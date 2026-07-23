import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { planForPrice } from "@/lib/stripe";
import { handleSubscriptionEvent } from "@/lib/services/webhook";
import type { SubscriptionState } from "@/lib/billing";

// Stripe needs the RAW request body to verify the signature, so we read text()
// and never let a body parser touch it.
export async function POST(req: Request): Promise<NextResponse> {
  if (!stripe) {
    // Stub mode: no real webhooks. Subscription changes are applied directly by
    // startCheckout/openPortalOrDowngrade, so there is nothing to verify here.
    return NextResponse.json({ received: true, mode: "stub" });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Missing webhook secret/signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    // A bad signature means the request didn't come from Stripe — reject it.
    return NextResponse.json(
      { error: `Signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const mapped = mapEvent(event);
  if (mapped) {
    const { orgId, state } = mapped;
    const { duplicate } = await handleSubscriptionEvent(event.id, event.type, orgId, state);
    return NextResponse.json({ received: true, duplicate });
  }

  return NextResponse.json({ received: true, ignored: event.type });
}

function mapEvent(event: Stripe.Event): { orgId: string; state: SubscriptionState } | null {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.orgId;
      if (!orgId) return null;
      const item = sub.items.data[0];
      const priceId = item?.price.id;
      // Recent Stripe API versions expose the period end on the subscription
      // item; older ones put it on the subscription. Read whichever is present.
      const periodEnd =
        (item as { current_period_end?: number })?.current_period_end ??
        (sub as unknown as { current_period_end?: number }).current_period_end;
      return {
        orgId,
        state: {
          plan: planForPrice(priceId),
          status: sub.status,
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      };
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.orgId;
      if (!orgId) return null;
      return {
        orgId,
        state: {
          plan: "free",
          status: "canceled",
          stripeSubscriptionId: sub.id,
          cancelAtPeriodEnd: false,
        },
      };
    }
    default:
      return null;
  }
}
