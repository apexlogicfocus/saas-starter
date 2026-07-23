import Link from "next/link";
import { requireContext } from "@/lib/context";
import { listProjects } from "@/lib/services/projects";
import { planFor } from "@/lib/plans";
import { can } from "@/lib/rbac";
import { removeProject } from "@/app/actions/projects";
import { AddProjectForm } from "@/components/add-project-form";

export default async function ProjectsPage() {
  const ctx = await requireContext();
  const projects = await listProjects(ctx);
  const plan = planFor(ctx.org.plan);
  const limit = plan.maxProjects;
  const atLimit = limit !== -1 && projects.length >= limit;
  const canDelete = can(ctx.role, "project:delete");

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted text-sm mt-1">
            {projects.length}
            {limit !== -1 ? ` / ${limit}` : ""} used on your {plan.name} plan
          </p>
        </div>
      </div>

      <div className="card p-4 mb-6">
        {atLimit ? (
          <p className="text-sm text-muted">
            You&apos;ve reached the {plan.name} plan limit.{" "}
            <Link href="/dashboard/billing" className="text-primary font-medium">Upgrade</Link>{" "}
            to add more projects.
          </p>
        ) : (
          <AddProjectForm />
        )}
      </div>

      {projects.length === 0 ? (
        <p className="text-muted text-sm">No projects yet. Create your first one above.</p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id} className="card p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted">
                  Created {new Date(p.createdAt).toLocaleDateString()}
                </div>
              </div>
              {canDelete && (
                <form action={removeProject}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <button className="btn-danger text-xs px-3 py-1.5" type="submit">Delete</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
