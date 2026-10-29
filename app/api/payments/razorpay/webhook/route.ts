import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { recordCapturedPayment } from "@/lib/checkout-server";
import { getRazorpayPayment, hasRazorpayWebhookConfig, verifyWebhookSignature } from "@/lib/razorpay";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasRazorpayWebhookConfig() || !hasSupabaseAdminConfig()) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  const body = await request.text(); const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !verifyWebhookSignature(body, signature)) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  const eventId = request.headers.get("x-razorpay-event-id") ?? createHash("sha256").update(body).digest("hex");
  const admin = createAdminClient(); const { data: existing } = await admin.from("payment_webhook_events").select("event_id").eq("event_id", eventId).maybeSingle();
  if (existing) return NextResponse.json({ duplicate: true, received: true });
  const webhook = JSON.parse(body); const payment = webhook.payload?.payment?.entity; const providerOrderId = payment?.order_id ?? webhook.payload?.order?.entity?.id;
  if (["payment.captured","order.paid"].includes(webhook.event) && payment?.id && payment.amount && payment.status === "captured" && providerOrderId) {
    const { data: batch, error: batchLookupError } = await admin.from("checkout_batches")
      .select("id,amount_paise").eq("provider_order_id", providerOrderId).maybeSingle();
    if (batchLookupError) return NextResponse.json({ error: "Payment lookup is temporarily unavailable." }, { status: 503 });
    if (batch) {
      const confirmed = await getRazorpayPayment(payment.id);
      if (confirmed.status !== "captured" || confirmed.order_id !== providerOrderId
        || confirmed.currency !== "INR" || confirmed.amount !== batch.amount_paise)
        return NextResponse.json({ error: "Combined payment mismatch." }, { status: 409 });
      const { error } = await admin.rpc("capture_checkout_batch", {
        p_batch_id: batch.id,
        p_provider_order_id: providerOrderId,
        p_provider_payment_id: confirmed.id,
        p_amount_paise: confirmed.amount,
      });
      if (error) return NextResponse.json({ error: "Combined payment is pending reconciliation." }, { status: 503 });
    } else {
      const { data: order } = await admin.from("orders").select("id").eq("razorpay_order_id", providerOrderId).maybeSingle();
      if (order) await recordCapturedPayment({ amount: payment.amount, orderId: order.id, paymentId: payment.id, providerOrderId });
    }
  }
  await admin.from("payment_webhook_events").insert({ event_id: eventId, event_type: webhook.event ?? "unknown" });
  return NextResponse.json({ received: true });
}
