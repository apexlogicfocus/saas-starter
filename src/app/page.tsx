import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PLANS } from "@/lib/plans";

export default async function Home() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="flex-1">
      <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
        <span className="font-semibold text-lg">🚀 Launchpad</span>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="btn-ghost">Sign in</Link>
          <Link href="/signup" className="btn-primary">Get started</Link>
        </nav>
      </header>

      <section className="max-w-3xl mx-auto text-center px-6 pt-20 pb-16">
        <span className="badge bg-primary/10 text-primary mb-4">Multi-tenant SaaS starter</span>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          The boring parts of a SaaS, done right.
        </h1>
        <p className="text-muted text-lg mt-5 max-w-xl mx-auto">
          Organizations, roles &amp; invitations, Stripe subscriptions, and
          database-enforced tenant isolation — so you can build the interesting part.
        </p>
        <div className="flex items-center justify-center gap-3 mt-8">
          <Link href="/signup" className="btn-primary">Create your workspace</Link>
          <Link href="/login" className="btn-ghost">Sign in</Link>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-10 text-sm text-muted">
          <li>✅ Postgres row-level security</li>
          <li>✅ Role-based access control</li>
          <li>✅ Idempotent Stripe webhooks</li>
        </ul>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-semibold text-center mb-8">Simple pricing</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {Object.values(PLANS).map((plan) => (
            <div key={plan.id} className="card p-6 flex flex-col">
              <h3 className="font-semibold text-lg">{plan.name}</h3>
              <p className="text-3xl font-bold mt-2">{plan.priceLabel}</p>
              <ul className="mt-5 space-y-2 text-sm text-muted flex-1">
                {plan.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
              <Link href="/signup" className="btn-ghost mt-6">
                {plan.id === "free" ? "Start free" : `Choose ${plan.name}`}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
