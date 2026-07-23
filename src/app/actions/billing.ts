"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/context";
import { assertCan } from "@/lib/rbac";
import { startCheckout, openPortalOrDowngrade } from "@/lib/billing";
import type { PlanId } from "@/lib/plans";

export async function upgrade(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  assertCan(ctx.role, "billing:manage");
  const plan = String(formData.get("plan") ?? "") as PlanId;
  const { url } = await startCheckout(ctx, plan);
  // Refresh the dashboard layout so the plan badge/limits reflect the new plan
  // (in stub mode the change is already applied by the time we redirect).
  revalidatePath("/dashboard", "layout");
  redirect(url);
}

export async function manageBilling(): Promise<void> {
  const ctx = await requireContext();
  assertCan(ctx.role, "billing:manage");
  const { url } = await openPortalOrDowngrade(ctx);
  revalidatePath("/dashboard", "layout");
  redirect(url);
}
