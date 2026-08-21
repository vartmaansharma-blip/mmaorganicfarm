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

  if (!areaId) return { error: "Choose a service area." } as const;
  if (name.length < 2 || name.length > 80) return { error: "Enter a route name." } as const;
  if (code.length > 24) return { error: "Keep the route code under 24 characters." } as const;
  if (matchTerms.length > 20 || matchTerms.some((term) => term.length < 2 || term.length > 80)) {
    return { error: "Add up to 20 valid locality terms." } as const;
  }
  if (postalCodes.length > 20 || postalCodes.some((codeValue) => !/^\d{6}$/.test(codeValue))) {
    return { error: "Postal codes must contain six digits." } as const;
  }
  if (!Number.isInteger(stopCapacity) || stopCapacity < 1 || stopCapacity > 200) {
    return { error: "Route capacity must be between 1 and 200 stops." } as const;
  }

  return { settings: { areaId, code: code || null, matchTerms, name, postalCodes, stopCapacity } } as const;
}

async function requireRouteManager() {
  const context = await requireFarmStaff("/farm/routes");
  if (!canManageLocations(context.role)) throw new Error("Manager access is required.");
  return context;
}

export async function createDeliveryRoute(formData: FormData) {
  const { supabase } = await requireRouteManager();
  const parsed = routeSettings(formData);
  if (parsed.error) redirect(`/farm/routes?error=${encodeURIComponent(parsed.error)}`);
  const settings = parsed.settings;
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
  const parsed = routeSettings(formData);
  if (parsed.error) redirect(`/farm/routes?error=${encodeURIComponent(parsed.error)}`);
  if (!routeId) redirect("/farm/routes?error=Route+is+required.");
  const settings = parsed.settings;

  const { data: targetArea, error: areaError } = await supabase.from("delivery_areas")
    .select("id")
    .eq("id", settings.areaId)
    .eq("active", true)
    .maybeSingle();
  if (areaError) redirect(`/farm/routes?error=${encodeURIComponent(areaError.message)}`);
  if (!targetArea) redirect("/farm/routes?error=Choose+an+active+service+area.");

  const { error } = await supabase.rpc("update_delivery_route_settings", {
    p_area_id: settings.areaId,
    p_code: settings.code,
    p_match_terms: settings.matchTerms,
    p_name: settings.name,
    p_postal_codes: settings.postalCodes,
    p_route_id: routeId,
    p_stop_capacity: settings.stopCapacity,
  });
  if (error) redirect(`/farm/routes?error=${encodeURIComponent(error.message)}`);

  const { error: routingError } = await supabase.rpc("assign_unrouted_customers");
  if (routingError) redirect(`/farm/routes?error=${encodeURIComponent(`Route settings were saved, but customer routing failed: ${routingError.message}`)}`);
  revalidatePath("/farm");
  revalidatePath("/farm/locations");
  revalidatePath("/farm/routes");
  redirect("/farm/routes?message=Route+updated+and+customer+areas+synchronized.");
}

export async function assignRouteDriver(formData: FormData) {
  const { supabase, user } = await requireRouteManager();
  const routeId = textValue(formData, "routeId");
  const driverId = textValue(formData, "driverId");
  if (!routeId || !driverId) redirect("/farm/routes?error=Choose+a+route+and+driver.");

  const admin = createAdminClient();
  const { data: driver, error: driverError } = await admin.from("farm_staff")
    .select("user_id")
    .eq("user_id", driverId)
    .eq("role", "driver")
    .eq("active", true)
    .maybeSingle();
  if (driverError) redirect(`/farm/routes?error=${encodeURIComponent(driverError.message)}`);
  if (!driver) redirect("/farm/routes?error=Choose+an+active+driver.");

  const { error } = await supabase.from("route_driver_assignments").upsert({
    driver_id: driverId,
    route_id: routeId,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }, { onConflict: "route_id" });
  if (error) redirect(`/farm/routes?error=${encodeURIComponent(error.message)}`);

  const { error: syncError } = await supabase.rpc("sync_route_default_driver", {
    p_route_id: routeId,
  });
  if (syncError) redirect(`/farm/routes?error=${encodeURIComponent(`The driver was assigned, but future route work could not be synchronized: ${syncError.message}`)}`);

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
