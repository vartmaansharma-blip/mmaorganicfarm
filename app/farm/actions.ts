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
