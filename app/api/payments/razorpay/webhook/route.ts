import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { recordCapturedPayment } from "@/lib/checkout-server";
import { hasRazorpayWebhookConfig, verifyWebhookSignature } from "@/lib/razorpay";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasRazorpayWebhookConfig() || !hasSupabaseAdminConfig())
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  const body = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !verifyWebhookSignature(body, signature))
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  let webhook;
  try { webhook = JSON.parse(body); }
  catch { return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 }); }
  if (!webhook || typeof webhook.event !== "string")
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  const eventId = request.headers.get("x-razorpay-event-id") ?? createHash("sha256").update(body).digest("hex");
  try {
    const admin = createAdminClient();
    const { data: existing, error: lookupError } = await admin.from("payment_webhook_events")
      .select("event_id").eq("event_id", eventId).maybeSingle();
    if (lookupError) throw new Error("Event lookup unavailable");
    if (existing) return NextResponse.json({ duplicate: true, received: true });
    if (["payment.captured", "order.paid"].includes(webhook.event)) {
      const payment = webhook.payload?.payment?.entity;
      if (!payment || typeof payment.id !== "string" || !/^pay_[A-Za-z0-9]+$/.test(payment.id)
        || typeof payment.order_id !== "string" || !/^order_[A-Za-z0-9]+$/.test(payment.order_id)
        || !Number.isSafeInteger(payment.amount) || payment.amount <= 0
        || payment.currency !== "INR" || payment.status !== "captured")
        return NextResponse.json({ error: "Invalid captured payment." }, { status: 400 });
      const { data: order, error: orderError } = await admin.from("orders")
        .select("id").eq("razorpay_order_id", payment.order_id).maybeSingle();
      // Do not permanently acknowledge an event before its order can be found.
      if (orderError || !order) throw new Error("Payment order unavailable");
      await recordCapturedPayment({ amount: payment.amount, currency: payment.currency,
        orderId: order.id, paymentId: payment.id, providerOrderId: payment.order_id });
    }
    const { error: eventError } = await admin.from("payment_webhook_events")
      .insert({ event_id: eventId, event_type: webhook.event });
    // A simultaneous retry may have inserted this event after both lookups.
    // Captured effects are already serialized by record_razorpay_payment.
    if (eventError && eventError.code !== "23505") throw new Error("Event record unavailable");
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Payment confirmation is pending. Retry delivery." }, { status: 503 });
  }
}
