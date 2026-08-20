"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayInIndia } from "@/lib/delivery-calendar";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function staffMessage(key: "error" | "message", value: string): never {
  redirect(`/farm/staff?${key}=${encodeURIComponent(value)}`);
}

function inviteRedirectUrl() {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://mmaorganicfarm-tvn8.vercel.app";
  return `${site}/auth/callback?next=/reset-password`;
}

export async function inviteDriver(formData: FormData) {
  const { role } = await requireFarmManager("/farm/staff");
  if (role !== "admin") staffMessage("error", "Only an admin can invite farm staff.");

  const email = textValue(formData, "email").toLowerCase();
  const fullName = textValue(formData, "fullName");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) staffMessage("error", "Enter a valid driver email address.");
  if (fullName.length < 2 || fullName.length > 120) staffMessage("error", "Enter the driver's name.");

  const admin = createAdminClient();
  const { data: usersResult, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) staffMessage("error", usersError.message);
  let driver = usersResult.users.find((user) => user.email?.toLowerCase() === email);
  let invited = false;

  if (!driver) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: inviteRedirectUrl(),
    });
    if (error || !data.user) staffMessage("error", error?.message ?? "The driver invitation could not be sent.");
    driver = data.user;
    invited = true;
  }

  const { error: staffError } = await admin.from("farm_staff").upsert({
    active: true,
    role: "driver",
    updated_at: new Date().toISOString(),
    user_id: driver.id,
  });
  if (staffError) staffMessage("error", staffError.message);

  const { error: profileError } = await admin.from("customer_profiles").upsert({
    email,
    full_name: fullName,
    updated_at: new Date().toISOString(),
    user_id: driver.id,
  }, { onConflict: "user_id" });
  if (profileError) staffMessage("error", profileError.message);

  revalidatePath("/farm/staff");
  revalidatePath("/farm/routes");
  revalidatePath("/farm/delivery-sheet");
  staffMessage("message", invited ? "Driver invited. Assign a route after they accept the email invitation." : "Existing account activated as a driver.");
}

export async function setDriverActive(formData: FormData) {
  const { role, user } = await requireFarmManager("/farm/staff");
  if (role !== "admin") staffMessage("error", "Only an admin can change farm staff access.");
  const userId = textValue(formData, "userId");
  const active = textValue(formData, "active") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(userId) || userId === user.id) staffMessage("error", "Choose another farm staff account.");

  const admin = createAdminClient();
  if (!active) {
    const today = todayInIndia();
    const [defaults, dailyAssignments, unfinishedDeliveries] = await Promise.all([
      admin.from("route_driver_assignments")
        .select("route_id", { count: "exact", head: true })
        .eq("driver_id", userId),
      admin.from("daily_route_assignments")
        .select("route_id", { count: "exact", head: true })
        .eq("driver_id", userId)
        .gte("delivery_date", today),
      admin.from("daily_deliveries")
        .select("visit_key", { count: "exact", head: true })
        .eq("assigned_driver_id", userId)
        .gte("delivery_date", today)
        .in("status", ["planned", "ready", "out_for_delivery", "failed"]),
    ]);
    const assignmentError = defaults.error ?? dailyAssignments.error ?? unfinishedDeliveries.error;
    if (assignmentError) staffMessage("error", assignmentError.message);
    if (defaults.count || dailyAssignments.count || unfinishedDeliveries.count) {
      staffMessage("error", "Reassign this driver's permanent routes and current or future dispatch work before deactivating access.");
    }
  }

  const { error } = await admin.from("farm_staff").update({ active, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("role", "driver");
  if (error) staffMessage("error", error.message);
  revalidatePath("/farm/staff");
  revalidatePath("/farm/routes");
  revalidatePath("/farm/delivery-sheet");
  staffMessage("message", active ? "Driver access restored." : "Driver access deactivated.");
}
