"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageLocations, requireFarmStaff } from "@/lib/farm-dashboard";

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
  const { role, supabase } = await requireFarmStaff("/farm/delivery-sheet");
  if (!canManageLocations(role)) {
    redirect(deliverySheetUrl(formData, "error", "Manager access is required."));
  }

  const routeId = textValue(formData, "routeId");
  const driverId = textValue(formData, "driverId");
  const deliveryDate = validDate(textValue(formData, "deliveryDate"));
  if (!routeId || !driverId || !deliveryDate) {
    redirect(deliverySheetUrl(formData, "error", "Choose a route and driver."));
  }

  const makeDefault = formData.get("makeDefault") === "yes";
  const { error } = await supabase.rpc("assign_daily_route_driver", {
    p_delivery_date: deliveryDate,
    p_driver_id: driverId,
    p_make_default: makeDefault,
    p_route_id: routeId,
  });
  if (error) {
    redirect(deliverySheetUrl(formData, "error", error.message));
  }

  revalidatePath("/farm");
  revalidatePath("/farm/delivery-sheet");
  if (makeDefault) revalidatePath("/farm/routes");
  redirect(deliverySheetUrl(
    formData,
    "message",
    makeDefault
      ? "Driver assigned for this date and saved as the route default."
      : "Replacement driver assigned for this date only.",
  ));
}

export async function prepareDailyDispatch(formData: FormData) {
  const { role, supabase } = await requireFarmStaff("/farm/delivery-sheet");
  if (!canManageLocations(role)) {
    redirect(deliverySheetUrl(formData, "error", "Manager access is required."));
  }

  const deliveryDate = validDate(textValue(formData, "deliveryDate"));
  if (!deliveryDate) {
    redirect(deliverySheetUrl(formData, "error", "Choose a valid delivery date."));
  }

  const { data: startedStops, error: stopsError } = await supabase
    .from("daily_deliveries")
    .select("id,status")
    .eq("delivery_date", deliveryDate)
    .eq("is_test", false)
    .in("status", ["out_for_delivery", "delivered", "failed"])
    .limit(1);
  if (stopsError) throw stopsError;

  let generated = 0;
  if (!(startedStops ?? []).length) {
    const { data, error } = await supabase.rpc("generate_daily_deliveries", {
      p_delivery_date: deliveryDate,
    });
    if (error) {
      redirect(deliverySheetUrl(formData, "error", error.message));
    }
    generated = Number(data ?? 0);
  }

  const { error: dispatchError } = await supabase.rpc("prepare_daily_dispatch", {
    p_delivery_date: deliveryDate,
  });
  if (dispatchError) {
    redirect(deliverySheetUrl(formData, "error", dispatchError.message));
  }

  revalidatePath("/farm");
  revalidatePath("/farm/delivery-sheet");
  redirect(deliverySheetUrl(
    formData,
    "message",
    generated
      ? `${generated} paid delivery stops prepared. Review exceptions before release.`
      : "Dispatch refreshed. Review exceptions before release.",
  ));
}

export async function releaseDailyDispatch(formData: FormData) {
  const { role, supabase } = await requireFarmStaff("/farm/delivery-sheet");
  if (!canManageLocations(role)) {
    redirect(deliverySheetUrl(formData, "error", "Manager access is required."));
  }
  const deliveryDate = validDate(textValue(formData, "deliveryDate"));
  if (!deliveryDate) {
    redirect(deliverySheetUrl(formData, "error", "Choose a valid delivery date."));
  }

  const { data, error } = await supabase.rpc("release_daily_dispatch", {
    p_delivery_date: deliveryDate,
  });
  if (error) {
    redirect(deliverySheetUrl(formData, "error", error.message));
  }

  revalidatePath("/farm");
  revalidatePath("/farm/delivery-sheet");
  redirect(deliverySheetUrl(
    formData,
    "message",
    `${Number(data ?? 0)} stops released to their drivers.`,
  ));
}

export async function reopenDailyDispatch(formData: FormData) {
  const { role, supabase } = await requireFarmStaff("/farm/delivery-sheet");
  if (!canManageLocations(role)) {
    redirect(deliverySheetUrl(formData, "error", "Manager access is required."));
  }
  const deliveryDate = validDate(textValue(formData, "deliveryDate"));
  if (!deliveryDate) {
    redirect(deliverySheetUrl(formData, "error", "Choose a valid delivery date."));
  }

  const { error } = await supabase.rpc("reopen_daily_dispatch", {
    p_delivery_date: deliveryDate,
  });
  if (error) {
    redirect(deliverySheetUrl(formData, "error", error.message));
  }

  revalidatePath("/farm");
  revalidatePath("/farm/delivery-sheet");
  redirect(deliverySheetUrl(
    formData,
    "message",
    "Dispatch reopened. Drivers cannot see it until it is released again.",
  ));
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
