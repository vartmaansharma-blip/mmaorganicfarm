"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function saveAccountDeliveryDetails(formData: FormData) {
  const settings = "/account?section=settings";
  const fail = (message: string): never => redirect(`${settings}&error=${encodeURIComponent(message)}`);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=%2Faccount%3Fsection%3Dsettings");

  const digits = String(formData.get("phone") ?? "").replace(/\D/g, "");
  const phone = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  const address = String(formData.get("address") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();
  if (!/^\d{10}$/.test(phone) || address.length < 8 || address.length > 500 ||
    (postalCode && !/^\d{6}$/.test(postalCode))) {
    fail("Enter a 10-digit mobile number, a complete address, and a valid PIN code if available.");
  }

  const { data: current, error: readError } = await supabase.from("customer_profiles")
    .select("address_line,postal_code").eq("user_id", user.id).maybeSingle();
  if (readError || !current) return fail("We could not load your delivery details. Please try again.");
  const { data: saved, error: saveError } = await supabase.from("customer_profiles")
    .update({ phone: `+91${phone}`, address_line: address, postal_code: postalCode || null, updated_at: new Date().toISOString() })
    .eq("user_id", user.id).select("user_id").maybeSingle();
  if (saveError || !saved) return fail("We could not save your delivery details. Please try again.");

  const addressChanged = current.address_line !== address || (current.postal_code ?? "") !== postalCode;
  const { error: routeError } = await supabase.rpc("refresh_customer_route", {
    p_user_id: user.id,
    p_force_reroute: addressChanged,
  });
  revalidatePath("/account");
  revalidatePath("/farm", "layout");
  if (routeError) fail("Your details were saved, but the route could not be refreshed. Please contact the farm.");
  redirect(`${settings}&message=Delivery+details+saved.`);
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
