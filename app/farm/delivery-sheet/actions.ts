"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageLocations, requireFarmStaff } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function deliverySheetUrl(formData: FormData, key: "error" | "message", value: string) {
  const parameters = new URLSearchParams();
  const date = validDate(textValue(formData, "deliveryDate"));
  const area = textValue(formData, "area");
  if (date) parameters.set("date", date);
  if (area) parameters.set("area", area);
  parameters.set(key, value);
  return `/farm/delivery-sheet?${parameters.toString()}`;
}

export async function assignRouteDriver(formData: FormData) {
  const { role, supabase, user } = await requireFarmStaff("/farm/delivery-sheet");
  if (!canManageLocations(role)) {
    redirect(deliverySheetUrl(formData, "error", "Manager access is required."));
  }

  const routeId = textValue(formData, "routeId");
  const driverId = textValue(formData, "driverId");
  const deliveryDate = validDate(textValue(formData, "deliveryDate"));
  if (!routeId || !driverId || !deliveryDate) {
    redirect(deliverySheetUrl(formData, "error", "Choose a route and driver."));
  }

  const admin = createAdminClient();
  const { data: driver, error: driverError } = await admin
    .from("farm_staff")
    .select("user_id")
    .eq("user_id", driverId)
    .eq("active", true)
    .maybeSingle();
  if (driverError) throw driverError;
  if (!driver) {
    redirect(deliverySheetUrl(formData, "error", "The selected driver is not active."));
  }

  const { error: assignmentError } = await supabase
    .from("route_driver_assignments")
    .upsert(
      {
        driver_id: driverId,
        route_id: routeId,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "route_id" },
    );
  if (assignmentError) throw assignmentError;

  const { error: deliveryError } = await supabase
    .from("daily_deliveries")
    .update({ assigned_driver_id: driverId, updated_at: new Date().toISOString() })
    .eq("delivery_date", deliveryDate)
    .eq("delivery_route_id", routeId)
    .eq("is_test", false)
    .in("status", ["planned", "ready", "out_for_delivery", "failed"]);
  if (deliveryError) throw deliveryError;

  revalidatePath("/farm");
  revalidatePath("/farm/delivery-sheet");
  redirect(deliverySheetUrl(formData, "message", "Driver assigned to this route."));
}

export async function recordDeliveryStop(formData: FormData) {
  const { supabase } = await requireFarmStaff("/farm/delivery-sheet");
  const deliveryId = textValue(formData, "deliveryId");
  if (!deliveryId) {
    redirect(deliverySheetUrl(formData, "error", "Delivery stop is missing."));
  }

  const deliveryConfirmed = formData.get("deliveryConfirmed") === "yes";
  const bottleReturned = formData.get("bottleReturned") === "yes";
  const driverNote = textValue(formData, "driverNote");

  const { error } = await supabase.rpc("record_delivery_stop", {
    p_bottle_returned: bottleReturned,
    p_delivery_confirmed: deliveryConfirmed,
    p_delivery_id: deliveryId,
    p_driver_note: driverNote || null,
  });

  if (error) {
    console.error("Unable to record delivery stop", error.message);
    redirect(deliverySheetUrl(formData, "error", error.message));
  }

  revalidatePath("/account");
  revalidatePath("/farm");
  revalidatePath("/farm/delivery-sheet");
  redirect(deliverySheetUrl(formData, "message", "Doorstep checks saved."));
}
