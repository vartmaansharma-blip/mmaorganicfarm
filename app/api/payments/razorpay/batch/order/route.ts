import { NextResponse } from "next/server";
import { quoteCheckoutBatch } from "@/lib/checkout-batch";
import { paymentModeError, razorpayMode } from "@/lib/payment-mode";
import { reserveOrderCapacity } from "@/lib/production-capacity";
import { createRazorpayOrder, getRazorpayOrder, hasRazorpayConfig, publicRazorpayKey, RazorpayRequestError } from "@/lib/razorpay";
import { createAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!hasRazorpayConfig() || !hasSupabaseAdminConfig())
    return NextResponse.json({ error: "Online payment is not enabled yet." }, { status: 503 });
  const body = await request.json().catch(() => null) as {
    batchId?: string; expectedAmountPaise?: number; termsAccepted?: boolean;
  } | null;
  if (!body?.batchId || body.termsAccepted !== true)
    return NextResponse.json({ error: "Accept the order terms before payment." }, { status: 400 });
  const admin = createAdminClient();
  const { data: batch } = await admin.from("checkout_batches")
    .select("id,user_id,once_order_id,plan_order_id,amount_paise,is_test,status,provider_order_id")
    .eq("id", body.batchId).eq("user_id", user.id).maybeSingle();
  if (!batch || !["draft", "pending_payment"].includes(batch.status))
    return NextResponse.json({ error: "This combined checkout is not available for payment." }, { status: 409 });
  const modeError = paymentModeError(batch.is_test);
  if (modeError) return NextResponse.json({ error: modeError }, { status: 409 });
  if (razorpayMode() === "live" && process.env.RAZORPAY_LIVE_CHECKOUT_ENABLED !== "true")
    return NextResponse.json({ error: "Live payments are not enabled yet." }, { status: 503 });
  if (body.expectedAmountPaise !== batch.amount_paise)
    return NextResponse.json({ error: "Your total changed. Review it before paying." }, { status: 409 });

  let quote: Awaited<ReturnType<typeof quoteCheckoutBatch>>;
  try { quote = await quoteCheckoutBatch(admin, batch); }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The selected total could not be verified." }, { status: 409 });
  }
  const prefill = {
    contact: quote.once.phone_snapshot,
    email: user.email ?? "",
    name: user.user_metadata.full_name ?? user.user_metadata.name ?? "Customer",
  };
  if (batch.status === "pending_payment" && batch.provider_order_id) {
    const providerOrder = await getRazorpayOrder(batch.provider_order_id);
    if (providerOrder.amount !== quote.amount || providerOrder.currency !== "INR")
      return NextResponse.json({ error: "The gateway total changed. Contact the farm before paying." }, { status: 409 });
    if (providerOrder.status === "paid" || providerOrder.amount_paid > 0)
      return NextResponse.json({ error: "Payment confirmation is pending. Do not pay again." }, { status: 409 });
    return NextResponse.json({ amount: quote.amount, isTest: batch.is_test,
      keyId: publicRazorpayKey(), providerOrderId: batch.provider_order_id, prefill });
  }

  let claimed = false;
  let providerAttempted = false;
  try {
    const { error: claimError } = await admin.rpc("claim_checkout_batch", {
      p_batch_id: batch.id,
      p_expected_amount_paise: quote.amount,
      p_expected_plan_rules: quote.planRules,
    });
    if (claimError) throw new Error("This combined checkout is already being prepared. Check your account before trying again.");
    claimed = true;
    if (!batch.is_test) {
      await reserveOrderCapacity(batch.once_order_id);
      await reserveOrderCapacity(batch.plan_order_id);
    }
    providerAttempted = true;
    const providerOrder = await createRazorpayOrder({
      amount: quote.amount,
      receipt: `mma_${batch.id.replaceAll("-", "").slice(0, 32)}`,
    });
    if (providerOrder.amount !== quote.amount || providerOrder.currency !== "INR")
      throw new Error("Gateway order total did not match. Payment preparation is pending.");
    const providerOrderId = providerOrder.id;
    const { error: bindError } = await admin.rpc("bind_checkout_batch", {
      p_batch_id: batch.id, p_provider_order_id: providerOrderId,
    });
    if (bindError) throw new Error("Payment preparation is pending. Please contact the farm before trying again.");
    return NextResponse.json({ amount: quote.amount, isTest: batch.is_test,
      keyId: publicRazorpayKey(), providerOrderId, prefill });
  } catch (error) {
    const rejected = error instanceof RazorpayRequestError && error.definitelyRejected;
    if (claimed && (!providerAttempted || rejected)) {
      await admin.rpc("reset_rejected_checkout_batch", { p_batch_id: batch.id });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment could not be prepared." }, { status: 409 });
  }
}
