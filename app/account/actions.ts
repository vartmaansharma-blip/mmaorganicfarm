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


/** Update delivery contact details without creating an unpaid checkout or order. */
export async function saveCustomerDeliveryDetails(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=%2Faccount%3Fsection%3Dsettings");

  const rawPhone = String(formData.get("phone") ?? "").replace(/\D/g, "");
  const phone = rawPhone.length === 12 && rawPhone.startsWith("91") ? rawPhone.slice(2) : rawPhone;
  const address = String(formData.get("address") ?? "").trim();
  const postalCode = String(formData.get("postal_code") ?? "").trim();
  const errorUrl = (message: string) => "/account?section=settings&error=" + encodeURIComponent(message);

  if (!/^[6-9]\d{9}$/.test(phone)) redirect(errorUrl("Enter a valid 10-digit Indian mobile number."));
  if (address.length < 10 || address.length > 300) redirect(errorUrl("Enter a full delivery address (10–300 characters)."));
  if (postalCode && !/^\d{6}$/.test(postalCode)) redirect(errorUrl("Enter a six-digit PIN code, or leave it blank."));

  const { data: previous, error: readError } = await supabase
    .from("customer_profiles")
    .select("address_line, full_name, email, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) redirect(errorUrl("Your details could not be checked. Please try again."));

  const addressChanged = (previous?.address_line ?? "").trim().toLowerCase() !== address.toLowerCase();
  const { error } = await supabase.from("customer_profiles").upsert({
    user_id: user.id,
    full_name: previous?.full_name ?? user.user_metadata.full_name ?? user.user_metadata.name ?? "Customer",
    email: previous?.email ?? user.email ?? null,
    avatar_url: previous?.avatar_url ?? user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null,
    phone: "+91" + phone,
    address_line: address,
    postal_code: postalCode || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) redirect(errorUrl("We could not save your delivery details. Please try again."));

  if (addressChanged) {
    const { error: routeError } = await supabase.rpc("refresh_customer_route", {
      p_force_reroute: true,
      p_user_id: user.id,
    });
    if (routeError) {
      revalidatePath("/account");
      redirect(errorUrl("Your address was saved, but the delivery route needs farm review. Please contact the farm."));
    }
  }
  revalidatePath("/account");
  revalidatePath("/calendar");
  revalidatePath("/farm", "layout");
  redirect("/account?section=settings&message=" + encodeURIComponent("Delivery details saved. Changes to a dispatched delivery require farm confirmation."));
}
