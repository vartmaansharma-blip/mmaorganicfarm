"use server";
import { revalidatePath } from "next/cache";
import { requireFarmStaff, canManageLocations } from "@/lib/farm-dashboard";
import {
  validOperationalDate,
  type OperationState,
} from "@/lib/delivery-operations";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function text(f: FormData, k: string) {
  return String(f.get(k) ?? "").trim();
}
function invalidate() {
  for (const path of [
    "/farm",
    "/farm/delivery-sheet",
    "/farm/exceptions",
    "/farm/reconciliation",
    "/account",
  ])
    revalidatePath(path);
  revalidatePath("/farm/customers/[userId]", "page");
}
export async function saveDeliveryOutcome(
  _state: OperationState | null,
  form: FormData,
): Promise<OperationState> {
  const { supabase } = await requireFarmStaff("/farm/delivery-sheet");
  const ids = form.getAll("deliveryId").map(String);
  if (
    ids.length < 1 ||
    ids.length > 50 ||
    ids.some((id) => !uuid.test(id)) ||
    new Set(ids).size !== ids.length ||
    !uuid.test(text(form, "requestKey"))
  )
    return {
      ok: false,
      error: "Invalid visit. Refresh the route and try again.",
    };
  const outcome = text(form, "outcome");
  const bottles = Number(text(form, "bottlesReturned") || "0");
  if (!Number.isInteger(bottles) || bottles < 0 || bottles > 50)
    return { ok: false, error: "Enter a valid bottle return count." };
  const quantities =
    outcome === "partial"
      ? form
          .getAll("quantityKey")
          .map(String)
          .map((key) => {
            const [delivery_id, product_key] = key.split(":");
            const input = form.get(`actual:${key}`);
            return {
              delivery_id,
              product_key,
              quantity: input === null || input === "" ? null : Number(input),
            };
          })
      : null;
  try {
    const { error } = await supabase.rpc("record_delivery_outcome", {
      p_delivery_ids: ids,
      p_outcome: outcome,
      p_reason_code:
        outcome === "delivered" ? null : text(form, "reason") || null,
      p_note: text(form, "note") || null,
      p_bottles_returned: bottles,
      p_quantities: quantities,
      p_request_key: text(form, "requestKey"),
    });
    if (error) return { ok: false, error: error.message };
    invalidate();
    return {
      ok: true,
      message:
        outcome === "delivered"
          ? "Delivery saved. Continue to the next stop."
          : "Issue saved for manager review. Undelivered quantities remain outstanding.",
    };
  } catch {
    return {
      ok: false,
      error:
        "The outcome was not confirmed. Keep this form and retry with the same request.",
    };
  }
}
export async function resolveDeliveryException(
  _state: OperationState | null,
  form: FormData,
): Promise<OperationState> {
  const { supabase, role } = await requireFarmStaff("/farm/exceptions");
  if (!canManageLocations(role))
    return { ok: false, error: "Manager access is required." };
  const date = validOperationalDate(text(form, "date"));
  if (
    !date ||
    !uuid.test(text(form, "eventId")) ||
    !uuid.test(text(form, "requestKey"))
  )
    return {
      ok: false,
      error: "The exception changed. Refresh and review it again.",
    };
  try {
    const { error } = await supabase.rpc("resolve_delivery_exception", {
      p_date: date,
      p_visit_key: text(form, "visitKey"),
      p_expected_event: text(form, "eventId"),
      p_action: text(form, "resolution"),
      p_note: text(form, "note"),
      p_follow_up_date: validOperationalDate(text(form, "followUp")),
      p_request_key: text(form, "requestKey"),
    });
    if (error) return { ok: false, error: error.message };
    invalidate();
    return { ok: true, message: "Decision saved with an audit record." };
  } catch {
    return {
      ok: false,
      error:
        "Decision was not confirmed. Your entries are preserved; retry the same request.",
    };
  }
}
export async function reviewDeliveryDay(
  _state: OperationState | null,
  form: FormData,
): Promise<OperationState> {
  const { supabase, role } = await requireFarmStaff("/farm/reconciliation");
  if (!canManageLocations(role))
    return { ok: false, error: "Manager access is required." };
  const date = validOperationalDate(text(form, "date"));
  if (!date || !uuid.test(text(form, "requestKey")))
    return { ok: false, error: "Choose a valid operational date." };
  try {
    const { error } = await supabase.rpc("close_delivery_day", {
      p_date: date,
      p_action: text(form, "action"),
      p_note: text(form, "note"),
      p_request_key: text(form, "requestKey"),
    });
    if (error) return { ok: false, error: error.message };
    invalidate();
    return {
      ok: true,
      message:
        text(form, "action") === "closed"
          ? "Day closed. The reviewed snapshot is preserved."
          : "Correction review opened. The original closeout remains preserved.",
    };
  } catch {
    return {
      ok: false,
      error: "Closeout was not confirmed. Retry with the same request.",
    };
  }
}
