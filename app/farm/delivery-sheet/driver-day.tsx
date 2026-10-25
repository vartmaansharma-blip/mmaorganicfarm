import Link from "next/link";
import {
  formatCalendarDate,
  productName,
  todayInIndia,
  nextDeliveryDateInIndia,
} from "@/lib/delivery-calendar";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import { DriverCustomerRequestForm } from "../customer-request-forms";
import { outcomeLabel, type OutcomeItem } from "@/lib/delivery-operations";
import { DeliveryOutcomeForm } from "../operation-forms";
import styles from "./driver-day.module.css";
type Stop = {
  id: string;
  visit_key: string;
  customer_name: string;
  address_snapshot: string | null;
  phone_snapshot: string | null;
  user_id: string;
  status: string;
  deliveryIds: string[];
  bottlesExpected: number;
  outcomeItems: OutcomeItem[];
  daily_delivery_items: {
    product_key: string;
    quantity: number;
    unit: string;
  }[];
};
export async function DriverDay({
  date,
  selected,
  routes,
  instructions,
  outcomes,
  recorded,
}: {
  date: string;
  selected?: string;
  routes: { name: string; stops: Stop[] }[];
  instructions: Map<string, string>;
  outcomes: Map<string, string>;
  recorded: Set<string>;
}) {
  const stops = routes.flatMap((route) =>
    route.stops.map((stop) => ({ ...stop, routeName: route.name })),
  );
  const isRecorded = (stop: Stop) =>
    recorded.has(stop.visit_key) || stop.status === "delivered";
  const pending = stops.filter(
    (stop) => !isRecorded(stop) && stop.status !== "cancelled",
  );
  const current =
    stops.find((stop) => stop.id === selected) ?? pending[0] ?? stops[0];
  const next = pending.find((stop) => stop.id !== current?.id);
  const { supabase } = await requireFarmStaff("/farm/delivery-sheet");
  const requests = current
    ? await supabase
        .from("delivery_customer_requests")
        .select("kind,requested_date,status,customer_words")
        .in("source_delivery_id", current.deliveryIds)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [], error: null };
  if (requests.error) throw requests.error;
  const href = (id: string) =>
    `/farm/delivery-sheet?${new URLSearchParams({ date, stop: id })}`;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>Delivery staff</p>
          <h1>My route</h1>
          <span>{formatCalendarDate(date)}</span>
        </div>
        <span className={styles.count}>
          {stops.length - pending.length} of {stops.length} recorded
        </span>
      </header>
      <form className={styles.dateFilter}>
        <label>
          Service date
          <input name="date" type="date" defaultValue={date} />
        </label>
        <button>Apply</button>
      </form>
      {current ? (
        <>
          <section className={styles.context}>
            <span>{current.routeName}</span>
            <strong>{pending.length} stops awaiting an outcome</strong>
          </section>
          <ol className={styles.focused}>
            <li
              id={`stop-${current.id}`}
              key={current.visit_key}
              className={styles.stop}
            >
              <div className={styles.stopHeading}>
                <span>
                  {isRecorded(current) ? "Recorded stop" : "Current stop"}
                </span>
                <span className={styles.badge}>
                  {outcomes.has(current.visit_key)
                    ? outcomeLabel(outcomes.get(current.visit_key) ?? null)
                    : current.status === "delivered"
                      ? "Delivered"
                      : "Pending"}
                </span>
              </div>
              <h2>{current.customer_name}</h2>
              <p className={styles.address}>
                {current.address_snapshot ??
                  "Address missing. Contact the manager before proceeding."}
              </p>
              <div className={styles.contact}>
                {current.phone_snapshot ? (
                  <a
                    href={`tel:${current.phone_snapshot.replace(/[^+\d]/g, "")}`}
                  >
                    Call customer
                  </a>
                ) : null}
                {current.address_snapshot ? (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(current.address_snapshot)}`}
                  >
                    Navigate ↗
                  </a>
                ) : null}
              </div>
              {instructions.get(current.user_id) ? (
                <p className={styles.instructions}>
                  {instructions.get(current.user_id)}
                </p>
              ) : null}
              <div className={styles.products}>
                {current.daily_delivery_items.map((item) => (
                  <div key={item.product_key}>
                    <span>{productName(item.product_key)}</span>
                    <strong>
                      {item.quantity} {item.unit}
                    </strong>
                  </div>
                ))}
              </div>
              <DeliveryOutcomeForm
                deliveryIds={current.deliveryIds}
                items={current.outcomeItems}
                bottlesExpected={current.bottlesExpected}
                recorded={isRecorded(current)}
              />
              {date === todayInIndia() ? (
                <DriverCustomerRequestForm
                  key={current.visit_key}
                  deliveryId={current.id}
                  tomorrow={nextDeliveryDateInIndia()}
                  latest={requests.data ?? []}
                />
              ) : null}
              {next ? (
                <Link
                  prefetch={false}
                  className={styles.next}
                  href={href(next.id)}
                >
                  Next stop →
                </Link>
              ) : null}
            </li>
          </ol>
          <section className={styles.queue}>
            <h2>Your stops</h2>
            <ol>
              {stops.map((stop, i) => (
                <li key={stop.visit_key}>
                  <Link
                    prefetch={false}
                    href={href(stop.id)}
                    aria-current={current.id === stop.id ? "step" : undefined}
                  >
                    <span>
                      {i + 1}. {stop.customer_name}
                    </span>
                    <small>
                      {isRecorded(stop)
                        ? outcomes.has(stop.visit_key)
                          ? outcomeLabel(outcomes.get(stop.visit_key) ?? null)
                          : "Recorded"
                        : "Pending"}
                    </small>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : (
        <section className={styles.empty}>
          <h2>No released route</h2>
          <p>
            The manager has not released work assigned to you for this date.
          </p>
        </section>
      )}
      <footer>
        Customer information is provided only for completing farm deliveries. A
        saved outcome requires confirmation from the server.
      </footer>
    </main>
  );
}
