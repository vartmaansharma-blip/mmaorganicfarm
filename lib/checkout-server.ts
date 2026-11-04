import "server-only";
import { paymentModeError } from "./payment-mode";
import { createAdminClient } from "@/lib/supabase/admin";

type Payment = { amount: number; currency: string; orderId: string; paymentId: string; providerOrderId: string };
type PaymentResult = { status: "paid" | "processing" | "review_required"; duplicate?: boolean; isTest?: boolean };

async function recordVerifiedPayment(payment: Payment, status: "authorized" | "captured"): Promise<PaymentResult> {
  const admin = createAdminClient();
  const { data: order, error } = await admin.from("orders")
    .select("id,total_paise,is_test")
    .eq("id", payment.orderId).eq("razorpay_order_id", payment.providerOrderId).single();
  if (error || !order || order.total_paise !== payment.amount || payment.currency !== "INR")
    throw new Error("Payment order or amount mismatch.");
  const modeError = paymentModeError(order.is_test);
  if (modeError) throw new Error(modeError);

  // Both checkout verification and webhooks use the same database transaction.
  // Fail without a fallback if the migration is unavailable: several independent
  // writes cannot guarantee recovery after an interrupted confirmation.
  const { data, error: recordError } = await admin.rpc("record_razorpay_payment", {
    p_order_id: order.id,
    p_provider_order_id: payment.providerOrderId,
    p_payment_id: payment.paymentId,
    p_amount_paise: payment.amount,
    p_currency: payment.currency,
    p_is_test: order.is_test,
    p_status: status,
  });
  if (recordError || !data || !["paid", "processing", "review_required"].includes(data.status))
    throw new Error("Payment confirmation could not be saved. Do not pay again.");
  return data as PaymentResult;
}

export async function recordCapturedPayment(payment: Payment) {
  return recordVerifiedPayment(payment, "captured");
}

export async function recordAuthorizedPayment(payment: Payment) {
  return recordVerifiedPayment(payment, "authorized");
}
