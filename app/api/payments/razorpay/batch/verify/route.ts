import { NextResponse } from "next/server";
import { getRazorpayPayment, hasRazorpayConfig, verifyPaymentSignature } from "@/lib/razorpay";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!hasRazorpayConfig() || !hasSupabaseAdminConfig())
    return NextResponse.json({ error: "Payment verification is not configured." }, { status: 503 });
  const body = await request.json().catch(() => null) as {
    batchId?: string; paymentId?: string; providerOrderId?: string; signature?: string;
  } | null;
  if (!body?.batchId || !body.paymentId || !body.providerOrderId || !body.signature)
    return NextResponse.json({ error: "Payment details are incomplete." }, { status: 400 });
  const admin = createAdminClient();
  const { data: batch } = await admin.from("checkout_batches")
    .select("id,user_id,amount_paise,provider_order_id,status,is_test")
    .eq("id", body.batchId).eq("user_id", user.id).maybeSingle();
  if (!batch?.provider_order_id || batch.provider_order_id !== body.providerOrderId)
    return NextResponse.json({ error: "Payment order mismatch." }, { status: 400 });
  if (!verifyPaymentSignature({ paymentId: body.paymentId,
    providerOrderId: batch.provider_order_id, signature: body.signature }))
    return NextResponse.json({ error: "Payment signature could not be verified." }, { status: 400 });
  const payment = await getRazorpayPayment(body.paymentId);
  if (payment.order_id !== batch.provider_order_id
    || payment.amount !== batch.amount_paise || payment.currency !== "INR")
    return NextResponse.json({ error: "Payment amount or order reference did not match." }, { status: 400 });
  if (payment.status === "captured") {
    const { error } = await admin.rpc("capture_checkout_batch", {
      p_batch_id: batch.id,
      p_provider_order_id: batch.provider_order_id,
      p_provider_payment_id: payment.id,
      p_amount_paise: payment.amount,
    });
    if (error) return NextResponse.json({ error: "Payment confirmation is pending. Do not pay again." }, { status: 503 });
    return NextResponse.json({ status: batch.is_test ? "test_captured" : "paid" });
  }
  if (payment.status === "authorized") return NextResponse.json({ status: "processing" });
  return NextResponse.json({ error: "Payment has not been captured. Do not pay again yet." }, { status: 409 });
}
