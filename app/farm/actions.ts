"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nextDeliveryDateInIndia, todayInIndia } from "@/lib/delivery-calendar";
import { canManageLocations, requireFarmStaff } from "@/lib/farm-dashboard";

async function prepareDeliverySheet(deliveryDate: string) {
  const { role, supabase } = await requireFarmStaff("/farm");

  if (!canManageLocations(role)) {
    redirect("/farm?error=Manager+access+is+required+to+generate+a+delivery+sheet.");
  }

  const { data: dispatch, error: dispatchReadError } = await supabase
    .from("delivery_dispatches")
    .select("status")
    .eq("delivery_date", deliveryDate)
    .maybeSingle();
  if (dispatchReadError) redirect(`/farm?error=${encodeURIComponent(dispatchReadError.message)}`);
  if (dispatch?.status === "released") {
    redirect(`/farm?error=${encodeURIComponent("Reopen the released dispatch before refreshing its delivery sheet.")}`);
  }

  const { data: startedStops, error: startedError } = await supabase
    .from("daily_deliveries")
    .select("id")
    .eq("delivery_date", deliveryDate)
    .eq("is_test", false)
    .in("status", ["out_for_delivery", "delivered", "failed"])
    .limit(1);
  if (startedError) redirect(`/farm?error=${encodeURIComponent(startedError.message)}`);
  if ((startedStops ?? []).length) {
    redirect(`/farm?error=${encodeURIComponent("The delivery sheet cannot be refreshed after route work has started.")}`);
  }

  const { data, error } = await supabase.rpc("generate_daily_deliveries", {
    p_delivery_date: deliveryDate,
  });

  if (error) {
    console.error("Unable to generate delivery sheet", error.message);
    redirect("/farm?error=The+delivery+sheet+could+not+be+generated.");
  }

  const { error: dispatchError } = await supabase.rpc("prepare_daily_dispatch", {
    p_delivery_date: deliveryDate,
  });
  if (dispatchError) {
    console.error("Unable to prepare dispatch", dispatchError.message);
    redirect(`/farm?error=${encodeURIComponent(dispatchError.message)}`);
  }

  revalidatePath("/farm");
  revalidatePath("/farm/delivery-sheet");
  const count = Number(data ?? 0);
  redirect(
    `/farm?message=${encodeURIComponent(
      count === 0
        ? "Sheet checked. No active paid deliveries are scheduled for tomorrow."
        : `${count} paid delivery ${count === 1 ? "line" : "lines"} refreshed for tomorrow. Open the sheet to review doorstep visits.`,
    )}`,
  );
}

export async function generateTomorrowDeliverySheet() {
  await prepareDeliverySheet(nextDeliveryDateInIndia());
}

export async function prepareTodayDeliverySheet() {
  await prepareDeliverySheet(todayInIndia());
}

const DELIVERY_STATUSES = new Set([
  "ready",
  "out_for_delivery",
  "delivered",
  "failed",
  "cancelled",
]);

export async function updateDeliveryStatus(formData: FormData) {
  const { role, supabase } = await requireFarmStaff("/farm");

  if (!canManageLocations(role)) {
    redirect("/farm?error=Manager+access+is+required+to+update+a+delivery.");
  }

  const deliveryId = String(formData.get("deliveryId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!deliveryId || !DELIVERY_STATUSES.has(status)) {
    redirect("/farm?error=Choose+a+valid+delivery+status.");
  }

  const { error } = await supabase.rpc("update_daily_delivery_status", {
    p_delivery_id: deliveryId,
    p_status: status,
  });

  if (error) {
    console.error("Unable to update delivery status", error.message);
    redirect(`/farm?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/farm");
  revalidatePath("/account");
  redirect(`/farm?message=${encodeURIComponent(`Delivery marked ${status.replaceAll("_", " ")}.`)}`);
}
