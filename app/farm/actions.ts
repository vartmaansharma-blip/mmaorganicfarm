"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nextDeliveryDateInIndia } from "@/lib/delivery-calendar";
import { canManageLocations, requireFarmStaff } from "@/lib/farm-dashboard";

export async function generateTomorrowDeliverySheet() {
  const { role, supabase } = await requireFarmStaff("/farm");

  if (!canManageLocations(role)) {
    redirect("/farm?error=Manager+access+is+required+to+generate+a+delivery+sheet.");
  }

  const deliveryDate = nextDeliveryDateInIndia();
  const { data, error } = await supabase.rpc("generate_daily_deliveries", {
    p_delivery_date: deliveryDate,
  });

  if (error) {
    console.error("Unable to generate delivery sheet", error.message);
    redirect("/farm?error=The+delivery+sheet+could+not+be+generated.");
  }

  revalidatePath("/farm");
  const count = Number(data ?? 0);
  redirect(
    `/farm?message=${encodeURIComponent(
      count === 0
        ? "Sheet checked. No active paid deliveries are scheduled for tomorrow."
        : `${count} delivery ${count === 1 ? "stop" : "stops"} prepared for tomorrow.`,
    )}`,
  );
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
