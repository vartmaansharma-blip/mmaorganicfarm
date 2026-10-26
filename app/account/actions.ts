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

export async function cancelPlan(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const planId = String(formData.get("planId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(planId) || reason.length > 500) {
    redirect("/account?section=deliveries&error=Choose+a+valid+plan+and+keep+the+reason+under+500+characters.");
  }
  const { error } = await supabase.rpc("cancel_my_delivery_plan", {
    p_plan_id: planId,
    p_reason: reason || null,
  });
  if (error) {
    console.error("Customer plan cancellation failed", { code: error.code });
    redirect("/account?section=deliveries&error=We+could+not+confirm+cancellation.+Please+try+again.");
  }
  revalidatePath("/account");
  revalidatePath("/calendar");
  revalidatePath("/farm", "layout");
  redirect("/account?section=deliveries&message=Your+plan+is+cancelled.+No+farm+approval+is+needed.");
}
