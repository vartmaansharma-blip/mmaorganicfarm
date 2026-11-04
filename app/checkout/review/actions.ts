"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateBottleMode(_previous: string | null, form: FormData) {
  const mode = form.get("mode");
  const orderId = String(form.get("order") ?? "");
  const expectedTotal = Number(form.get("total"));
  if ((mode !== "return" && mode !== "new") || !Number.isSafeInteger(expectedTotal) || expectedTotal <= 0)
    return "Choose a bottle mode and try again.";

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_checkout_bottle_mode", {
    p_order_id: orderId,
    p_mode: mode,
    p_expected_total: expectedTotal,
  });
  revalidatePath("/checkout/review");
  return error ? "The bottle mode could not be changed. Review the current bill and try again." : null;
}
