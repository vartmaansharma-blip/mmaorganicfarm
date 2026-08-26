"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageLocations, requireFarmStaff } from "@/lib/farm-dashboard";

export type RouteMoveActionState = {
  error?: string;
  message?: string;
  ok: boolean;
};

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
  if (stopsError) redirect(deliverySheetUrl(formData, "error", stopsError.message));

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
      ? `${generated} paid delivery lines refreshed. Review doorstep visits before release.`
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
    `${Number(data ?? 0)} doorstep visits released to their drivers.`,
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
  const deliveryIds = formData.getAll("deliveryId").map(String).filter((value) => /^[0-9a-f-]{36}$/i.test(value));
  if (!deliveryIds.length || deliveryIds.length > 50) {
    redirect(deliverySheetUrl(formData, "error", "Delivery stop is missing."));
  }

  const deliveryConfirmed = formData.get("deliveryConfirmed") === "yes";
  const bottlesReturned = Number(formData.get("bottlesReturned") ?? 0);
  if (!Number.isInteger(bottlesReturned) || bottlesReturned < 0 || bottlesReturned > 50) {
    redirect(deliverySheetUrl(formData, "error", "Enter a valid bottle return count."));
  }
  const driverNote = textValue(formData, "driverNote");

  const { error } = await supabase.rpc("record_delivery_visit", {
    p_bottles_returned: bottlesReturned,
    p_delivery_confirmed: deliveryConfirmed,
    p_delivery_ids: deliveryIds,
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

export async function moveDeliveryVisit(
  _previousState: RouteMoveActionState | null,
  formData: FormData,
): Promise<RouteMoveActionState> {
  try {
    const { role, supabase } = await requireFarmStaff("/farm/delivery-sheet");
    if (!canManageLocations(role)) return { error: "Manager access is required.", ok: false };

    const deliveryDate = validDate(textValue(formData, "deliveryDate"));
    const visitKey = textValue(formData, "visitKey");
    const routeId = textValue(formData, "routeId");
    const position = Number.parseInt(textValue(formData, "position"), 10);
    const applyToCustomer = formData.get("applyToCustomer") === "yes";
    if (!deliveryDate || !visitKey || !routeId || !Number.isInteger(position)) {
      return { error: "Choose a route and a valid stop position.", ok: false };
    }

    const { data, error } = await supabase.rpc("move_delivery_visit", {
      p_apply_to_customer: applyToCustomer,
      p_delivery_date: deliveryDate,
      p_position: position,
      p_route_id: routeId,
      p_visit_key: visitKey,
    });
    if (error) return { error: error.message, ok: false };

    const savedPosition = Number((data as { stop_position?: number } | null)?.stop_position ?? position);
    return {
      message: applyToCustomer
        ? `Visit moved to position ${savedPosition}; the customer default and future unreleased visits were updated.`
        : `Visit moved to position ${savedPosition} for this delivery date only.`,
      ok: true,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The visit could not be moved.", ok: false };
  }
}
