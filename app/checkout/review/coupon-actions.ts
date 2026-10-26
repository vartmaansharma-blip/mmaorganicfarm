"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CouponState = { error?: string; message?: string };
export async function applyCheckoutCode(
  _previous: CouponState,
  formData: FormData,
): Promise<CouponState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to use your personal code." };
  const orderId = String(formData.get("order_id") ?? "");
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  const remove = formData.get("intent") === "remove";
  if (
    !/^[a-f0-9-]{36}$/i.test(orderId) ||
    (!remove && !/^MMA-[A-F0-9]{16}$/.test(code))
  )
    return { error: "Enter the personal code from your welcome-back message." };
  const { error } = await supabase.rpc("apply_my_checkout_code", {
    p_order_id: orderId,
    p_code: remove ? "" : code,
  });
  if (error) {
    // Only business validation messages are customer-facing; never leak SQL or infrastructure errors.
    const messages = [
      "This code is not valid for your account.",
      "You have already used your welcome-back offer.",
      "Your code is attached to another checkout. Open that order to continue or remove it there first.",
      "This offer is for your first monthly plan after cancelling a paid plan.",
      "This offer is for your first monthly plan back.",
      "Payment has started. This code cannot be changed.",
    ];
    return {
      error: messages.includes(error.message)
        ? error.message
        : "We could not apply your code. Review your order and try again.",
    };
  }
  revalidatePath("/checkout/review");
  revalidatePath("/welcome-back");
  return {
    message: remove
      ? "Code removed. Your original total is restored."
      : "Your personal code is applied. You save 5% on this month's products.",
  };
}
