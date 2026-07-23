import { sql } from "drizzle-orm";
import { db } from "@/db";
import { processedWebhookEvents, webhookApplyCounts } from "@/db/schema";
import { upsertSubscription, type SubscriptionState } from "../billing";

export interface WebhookResult {
  duplicate: boolean;
}

/**
 * Apply a subscription-changing webhook exactly once.
 *
 * Stripe delivers events AT LEAST once and retries on any non-2xx response, so
 * the same event id will occasionally arrive twice. Everything below runs in ONE
 * transaction: we INSERT the event id (ON CONFLICT DO NOTHING) and, only if that
 * insert won the race, apply the effect and bump an observability counter. Dedup
 * record and side effect commit together, so a redelivery either sees the row and
 * skips, or doesn't and does the work once — there is no partial-apply window.
 */
export async function handleSubscriptionEvent(
  eventId: string,
  eventType: string,
  orgId: string,
  state: SubscriptionState,
): Promise<WebhookResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_org', ${orgId}, true)`);

    const inserted = await tx
      .insert(processedWebhookEvents)
      .values({ id: eventId, type: eventType })
      .onConflictDoNothing()
      .returning({ id: processedWebhookEvents.id });

    if (inserted.length === 0) {
      return { duplicate: true }; // already processed — skip the effect
    }

    await upsertSubscription(tx, orgId, state);

    // Observability/testing hook: proves the effect ran exactly once per event.
    await tx
      .insert(webhookApplyCounts)
      .values({ key: `sub:${orgId}`, count: 1 })
      .onConflictDoUpdate({
        target: webhookApplyCounts.key,
        set: { count: sql`${webhookApplyCounts.count} + 1` },
      });

    return { duplicate: false };
  });
}
