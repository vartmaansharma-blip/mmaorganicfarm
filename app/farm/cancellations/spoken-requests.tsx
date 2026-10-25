import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { formatCalendarDate } from "@/lib/delivery-calendar";
import { CustomerRequestReviewForm } from "../customer-request-forms";
import styles from "../operations-list.module.css";
export async function SpokenRequests({ history }: { history: boolean }) {
  const { supabase } = await requireFarmManager("/farm/cancellations");
  const { data, error } = await supabase
    .from("delivery_customer_requests")
    .select(
      "id,user_id,kind,requested_date,source_date,customer_words,status,decision_note,recorded_by,created_at",
    )
    .in(
      "status",
      history ? ["approved", "declined"] : ["requested", "follow_up"],
    )
    .order("created_at", { ascending: !history })
    .limit(100);
  if (error) throw error;
  const ids = [
    ...new Set((data ?? []).flatMap((r) => [r.user_id, r.recorded_by])),
  ];
  const profiles = ids.length
    ? await supabase
        .from("customer_profiles")
        .select("user_id,full_name")
        .in("user_id", ids)
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const names = new Map(
    (profiles.data ?? []).map((p) => [p.user_id, p.full_name]),
  );
  return (
    <section
      className={styles.list}
      aria-label="Requests recorded during delivery"
    >
      <h2>From the doorstep</h2>
      <p>
        {history
          ? "Latest 100 completed decisions."
          : "Oldest 100 open requests first. A saved request does not change the plan until approved."}
      </p>
      {(data ?? []).map((r) => (
        <article key={r.id}>
          <div className={styles.rowHeading}>
            <div>
              <strong>{names.get(r.user_id) ?? "Customer"}</strong>
              <span>
                {r.kind === "skip_milk"
                  ? "Skip milk"
                  : r.kind === "quantity_change"
                    ? "Quantity change"
                    : "Other request"}{" "}
                · {formatCalendarDate(r.requested_date)}
              </span>
            </div>
            <b>{r.status.replaceAll("_", " ")}</b>
          </div>
          <p>“{r.customer_words}”</p>
          <small>
            Recorded by {names.get(r.recorded_by) ?? "Delivery staff"} during
            delivery on {formatCalendarDate(r.source_date)}
          </small>
          {r.decision_note ? (
            <p className={styles.resolution}>{r.decision_note}</p>
          ) : null}
          {["requested", "follow_up"].includes(r.status) ? (
            <CustomerRequestReviewForm
              key={r.id + r.status}
              id={r.id}
              kind={r.kind}
            />
          ) : null}
          <Link prefetch={false} href={`/farm/customers/${r.user_id}`}>Open customer →</Link>
        </article>
      ))}
      {!data?.length ? (
        <div className={styles.empty}>
          No {history ? "completed" : "open"} doorstep requests.
        </div>
      ) : null}
    </section>
  );
}
