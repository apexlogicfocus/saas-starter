import { requireContext } from "@/lib/context";
import { listMembers, listPendingInvites } from "@/lib/services/members";
import { planFor } from "@/lib/plans";
import { can } from "@/lib/rbac";
import { kickMember } from "@/app/actions/members";
import { InviteForm } from "@/components/invite-form";
import { RoleSelect } from "@/components/role-select";

export default async function MembersPage() {
  const ctx = await requireContext();
  const [members, pending] = await Promise.all([listMembers(ctx), listPendingInvites(ctx)]);
  const plan = planFor(ctx.org.plan);
  const seatsUsed = members.length + pending.length;
  const canInvite = can(ctx.role, "member:invite");
  const canRemove = can(ctx.role, "member:remove");
  const canChangeRole = can(ctx.role, "member:changeRole");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-muted text-sm mt-1">
          {seatsUsed}
          {plan.maxMembers !== -1 ? ` / ${plan.maxMembers}` : ""} seats used on your {plan.name} plan
        </p>
      </div>

      {canInvite && (
        <div className="card p-4 mb-6">
          <InviteForm />
        </div>
      )}

      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.userId} className="card p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium truncate">{m.name ?? m.email}</div>
              <div className="text-xs text-muted truncate">{m.email}</div>
            </div>
            <div className="flex items-center gap-2">
              {canChangeRole && m.userId !== ctx.user.id ? (
                <RoleSelect userId={m.userId} role={m.role} />
              ) : (
                <span className="badge bg-primary/10 text-primary capitalize">{m.role}</span>
              )}
              {canRemove && m.userId !== ctx.user.id && (
                <form action={kickMember}>
                  <input type="hidden" name="userId" value={m.userId} />
                  <button className="btn-danger text-xs px-3 py-1.5" type="submit">Remove</button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>

      {pending.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-muted mt-8 mb-2">Pending invitations</h2>
          <ul className="space-y-2">
            {pending.map((inv) => (
              <li key={inv.id} className="card p-4 flex items-center justify-between text-sm">
                <span>{inv.email}</span>
                <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 capitalize">
                  {inv.role} · pending
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
