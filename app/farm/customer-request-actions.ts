"use server";
import { revalidatePath } from "next/cache";
import { requireFarmStaff, requireFarmManager } from "@/lib/farm-dashboard";
import {
  validOperationalDate,
  type OperationState,
} from "@/lib/delivery-operations";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const value = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
function refresh() {
  for (const path of [
    "/farm",
    "/farm/cancellations",
    "/farm/delivery-sheet",
    "/farm/routes",
    "/account",
    "/calendar",
  ])
    revalidatePath(path);
  revalidatePath("/farm/customers/[userId]", "page");
}
export async function recordCustomerRequest(
  _state: OperationState | null,
  form: FormData,
): Promise<OperationState> {
  const { supabase } = await requireFarmStaff("/farm/delivery-sheet");
  const date = validOperationalDate(value(form, "requestedDate"));
  if (
    !date ||
    !uuid.test(value(form, "deliveryId")) ||
    !uuid.test(value(form, "requestKey"))
  )
    return {
      ok: false,
      error: "Refresh this stop and choose the requested service date.",
    };
  try {
    const { error } = await supabase.rpc("record_driver_customer_request", {
      p_delivery_id: value(form, "deliveryId"),
      p_requested_date: date,
      p_kind: value(form, "kind"),
      p_words: value(form, "words"),
      p_key: value(form, "requestKey"),
    });
    if (error) return { ok: false, error: error.message };
    refresh();
    return {
      ok: true,
      message:
        "Request saved — awaiting manager approval. Today’s delivery is unchanged.",
    };
  } catch {
    return {
      ok: false,
      error: "The request was not confirmed. Keep these details and retry.",
    };
  }
}
export async function reviewCustomerRequest(
  _state: OperationState | null,
  form: FormData,
): Promise<OperationState> {
  const { supabase } = await requireFarmManager("/farm/cancellations");
  if (
    !uuid.test(value(form, "requestId")) ||
    !uuid.test(value(form, "requestKey"))
  )
    return { ok: false, error: "Refresh the request before reviewing." };
  try {
    const { error } = await supabase.rpc("review_driver_customer_request", {
      p_id: value(form, "requestId"),
      p_decision: value(form, "decision"),
      p_note: value(form, "note"),
      p_key: value(form, "requestKey"),
    });
    if (error) return { ok: false, error: error.message };
    refresh();
    return {
      ok: true,
      message:
        value(form, "decision") === "approve"
          ? "Milk skip applied. Prepaid service is preserved; future preparation will use the change."
          : "Review saved with an audit record.",
    };
  } catch {
    return {
      ok: false,
      error: "The decision was not confirmed. Keep these details and retry.",
    };
  }
}
