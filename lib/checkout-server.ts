import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeOrderCapacity } from "@/lib/production-capacity";

type Payment = { amount: number; orderId: string; paymentId: string; providerOrderId: string };
export async function recordCapturedPayment(payment: Payment) {
  const admin = createAdminClient();
  const { data: order, error } = await admin.from("orders").select("id, user_id, delivery_plan_id, total_paise").eq("id", payment.orderId).eq("razorpay_order_id", payment.providerOrderId).single();
  if (error || !order || order.total_paise !== payment.amount) throw new Error("Paid order mismatch.");
  const paidAt = new Date().toISOString();
  const { error: paymentError } = await admin.from("payments").upsert({ amount_paise: payment.amount, currency: "INR", order_id: order.id, paid_at: paidAt, provider: "razorpay", provider_order_id: payment.providerOrderId, provider_payment_id: payment.paymentId, signature_verified: true, status: "captured", user_id: order.user_id }, { onConflict: "provider_payment_id" });
  if (paymentError) throw new Error("Payment record could not be saved.");
  const { error: updateError } = await admin.from("orders").update({ status: "paid", updated_at: paidAt }).eq("id", order.id);
  if (updateError) throw new Error("Order could not be marked paid.");
  await consumeOrderCapacity(order.id);
  if (order.delivery_plan_id) { const { error: planError } = await admin.from("delivery_plans").update({ status: "active", updated_at: paidAt }).eq("id", order.delivery_plan_id).eq("user_id", order.user_id).eq("status", "pending_confirmation"); if (planError) throw new Error("Plan could not be activated."); }
  await admin.from("customer_notifications").insert({
    kind: "payment_confirmed",
    message: order.delivery_plan_id
      ? "Your payment is confirmed and your delivery plan is active."
      : "Your payment is confirmed and your farm order is accepted.",
    order_id: order.id,
    title: "Payment confirmed",
    user_id: order.user_id,
  });
}
export async function recordAuthorizedPayment(input: Payment) {
  const admin = createAdminClient();
  const { data: order, error } = await admin.from("orders").select("id, user_id, total_paise").eq("id", input.orderId).eq("razorpay_order_id", input.providerOrderId).single();
  if (error || !order || order.total_paise !== input.amount) throw new Error("Authorized payment mismatch.");
  const { error: saveError } = await admin.from("payments").upsert({ amount_paise: input.amount, currency: "INR", order_id: order.id, provider: "razorpay", provider_order_id: input.providerOrderId, provider_payment_id: input.paymentId, signature_verified: true, status: "authorized", user_id: order.user_id }, { onConflict: "provider_payment_id" });
  if (saveError) throw new Error("Authorized payment could not be saved.");
}
