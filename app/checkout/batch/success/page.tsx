import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CartCheckoutBatchSync } from "@/app/shop/cart-checkout-batch-sync";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import { createClient } from "@/lib/supabase/server";
import styles from "../../success/success.module.css";
import batchStyles from "../batch.module.css";

export const metadata: Metadata = { title: "Payment status", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BatchSuccess({ searchParams }: {
  searchParams: Promise<{ batch?: string }>;
}) {
  const { batch: batchId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  if (!batchId) redirect("/account");
  const { data: batch } = await supabase.from("checkout_batches")
    .select("id,user_id,once_order_id,plan_order_id,amount_paise,is_test,status")
    .eq("id", batchId).eq("user_id", user.id).maybeSingle();
  if (!batch) redirect("/account");
  const paid = batch.status === "paid";
  const testCaptured = batch.status === "test_captured";
  return <main className={styles.page}>
    {paid ? <CartCheckoutBatchSync batchId={batch.id} paid orders={[
      { id: batch.once_order_id, mode: "once" },
      { id: batch.plan_order_id, mode: "plan" },
    ]} /> : null}
    <Link className={styles.brand} href="/">M&apos;ma Organic Farm</Link>
    <section className={styles.content}>
      <span className={`${styles.mark} ${paid ? batchStyles.paidMark : ""}`} aria-hidden="true">{paid || testCaptured ? "✓" : "…"}</span>
      <p>Step 4 of 4</p>
      <h1>{testCaptured ? "Test payment status." : paid ? "Payment complete." : "Payment is being confirmed."}</h1>
      <p className={styles.intro}>{testCaptured
        ? "This was a simulated payment. No farm deliveries were activated."
        : paid
          ? `We received your payment of ${formatCheckoutAmount(batch.amount_paise)}. Your one-time order and prepaid delivery plan are confirmed.`
          : "Do not pay again. We will confirm both orders when Razorpay reports the payment as captured."}</p>
      <dl>
        <div><dt>One-time order</dt><dd>{batch.once_order_id.slice(0, 8).toUpperCase()}</dd></div>
        <div><dt>Scheduled order</dt><dd>{batch.plan_order_id.slice(0, 8).toUpperCase()}</dd></div>
        <div><dt>Amount</dt><dd>{formatCheckoutAmount(batch.amount_paise)}</dd></div>
        <div><dt>Status</dt><dd>{testCaptured ? "Test payment recorded" : paid ? "Paid" : "Processing"}</dd></div>
      </dl>
      <div className={styles.actions}>
        <Link className={styles.primary} href="/account">View profile</Link>
        <Link href="/shop">Back to shop</Link>
      </div>
    </section>
  </main>;
}
