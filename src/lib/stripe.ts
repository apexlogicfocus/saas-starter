import Stripe from "stripe";
import type { PlanId, Plan } from "./plans";
import { PLANS } from "./plans";

// STUB MODE: when STRIPE_SECRET_KEY is empty the app simulates checkout locally
// so it is fully demo-able without a Stripe account. With a (test-mode) key set,
// every call below hits real Stripe. Nothing else in the app knows the
// difference — it all goes through startCheckout / openPortal.
const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripeLive = Boolean(secretKey);

export const stripe: Stripe | null = secretKey ? new Stripe(secretKey) : null;

export function priceIdFor(plan: Plan): string | undefined {
  if (!plan.priceEnv) return undefined;
  return process.env[plan.priceEnv];
}

export function planForPrice(priceId: string | null | undefined): PlanId {
  if (!priceId) return "free";
  for (const plan of Object.values(PLANS)) {
    if (plan.priceEnv && process.env[plan.priceEnv] === priceId) return plan.id;
  }
  return "free";
}
