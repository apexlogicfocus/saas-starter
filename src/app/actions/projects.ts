"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { createProject, deleteProject, PlanLimitError } from "@/lib/services/projects";
import { ForbiddenError } from "@/lib/rbac";
import type { FormState } from "./auth";

export async function addProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext();
  try {
    await createProject(ctx, String(formData.get("name") ?? ""));
  } catch (e) {
    if (e instanceof PlanLimitError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  revalidatePath("/dashboard");
  return undefined;
}

export async function removeProject(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  await deleteProject(ctx, String(formData.get("projectId") ?? ""));
  revalidatePath("/dashboard");
}
