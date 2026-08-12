"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageLocations, requireFarmStaff } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";

const RESOLUTIONS = new Set(["approved", "declined", "completed"]);

export async function resolveCancellationRequest(formData: FormData) {
  const { role, user } = await requireFarmStaff("/farm/cancellations");
  if (!canManageLocations(role)) redirect("/farm/cancellations?error=Manager+access+is+required.");

  const requestId = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!requestId || !RESOLUTIONS.has(status)) redirect("/farm/cancellations?error=Choose+a+valid+resolution.");

  const admin = createAdminClient();
  const { data: request } = await admin.from("cancellation_requests").select("id,user_id,plan_id,order_id,status").eq("id", requestId).single();
  if (!request || request.status !== "requested") redirect("/farm/cancellations?error=This+request+was+already+resolved.");

  const resolvedAt = new Date().toISOString();
  const { error } = await admin.from("cancellation_requests").update({ resolution_note: note || null, resolved_at: resolvedAt, resolved_by: user.id, status }).eq("id", request.id);
  if (error) throw error;

  if (status === "approved") {
    if (request.plan_id) await admin.from("delivery_plans").update({ status: "cancelled", updated_at: resolvedAt }).eq("id", request.plan_id);
    if (request.order_id) await admin.from("orders").update({ status: "cancelled", updated_at: resolvedAt }).eq("id", request.order_id).in("status", ["draft", "pending_payment"]);
  }

  await admin.from("customer_notifications").insert({
    kind: "cancellation_update",
    message: note || `Your cancellation request was ${status}.`,
    order_id: request.order_id,
    title: `Cancellation ${status}`,
    user_id: request.user_id,
  });

  revalidatePath("/farm/cancellations");
  revalidatePath("/account");
  redirect(`/farm/cancellations?message=${encodeURIComponent(`Request ${status}.`)}`);
}
