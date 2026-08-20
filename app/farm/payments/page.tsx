import type { Metadata } from "next";
import Link from "next/link";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import styles from "../operations-list.module.css";

export const metadata: Metadata = { title: "Farm payments", robots: { index: false, follow: false } };

export default async function FarmPaymentsPage({ searchParams }: { searchParams: Promise<{ customer?: string; mode?: string }> }) {
  await requireFarmManager("/farm/payments");
  const admin = createAdminClient();
  const parameters = await searchParams;
  const mode = parameters.mode === "test" ? "test" : "live";
  const isTest = mode === "test";
  const customerId = /^[0-9a-f-]{36}$/i.test(parameters.customer ?? "") ? parameters.customer! : null;
  let paymentQuery = admin.from("payments").select("id,user_id,order_id,status,amount_paise,provider,provider_payment_id,paid_at,created_at").eq("is_test", isTest).order("created_at", { ascending: false }).limit(100);
  let pendingQuery = admin.from("orders").select("id,user_id,status,total_paise,created_at").eq("is_test", isTest).eq("status", "pending_payment").order("created_at", { ascending: false }).limit(100);
  if (customerId) {
    paymentQuery = paymentQuery.eq("user_id", customerId);
    pendingQuery = pendingQuery.eq("user_id", customerId);
  }
  const [{ data: payments, error }, { data: pendingOrders }, { data: customer }] = await Promise.all([
    paymentQuery,
    pendingQuery,
    customerId
      ? admin.from("customer_profiles").select("full_name").eq("user_id", customerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (error) throw error;
  const captured = (payments ?? []).filter((payment) => payment.status === "captured");
  const capturedTotal = captured.reduce((sum, payment) => sum + Number(payment.amount_paise), 0);

  return <main className={styles.page}>
    <header><div><p>Finance · {mode}</p><h1>{customer ? `${customer.full_name ?? "Customer"} payments` : "Payments"}</h1><span>{isTest ? "Trial payments kept outside live totals." : customer ? "Customer-specific payment ledger and outstanding orders." : "Verified payment records for live orders."}</span></div><div><Link href={customerId ? `/farm/payments?customer=${customerId}` : "/farm/payments"}>Live</Link> <Link href={customerId ? `/farm/payments?mode=test&customer=${customerId}` : "/farm/payments?mode=test"}>Test</Link> {customerId ? <Link href={`/farm/customers/${customerId}`}>Back to customer</Link> : <Link href="/farm">Back to deliveries</Link>}</div></header>
    <section className={styles.metrics}><article><span>Captured</span><strong>{captured.length}</strong></article><article><span>Value</span><strong>{formatCheckoutAmount(capturedTotal)}</strong></article><article><span>Pending</span><strong>{pendingOrders?.length ?? 0}</strong></article></section>
    <section className={styles.list}>
      {(payments ?? []).length ? payments?.map((payment) => <article key={payment.id}>
        <div className={styles.rowHeading}><div><strong>Order {payment.order_id.slice(0, 8).toUpperCase()}</strong><span>{payment.provider} · {payment.provider_payment_id ?? "Awaiting reference"}</span></div><b>{payment.status}</b></div>
        <p>{formatCheckoutAmount(payment.amount_paise)}</p><small>{new Date(payment.paid_at ?? payment.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small>
        {!customerId ? <Link href={`/farm/customers/${payment.user_id}`}>Open customer</Link> : null}
      </article>) : <div className={styles.empty}>No payment records yet.</div>}
    </section>
  </main>;
}
