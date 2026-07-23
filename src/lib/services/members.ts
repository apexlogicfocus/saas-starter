import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { withOrg } from "@/db/rls";
import {
  memberships,
  users,
  invitations,
  organizations,
  subscriptions,
  type Invitation,
} from "@/db/schema";
import { assertCan, type Role } from "../rbac";
import { planFor, withinLimit } from "../plans";
import { PlanLimitError } from "./projects";
import type { AppContext } from "../context";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface MemberRow {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
}

export async function listMembers(ctx: AppContext): Promise<MemberRow[]> {
  // memberships is control plane (no RLS); we already know ctx.user belongs to
  // ctx.org, so scoping by org_id here is the app-level authorization.
  const rows = await db
    .select({ userId: users.id, email: users.email, name: users.name, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, ctx.org.id))
    .orderBy(memberships.createdAt);
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

export async function listPendingInvites(ctx: AppContext): Promise<Invitation[]> {
  return withOrg(ctx.org.id, (tx) =>
    tx
      .select()
      .from(invitations)
      .where(sql`${invitations.acceptedAt} IS NULL`),
  );
}

async function seatCount(orgId: string): Promise<number> {
  const [{ members }] = await db
    .select({ members: sql<number>`count(*)::int` })
    .from(memberships)
    .where(eq(memberships.orgId, orgId));
  const pending = await withOrg(orgId, async (tx) => {
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(invitations)
      .where(sql`${invitations.acceptedAt} IS NULL`);
    return n;
  });
  return members + pending;
}

export async function inviteMember(
  ctx: AppContext,
  email: string,
  role: Role,
): Promise<{ invite: Invitation; url: string }> {
  assertCan(ctx.role, "member:invite");
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) throw new Error("A valid email is required");
  if (role === "owner") throw new Error("Cannot invite someone as owner");

  const plan = planFor(ctx.org.plan);
  const used = await seatCount(ctx.org.id);
  if (!withinLimit(plan.maxMembers, used)) {
    throw new PlanLimitError(
      `Your ${plan.name} plan allows ${plan.maxMembers} members. Upgrade to invite more.`,
    );
  }

  // Token carries the org id so acceptance can locate the (RLS-protected)
  // invitation without a prior org context. The random half makes it unguessable.
  const token = `${ctx.org.id}.${randomBytes(24).toString("base64url")}`;
  const invite = await withOrg(ctx.org.id, async (tx) => {
    const [row] = await tx
      .insert(invitations)
      .values({
        orgId: ctx.org.id,
        email: normalized,
        role,
        token,
        invitedBy: ctx.user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      })
      .returning();
    return row;
  });
  return { invite, url: `${APP_URL}/invite/${token}` };
}

export class InviteError extends Error {}

/** Accept an invite. Deliberately opens the org context named inside the token —
 *  the unguessable token IS the authorization, since the user is not yet a member. */
export async function acceptInvite(userId: string, token: string): Promise<string> {
  const orgId = token.split(".")[0];
  if (!orgId) throw new InviteError("Malformed invite");

  const invite = await withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.token, token))
      .limit(1);
    return row;
  });
  if (!invite) throw new InviteError("Invite not found");
  if (invite.acceptedAt) throw new InviteError("Invite already used");
  if (invite.expiresAt < new Date()) throw new InviteError("Invite expired");

  await withOrg(orgId, (tx) =>
    tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invite.id)),
  );
  // Membership is control plane. ON CONFLICT DO NOTHING makes re-accept a no-op.
  await db
    .insert(memberships)
    .values({ orgId, userId, role: invite.role })
    .onConflictDoNothing();
  return orgId;
}

export interface InvitePreview {
  orgName: string;
  email: string;
  role: Role;
  valid: boolean;
  reason?: string;
}

export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
  const orgId = token.split(".")[0];
  if (!orgId) return null;
  const invite = await withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.token, token))
      .limit(1);
    return row;
  });
  if (!invite) return null;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const reason = invite.acceptedAt
    ? "This invite has already been used."
    : invite.expiresAt < new Date()
      ? "This invite has expired."
      : undefined;
  return {
    orgName: org?.name ?? "an organization",
    email: invite.email,
    role: invite.role as Role,
    valid: !reason,
    reason,
  };
}

export async function removeMember(ctx: AppContext, userId: string): Promise<void> {
  assertCan(ctx.role, "member:remove");
  if (userId === ctx.user.id) throw new Error("You cannot remove yourself");
  await guardLastOwner(ctx.org.id, userId);
  await db
    .delete(memberships)
    .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, userId)));
}

export async function changeRole(
  ctx: AppContext,
  userId: string,
  role: Role,
): Promise<void> {
  assertCan(ctx.role, "member:changeRole");
  if (role !== "owner") await guardLastOwner(ctx.org.id, userId);
  await db
    .update(memberships)
    .set({ role })
    .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, userId)));
}

/** Prevent an org from being left with zero owners (which would lock everyone
 *  out of billing and role management). */
async function guardLastOwner(orgId: string, affectedUserId: string): Promise<void> {
  const owners = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "owner")));
  if (owners.length === 1 && owners[0].userId === affectedUserId) {
    throw new Error("An organization must have at least one owner");
  }
}

export async function createOrganization(
  userId: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Organization name is required");
  const slug =
    trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) +
    "-" +
    randomBytes(3).toString("hex");

  const [org] = await db.insert(organizations).values({ name: trimmed, slug }).returning();
  await db.insert(memberships).values({ orgId: org.id, userId, role: "owner" });
  // Every org starts on a free subscription row so billing state is never absent.
  await withOrg(org.id, (tx) =>
    tx.insert(subscriptions).values({ orgId: org.id, plan: "free", status: "active" }),
  );
  return org.id;
}
