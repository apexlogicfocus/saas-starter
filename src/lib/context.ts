import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organizations, type User, type Organization } from "@/db/schema";
import { getCurrentUser } from "./auth";
import type { Role } from "./rbac";

const ACTIVE_ORG_COOKIE = "active_org";

export interface OrgSummary {
  org: Organization;
  role: Role;
}

/** Every org the user belongs to, with their role. Control-plane query. */
export async function listMemberships(userId: string): Promise<OrgSummary[]> {
  const rows = await db
    .select({ org: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(organizations.createdAt);
  return rows.map((r) => ({ org: r.org, role: r.role as Role }));
}

/** Verify a membership and return the role, or null. This is the gate that
 *  decides whether it is safe to open the org's RLS data context. */
export async function membershipRole(
  userId: string,
  orgId: string,
): Promise<Role | null> {
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .limit(1);
  return (rows[0]?.role as Role) ?? null;
}

export interface AppContext {
  user: User;
  org: Organization;
  role: Role;
  orgs: OrgSummary[];
}

/** Resolve the full context for the current request, or null if unauthenticated
 *  or the user has no organizations yet. */
export async function getContext(): Promise<AppContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const orgs = await listMemberships(user.id);
  if (orgs.length === 0) return null;

  const c = await cookies();
  const wanted = c.get(ACTIVE_ORG_COOKIE)?.value;
  const active = orgs.find((o) => o.org.id === wanted) ?? orgs[0];

  return { user, org: active.org, role: active.role, orgs };
}

/** For pages/actions that require an authenticated user with an org. Redirects
 *  otherwise. Returns a non-null context. */
export async function requireContext(): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx) {
    const user = await getCurrentUser();
    redirect(user ? "/onboarding" : "/login");
  }
  return ctx;
}

export async function setActiveOrg(userId: string, orgId: string): Promise<boolean> {
  const role = await membershipRole(userId, orgId);
  if (!role) return false;
  const c = await cookies();
  c.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return true;
}
