"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFarmManager } from "@/lib/farm-dashboard";

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function resetManualPayment(formData: FormData) {
  const paymentId = textValue(formData, "paymentId");
  const userId = textValue(formData, "userId");
  const reason = textValue(formData, "reason");
  const returnTo = userId ? `/farm/payments?customer=${encodeURIComponent(userId)}` : "/farm/payments";
  const { role, supabase } = await requireFarmManager(returnTo);

  if (role !== "admin") {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=Only+an+admin+can+reset+a+payment.`);
  }
  if (!/^[0-9a-f-]{36}$/i.test(paymentId) || reason.length < 3 || reason.length > 300) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=Add+a+short+reason+for+the+payment+reset.`);
  }

  const { error } = await supabase.rpc("reset_manual_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/farm");
  revalidatePath("/farm/capacity");
  revalidatePath("/farm/delivery-sheet");
  revalidatePath("/farm/locations");
  revalidatePath("/farm/payments");
  if (userId) revalidatePath(`/farm/customers/${userId}`);
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}message=Manual+payment+reset.+The+order+and+future+service+were+reversed.`);
}
