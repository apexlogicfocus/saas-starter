/**
 * Idempotent demo data: a user with two organizations on different plans, each
 * with a few projects, plus a second member. Handy for demos and screenshots.
 *
 *   npm run seed
 *   → login as demo@launchpad.dev / password123
 */
import { eq } from "drizzle-orm";
import { db, client } from "@/db";
import { users, organizations, memberships, projects } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { withOrg } from "@/db/rls";
import { createOrganization } from "@/lib/services/members";
import { applySubscriptionState } from "@/lib/billing";

async function upsertUser(email: string, name: string): Promise<string> {
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return existing.id;
  const [u] = await db
    .insert(users)
    .values({ email, name, passwordHash: hashPassword("password123") })
    .returning();
  return u.id;
}

async function orgHasProjects(orgId: string): Promise<boolean> {
  const rows = await withOrg(orgId, (tx) => tx.select().from(projects).limit(1));
  return rows.length > 0;
}

async function main() {
  const demoId = await upsertUser("demo@launchpad.dev", "Demo User");
  const teammateId = await upsertUser("teammate@launchpad.dev", "Terry Teammate");

  // Only create orgs if the demo user has none yet (keeps seed idempotent).
  const existing = await db.select().from(memberships).where(eq(memberships.userId, demoId));
  if (existing.length === 0) {
    const acme = await createOrganization(demoId, "Acme Inc");
    await applySubscriptionState(acme, { plan: "pro", status: "active" });
    await db.insert(memberships).values({ orgId: acme, userId: teammateId, role: "member" });
    await withOrg(acme, (tx) =>
      tx.insert(projects).values([
        { orgId: acme, name: "Website Redesign", createdBy: demoId },
        { orgId: acme, name: "Mobile App", createdBy: demoId },
        { orgId: acme, name: "Q3 Marketing", createdBy: teammateId },
      ]),
    );

    const globex = await createOrganization(demoId, "Globex (Free)");
    if (!(await orgHasProjects(globex))) {
      await withOrg(globex, (tx) =>
        tx.insert(projects).values({ orgId: globex, name: "Prototype", createdBy: demoId }),
      );
    }
    console.log("seeded Acme Inc (Pro) + Globex (Free)");
  } else {
    console.log("demo user already has organizations — nothing to do");
  }

  console.log("login: demo@launchpad.dev / password123");
}

main().then(
  () => client.end().then(() => process.exit(0)),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
