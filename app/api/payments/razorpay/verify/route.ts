import { paymentModeError } from "@/lib/payment-mode";
import { NextResponse } from "next/server";
import { recordAuthorizedPayment, recordCapturedPayment } from "@/lib/checkout-server";
import { getRazorpayPayment, hasRazorpayConfig, verifyPaymentSignature } from "@/lib/razorpay";
import { hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!hasRazorpayConfig() || !hasSupabaseAdminConfig()) return NextResponse.json({ error: "Payment verification is not configured." }, { status: 503 });
  const body = await request.json().catch(() => null) as { orderId?: string; paymentId?: string; providerOrderId?: string; signature?: string } | null;
  if (!body?.orderId || !body.paymentId || !body.providerOrderId || !body.signature) return NextResponse.json({ error: "Payment details are incomplete." }, { status: 400 });
  const { data: order } = await supabase.from("orders").select("id,user_id,total_paise,razorpay_order_id,is_test").eq("id", body.orderId).eq("user_id", user.id).maybeSingle();
  if (!order?.razorpay_order_id || order.razorpay_order_id !== body.providerOrderId) return NextResponse.json({ error: "Payment order mismatch." }, { status: 400 });
  const modeError = paymentModeError(order.is_test);
  if (modeError) return NextResponse.json({ error: modeError }, { status: 409 });
  if (!verifyPaymentSignature({ paymentId: body.paymentId, providerOrderId: order.razorpay_order_id, signature: body.signature })) return NextResponse.json({ error: "Payment signature could not be verified." }, { status: 400 });
  try {
  const payment = await getRazorpayPayment(body.paymentId);
  if (payment.order_id !== order.razorpay_order_id || payment.amount !== order.total_paise || payment.currency !== "INR") return NextResponse.json({ error: "Payment amount or order reference did not match." }, { status: 400 });
  const record = { amount: payment.amount, currency: payment.currency, orderId: order.id, paymentId: payment.id, providerOrderId: order.razorpay_order_id };
  if (payment.status === "captured" || payment.status === "authorized") {
    const result = payment.status === "captured" ? await recordCapturedPayment(record) : await recordAuthorizedPayment(record);
    if (result.status === "review_required")
      return NextResponse.json({ error: "Your payment was captured and needs farm review. Do not pay again." }, { status: 409 });
    return NextResponse.json({ status: result.status });
  }
  return NextResponse.json({ error: "Payment has not been captured. Do not pay again yet." }, { status: 409 });
  } catch {
    return NextResponse.json({ error: "Payment confirmation is pending. Do not pay again. Check your profile or contact the farm." }, { status: 502 });
  }
}
