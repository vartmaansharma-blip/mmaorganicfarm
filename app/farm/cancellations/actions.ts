"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageLocations, requireFarmStaff } from "@/lib/farm-dashboard";

const RESOLUTIONS = new Set(["approved", "declined", "completed"]);

export async function resolveCancellationRequest(formData: FormData) {
  const { role, supabase } = await requireFarmStaff("/farm/cancellations");
  if (!canManageLocations(role)) redirect("/farm/cancellations?error=Manager+access+is+required.");

  const requestId = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!requestId || !RESOLUTIONS.has(status)) redirect("/farm/cancellations?error=Choose+a+valid+resolution.");

  const { error } = await supabase.rpc("resolve_cancellation_request", {
    p_note: note || null,
    p_request_id: requestId,
    p_status: status,
  });
  if (error) redirect(`/farm/cancellations?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/farm/cancellations");
  revalidatePath("/account");
  redirect(`/farm/cancellations?message=${encodeURIComponent(`Request ${status}.`)}`);
}
