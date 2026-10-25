import { CartCheckoutSync } from "@/app/shop/cart-checkout-sync";
import { PageNavigationControls } from "@/app/components/page-navigation-controls";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import { createClient } from "@/lib/supabase/server";
import styles from "./success.module.css";
export const metadata: Metadata = { title: "Order confirmation", robots: { follow: false, index: false } };
export const dynamic = "force-dynamic";
export default async function Success({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order: orderId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  if (!orderId) redirect("/account");
  const { data: order } = await supabase.from("orders").select("id,status,is_test,purchase_mode,total_paise")
    .eq("id", orderId).eq("user_id", user.id).maybeSingle();
  if (!order) redirect("/account");
  const { data: testPayments } = order.is_test ? await supabase.from("payments").select("status")
    .eq("order_id", order.id).eq("user_id", user.id).eq("is_test", true).eq("status", "captured").limit(1) : { data: null };
  const paid = order.is_test ? Boolean(testPayments?.length) : order.status === "paid";
  const intro = order.is_test
    ? "This is a simulated payment. No delivery plan was activated and no farm fulfilment was created."
    : paid ? order.purchase_mode === "plan" ? "Your selected delivery plan is active and saved in your profile."
      : order.purchase_mode === "adjustment" ? "Your payment is complete and the additional milk is saved in your calendar."
      : "Your farm order is paid and saved in your profile."
    : "Do not pay again. We will activate the order as soon as Razorpay confirms it.";
  return <main className={styles.page}>
    {paid && !order.is_test ? <CartCheckoutSync orderId={order.id} mode={order.purchase_mode} paid /> : null}
    <div className="customer-success-heading">
      <Link className={styles.brand} href="/"><Image src="/mma-logo.png" alt="" width={72} height={62} /><span>M&apos;ma Organic Farm</span></Link>
      <PageNavigationControls />
    </div>
    <section className={styles.content}>
      <span className={styles.mark}>{paid ? "✓" : "…"}</span><p>Step 4 of 4</p>
      <h1>{order.is_test ? "Test payment status." : paid ? "Your order is confirmed." : "Payment is being confirmed."}</h1>
      <p className={styles.intro}>{intro}</p>
      <dl>
        <div><dt>Order</dt><dd>{order.id.slice(0, 8).toUpperCase()}</dd></div>
        <div><dt>Amount</dt><dd>{formatCheckoutAmount(order.total_paise)}</dd></div>
        <div><dt>Status</dt><dd>{order.is_test ? paid ? "Test payment recorded" : "Test processing" : paid ? "Paid" : "Processing"}</dd></div>
      </dl>
      <div className={styles.actions}><Link className={styles.primary} href="/account">View profile</Link><Link className={styles.secondary} href="/">Back to home</Link></div>
    </section>
  </main>;
}
