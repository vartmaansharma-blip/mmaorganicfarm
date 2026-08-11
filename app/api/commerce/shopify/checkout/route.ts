import { NextResponse } from "next/server";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  releaseOrderCapacity,
  reserveOrderCapacity,
} from "@/lib/production-capacity";
import {
  createShopifyCart,
  hasShopifyStorefrontConfig,
  shopifyVariantId,
  type ShopifyProductKey,
} from "@/lib/shopify";

export const runtime = "nodejs";

type CheckoutRequest = { orderId?: string; termsAccepted?: boolean };

export async function POST(request: Request) {
  if (!hasShopifyStorefrontConfig() || !hasSupabaseAdminConfig()) {
    return NextResponse.json(
      { error: "The Shopify store connection is not configured yet." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as CheckoutRequest;
  if (!body.orderId || body.termsAccepted !== true) {
    return NextResponse.json(
      { error: "Accept the order terms before continuing." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id,user_id,status,purchase_mode,delivery_plan_id,bottle_choice,phone_snapshot,address_snapshot,order_items(product_key,quantity,frequency,scheduled_days,delivery_date)",
    )
    .eq("id", body.orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!order || ["cancelled", "paid"].includes(order.status)) {
    return NextResponse.json(
      { error: "This order cannot be sent to checkout." },
      { status: 409 },
    );
  }

  let capacityReserved = false;
  try {
    await reserveOrderCapacity(order.id);
    capacityReserved = true;

    const lines = (order.order_items ?? []).map((item) => {
      const scheduledDays = item.scheduled_days ?? [];
      const deliveries =
        item.frequency === "weekly" && item.product_key !== "milk"
          ? scheduledDays.length
          : 1;
      const quantity = Math.round(Number(item.quantity) * deliveries);
      if (quantity < 1) throw new Error("The saved order contains an invalid quantity.");
      return {
        attributes: [
          { key: "M'ma order", value: order.id },
          { key: "Delivery frequency", value: item.frequency },
          ...(scheduledDays.length
            ? [{ key: "Scheduled weekdays", value: scheduledDays.join(",") }]
            : []),
          ...(item.delivery_date
            ? [{ key: "First delivery", value: item.delivery_date }]
            : []),
        ],
        merchandiseId: shopifyVariantId(item.product_key as ShopifyProductKey),
        quantity,
      };
    });

    if (order.bottle_choice === "new") {
      const bottleQuantity = (order.order_items ?? [])
        .filter((item) => item.product_key === "milk")
        .reduce((total, item) => total + Math.round(Number(item.quantity)), 0);
      if (bottleQuantity < 1) {
        throw new Error("The saved order contains no milk bottles.");
      }
      lines.push({
        attributes: [{ key: "M'ma order", value: order.id }],
        merchandiseId: shopifyVariantId("bottle"),
        quantity: bottleQuantity,
      });
    }

    const cart = await createShopifyCart({
      attributes: [
        { key: "mma_order_id", value: order.id },
        { key: "purchase_mode", value: order.purchase_mode },
        ...(order.delivery_plan_id
          ? [{ key: "mma_delivery_plan_id", value: order.delivery_plan_id }]
          : []),
      ],
      buyer: { email: user.email, phone: order.phone_snapshot },
      buyerIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      lines,
    });

    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("orders")
      .update({
        commerce_provider: "shopify",
        shopify_cart_id: cart.id,
        shopify_checkout_url: cart.checkoutUrl,
        status: "pending_payment",
        terms_accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("user_id", user.id);
    if (updateError) throw new Error("The checkout could not be linked to your order.");

    return NextResponse.json({ checkoutUrl: cart.checkoutUrl });
  } catch (error) {
    if (capacityReserved) await releaseOrderCapacity(order.id);
    console.error("Unable to create Shopify checkout", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Shopify checkout could not be prepared.",
      },
      {
        status:
          error instanceof Error && error.message.includes("capacity is full")
            ? 409
            : 502,
      },
    );
  }
}
