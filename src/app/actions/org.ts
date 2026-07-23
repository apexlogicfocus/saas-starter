"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { setActiveOrg } from "@/lib/context";
import { createOrganization } from "@/lib/services/members";
import type { FormState } from "./auth";

export async function createOrg(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = String(formData.get("name") ?? "");
  if (!name.trim()) return { error: "Organization name is required" };

  const orgId = await createOrganization(user.id, name);
  await setActiveOrg(user.id, orgId);
  redirect("/dashboard");
}

export async function switchOrg(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgId = String(formData.get("orgId") ?? "");
  await setActiveOrg(user.id, orgId);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
