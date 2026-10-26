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

export async function correctPaymentDetails(formData: FormData) {
  const { role, supabase } = await requireFarmManager("/farm/payments");
  if (role !== "admin") redirect("/farm/payments?error=Owner+access+is+required.");
  const userId = textValue(formData,"userId");
  const returnTo = /^[0-9a-f-]{36}$/i.test(userId) ? `/farm/payments?customer=${userId}` : "/farm/payments";
  const join = returnTo.includes("?") ? "&" : "?";
  const received = textValue(formData,"receivedAt");
  // The input explicitly displays India time; never interpret it in the server timezone.
  const paidAt = new Date(`${received}+05:30`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(received) || !Number.isFinite(paidAt.valueOf())) redirect(`${returnTo}${join}error=Choose+a+valid+received+date.`);
  const {error} = await supabase.rpc("correct_manual_payment_details", {
    p_payment_id: textValue(formData,"paymentId"), p_method: textValue(formData,"method"),
    p_reference: textValue(formData,"reference"), p_paid_at: paidAt.toISOString(),
    p_reason: textValue(formData,"reason"), p_expected_revision: Number(formData.get("revision")),
  });
  if (error) redirect(`${returnTo}${join}error=${encodeURIComponent(error.code === "23505" ? "That reference is already recorded on another payment. Check it before saving." : error.message)}`);
  revalidatePath("/farm/payments");
  revalidatePath(`/farm/customers/${userId}`);
  redirect(`${returnTo}${join}message=Receipt+details+corrected.+The+amount+and+service+are+unchanged.`);
}
