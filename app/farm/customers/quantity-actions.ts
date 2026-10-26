"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFarmManager } from "@/lib/farm-dashboard";
export async function movePrepaidQuantity(form: FormData) {
  const userId = String(form.get("userId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId))
    redirect("/farm/locations?error=Choose+a+customer.");
  const path = `/farm/customers/${userId}`;
  const { supabase } = await requireFarmManager(path);
  const planId = String(form.get("planId") ?? "");
  const { data: plan } = await supabase
    .from("delivery_plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!plan) redirect(`${path}?error=Choose+this+customer's+plan.`);
  const { error } = await supabase.rpc("move_farm_prepaid_quantity", {
    p_plan_id: planId,
    p_product: String(form.get("product") ?? ""),
    p_source: String(form.get("source") ?? ""),
    p_target: String(form.get("target") ?? "") || null,
    p_quantity: Number(form.get("quantity")),
    p_expected_source: Number(form.get("sourceQuantity")),
    p_expected_target: Number(form.get("targetQuantity")),
    p_reason: String(form.get("reason") ?? "").trim(),
  });
  if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);
  for (const route of [
    path,
    "/farm",
    "/farm/capacity",
    "/farm/delivery-sheet",
    "/account",
    "/calendar",
  ])
    revalidatePath(route);
  redirect(
    `${path}?message=Prepaid+quantities+updated.+The+payment+and+purchased+terms+are+preserved.`,
  );
}
