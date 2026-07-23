"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { getCurrentUser } from "@/lib/auth";
import {
  inviteMember,
  removeMember,
  changeRole,
  acceptInvite,
  InviteError,
} from "@/lib/services/members";
import { PlanLimitError } from "@/lib/services/projects";
import { ForbiddenError, type Role } from "@/lib/rbac";
import type { FormState } from "./auth";

export type InviteState = { error?: string; url?: string } | undefined;

export async function invite(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await requireContext();
  try {
    const { url } = await inviteMember(
      ctx,
      String(formData.get("email") ?? ""),
      (String(formData.get("role") ?? "member")) as Role,
    );
    revalidatePath("/dashboard/members");
    return { url };
  } catch (e) {
    if (e instanceof PlanLimitError || e instanceof ForbiddenError || e instanceof Error) {
      return { error: e.message };
    }
    throw e;
  }
}

export async function kickMember(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  await removeMember(ctx, String(formData.get("userId") ?? ""));
  revalidatePath("/dashboard/members");
}

export async function setRole(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  await changeRole(ctx, String(formData.get("userId") ?? ""), String(formData.get("role") ?? "member") as Role);
  revalidatePath("/dashboard/members");
}

export async function accept(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const token = String(formData.get("token") ?? "");
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  try {
    await acceptInvite(user.id, token);
  } catch (e) {
    if (e instanceof InviteError) return { error: e.message };
    throw e;
  }
  redirect("/dashboard");
}
