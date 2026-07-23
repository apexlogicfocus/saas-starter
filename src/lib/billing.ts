import { eq } from "drizzle-orm";
import { db } from "@/db";
import { withOrg, type Tx } from "@/db/rls";
import { organizations, subscriptions, type Subscription } from "@/db/schema";
import { PLANS, type PlanId } from "./plans";
import { stripe, stripeLive, priceIdFor } from "./stripe";
import type { AppContext } from "./context";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export interface SubscriptionState {
  plan: PlanId;
  status: string;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}

/**
 * Writes subscription state within a caller-provided transaction that has
 * already opened `orgId`'s context. Upserts the subscriptions row (RLS-scoped)
 * and refreshes the cached plan on the organization. This is the single source
 * of truth for "apply this billing state", shared by stub mode and the webhook
 * so the effect of "a payment succeeded" is byte-identical either way.
 */
export async function upsertSubscription(
  tx: Tx,
  orgId: string,
  s: SubscriptionState,
): Promise<void> {
  const values = {
    orgId,
    plan: s.plan,
    status: s.status,
    stripeSubscriptionId: s.stripeSubscriptionId ?? null,
    stripePriceId: s.stripePriceId ?? null,
    currentPeriodEnd: s.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd ?? false,
    updatedAt: new Date(),
  };
  await tx
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.orgId, set: values });

  // Cache the effective plan for fast gating. An active/trialing paid plan grants
  // its tier; anything else (past_due, canceled, incomplete) falls back to free.
  const effectivePlan =
    s.status === "active" || s.status === "trialing" ? s.plan : "free";
  await tx
    .update(organizations)
    .set({ plan: effectivePlan })
    .where(eq(organizations.id, orgId));
}

export async function applySubscriptionState(
  orgId: string,
  s: SubscriptionState,
): Promise<void> {
  await withOrg(orgId, (tx) => upsertSubscription(tx, orgId, s));
}

export async function getSubscription(orgId: string): Promise<Subscription | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .limit(1);
    return rows[0] ?? null;
  });
}

async function ensureCustomer(ctx: AppContext): Promise<string> {
  if (!stripe) throw new Error("Stripe not configured");
  if (ctx.org.stripeCustomerId) return ctx.org.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: ctx.user.email,
    name: ctx.org.name,
    metadata: { orgId: ctx.org.id },
  });
  await db
    .update(organizations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizations.id, ctx.org.id));
  return customer.id;
}

/** Begin an upgrade. Live mode returns a Stripe Checkout URL; stub mode applies
 *  the plan immediately and returns a local redirect. */
export async function startCheckout(
  ctx: AppContext,
  planId: PlanId,
): Promise<{ url: string }> {
  const plan = PLANS[planId];
  if (planId === "free") throw new Error("Cannot checkout the free plan");

  if (!stripeLive || !stripe) {
    // STUB: pretend Checkout succeeded instantly.
    await applySubscriptionState(ctx.org.id, {
      plan: planId,
      status: "active",
      stripePriceId: `stub_${planId}`,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      cancelAtPeriodEnd: false,
    });
    return { url: `${APP_URL}/dashboard/billing?success=1` };
  }

  const price = priceIdFor(plan);
  if (!price) throw new Error(`No Stripe price configured for ${planId}`);
  const customerId = await ensureCustomer(ctx);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${APP_URL}/dashboard/billing?success=1`,
    cancel_url: `${APP_URL}/dashboard/billing?canceled=1`,
    metadata: { orgId: ctx.org.id, plan: planId },
    subscription_data: { metadata: { orgId: ctx.org.id } },
  });
  return { url: session.url! };
}

/** Open the customer portal (live) or apply a downgrade to free (stub). */
export async function openPortalOrDowngrade(
  ctx: AppContext,
): Promise<{ url: string }> {
  if (!stripeLive || !stripe) {
    await applySubscriptionState(ctx.org.id, { plan: "free", status: "canceled" });
    return { url: `${APP_URL}/dashboard/billing?downgraded=1` };
  }
  const customerId = await ensureCustomer(ctx);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_URL}/dashboard/billing`,
  });
  return { url: session.url };
}
