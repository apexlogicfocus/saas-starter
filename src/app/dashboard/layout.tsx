import { requireContext } from "@/lib/context";
import { planFor } from "@/lib/plans";
import { signOut } from "@/app/actions/auth";
import { OrgSwitcher } from "@/components/org-switcher";
import { NavLink } from "@/components/nav-link";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const plan = planFor(ctx.org.plan);

  return (
    <div className="flex-1 flex flex-col sm:flex-row">
      <aside className="sm:w-64 border-b sm:border-b-0 sm:border-r border-border p-4 flex sm:flex-col gap-4 sm:h-screen sm:sticky sm:top-0">
        <div className="flex-1 sm:flex-none">
          <div className="text-lg font-semibold mb-3">🚀 Launchpad</div>
          <OrgSwitcher
            orgs={ctx.orgs.map((o) => ({ id: o.org.id, name: o.org.name }))}
            activeId={ctx.org.id}
          />
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <span className="badge bg-primary/10 text-primary">{plan.name}</span>
            <span className="capitalize">{ctx.role}</span>
          </div>
        </div>

        <nav className="hidden sm:flex flex-col gap-1 mt-4">
          <NavLink href="/dashboard">Projects</NavLink>
          <NavLink href="/dashboard/members">Members</NavLink>
          <NavLink href="/dashboard/billing">Billing</NavLink>
        </nav>

        <div className="sm:mt-auto flex items-center gap-2">
          <div className="hidden sm:block flex-1 min-w-0">
            <div className="text-sm truncate">{ctx.user.name ?? ctx.user.email}</div>
            <div className="text-xs text-muted truncate">{ctx.user.email}</div>
          </div>
          <form action={signOut}>
            <button className="btn-ghost text-xs px-3 py-1.5" type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      <main className="flex-1 p-6 sm:p-10 max-w-4xl w-full mx-auto">{children}</main>
    </div>
  );
}
