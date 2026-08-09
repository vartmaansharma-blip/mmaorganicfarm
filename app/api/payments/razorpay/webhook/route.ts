import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { recordCapturedPayment } from "@/lib/checkout-server";
import { hasRazorpayWebhookConfig, verifyWebhookSignature } from "@/lib/razorpay";
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
    const { data: order } = await admin.from("orders").select("id").eq("razorpay_order_id", providerOrderId).maybeSingle();
    if (order) await recordCapturedPayment({ amount: payment.amount, orderId: order.id, paymentId: payment.id, providerOrderId });
  }
  await admin.from("payment_webhook_events").insert({ event_id: eventId, event_type: webhook.event ?? "unknown" });
  return NextResponse.json({ received: true });
}
