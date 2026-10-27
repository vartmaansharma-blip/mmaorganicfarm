"use server";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import type { FarmNotificationWorkspace } from "@/lib/farm-notifications";
async function notificationClient() {
  const context = await requireFarmStaff("/farm");
  if (!["admin", "manager"].includes(context.role))
    throw new Error("Farm management access required");
  return context.supabase;
}
export async function loadFarmNotifications(before: string | null = null) {
  const supabase = await notificationClient();
  if (before !== null && !/^\d{1,19}$/.test(before))
    return { error: "Choose a valid notification page." };
  const { data, error } = await supabase.rpc("get_farm_notifications", {
    p_before: before,
  });
  return error
    ? {
        error:
          "Notifications couldn’t be loaded. Your farm records are still available.",
      }
    : { data: data as FarmNotificationWorkspace };
}
export async function dismissFarmNotifications(ids: string[]) {
  const supabase = await notificationClient();
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 200 ||
    ids.some((id) => !/^\d{1,19}$/.test(id))
  )
    return { error: "Choose the notifications to update." };
  const { data, error } = await supabase.rpc("dismiss_farm_notifications", {
    p_ids: ids,
  });
  return error
    ? {
        error:
          "That update couldn’t be confirmed. Your notifications are still here.",
      }
    : { data: data as FarmNotificationWorkspace };
}
