import { FarmForm } from "../farm-form";
import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { todayInIndia, productName } from "@/lib/delivery-calendar";
import {
  validOperationalDate,
  type Reconciliation,
} from "@/lib/delivery-operations";
import { WorkspaceHeader } from "../workspace-parts";
import styles from "../operations-workbench.module.css";
export const metadata = {
  title: "Operations report",
  robots: { index: false, follow: false },
};
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { supabase } = await requireFarmManager("/farm/reports");
  const date =
    validOperationalDate((await searchParams).date) ?? todayInIndia();
  const result = await supabase.rpc("get_delivery_reconciliation", {
    p_date: date,
  });
  if (result.error) throw result.error;
  const data = result.data as Reconciliation;
  return (
    <main className={styles.page}>
      <WorkspaceHeader
        title="Operations report"
        description="Service-day results calculated from authoritative delivery and reconciliation records."
      />
      <FarmForm className={styles.filters}>
        <label>
          Service date
          <input name="date" type="date" defaultValue={date} />
        </label>
        <button>Apply</button>
      </FarmForm>
      <section className={styles.metrics}>
        <article>
          <strong>
            {data.delivered_visits} / {data.scheduled_visits}
          </strong>
          <span>Fully delivered / scheduled visits</span>
        </article>
        <article>
          <strong>{data.partial_visits}</strong>
          <span>Partial visits</span>
        </article>
        <article data-attention={data.failed_attempts > 0 || undefined}>
          <strong>{data.failed_attempts}</strong>
          <span>Unsuccessful attempts</span>
        </article>
        <article>
          <strong>{data.follow_ups}</strong>
          <span>Tracked follow-ups</span>
        </article>
      </section>
      <section className={styles.panel}>
        <h2>Product fulfilment</h2>
        {data.products.length ? (
          data.products.map((row) => (
            <div
              className={styles.reportRow}
              key={`${row.product_key}:${row.unit}`}
            >
              <strong>
                {productName(row.product_key)} · {row.unit}
              </strong>
              <span>
                {row.delivered} delivered / {row.scheduled} scheduled
              </span>
              <span>
                {row.outstanding} outstanding · {row.cancelled} cancelled
              </span>
            </div>
          ))
        ) : (
          <p>
            No product records for this day. Check whether dispatch has been
            prepared.
          </p>
        )}
        <Link prefetch={false} href={`/farm/reconciliation?date=${date}`}>
          Inspect the underlying reconciliation →
        </Link>
      </section>
      <section className={styles.panel}>
        <h2>Measurement limits</h2>
        <p>
          Scheduled counts include cancelled and approved-skipped visits;
          consult Closeout for each disposition. On-time performance requires
          recorded promised windows. Route efficiency requires measured travel
          time. Profit requires actual costs. Those measures are unavailable
          until their source data is verified.
        </p>
      </section>
    </main>
  );
}
