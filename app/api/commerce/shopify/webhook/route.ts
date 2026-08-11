import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { hasShopifyWebhookConfig, shopifyWebhookSecret } from "@/lib/shopify";
import { consumeOrderCapacity } from "@/lib/production-capacity";

export const runtime = "nodejs";

type ShopifyAttribute = { name?: string; value?: string };
type ShopifyProperty = { name?: string; value?: string };
type ShopifyPaidOrder = {
  admin_graphql_api_id?: string;
  currency?: string;
  id?: number | string;
  line_items?: Array<{ properties?: ShopifyProperty[] }>;
  name?: string;
  note_attributes?: ShopifyAttribute[];
  total_price?: string;
};

function validSignature(body: string, signature: string) {
  const expected = createHmac("sha256", shopifyWebhookSecret())
    .update(body, "utf8")
    .digest("base64");
  const received = Buffer.from(signature);
  const calculated = Buffer.from(expected);
  return (
    received.length === calculated.length &&
    timingSafeEqual(received, calculated)
  );
}

function internalOrderId(order: ShopifyPaidOrder) {
  const noteValue = order.note_attributes?.find(
    (item) => item.name === "mma_order_id",
  )?.value;
  if (noteValue) return noteValue;
  return order.line_items
    ?.flatMap((item) => item.properties ?? [])
    .find((item) => item.name === "M'ma order")?.value;
}

export async function POST(request: Request) {
  if (!hasShopifyWebhookConfig() || !hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-shopify-hmac-sha256") ?? "";
  if (!signature || !validSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic") ?? "unknown";
  const eventId = request.headers.get("x-shopify-event-id") ?? "";
  const admin = createAdminClient();
  if (eventId) {
    const { data: existing } = await admin
      .from("payment_webhook_events")
      .select("event_id")
      .eq("event_id", eventId)
      .maybeSingle();
    if (existing) return NextResponse.json({ duplicate: true, received: true });
  }

  const order = JSON.parse(body) as ShopifyPaidOrder;
  const orderId = internalOrderId(order);
  if (topic === "orders/paid" && orderId && order.id) {
    const providerOrderId = String(order.admin_graphql_api_id ?? order.id);
    const paidTotal = Math.round(Number(order.total_price ?? "0") * 100);
    const { data: savedOrder } = await admin
      .from("orders")
      .select("id,user_id,delivery_plan_id")
      .eq("id", orderId)
      .maybeSingle();

    if (savedOrder && paidTotal > 0) {
      const paidAt = new Date().toISOString();
      const { error: paymentError } = await admin.from("payments").upsert(
        {
          amount_paise: paidTotal,
          currency: order.currency ?? "INR",
          order_id: savedOrder.id,
          paid_at: paidAt,
          provider: "shopify",
          provider_order_id: providerOrderId,
          provider_payment_id: providerOrderId,
          signature_verified: true,
          status: "captured",
          user_id: savedOrder.user_id,
        },
        { onConflict: "provider_payment_id" },
      );
      if (paymentError) throw new Error("Shopify payment could not be recorded.");

      const { error: orderError } = await admin
        .from("orders")
        .update({
          paid_total_paise: paidTotal,
          shopify_order_id: providerOrderId,
          shopify_order_name: order.name ?? null,
          status: "paid",
          updated_at: paidAt,
        })
        .eq("id", savedOrder.id);
      if (orderError) throw new Error("Shopify order could not be confirmed.");

      await consumeOrderCapacity(savedOrder.id);

      if (savedOrder.delivery_plan_id) {
        const { error: planError } = await admin
          .from("delivery_plans")
          .update({ status: "active", updated_at: paidAt })
          .eq("id", savedOrder.delivery_plan_id)
          .eq("user_id", savedOrder.user_id)
          .eq("status", "pending_confirmation");
        if (planError) throw new Error("Paid delivery plan could not be activated.");
      }
    }
  }

  if (eventId) {
    await admin.from("payment_webhook_events").insert({
      event_id: eventId,
      event_type: `shopify:${topic}`,
    });
  }
  return NextResponse.json({ received: true });
}
