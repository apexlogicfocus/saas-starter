"use server";

import { redirect } from "next/navigation";
import { requireContext } from "@/lib/context";
import { assertCan } from "@/lib/rbac";
import { startCheckout, openPortalOrDowngrade } from "@/lib/billing";
import type { PlanId } from "@/lib/plans";

export async function upgrade(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  assertCan(ctx.role, "billing:manage");
  const plan = String(formData.get("plan") ?? "") as PlanId;
  const { url } = await startCheckout(ctx, plan);
  redirect(url);
}

export async function manageBilling(): Promise<void> {
  const ctx = await requireContext();
  assertCan(ctx.role, "billing:manage");
  const { url } = await openPortalOrDowngrade(ctx);
  redirect(url);
}
