"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function markNotificationsRead() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { error } = await supabase
    .from("customer_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) throw error;
  revalidatePath("/account");
}

export async function requestPlanCancellation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const planId = String(formData.get("planId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!planId || reason.length < 3) {
    redirect("/account?error=Add+a+short+reason+for+the+request.");
  }

  const { data: plan } = await supabase
    .from("delivery_plans")
    .select("id")
    .eq("id", planId)
    .eq("user_id", user.id)
    .in("status", ["active", "paused", "pending_confirmation"])
    .maybeSingle();
  if (!plan) redirect("/account?error=This+plan+cannot+be+cancelled.");

  const { data: existing } = await supabase
    .from("cancellation_requests")
    .select("id")
    .eq("plan_id", plan.id)
    .eq("user_id", user.id)
    .eq("status", "requested")
    .maybeSingle();
  if (existing) redirect("/account?message=Your+cancellation+request+is+already+under+review.");

  const { error } = await supabase.from("cancellation_requests").insert({
    plan_id: plan.id,
    reason,
    status: "requested",
    user_id: user.id,
  });
  if (error) redirect("/account?error=We+could+not+save+the+request.");
  redirect("/account?message=Cancellation+request+sent+to+the+farm.");
}
