import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, client } from "@/db";
import { withOrg } from "@/db/rls";
import {
  organizations,
  subscriptions,
  webhookApplyCounts,
  processedWebhookEvents,
} from "@/db/schema";
import { handleSubscriptionEvent } from "@/lib/services/webhook";

let orgId: string;
const eventId = `evt_test_${Date.now()}`;

before(async () => {
  const [org] = await db
    .insert(organizations)
    .values({ name: "WH Org", slug: `wh-${Date.now()}` })
    .returning();
  orgId = org.id;
});

after(async () => {
  await db.delete(processedWebhookEvents).where(eq(processedWebhookEvents.id, eventId));
  await db.delete(webhookApplyCounts).where(eq(webhookApplyCounts.key, `sub:${orgId}`));
  await db.delete(organizations).where(eq(organizations.id, orgId));
  await client.end();
});

test("first delivery applies the subscription change", async () => {
  const res = await handleSubscriptionEvent(
    eventId,
    "customer.subscription.updated",
    orgId,
    { plan: "pro", status: "active" },
  );
  assert.equal(res.duplicate, false);

  const sub = await withOrg(orgId, (tx) =>
    tx.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)),
  );
  assert.equal(sub[0].plan, "pro");
  assert.equal(sub[0].status, "active");

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  assert.equal(org.plan, "pro", "org plan cache should be updated");
});

test("redelivery of the same event id is skipped (idempotent)", async () => {
  const res = await handleSubscriptionEvent(
    eventId,
    "customer.subscription.updated",
    orgId,
    { plan: "enterprise", status: "active" }, // different payload — must be ignored
  );
  assert.equal(res.duplicate, true);

  // The effect ran exactly once despite two deliveries.
  const [c] = await db
    .select()
    .from(webhookApplyCounts)
    .where(eq(webhookApplyCounts.key, `sub:${orgId}`));
  assert.equal(c.count, 1);

  // And the plan is still what the FIRST event set — the duplicate didn't upgrade.
  const sub = await withOrg(orgId, (tx) =>
    tx.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)),
  );
  assert.equal(sub[0].plan, "pro");
});
