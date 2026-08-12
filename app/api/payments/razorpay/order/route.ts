import { NextResponse } from "next/server";
import { calculateCheckoutAmount, type CheckoutItem } from "@/lib/checkout";
import { releaseOrderCapacity, reserveOrderCapacity } from "@/lib/production-capacity";
import { createRazorpayOrder, hasRazorpayConfig, publicRazorpayKey } from "@/lib/razorpay";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!hasRazorpayConfig() || !hasSupabaseAdminConfig()) return NextResponse.json({ error: "Online payment is not enabled yet." }, { status: 503 });
  const body = await request.json().catch(() => null) as { orderId?: string; termsAccepted?: boolean } | null;
  if (!body?.orderId || body.termsAccepted !== true) return NextResponse.json({ error: "Accept the order terms before payment." }, { status: 400 });
  const { data: order } = await supabase.from("orders").select("id,user_id,status,bottle_choice,total_paise,razorpay_order_id,phone_snapshot").eq("id", body.orderId).eq("user_id", user.id).maybeSingle();
  if (!order || !["draft","pending_payment"].includes(order.status)) return NextResponse.json({ error: "This order is not available for payment." }, { status: 409 });
  const { data: items } = await supabase.from("order_items").select("product_key,quantity,unit_price_paise,frequency,scheduled_days").eq("order_id", order.id).eq("user_id", user.id);
  if (!items?.length) return NextResponse.json({ error: "This order has no items." }, { status: 400 });
  let amount: number;
  try { amount = calculateCheckoutAmount(items.map((item) => ({ ...item, quantity: Number(item.quantity), scheduled_days: item.scheduled_days ?? [], unit_price_paise: Number(item.unit_price_paise) })) as CheckoutItem[], order.bottle_choice).total; }
  catch { return NextResponse.json({ error: "This order could not be priced safely." }, { status: 400 }); }
  if (amount !== order.total_paise) return NextResponse.json({ error: "The order total changed. Review it again." }, { status: 409 });
  try {
    await reserveOrderCapacity(order.id);
    let providerOrderId = order.razorpay_order_id;
    if (!providerOrderId) providerOrderId = (await createRazorpayOrder({ amount, receipt: `mma_${order.id.replaceAll("-", "").slice(0, 32)}` })).id;
    const acceptedAt = new Date().toISOString();
    const { error } = await createAdminClient().from("orders").update({ razorpay_order_id: providerOrderId, status: "pending_payment", terms_accepted_at: acceptedAt, updated_at: acceptedAt }).eq("id", order.id).eq("user_id", user.id);
    if (error) throw new Error("Payment could not be prepared.");
    return NextResponse.json({ amount, keyId: publicRazorpayKey(), providerOrderId, prefill: { contact: order.phone_snapshot, email: user.email ?? "", name: user.user_metadata.full_name ?? user.user_metadata.name ?? "Customer" } });
  } catch (error) {
    await releaseOrderCapacity(order.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment could not be prepared." }, { status: 409 });
  }
}
