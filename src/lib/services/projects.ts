import { sql, desc, eq } from "drizzle-orm";
import { withOrg } from "@/db/rls";
import { projects, type Project } from "@/db/schema";
import { assertCan } from "../rbac";
import { planFor, withinLimit } from "../plans";
import type { AppContext } from "../context";

export async function listProjects(ctx: AppContext): Promise<Project[]> {
  return withOrg(ctx.org.id, (tx) =>
    tx.select().from(projects).orderBy(desc(projects.createdAt)),
  );
}

export class PlanLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export async function createProject(ctx: AppContext, name: string): Promise<Project> {
  assertCan(ctx.role, "project:create");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name is required");

  const plan = planFor(ctx.org.plan);
  return withOrg(ctx.org.id, async (tx) => {
    // Count + insert in one transaction so two concurrent creates can't both
    // slip past the limit.
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(projects);
    if (!withinLimit(plan.maxProjects, count)) {
      throw new PlanLimitError(
        `Your ${plan.name} plan allows ${plan.maxProjects} projects. Upgrade to add more.`,
      );
    }
    const [row] = await tx
      .insert(projects)
      .values({ orgId: ctx.org.id, name: trimmed, createdBy: ctx.user.id })
      .returning();
    return row;
  });
}

export async function deleteProject(ctx: AppContext, projectId: string): Promise<void> {
  assertCan(ctx.role, "project:delete");
  await withOrg(ctx.org.id, (tx) =>
    // RLS guarantees this can only ever match a project in ctx.org, so a forged
    // projectId from another tenant simply deletes nothing.
    tx.delete(projects).where(eq(projects.id, projectId)),
  );
}
