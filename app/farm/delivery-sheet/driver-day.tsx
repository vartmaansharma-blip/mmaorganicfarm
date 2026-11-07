import { type DriverTodayChange } from "@/lib/today-delivery-management";
import { orderedPendingStops, type GpsWorkspace } from "@/lib/gps-routing";
import {
  deliveryNavigationUrl,
  hasConfirmedDestination,
} from "@/lib/delivery-navigation";
import { FarmForm } from "../farm-form";
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
  destination_latitude: number | null;
  destination_longitude: number | null;
  destination_confirmed_at: string | null;
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
  updatesOnly = false,
  route,
  routes,
  instructions,
  outcomes,
  recorded,
}: {
  date: string;
  selected?: string;
  updatesOnly?: boolean;
  route?: string;
  routes: { name: string; stops: Stop[] }[];
  instructions: Map<string, string>;
  outcomes: Map<string, string>;
  recorded: Set<string>;
}) {
  const { supabase } = await requireFarmStaff("/farm/delivery-sheet");
  const { data: gps, error: gpsError } = await supabase.rpc(
    "get_gps_workspace",
    { p_date: date },
  );
  if (
    gpsError &&
    (!["PGRST202", "42883"].includes(gpsError.code) ||
      !/get_gps_workspace/.test(gpsError.message))
  )
    throw gpsError;
  const gpsRuns = (gps as GpsWorkspace | null)?.runs ?? [];
  const stops = routes.flatMap((group) => {
    const gpsRun = gpsRuns.find(
      (run) =>
        run.route_name === group.name && (!route || run.route_id === route),
    );
    const ranking = new Map(
      gpsRun
        ? orderedPendingStops(gpsRun).map((stop, index) => [
            stop.visit_key,
            index,
          ])
        : [],
    );
    return group.stops
      .map((stop) => ({ ...stop, routeName: group.name }))
      .sort(
        (a, b) =>
          (ranking.get(a.visit_key) ?? Infinity) -
          (ranking.get(b.visit_key) ?? Infinity),
      );
  });
  const isRecorded = (stop: Stop) =>
    recorded.has(stop.visit_key) || stop.status === "delivered";
  const pending = stops.filter(
    (stop) => !isRecorded(stop) && stop.status !== "cancelled",
  );
  const current =
    stops.find((stop) => stop.id === selected) ?? pending[0] ?? stops[0];
  const next = pending.find((stop) => stop.id !== current?.id);
  const requests = current
    ? await supabase
        .from("delivery_customer_requests")
        .select("kind,requested_date,status,customer_words")
        .in("source_delivery_id", current.deliveryIds)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [], error: null };
  if (requests.error) throw requests.error;
  const updatesResult = await supabase.rpc("get_driver_today_changes", { p_date: date });
  const approved = updatesResult.error ? [] : (updatesResult.data ?? []) as DriverTodayChange[];
  const currentUpdates = approved.filter(change => current?.deliveryIds.includes(change.delivery_id));
  const updateError = updatesResult.error
    && !["PGRST202", "42883"].includes(updatesResult.error.code);
  const href = (id: string) =>
    `/farm/delivery-sheet?${new URLSearchParams({ date, stop: id, ...(route ? { route } : {}) })}`;
  return (
    <main className={styles.page}>
      <Link
        prefetch={false}
        href={`/farm/runs?date=${date}`}
        className={styles.runBack}
      >
        ← My delivery run
      </Link>
      {gpsRuns.some((run) => run.accepted) ? (
        <Link
          prefetch={false}
          className={styles.runBack}
          href={`/farm/gps?date=${date}`}
        >
          ← GPS route and next stop
        </Link>
      ) : null}
      <header className={styles.header}>
        <div>
          <p>Delivery staff</p>
          <h1>{updatesOnly ? "Delivery updates" : "My route"}</h1>
          <span>{formatCalendarDate(date)}</span>
        </div>
        <span className={styles.count}>
          {stops.length - pending.length} of {stops.length} recorded
        </span>
      </header>
      <FarmForm className={styles.dateFilter}>
        <label>
          Service date
          <input name="date" type="date" defaultValue={date} />
        </label>
        <button>Apply</button>
      </FarmForm>
      <nav className={styles.driverTabs} aria-label="Driver workspace">
        <Link aria-current={updatesOnly ? undefined : "page"} href={`/farm/delivery-sheet?date=${date}`}>Route</Link>
        <Link href={`/farm/runs?date=${date}`}>Inventory</Link>
        <Link aria-current={updatesOnly ? "page" : undefined} href={`/farm/delivery-sheet?date=${date}&view=updates`}>Updates</Link>
        <Link href={`/farm/runs?date=${date}&view=profile`}>Profile</Link>
      </nav>
      {updatesOnly ? <section className={styles.empty}>
        <h2>Confirmed changes</h2>
        {updateError ? <p role="status">Updates could not sync. Refresh the route before delivering.</p>
          : approved.length ? <ul className={styles.changes}>{approved.map(change => {
            const stop = stops.find(row => row.deliveryIds.includes(change.delivery_id));
            return stop && change.product_key ? <li key={change.id}><Link href={href(stop.id)}>{stop.customer_name}</Link>
              <span>{productName(change.product_key)} · {change.previous_quantity} → {change.requested_quantity}</span></li> : null;
          })}</ul> : <p>No confirmed changes for your assigned route.</p>}
      </section> : current ? (
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
              data-outcome={outcomes.get(current.visit_key) ?? current.status}
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
                    href={deliveryNavigationUrl(current)!}
                  >
                    {hasConfirmedDestination(current)
                      ? "Navigate to confirmed entrance ↗"
                      : "Navigate by address ↗"}
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
              {currentUpdates.length ? <aside className={styles.changeBanner} aria-label="Approved quantity changes">
                <strong>Updated before packing</strong>
                {currentUpdates.map(change => change.product_key ? <span key={change.id}>
                  {productName(change.product_key)} · {change.previous_quantity} → {change.requested_quantity}
                </span> : null)}
              </aside> : null}
              {updateError ? <p role="status">Change history could not sync. Refresh the route to check for updates.</p> : null}
              <DeliveryOutcomeForm
                deliveryIds={current.deliveryIds}
                items={current.outcomeItems}
                bottlesExpected={current.bottlesExpected}
                recorded={isRecorded(current)}
                verifyManifest={!updatesResult.error || Boolean(updateError)}
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
