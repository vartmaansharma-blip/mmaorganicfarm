"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageLocations, requireFarmStaff } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function routeValues(value: string) {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function routeSettings(formData: FormData) {
  const areaId = textValue(formData, "areaId");
  const name = textValue(formData, "name");
  const code = textValue(formData, "code");
  const matchTerms = routeValues(textValue(formData, "matchTerms"));
  const postalCodes = routeValues(textValue(formData, "postalCodes"));
  const stopCapacity = Number.parseInt(textValue(formData, "stopCapacity"), 10);

  if (!areaId) throw new Error("Choose a service area.");
  if (name.length < 2 || name.length > 80) throw new Error("Enter a route name.");
  if (code.length > 24) throw new Error("Keep the route code under 24 characters.");
  if (matchTerms.length > 20 || matchTerms.some((term) => term.length < 2 || term.length > 80)) {
    throw new Error("Add up to 20 valid locality terms.");
  }
  if (postalCodes.length > 20 || postalCodes.some((codeValue) => !/^\d{6}$/.test(codeValue))) {
    throw new Error("Postal codes must contain six digits.");
  }
  if (!Number.isInteger(stopCapacity) || stopCapacity < 1 || stopCapacity > 200) {
    throw new Error("Route capacity must be between 1 and 200 stops.");
  }

  return { areaId, code: code || null, matchTerms, name, postalCodes, stopCapacity };
}

async function requireRouteManager() {
  const context = await requireFarmStaff("/farm/routes");
  if (!canManageLocations(context.role)) throw new Error("Manager access is required.");
  return context;
}

export async function createDeliveryRoute(formData: FormData) {
  const { supabase } = await requireRouteManager();
  const settings = routeSettings(formData);
  const { error } = await supabase.from("delivery_routes").insert({
    active: true,
    area_id: settings.areaId,
    code: settings.code,
    match_terms: settings.matchTerms,
    name: settings.name,
    postal_codes: settings.postalCodes,
    stop_capacity: settings.stopCapacity,
  });
  if (error) redirect(`/farm/routes?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/farm");
  revalidatePath("/farm/routes");
  redirect("/farm/routes?message=Delivery+route+created.");
}

export async function updateDeliveryRoute(formData: FormData) {
  const { supabase } = await requireRouteManager();
  const routeId = textValue(formData, "routeId");
  const settings = routeSettings(formData);
  if (!routeId) throw new Error("Route is required.");

  const { error } = await supabase.from("delivery_routes").update({
    area_id: settings.areaId,
    code: settings.code,
    match_terms: settings.matchTerms,
    name: settings.name,
    postal_codes: settings.postalCodes,
    stop_capacity: settings.stopCapacity,
    updated_at: new Date().toISOString(),
  }).eq("id", routeId);
  if (error) redirect(`/farm/routes?error=${encodeURIComponent(error.message)}`);

  await supabase.rpc("assign_unrouted_customers");
  revalidatePath("/farm");
  revalidatePath("/farm/locations");
  revalidatePath("/farm/routes");
  redirect("/farm/routes?message=Route+rules+updated+and+customers+checked.");
}

export async function assignRouteDriver(formData: FormData) {
  const { supabase, user } = await requireRouteManager();
  const routeId = textValue(formData, "routeId");
  const driverId = textValue(formData, "driverId");
  if (!routeId || !driverId) throw new Error("Choose a route and driver.");

  const admin = createAdminClient();
  const { data: driver, error: driverError } = await admin.from("farm_staff")
    .select("user_id")
    .eq("user_id", driverId)
    .eq("role", "driver")
    .eq("active", true)
    .maybeSingle();
  if (driverError) throw driverError;
  if (!driver) throw new Error("Choose an active driver.");

  const { error } = await supabase.from("route_driver_assignments").upsert({
    driver_id: driverId,
    route_id: routeId,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }, { onConflict: "route_id" });
  if (error) throw error;

  revalidatePath("/farm");
  revalidatePath("/farm/routes");
  revalidatePath("/farm/delivery-sheet");
  redirect("/farm/routes?message=Driver+assigned+to+route.");
}

export async function runAutomaticRouting() {
  const { supabase } = await requireRouteManager();
  const { data, error } = await supabase.rpc("assign_unrouted_customers");
  if (error) redirect(`/farm/routes?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/farm");
  revalidatePath("/farm/locations");
  revalidatePath("/farm/routes");
  redirect(`/farm/routes?message=${encodeURIComponent(`${Number(data ?? 0)} customer routes assigned.`)}`);
}
