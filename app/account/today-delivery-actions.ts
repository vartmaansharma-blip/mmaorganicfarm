"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { changeProducts, type ChangeProduct } from "@/lib/today-delivery-management";

export type TodayActionState = { ok: boolean; message: string };
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function requestTodayDelivery(
  input: { id: string; delivery: string; product: ChangeProduct | null; expected: number | null; quantity: number | null; note: string },
): Promise<TodayActionState> {
  if (!uuid.test(input.id) || !uuid.test(input.delivery) || typeof input.note !== "string" || input.note.length > 300
    || (input.product !== null && (!changeProducts.includes(input.product) || !Number.isFinite(input.quantity) || !Number.isFinite(input.expected)))) {
    return { ok: false, message: "Review your request and try again." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sign in again before sending a delivery request." };
  const { error } = await supabase.rpc("request_today_delivery_change", {
    p_id: input.id,
    p_delivery: input.delivery,
    p_kind: input.product ? "quantity" : "issue",
    p_product: input.product,
    p_expected: input.expected,
    p_quantity: input.quantity,
    p_note: input.note,
  });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "The request could not be confirmed. Refresh your delivery and try again." };
  revalidatePath("/account");
  revalidatePath("/account/notifications");
  revalidatePath("/farm/cancellations");
  return { ok: true, message: "Request sent. Your current delivery and payment stay as shown while the farm reviews it." };
}
