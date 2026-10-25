import type { Metadata } from "next";
import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { todayInIndia, productName } from "@/lib/delivery-calendar";
import {
  validOperationalDate,
  type Reconciliation,
} from "@/lib/delivery-operations";
import { CloseDayForm, OperationFilters } from "../operation-forms";
import styles from "../operations-workbench.module.css";
export const metadata: Metadata = {
  title: "Daily reconciliation",
  robots: { index: false, follow: false },
};
export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const p = await searchParams;
  const date = validOperationalDate(p.date) ?? todayInIndia();
  const { supabase } = await requireFarmManager("/farm/reconciliation");
  const [summary, history] = await Promise.all([
    supabase.rpc("get_delivery_reconciliation", { p_date: date }),
    supabase
      .from("delivery_day_reviews")
      .select("id,version,action,created_at,snapshot,event_id")
      .eq("delivery_date", date)
      .order("version", { ascending: false })
      .limit(20),
  ]);
  if (summary.error) throw summary.error;
  if (history.error) throw history.error;
  const data = summary.data as Reconciliation;
  const closed = data.last_review?.action === "closed";
  const metrics = [
    ["Scheduled visits", data.scheduled_visits],
    ["Released visits", data.released_visits],
    ["Delivered visits", data.delivered_visits],
    ["Failed attempts", data.failed_attempts],
    ["Partial visits", data.partial_visits],
    ["Approved skips", data.approved_skips],
    ["Approved reschedules", data.approved_reschedules],
    ["Open exceptions", data.open_exceptions],
    ["Tracked follow-ups", data.follow_ups],
    ["Cancelled visits", data.cancelled_visits],
  ];
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>End-of-day control</span>
          <h1>Closeout</h1>
          <p>
            Explain every visit, product quantity and remaining obligation
            before closing the day. This is operational reconciliation; payments
            remain separate.
          </p>
        </div>
        <nav className={styles.links}>
          <Link prefetch={false} href={`/farm/exceptions?date=${date}`}>Resolve exceptions</Link>
          <Link prefetch={false} href={`/farm/delivery-sheet?date=${date}`}>Delivery sheet</Link>
        </nav>
      </header>
      <OperationFilters path="/farm/reconciliation">
        <label>
          Operational date
          <input type="date" name="date" defaultValue={date} />
        </label>
      </OperationFilters>
      <section
        className={styles.panel}
        data-attention={data.blockers.length > 0}
      >
        <div className={styles.panelHeader}>
          <h2>
            {closed
              ? "Day closed"
              : data.last_review?.action === "correction_required"
                ? "Correction review open"
                : data.blockers.length
                  ? "Decisions still required"
                  : "Ready for manager review"}
          </h2>
          <span className={styles.badge}>{data.blockers.length} blockers</span>
        </div>
        <p className={styles.hint}>
          Snapshot calculated{" "}
          {new Date(data.generated_at).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            dateStyle: "medium",
            timeStyle: "short",
          })}{" "}
          IST. Closeout rechecks the latest records before saving.
        </p>
        {data.blockers.length ? (
          <ul className={styles.blockers}>
            {data.blockers.map((b) => (
              <li key={`${b.code}:${b.entity}`}>
                <strong>{b.message}</strong>
                <br />
                <small>{b.entity}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            All visits have a recorded disposition or an approved, tracked
            follow-up. Closing does not erase outstanding service.
          </p>
        )}
        <CloseDayForm
          key={`${date}:${data.last_review?.id ?? "open"}`}
          date={date}
          closed={closed}
          blockers={data.blockers.length}
        />
      </section>
      <section className={styles.metrics} aria-label="Visit reconciliation">
        {metrics.map(([label, value]) => (
          <article key={String(label)} data-attention={Number(value) > 0 && ["Failed attempts", "Open exceptions"].includes(String(label)) || undefined}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>
      <section className={styles.panel}>
        <h2>Product quantities</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Product / unit</th>
                <th>Scheduled</th>
                <th>Delivered</th>
                <th>Cancelled</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((row) => (
                <tr key={`${row.product_key}:${row.unit}`}>
                  <td>
                    {productName(row.product_key)} · {row.unit}
                  </td>
                  <td>{row.scheduled}</td>
                  <td>{row.delivered}</td>
                  <td>{row.cancelled}</td>
                  <td>{row.outstanding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.products.length ? (
          <p className={styles.empty}>
            No scheduled product quantities for this date.
          </p>
        ) : null}
        <p className={styles.hint}>
          Scheduled = delivered + cancelled + outstanding, in each
          product&apos;s own unit. A future replacement stays owed until
          fulfilled.
        </p>
      </section>
      <section className={styles.panel}>
        <h2>Documented bottle returns</h2>
        <p>
          {data.bottle_returns_recorded} recorded /{" "}
          {data.bottle_returns_expected} expected ·{" "}
          {data.bottle_returns_expected - data.bottle_returns_recorded} return
          checks outstanding
        </p>
        <p className={styles.hint}>
          {data.bottle_count_scope} These counts are not a verified physical
          bottle inventory.
        </p>
      </section>
      <section className={`${styles.panel} ${styles.history}`}>
        <h2>Closeout history</h2>
        <p className={styles.hint}>
          Original summaries remain unchanged when a correction review is
          opened. Latest 20 versions.
        </p>
        {history.data?.length ? (
          history.data.map((review) => (
            <details key={review.id}>
              <summary>
                Version {review.version} · {review.action.replaceAll("_", " ")}{" "}
                ·{" "}
                {new Date(review.created_at).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                IST
              </summary>
              <p className={styles.hint}>Audit event {review.event_id}</p>
              <pre>{JSON.stringify(review.snapshot, null, 2)}</pre>
            </details>
          ))
        ) : (
          <p>No closeout has been recorded.</p>
        )}
      </section>
    </main>
  );
}
