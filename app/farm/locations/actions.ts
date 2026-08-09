"use server";

import { revalidatePath } from "next/cache";
import {
  areaSlug,
  canManageLocations,
  requireFarmStaff,
} from "@/lib/farm-dashboard";

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function requireLocationManager() {
  const context = await requireFarmStaff("/farm/locations");
  if (!canManageLocations(context.role)) {
    throw new Error("Manager access is required.");
  }
  return context;
}

export async function createArea(formData: FormData) {
  const { supabase } = await requireLocationManager();
  const name = textValue(formData, "name");
  const slug = areaSlug(name);

  if (name.length < 2 || !slug) throw new Error("Enter a valid area name.");

  const { error } = await supabase.from("delivery_areas").insert({ name, slug });
  if (error) throw error;

  revalidatePath("/farm");
  revalidatePath("/farm/locations");
}

export async function createRoute(formData: FormData) {
  const { supabase } = await requireLocationManager();
  const areaId = textValue(formData, "areaId");
  const name = textValue(formData, "name");
  const code = textValue(formData, "code").toUpperCase();

  if (!areaId || name.length < 2) throw new Error("Choose an area and name the route.");

  const { error } = await supabase.from("delivery_routes").insert({
    area_id: areaId,
    code: code || null,
    name,
  });
  if (error) throw error;

  revalidatePath("/farm");
  revalidatePath("/farm/locations");
}

export async function assignCustomerLocation(formData: FormData) {
  const { supabase } = await requireLocationManager();
  const userId = textValue(formData, "userId");
  let areaId = textValue(formData, "areaId") || null;
  const routeId = textValue(formData, "routeId") || null;
  const rawStopOrder = Number(textValue(formData, "stopOrder"));
  const stopOrder =
    Number.isInteger(rawStopOrder) && rawStopOrder > 0 ? rawStopOrder : null;

  if (!userId) throw new Error("Customer is required.");

  if (routeId) {
    const { data: route, error: routeError } = await supabase
      .from("delivery_routes")
      .select("area_id")
      .eq("id", routeId)
      .single();
    if (routeError) throw routeError;
    areaId = route.area_id;
  }

  const { error } = await supabase
    .from("customer_profiles")
    .update({
      delivery_area_id: areaId,
      delivery_route_id: routeId,
      route_stop_order: stopOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) throw error;

  revalidatePath("/farm");
  revalidatePath("/farm/locations");
}
