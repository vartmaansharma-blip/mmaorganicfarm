import type { Metadata } from "next";
import Image from "next/image"; import Link from "next/link"; import { redirect } from "next/navigation";
import { formatCheckoutAmount, formatOrderItemSchedule } from "@/lib/checkout-display";
import { hasSupabaseAdminConfig } from "@/lib/supabase/admin"; import { hasRazorpayConfig } from "@/lib/razorpay"; import { createClient } from "@/lib/supabase/server";
import { RazorpayCheckoutButton } from "./razorpay-checkout-button"; import styles from "./review.module.css";
export const metadata: Metadata = { title: "Review your order", robots: { follow: false, index: false } }; export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order: orderId } = await searchParams; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(orderId ? `/checkout/review?order=${orderId}` : "/milk")}`); if (!orderId) redirect("/milk");
  const { data: order } = await supabase.from("orders").select("id,status,purchase_mode,milk_litres,bottle_charge_paise,total_paise,phone_snapshot,address_snapshot").eq("id", orderId).eq("user_id", user.id).maybeSingle();
  if (!order) redirect("/milk"); if (order.status === "paid") redirect(`/checkout/success?order=${order.id}`);
  const { data: items } = await supabase.from("order_items").select("id,product_key,product_name,quantity,unit,line_total_paise,frequency,scheduled_days,delivery_date").eq("order_id", order.id).eq("user_id", user.id).order("created_at");
  const help = encodeURIComponent(`Hello M'ma Organic Farm, I need help with order ${order.id.slice(0,8).toUpperCase()}.`); const adminReady = hasSupabaseAdminConfig();
  return <main className={styles.page}>
    <header className={styles.header}><Link className={styles.brand} href="/"><Image src="/mma-logo.png" alt="" width={66} height={56}/><span>M&apos;ma Organic Farm</span></Link><Link href="/milk">Edit order</Link></header>
    <div className={styles.shell}><section className={styles.heading}><p>Step 3 of 4</p><h1>Review your order.</h1><span>Nothing is charged until you confirm payment.</span></section>
    <section className={styles.section}><div className={styles.sectionHeading}><div><p>Order {order.id.slice(0,8).toUpperCase()}</p><h2>{order.purchase_mode === "plan" ? "Weekly farm plan" : "One-time farm order"}</h2></div><span>{order.status === "pending_payment" ? "Payment started" : "Draft"}</span></div>
      <div className={styles.items}>{(items ?? []).map((item) => <div className={styles.item} key={item.id}><div><strong>{item.product_name}</strong><span>{item.quantity} × {item.unit}</span><small>{formatOrderItemSchedule(item)}</small></div><b>{formatCheckoutAmount(item.line_total_paise)}</b></div>)}</div>
      <dl className={styles.totals}>{order.bottle_charge_paise > 0 && <div><dt>New glass bottles ({Number(order.milk_litres)})</dt><dd>{formatCheckoutAmount(order.bottle_charge_paise)}</dd></div>}<div className={styles.total}><dt>{order.purchase_mode === "plan" ? "Selected weekly routine" : "Amount to pay"}</dt><dd>{formatCheckoutAmount(order.total_paise)}</dd></div></dl>
    </section>
    <section className={styles.section}><div className={styles.sectionHeading}><div><p>Delivery</p><h2>Where it will go</h2></div></div><dl className={styles.delivery}><div><dt>Phone</dt><dd>{order.phone_snapshot}</dd></div><div><dt>Address</dt><dd>{order.address_snapshot}</dd></div></dl></section>
    <section className={styles.section}><div className={styles.paymentHeading}><p>Secure checkout</p><h2>Confirm and pay</h2><span>Razorpay opens only after you accept the order terms.</span></div><RazorpayCheckoutButton amount={formatCheckoutAmount(order.total_paise)} orderId={order.id} ready={hasRazorpayConfig() && adminReady}/><p className={styles.note}>Your order and delivery calendar stay with M&apos;ma Organic Farm. Razorpay securely processes the payment.</p><p className={styles.note}>Increasing milk later requires an additional payment. Reducing paid milk creates a future milk credit, not a cash refund.</p><p className={styles.note}>WhatsApp remains available as a secondary option. <a href={`https://wa.me/919818804419?text=${help}`}>Contact the farm</a></p></section>
    </div></main>;
}
