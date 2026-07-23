import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql, eq } from "drizzle-orm";
import { db, client } from "@/db";
import { withOrg } from "@/db/rls";
import { organizations, projects } from "@/db/schema";

// These tests connect as `app_user` (DATABASE_URL) — the non-superuser role that
// is subject to RLS. They prove tenant isolation is enforced by Postgres, not by
// WHERE clauses in app code.

let orgA: string;
let orgB: string;

before(async () => {
  const [a] = await db
    .insert(organizations)
    .values({ name: "Org A", slug: `a-${Date.now()}` })
    .returning();
  const [b] = await db
    .insert(organizations)
    .values({ name: "Org B", slug: `b-${Date.now()}` })
    .returning();
  orgA = a.id;
  orgB = b.id;

  await withOrg(orgA, (tx) =>
    tx.insert(projects).values({ orgId: orgA, name: "A-secret" }),
  );
  await withOrg(orgB, (tx) =>
    tx.insert(projects).values({ orgId: orgB, name: "B-secret" }),
  );
});

after(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgA));
  await db.delete(organizations).where(eq(organizations.id, orgB));
  await client.end();
});

test("a tenant sees only its own rows", async () => {
  const rows = await withOrg(orgA, (tx) => tx.select().from(projects));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "A-secret");
});

test("a bare SELECT with no WHERE still leaks nothing across tenants", async () => {
  // Even a query that forgets to filter by org returns only the active tenant's
  // rows, because RLS rewrites it. This is the whole point of the design.
  const rows = await withOrg(orgB, (tx) =>
    tx.execute(sql`SELECT name FROM projects`),
  );
  assert.equal(rows.length, 1);
  assert.equal((rows[0] as { name: string }).name, "B-secret");
});

test("with no tenant context, isolation fails closed (zero rows)", async () => {
  // No app.current_org set → current_setting(...) is NULL → policy matches nothing.
  const rows = await db.execute(sql`SELECT * FROM projects`);
  assert.equal(rows.length, 0);
});

test("you cannot write a row into another tenant", async () => {
  // Context is A, but we try to insert a project owned by B. The policy's
  // WITH CHECK clause rejects it at the database level.
  await assert.rejects(
    () =>
      withOrg(orgA, (tx) =>
        tx.insert(projects).values({ orgId: orgB, name: "smuggled" }),
      ),
    (err: Error & { cause?: Error }) => {
      // The pg RLS message lives on the error or its cause.
      const msg = `${err.message} ${err.cause?.message ?? ""}`;
      return /row-level security|violates row-level|policy/i.test(msg);
    },
  );
});

test("cross-tenant read by id returns nothing", async () => {
  // Under A's context, explicitly ask for a B project by a matching filter.
  const rows = await withOrg(orgA, (tx) =>
    tx.select().from(projects).where(eq(projects.orgId, orgB)),
  );
  assert.equal(rows.length, 0);
});
