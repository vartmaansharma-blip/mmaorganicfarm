import type { Metadata } from "next";
import Link from "next/link";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import styles from "../operations-list.module.css";
import { resetManualPayment } from "./actions";

export const metadata: Metadata = { title: "Farm payments", robots: { index: false, follow: false } };

type PaymentRow = {
  amount_paise: number;
  created_at: string;
  id: string;
  order_id: string;
  paid_at: string | null;
  payment_method: string | null;
  provider: string;
  provider_payment_id: string | null;
  user_id: string;
};

function paymentMethodLabel(value: string | null) {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Online";
}

export default async function FarmPaymentsPage({ searchParams }: { searchParams: Promise<{ customer?: string; error?: string; message?: string }> }) {
  const { role } = await requireFarmManager("/farm/payments");
  const admin = createAdminClient();
  const parameters = await searchParams;
  const customerId = /^[0-9a-f-]{36}$/i.test(parameters.customer ?? "") ? parameters.customer! : null;
  let paymentQuery = admin
    .from("payments")
    .select("id,user_id,order_id,amount_paise,provider,provider_payment_id,payment_method,paid_at,created_at")
    .eq("is_test", false)
    .eq("status", "captured")
    .order("paid_at", { ascending: false })
    .limit(100);
  if (customerId) paymentQuery = paymentQuery.eq("user_id", customerId);

  const [{ data: paymentData, error }, { data: customer }, { data: customerOrders }] = await Promise.all([
    paymentQuery,
    customerId
      ? admin.from("customer_profiles").select("full_name").eq("user_id", customerId).maybeSingle()
      : Promise.resolve({ data: null }),
    customerId
      ? admin.from("orders").select("id").eq("user_id", customerId)
      : Promise.resolve({ data: [] }),
  ]);
  if (error) throw error;
  const correctionQuery = admin.from("payment_status_changes").select("id,order_id,reason,created_at").order("created_at", { ascending: false }).limit(25);
  const customerOrderIds = (customerOrders ?? []).map((order) => order.id);
  const { data: correctionData } = customerId && !customerOrderIds.length
    ? { data: [] }
    : await (customerId ? correctionQuery.in("order_id", customerOrderIds) : correctionQuery);
  const payments = (paymentData ?? []) as PaymentRow[];
  const userIds = [...new Set(payments.map((payment) => payment.user_id))];
  const { data: customerProfiles } = userIds.length
    ? await admin.from("customer_profiles").select("user_id,full_name").in("user_id", userIds)
    : { data: [] };
  const customerNames = new Map((customerProfiles ?? []).map((profile) => [profile.user_id, profile.full_name ?? "Customer"]));
  const capturedTotal = payments.reduce((sum, payment) => sum + Number(payment.amount_paise), 0);
  const farmRecordedCount = payments.filter((payment) => payment.provider === "manual").length;

  return <main className={styles.page}>
    <header><div><p>Finance</p><h1>{customer ? `${customer.full_name ?? "Customer"} payments` : "Confirmed payments"}</h1><span>Only money received by the farm is included. Reversed farm-recorded entries remain in the correction log.</span></div><div>{customerId ? <Link href={`/farm/customers/${customerId}`}>Back to customer</Link> : <Link href="/farm">Overview</Link>}</div></header>

    {parameters.message ? <p className={styles.notice}>{parameters.message}</p> : null}
    {parameters.error ? <p className={`${styles.notice} ${styles.error}`} role="alert">{parameters.error}</p> : null}

    <section className={styles.metrics} aria-label="Payment summary">
      <article><span>Confirmed</span><strong>{payments.length}</strong></article>
      <article><span>Received</span><strong>{formatCheckoutAmount(capturedTotal)}</strong></article>
      <article><span>Farm recorded</span><strong>{farmRecordedCount}</strong></article>
    </section>

    <section className={styles.list} aria-label="Confirmed payments">
      {payments.length ? payments.map((payment) => <article key={payment.id}>
        <div className={styles.rowHeading}><div><strong>{customerNames.get(payment.user_id) ?? "Customer"}</strong><span>Order MMA-{payment.order_id.slice(0, 8).toUpperCase()}</span></div><b>Confirmed</b></div>
        <p>{formatCheckoutAmount(payment.amount_paise)}</p>
        <small>{paymentMethodLabel(payment.payment_method)} · {payment.provider_payment_id ?? payment.provider} · {new Date(payment.paid_at ?? payment.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</small>
        {!customerId ? <Link href={`/farm/customers/${payment.user_id}`}>Open customer</Link> : null}
        {role === "admin" && payment.provider === "manual" ? <details className={styles.correction}><summary>Correct this payment</summary><form action={resetManualPayment}><input name="paymentId" type="hidden" value={payment.id} /><input name="userId" type="hidden" value={payment.user_id} /><label>Reason for reset<textarea maxLength={300} minLength={3} name="reason" placeholder="For example: cash entry recorded twice" required rows={2} /></label><p>This removes the payment from totals and cancels the related order and future service. The correction remains recorded.</p><button type="submit">Reset payment</button></form></details> : null}
      </article>) : <div className={styles.empty}>No confirmed payments yet.</div>}
    </section>

    {(correctionData ?? []).length ? <details className={styles.audit}><summary>Payment correction log · {(correctionData ?? []).length}</summary><div>{(correctionData ?? []).map((change) => <article key={change.id}><strong>Order MMA-{change.order_id.slice(0, 8).toUpperCase()}</strong><span>{change.reason}</span><small>{new Date(change.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</small></article>)}</div></details> : null}
  </main>;
}
