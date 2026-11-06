"use server";

import { revalidatePath } from "next/cache";
import { requireFarmManager } from "@/lib/farm-dashboard";
import type { OperationState } from "@/lib/delivery-operations";

export async function reviewTodayRequest(_state: OperationState | null, form: FormData): Promise<OperationState> {
  const { supabase } = await requireFarmManager("/farm/cancellations");
  const id = String(form.get("requestId") ?? "");
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "").trim();
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
    || !["applied", "declined", "follow_up", "resolved"].includes(decision) || note.length < 3 || note.length > 300) {
    return { ok: false, error: "Choose a decision and a short customer-facing explanation." };
  }
  try {
    const { error } = await supabase.rpc("review_today_delivery_change", { p_id: id, p_decision: decision, p_note: note });
    if (error) return { ok: false, error: error.code === "P0001" ? error.message : "The decision could not be saved. Refresh and try again." };
    for (const path of ["/farm/cancellations", "/farm/delivery-sheet", "/farm/runs", "/farm/gps", "/account", "/account/notifications", "/calendar"]) revalidatePath(path);
    return { ok: true, message: decision === "applied" ? "Prepaid quantities updated and customer notified." : "Decision saved and customer notified." };
  } catch {
    return { ok: false, error: "The decision was not confirmed. Refresh the request before trying again." };
  }
}
