import { MonthlyPlan } from "@/app/components/monthly-plan/monthly-plan";
import { serializeRoutines, validateRoutines } from "@/lib/monthly-schedule";
import { CartCheckoutSync } from "@/app/shop/cart-checkout-sync";
import { PageNavigationControls } from "@/app/components/page-navigation-controls";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  formatCheckoutAmount,
  formatOrderItemSchedule,
} from "@/lib/checkout-display";
import { hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { paymentModeError } from "@/lib/payment-mode";
import { hasRazorpayConfig } from "@/lib/razorpay";
import { createClient } from "@/lib/supabase/server";
import { RazorpayCheckoutButton } from "./razorpay-checkout-button";
import styles from "./review.module.css";
export const metadata: Metadata = {
  title: "Review your order",
  robots: { follow: false, index: false },
};
export const dynamic = "force-dynamic";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    redirect(
      `/sign-in?next=${encodeURIComponent(orderId ? `/checkout/review?order=${orderId}` : "/milk")}`,
    );
  if (!orderId) redirect("/milk");
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id,status,is_test,purchase_mode,delivery_plan_id,milk_litres,start_date,bottle_charge_paise,subtotal_paise,total_paise,phone_snapshot,address_snapshot",
    )
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order) redirect("/milk");
  if (order.status === "paid") redirect(`/checkout/success?order=${order.id}`);
  if (order.status === "cancelled") redirect("/account");
  const { data: items } = await supabase
    .from("order_items")
    .select(
      "id,product_key,product_name,quantity,unit,line_total_paise,frequency,scheduled_days,delivery_date",
    )
    .eq("order_id", order.id)
    .eq("user_id", user.id)
    .order("created_at");
  const { data: monthly } = order.delivery_plan_id
    ? await supabase
        .from("delivery_plans")
        .select(
          "id,status,start_date,period_end_exclusive,schedule_rules,scheduled_delivery_items(product_key,delivery_date,quantity,unit)",
        )
        .eq("id", order.delivery_plan_id)
        .eq("user_id", user.id)
        .eq("billing_model", "calendar_month")
        .maybeSingle()
    : { data: null };
  const rules = monthly
    ? validateRoutines(monthly.start_date, monthly.schedule_rules)
    : null;
  const help = encodeURIComponent(
    `Hello M'ma Organic Farm, I need help with order ${order.id.slice(0, 8).toUpperCase()}.`,
  );
  const adminReady = hasSupabaseAdminConfig();
  const modeError = paymentModeError(order.is_test);
  return (
    <main className={styles.page}>
      <CartCheckoutSync
        orderId={order.id}
        mode={order.purchase_mode}
        start={order.start_date}
        routine={
          rules ? serializeRoutines(rules, monthly!.start_date) : undefined
        }
        items={(items ?? []).map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          scheduled_days: item.scheduled_days ?? [],
        }))}
      />
      <header className={styles.header}>
        <Link
          className={`${styles.brand} customer-header-brand`}
          aria-label="M'ma Organic Farm"
          href="/"
        >
          <Image src="/mma-logo.png" alt="" width={66} height={56} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <div className="customer-header-actions">
          <Link
            href={order.purchase_mode === "adjustment" ? "/calendar" : "/shop"}
          >
            Edit order
          </Link>
          <PageNavigationControls />
        </div>
      </header>
      <div className={styles.shell}>
        <section className={styles.heading}>
          <p>Step 3 of 4</p>
          <h1 className="customer-page-heading">Review your order.</h1>
          <span>Nothing is charged until you confirm payment.</span>
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <p>Order {order.id.slice(0, 8).toUpperCase()}</p>
              <h2>
                {monthly
                  ? "Monthly farm plan"
                  : order.purchase_mode === "plan"
                    ? "30-delivery farm plan"
                    : order.purchase_mode === "adjustment"
                      ? "Additional milk"
                      : "One-time farm order"}
              </h2>
            </div>
            <span>
              {order.status === "pending_payment" ? "Payment started" : "Draft"}
            </span>
          </div>
          <div className={styles.items}>
            {(items ?? []).map((item) => (
              <div className={styles.item} key={item.id}>
                <div>
                  <strong>{item.product_name}</strong>
                  <span>
                    {item.quantity} × {item.unit}
                  </span>
                  <small>
                    {monthly
                      ? "Total across your selected dates below"
                      : formatOrderItemSchedule(item)}
                  </small>
                </div>
                <b>{formatCheckoutAmount(item.line_total_paise)}</b>
              </div>
            ))}
          </div>
          <dl className={styles.totals}>
            <div>
              <dt>Products</dt>
              <dd>{formatCheckoutAmount(order.subtotal_paise)}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>
                {formatCheckoutAmount(
                  Math.max(
                    0,
                    order.total_paise -
                      order.subtotal_paise -
                      order.bottle_charge_paise,
                  ),
                )}
              </dd>
            </div>
            {order.bottle_charge_paise > 0 && (
              <div>
                <dt>New glass bottles ({Number(order.milk_litres)})</dt>
                <dd>{formatCheckoutAmount(order.bottle_charge_paise)}</dd>
              </div>
            )}
            <div className={styles.total}>
              <dt>
                {monthly
                  ? "Monthly plan total"
                  : order.purchase_mode === "plan"
                    ? "30-delivery plan total"
                    : "Amount to pay"}
              </dt>
              <dd>{formatCheckoutAmount(order.total_paise)}</dd>
            </div>
          </dl>
        </section>
        {monthly ? (
          <MonthlyPlan
            id={monthly.id}
            start={monthly.start_date}
            end={monthly.period_end_exclusive}
            status={monthly.status}
            items={monthly.scheduled_delivery_items.map((x) => ({
              ...x,
              quantity: Number(x.quantity),
            }))}
            preview
          />
        ) : null}
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <p>Delivery</p>
              <h2>Where it will go</h2>
            </div>
          </div>
          <dl className={styles.delivery}>
            <div>
              <dt>Phone</dt>
              <dd>{order.phone_snapshot}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{order.address_snapshot}</dd>
            </div>
          </dl>
        </section>
        <section className={styles.section}>
          <div className={styles.paymentHeading}>
            <p>Secure checkout</p>
            <h2>Confirm and pay</h2>
            <span>Razorpay opens only after you accept the order terms.</span>
          </div>
          <RazorpayCheckoutButton
            amount={formatCheckoutAmount(order.total_paise)}
            amountPaise={order.total_paise}
            orderId={order.id}
            ready={hasRazorpayConfig() && adminReady && !modeError}
            unavailableReason={modeError ?? undefined}
            isTest={order.is_test}
          />
          <p className={styles.note}>
            Your order and delivery calendar stay with M&apos;ma Organic Farm.
            Razorpay securely processes the payment.
          </p>
          <p className={styles.note}>
            Increasing paid milk requires payment for the addition. Reducing it
            moves the unused milk to the next calendar day; no cash refund is
            issued.
          </p>
          <p className={styles.note}>
            WhatsApp remains available as a secondary option.{" "}
            <a href={`https://wa.me/919818804419?text=${help}`}>
              Contact the farm
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
