import { createClient } from "@/lib/supabase/server";
import { formatCalendarDate, productName } from "@/lib/delivery-calendar";
import {
  outcomeLabel,
  type CustomerDeliveryOutcome,
} from "@/lib/delivery-operations";
import styles from "./customer-delivery-history.module.css";
export async function CustomerDeliveryHistory({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_customer_delivery_outcomes", {
    p_user_id: userId,
    p_limit: 20,
  });
  if (error) return <section className={styles.section} aria-label="Confirmed delivery outcomes"><h2>Delivery outcomes</h2><p>We couldn’t load recorded delivery results. Please refresh to try again.</p></section>;
  const history = (data ?? []) as CustomerDeliveryOutcome[];
  return (
    <section
      className={styles.section}
      aria-label="Confirmed delivery outcomes"
      id="delivery-outcomes"
    >
      <h2>Delivery outcomes</h2>
      <p>
        Recorded delivery results and approved follow-ups. Future replacement
        service remains outstanding until delivered.
      </p>
      {history.length ? (
        history.map((row) => (
          <article key={`${row.delivery_date}:${row.visit_key}`}>
            <div>
              <strong>{formatCalendarDate(row.delivery_date)}</strong>
              <span>
                {outcomeLabel(row.outcome)}
                {row.resolution && row.resolution !== "not_required"
                  ? ` · ${row.resolution.replaceAll("_", " ")}`
                  : ""}
              </span>
              {row.follow_up_date ? (
                <span>Follow-up: {formatCalendarDate(row.follow_up_date)}</span>
              ) : null}
            </div>
            <div>
              {row.items
                .filter((item) => item.product_key)
                .map((item, index) => (
                  <span key={`${item.product_key}:${index}`}>
                    {productName(item.product_key)} ·{" "}
                    {item.fulfilled_quantity === null
                      ? "Awaiting recorded quantity"
                      : `${item.fulfilled_quantity} delivered`}{" "}
                    / {item.quantity} {item.unit} scheduled
                  </span>
                ))}
            </div>
          </article>
        ))
      ) : (
        <p>No generated deliveries to show yet.</p>
      )}
    </section>
  );
}
