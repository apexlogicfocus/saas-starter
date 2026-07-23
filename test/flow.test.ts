import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, client } from "@/db";
import { users, organizations } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { createProject, PlanLimitError } from "@/lib/services/projects";
import {
  createOrganization,
  inviteMember,
  acceptInvite,
  listMembers,
} from "@/lib/services/members";
import { applySubscriptionState } from "@/lib/billing";
import { ForbiddenError } from "@/lib/rbac";
import type { AppContext } from "@/lib/context";

let ownerId: string;
let bobId: string;
let orgId: string;

async function ctxFor(userId: string, role: "owner" | "admin" | "member"): Promise<AppContext> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  return { user, org, role, orgs: [] };
}

before(async () => {
  const [owner] = await db
    .insert(users)
    .values({ email: `owner-${Date.now()}@t.co`, passwordHash: hashPassword("password123") })
    .returning();
  const [bob] = await db
    .insert(users)
    .values({ email: `bob-${Date.now()}@t.co`, passwordHash: hashPassword("password123") })
    .returning();
  ownerId = owner.id;
  bobId = bob.id;
  orgId = await createOrganization(ownerId, "Acme");
});

after(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, bobId));
  await client.end();
});

test("free plan enforces the project limit", async () => {
  const ctx = await ctxFor(ownerId, "owner"); // free: max 3 projects
  await createProject(ctx, "P1");
  await createProject(ctx, "P2");
  await createProject(ctx, "P3");
  await assert.rejects(() => createProject(ctx, "P4"), PlanLimitError);
});

test("free plan enforces the member seat limit (members + pending invites)", async () => {
  const ctx = await ctxFor(ownerId, "owner"); // free: max 2 members; owner is 1
  const { url } = await inviteMember(ctx, "bob@acme.co", "member"); // seats: 1 + 1 pending = 2
  assert.match(url, /\/invite\//);
  await assert.rejects(() => inviteMember(ctx, "carol@acme.co", "member"), PlanLimitError);
});

test("a member cannot invite (RBAC)", async () => {
  const ctx = await ctxFor(ownerId, "member");
  await assert.rejects(() => inviteMember(ctx, "x@acme.co", "member"), ForbiddenError);
});

test("accepting an invite adds a membership", async () => {
  // Re-issue against bob's real email under a fresh invite for acceptance.
  const ctx = await ctxFor(ownerId, "owner");
  // Upgrade first so there's a free seat for the invite.
  await applySubscriptionState(orgId, { plan: "pro", status: "active" });
  const upgraded = await ctxFor(ownerId, "owner");
  const { invite } = await inviteMember(upgraded, "bob2@acme.co", "member");

  await acceptInvite(bobId, invite.token);
  const members = await listMembers(upgraded);
  assert.ok(members.some((m) => m.userId === bobId && m.role === "member"));
});

test("upgrading the plan lifts the project limit", async () => {
  const ctx = await ctxFor(ownerId, "owner"); // now pro: max 50
  await createProject(ctx, "P4");
  await createProject(ctx, "P5");
  // no throw — the earlier free-plan limit no longer applies
});
