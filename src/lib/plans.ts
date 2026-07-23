// Plan catalogue. Limits are enforced server-side before every gated action, so
// the DB never ends up in a state the plan disallows even if the UI is bypassed.
// `-1` means unlimited.

export type PlanId = "free" | "pro" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  priceLabel: string;
  maxMembers: number;
  maxProjects: number;
  // Which env var holds the Stripe price id for paid plans (undefined = free).
  priceEnv?: "STRIPE_PRICE_PRO" | "STRIPE_PRICE_ENTERPRISE";
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceLabel: "$0",
    maxMembers: 2,
    maxProjects: 3,
    features: ["Up to 2 members", "Up to 3 projects", "Community support"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceLabel: "$29/mo",
    maxMembers: 10,
    maxProjects: 50,
    priceEnv: "STRIPE_PRICE_PRO",
    features: ["Up to 10 members", "Up to 50 projects", "Email support"],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceLabel: "$99/mo",
    maxMembers: -1,
    maxProjects: -1,
    priceEnv: "STRIPE_PRICE_ENTERPRISE",
    features: ["Unlimited members", "Unlimited projects", "Priority support"],
  },
};

export const PAID_PLANS: PlanId[] = ["pro", "enterprise"];

export function planFor(id: string | null | undefined): Plan {
  return PLANS[(id as PlanId) ?? "free"] ?? PLANS.free;
}

export function withinLimit(limit: number, current: number): boolean {
  return limit === -1 || current < limit;
}

/** Resolve which plan a Stripe price id corresponds to (for webhook handling). */
export function planForPriceId(priceId: string | null | undefined): PlanId {
  if (!priceId) return "free";
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return "enterprise";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return "free";
}
