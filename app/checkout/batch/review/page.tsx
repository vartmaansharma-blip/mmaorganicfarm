import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CartCheckoutBatchSync } from "@/app/shop/cart-checkout-batch-sync";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import { serializeRoutines, validateRoutines } from "@/lib/monthly-schedule";
import { paymentModeError, razorpayMode } from "@/lib/payment-mode";
import { hasRazorpayConfig } from "@/lib/razorpay";
import { hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CheckoutPayment } from "../../review/checkout-payment";
import styles from "../batch.module.css";

export const metadata: Metadata = { title: "Review selected items", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BatchReview({ searchParams }: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const { batch: batchId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(batchId ? `/checkout/batch/review?batch=${batchId}` : "/shop")}`);
  if (!batchId) redirect("/shop");
  const { data: batch } = await supabase.from("checkout_batches")
    .select("id,user_id,once_order_id,plan_order_id,amount_paise,is_test,status,provider_order_id")
    .eq("id", batchId).eq("user_id", user.id).maybeSingle();
  if (!batch) redirect("/account");
  if (["paid", "test_captured", "review_required"].includes(batch.status)) redirect(`/checkout/batch/success?batch=${batch.id}`);
  const [{ data: once }, { data: plan }, { data: onceItems }, { data: planItems }] = await Promise.all([
    supabase.from("orders").select("id,purchase_mode,status,start_date,total_paise,address_snapshot,bottle_choice,bottle_charge_paise")
      .eq("id", batch.once_order_id).eq("user_id", user.id).maybeSingle(),
    supabase.from("orders").select("id,purchase_mode,status,start_date,total_paise,address_snapshot,delivery_plan_id,bottle_choice,bottle_charge_paise")
      .eq("id", batch.plan_order_id).eq("user_id", user.id).maybeSingle(),
    supabase.from("order_items").select("product_key,product_name,quantity,frequency,scheduled_days")
      .eq("order_id", batch.once_order_id).eq("user_id", user.id),
    supabase.from("order_items").select("product_key,product_name,quantity,frequency,scheduled_days")
      .eq("order_id", batch.plan_order_id).eq("user_id", user.id),
  ]);
  if (!once || !plan || !onceItems?.length || !planItems?.length
    || once.purchase_mode !== "once" || plan.purchase_mode !== "plan") redirect("/account");
  const { data: monthly } = await supabase.from("delivery_plans")
    .select("start_date,status,schedule_rules")
    .eq("id", plan.delivery_plan_id).eq("user_id", user.id).maybeSingle();
  const rules = monthly ? validateRoutines(monthly.start_date, monthly.schedule_rules) : null;
  const modeError = paymentModeError(batch.is_test)
    ?? (razorpayMode() === "live" && process.env.RAZORPAY_LIVE_CHECKOUT_ENABLED !== "true"
      ? "Live payments are not enabled yet." : null);
  const available = ["draft", "pending_payment"].includes(batch.status)
    && [once, plan].every((order) => order.status === (batch.status === "draft" ? "draft" : "pending_payment"))
    && monthly?.status === "pending_confirmation" && Boolean(rules);
  const ready = available && hasRazorpayConfig() && hasSupabaseAdminConfig() && !modeError;
  const unavailableReason = batch.status === "preparing"
    ? "Payment preparation is pending. Do not pay again."
    : !available ? "This combined order changed. Review your cart or contact the farm if you already paid."
    : modeError ?? undefined;
  const bottleMode = [once.bottle_choice, plan.bottle_choice].includes("new") ? "new"
    : [once.bottle_choice, plan.bottle_choice].includes("return") ? "return" : undefined;
  return <main className={styles.page}>
    <CartCheckoutBatchSync batchId={batch.id} orders={[
      { id: once.id, mode: "once", start: once.start_date, items: onceItems.map((item) => ({
        ...item, quantity: Number(item.quantity), scheduled_days: item.scheduled_days ?? [],
      })) },
      { id: plan.id, mode: "plan", start: plan.start_date,
        routine: rules ? serializeRoutines(rules, monthly!.start_date) : undefined,
        items: planItems.map((item) => ({
          ...item, quantity: Number(item.quantity), scheduled_days: item.scheduled_days ?? [],
        })) },
    ]} />
    <header className={styles.header}>
      <Link href="/shop">← Back to cart</Link>
      <span>M&apos;ma Organic Farm</span>
    </header>
    <section className={styles.content}>
      <p className={styles.eyebrow}>Review &amp; pay</p>
      <h1>One payment, both deliveries.</h1>
      <p>Check the selected items below. One-time and prepaid scheduled items remain separate farm orders after payment.</p>
      <CheckoutPayment orderId={once.id} batchId={batch.id}
        amount={formatCheckoutAmount(batch.amount_paise)} amountPaise={batch.amount_paise}
        ready={ready} unavailableReason={unavailableReason} isTest={batch.is_test}
        bottleMode={bottleMode} bottleLocked={!available || batch.status !== "draft"}>
      <div className={styles.orderCards}>
        <section>
          <h2>One-time delivery</h2>
          <p>{once.start_date} · Order {once.id.slice(0, 8).toUpperCase()}</p>
          <ul>{onceItems.map((item) => <li key={item.product_key}>
            <span>{item.product_name} · {item.quantity} {item.product_key === "milk" ? "L" : "×"}</span>
          </li>)}</ul>
          {once.bottle_charge_paise > 0 && <p>New glass bottles · {formatCheckoutAmount(once.bottle_charge_paise)}</p>}
          <strong>{formatCheckoutAmount(once.total_paise)}</strong>
        </section>
        <section>
          <h2>Prepaid scheduled deliveries</h2>
          <p>Starts {plan.start_date} · Order {plan.id.slice(0, 8).toUpperCase()}</p>
          <ul>{planItems.map((item) => <li key={item.product_key}>
            <span>{item.product_name} · {item.quantity} total units</span>
          </li>)}</ul>
          {plan.bottle_charge_paise > 0 && <p>New glass bottles · {formatCheckoutAmount(plan.bottle_charge_paise)}</p>}
          <strong>{formatCheckoutAmount(plan.total_paise)}</strong>
        </section>
      </div>
      <div className={styles.total}><span>Total for one payment</span><strong aria-live="polite">{formatCheckoutAmount(batch.amount_paise)}</strong></div>
      <p>One-time delivery address: {once.address_snapshot}</p>
      {plan.address_snapshot !== once.address_snapshot
        ? <p>Scheduled delivery address: {plan.address_snapshot}</p> : null}
      </CheckoutPayment>
      <p className={styles.footnote}>Unselected items stay in your cart. Razorpay processes this single payment securely.</p>
    </section>
  </main>;
}
