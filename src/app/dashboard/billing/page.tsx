import { requireContext } from "@/lib/context";
import { getSubscription } from "@/lib/billing";
import { PLANS, planFor, PAID_PLANS } from "@/lib/plans";
import { can } from "@/lib/rbac";
import { stripeLive } from "@/lib/stripe";
import { upgrade, manageBilling } from "@/app/actions/billing";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string; downgraded?: string }>;
}) {
  const ctx = await requireContext();
  const sub = await getSubscription(ctx.org.id);
  const current = planFor(ctx.org.plan);
  const canManage = can(ctx.role, "billing:manage");
  const params = await searchParams;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-muted text-sm mt-1">
          You are on the <strong>{current.name}</strong> plan.
          {sub?.currentPeriodEnd && (sub.status === "active" || sub.status === "trialing") && (
            <> Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}.</>
          )}
        </p>
      </div>

      {!stripeLive && (
        <div className="rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-sm p-3 mb-6">
          <strong>Stub billing mode.</strong> No Stripe keys are configured, so upgrades apply
          instantly without a real charge. Add test-mode keys in <code>.env.local</code> to use
          real Stripe Checkout.
        </div>
      )}
      {params.success && (
        <div className="rounded-lg bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300 text-sm p-3 mb-6">
          🎉 Subscription updated.
        </div>
      )}
      {params.downgraded && (
        <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 text-sm p-3 mb-6">
          Your plan was downgraded to Free.
        </div>
      )}
      {sub?.status === "past_due" && (
        <div className="rounded-lg bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 text-sm p-3 mb-6">
          Your last payment failed — access has dropped to Free until it&apos;s resolved.
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-3">
        {Object.values(PLANS).map((plan) => {
          const isCurrent = plan.id === current.id;
          return (
            <div
              key={plan.id}
              className={`card p-6 flex flex-col ${isCurrent ? "ring-2 ring-primary" : ""}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">{plan.name}</h3>
                {isCurrent && <span className="badge bg-primary/10 text-primary">Current</span>}
              </div>
              <p className="text-2xl font-bold mt-2">{plan.priceLabel}</p>
              <ul className="mt-4 space-y-2 text-sm text-muted flex-1">
                {plan.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
              {canManage && !isCurrent && PAID_PLANS.includes(plan.id) && (
                <form action={upgrade} className="mt-6">
                  <input type="hidden" name="plan" value={plan.id} />
                  <button className="btn-primary w-full" type="submit">
                    {current.id === "free" ? "Upgrade" : "Switch"} to {plan.name}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {canManage && current.id !== "free" && (
        <form action={manageBilling} className="mt-6">
          <button className="btn-ghost" type="submit">
            {stripeLive ? "Manage billing (Stripe portal)" : "Cancel & downgrade to Free"}
          </button>
        </form>
      )}
      {!canManage && (
        <p className="text-sm text-muted mt-6">Only owners can change billing.</p>
      )}
    </div>
  );
}
