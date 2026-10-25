import { readAllRows } from "@/lib/farm-data";
import type { Metadata } from "next";
import Link from "next/link";
import {
  CAPACITY_PRODUCTS,
  formatCapacityQuantity,
} from "@/lib/capacity-products";
import {
  formatCalendarDate,
  nextDeliveryDateInIndia,
  todayInIndia,
} from "@/lib/delivery-calendar";
import { requireFarmManager } from "@/lib/farm-dashboard";
import {
  summarizeVisits,
  type OverviewDelivery,
  type OverviewOutcome,
} from "@/lib/farm-overview";
import {
  validOperationalDate,
  type Reconciliation,
} from "@/lib/delivery-operations";
import { createAdminClient } from "@/lib/supabase/admin";
import { prepareDailyDispatch } from "./delivery-sheet/actions";
import { FormSubmitButton } from "./form-submit-button";
import { RefreshStatus } from "./refresh-status";
import styles from "./farm.module.css";
export const metadata: Metadata = {
  title: "Farm overview",
  robots: { index: false, follow: false },
};
type DailyRow = OverviewDelivery & {
  delivery_area_id: string | null;
  generated_at: string;
};
type Capacity = {
  active_plan_quantity: number | string;
  paid_once_quantity: number | string;
  capacity_limit: number | string;
  available_quantity: number | string;
  checkout_holds_quantity: number | string;
};
export default async function FarmDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    area?: string;
    message?: string;
    error?: string;
  }>;
}) {
  const { supabase } = await requireFarmManager();
  const p = await searchParams;
  const date = validOperationalDate(p.date) ?? todayInIndia();
  const tomorrow = nextDeliveryDateInIndia();
  const area = /^[0-9a-f-]{36}$/i.test(p.area ?? "") ? p.area! : "";
  async function dailyRows() {
    const rows: DailyRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      let query = supabase
        .from("daily_deliveries")
        .select(
          "id,visit_key,status,delivery_confirmed,delivery_area_id,delivery_route_id,assigned_driver_id,generated_at,daily_delivery_items(product_key,quantity,unit,fulfilled_quantity)",
        )
        .eq("delivery_date", date)
        .eq("is_test", false)
        .order("id")
        .range(offset, offset + 999);
      if (area) query = query.eq("delivery_area_id", area);
      const result = await query;
      if (result.error) throw result.error;
      rows.push(...(result.data as DailyRow[]));
      if (result.data.length < 1000) return rows;
    }
  }
  const [
    rows,
    routesResult,
    areasResult,
    assignmentsResult,
    dispatchResult,
    outcomesResult,
    requestsResult,
    reconciliationResult,
    capacityResults,
    preparationRuns,
    spokenRequests,
  ] = await Promise.all([
    dailyRows(),
    supabase
      .from("delivery_routes")
      .select("id,name,area_id,stop_capacity")
      .eq("active", true)
      .order("name"),
    supabase
      .from("delivery_areas")
      .select("id,name")
      .eq("active", true)
      .order("name"),
    supabase
      .from("daily_route_assignments")
      .select("route_id,driver_id")
      .eq("delivery_date", date),
    supabase
      .from("delivery_dispatches")
      .select("status,prepared_at,released_at")
      .eq("delivery_date", date)
      .maybeSingle(),
    readAllRows<OverviewOutcome>((start, end) =>
      supabase
        .from("delivery_visit_outcomes")
        .select("visit_key,outcome,resolution")
        .eq("delivery_date", date)
        .order("visit_key")
        .range(start, end),
    ),
    supabase
      .from("cancellation_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "requested"),
    supabase.rpc("get_delivery_reconciliation", { p_date: date }),
    Promise.all(
      CAPACITY_PRODUCTS.map((product) =>
        createAdminClient().rpc("product_capacity_snapshot", {
          p_days: 1,
          p_product_key: product.id,
          p_start_date: tomorrow,
        }),
      ),
    ),
    supabase
      .from("delivery_automation_runs")
      .select("service_date,status,started_at")
      .in("service_date", [date, tomorrow])
      .order("started_at", { ascending: false })
      .limit(2),
    supabase
      .from("delivery_customer_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["requested", "follow_up"]),
  ]);
  const error = [
    routesResult.error,
    areasResult.error,
    assignmentsResult.error,
    dispatchResult.error,
    requestsResult.error,
    reconciliationResult.error,
    preparationRuns.error,
    spokenRequests.error,
  ].find(Boolean);
  if (error) throw error;
  const outcomes = outcomesResult;
  const summary = summarizeVisits(rows, outcomes);
  const reconciliation = reconciliationResult.data as Reconciliation;
  const routeIds = new Set(rows.map((row) => row.delivery_route_id));
  const routes = (routesResult.data ?? []).filter(
    (route) => (!area || route.area_id === area) && routeIds.has(route.id),
  );
  const driverIds = [
    ...new Set((assignmentsResult.data ?? []).map((row) => row.driver_id)),
  ];
  const driverResult = driverIds.length
    ? await supabase
        .from("customer_profiles")
        .select("user_id,full_name")
        .in("user_id", driverIds)
    : { data: [], error: null };
  if (driverResult.error) throw driverResult.error;
  const driverNames = new Map(
    (driverResult.data ?? []).map((row) => [
      row.user_id,
      row.full_name ?? "Assigned driver",
    ]),
  );
  const assignments = new Map(
    (assignmentsResult.data ?? []).map((row) => [
      row.route_id,
      driverNames.get(row.driver_id) ?? "Assigned driver",
    ]),
  );
  const scopedVisits = new Set(rows.map((row) => row.visit_key));
  const decisions = outcomes.filter(
    (row) => scopedVisits.has(row.visit_key) && row.resolution === "pending",
  ).length;
  const unassigned = new Set(
    rows
      .filter(
        (row) =>
          row.status !== "cancelled" &&
          (!row.delivery_route_id || !row.assigned_driver_id),
      )
      .map((row) => row.visit_key),
  ).size;
  const released = dispatchResult.data?.status === "released";
  const closed = reconciliation.last_review?.action === "closed";
  const stage = closed
    ? "Closed"
    : !dispatchResult.data
      ? "Not prepared"
      : !released
        ? "Draft ready for review"
        : summary.pending
          ? "In progress"
          : "Closeout";
  const scope = new URLSearchParams({
    date,
    ...(area ? { area } : {}),
  }).toString();
  const nextPreparation = preparationRuns.data?.find(
    (run) => run.service_date === tomorrow,
  );
  const failedPreparation = preparationRuns.data?.some(
    (run) => run.status === "failed",
  );
  const label = date === todayInIndia() ? "Today at the farm" : "Farm overview";
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>Farm operations</p>
          <h1>{label}</h1>
          <span>
            {formatCalendarDate(date)} ·{" "}
            {area
              ? (areasResult.data?.find((row) => row.id === area)?.name ??
                "Selected zone")
              : "All zones"}
          </span>
        </div>
        <div className={styles.headerActions}>
          {!dispatchResult.data ? (
            <form action={prepareDailyDispatch}>
              <input type="hidden" name="deliveryDate" value={date} />
              <FormSubmitButton pendingLabel="Preparing…">
                Prepare draft
              </FormSubmitButton>
            </form>
          ) : (
            <Link prefetch={false}
              className={styles.primary}
              href={
                closed
                  ? `/farm/reconciliation?date=${date}`
                  : !released
                    ? `/farm/delivery-sheet?${scope}`
                    : decisions
                      ? `/farm/exceptions?${scope}`
                      : `/farm/reconciliation?date=${date}`
              }
            >
              {closed
                ? "View closed report"
                : !released
                  ? "Review dispatch"
                  : decisions
                    ? "Review exceptions"
                    : "Review closeout"}
            </Link>
          )}
        </div>
      </header>
      {p.message ? (
        <p className={styles.notice} role="status">
          {p.message}
        </p>
      ) : null}
      {p.error ? (
        <p className={styles.error} role="alert">
          {p.error}
        </p>
      ) : null}
      <form className={styles.filters} method="get">
        <label>
          Service date
          <input type="date" name="date" defaultValue={date} />
        </label>
        <label>
          Zone
          <select name="area" defaultValue={area}>
            <option value="">All zones</option>
            {areasResult.data?.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <button>Apply</button>
      </form>
      <section
        className={styles.mission}
        aria-label="Daily goal and current status"
      >
        <div className={styles.missionCopy}>
          <p>The goal for this service day</p>
          <h2>
            Every doorstep served.
            <br />
            Every shortfall accounted for.
          </h2>
          <span>
            Prepare the right quantities, complete the route, and preserve every
            customer’s outstanding service.
          </span>
        </div>
        <div className={styles.currentStatus}>
          <span className={styles.statusPill}>
            <i aria-hidden="true" />
            {stage}
          </span>
          <h3>
            {!dispatchResult.data
              ? "Start with a prepared draft"
              : closed
                ? "This day’s review is preserved"
                : !released
                  ? "Review assignments before dispatch"
                  : summary.pending
                    ? `${summary.pending} visits still need an outcome`
                    : decisions
                      ? `${decisions} ${decisions === 1 ? "exception needs" : "exceptions need"} a decision`
                      : "Ready for the closeout review"}
          </h3>
          <p>
            {summary.delivered} fully delivered · {summary.partial} partial ·{" "}
            {decisions} need review
          </p>
          <progress
            aria-label="Visits with an outcome"
            max={Math.max(1, summary.expected)}
            value={summary.expected - summary.pending}
          />
          <small>
            {summary.expected - summary.pending} of {summary.expected} visits
            have a recorded outcome
          </small>
        </div>
      </section>
      <div className={styles.stage}>
        <strong>{stage}</strong>
        <span>Draft → Review → Released → In progress → Closeout → Closed</span>
      </div>
      <section className={styles.metrics} aria-label="Delivery progress">
        <Link prefetch={false} href={`/farm/delivery-sheet?${scope}&outcome=delivered`}>
          <span>Fully delivered visits</span>
          <strong>
            {summary.delivered}
            <small> / {summary.expected}</small>
          </strong>
          <small>
            {summary.partial} partial · {summary.unsuccessful} exceptions ·{" "}
            {summary.pending} pending
          </small>
        </Link>
        <Link prefetch={false} href={`/farm/delivery-sheet?${scope}`}>
          <span>Milk delivered</span>
          <strong>
            {formatCapacityQuantity(summary.milkDelivered)}
            <small> / {formatCapacityQuantity(summary.milkPlanned)} L</small>
          </strong>
          <small>Confirmed actual / planned</small>
        </Link>
        <Link prefetch={false} href={`/farm/exceptions?${scope}`} data-attention={decisions > 0}>
          <span>Decisions due</span>
          <strong>{decisions}</strong>
          <small>Recorded service exceptions</small>
        </Link>
        <Link prefetch={false} href={`/farm/routes?date=${date}`}>
          <span>Routes with work</span>
          <strong>{routes.length}</strong>
          <small>
            {released ? "Dispatch released" : "Awaiting release"} · {unassigned}{" "}
            unassigned visits
          </small>
        </Link>
      </section>
      {!dispatchResult.data ? (
        <p className={styles.empty}>
          This day has not been prepared. Prepare a draft to see validated work;
          an empty list does not establish zero demand.
        </p>
      ) : !summary.expected ? (
        <p className={styles.empty}>
          No active visits in this prepared day and zone.
        </p>
      ) : null}
      {failedPreparation ? (
        <p className={styles.warning}>
          Automatic preparation needs attention.{" "}
          <Link prefetch={false} href="/farm/activity">Review the failed run and retry →</Link>
        </p>
      ) : null}
      <div className={styles.mainGrid}>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <h2>Routes this morning</h2>
            <Link prefetch={false} href={`/farm/routes?date=${date}`}>All routes →</Link>
          </div>
          {routes.length ? (
            routes.map((route) => {
              const s = summarizeVisits(
                rows.filter((row) => row.delivery_route_id === route.id),
                outcomes,
              );
              return (
                <div className={styles.routeRow} key={route.id}>
                  <div>
                    <h3>{route.name}</h3>
                    <p>
                      {assignments.get(route.id) ?? "Driver required"} ·{" "}
                      {s.expected} visits
                    </p>
                    <progress
                      aria-label={`${route.name} fully delivered visits`}
                      max={Math.max(1, s.expected)}
                      value={s.delivered}
                    />
                    <small>
                      {s.delivered} delivered · {s.partial} partial ·{" "}
                      {s.unsuccessful} exceptions · {s.pending} pending
                    </small>
                  </div>
                  <Link prefetch={false}
                    href={`/farm/delivery-sheet?date=${date}&route=${route.id}`}
                  >
                    Open →
                  </Link>
                </div>
              );
            })
          ) : (
            <p className={styles.empty}>No routed work in this scope.</p>
          )}
          {unassigned > 0 ? (
            <p className={styles.warning}>
              {unassigned} visits need a route or driver.{" "}
              <Link prefetch={false} href={`/farm/delivery-sheet?date=${date}`}>
                Review assignments →
              </Link>
            </p>
          ) : null}
        </section>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <h2>Needs a decision</h2>
            <span>{decisions} in selected scope</span>
          </div>
          <div className={styles.attention}>
            <Link prefetch={false} href={`/farm/exceptions?${scope}`}>
              <strong>
                Delivery exceptions <b>{decisions}</b>
              </strong>
              <small>Review shortfalls and preserve outstanding service.</small>
              <span>Operations manager · service day {date}</span>
            </Link>
            <Link prefetch={false} href={`/farm/reconciliation?date=${date}`}>
              <strong>
                Closeout blockers <b>{reconciliation.blockers.length}</b>
              </strong>
              <small>
                All zones · {reconciliation.follow_ups} tracked follow-ups
              </small>
            </Link>
            <Link prefetch={false} href="/farm/cancellations">
              <strong>
                Customer requests{" "}
                <b>
                  {(requestsResult.count ?? 0) + (spokenRequests.count ?? 0)}
                </b>
              </strong>
              <small>
                {spokenRequests.count ?? 0} from delivery staff · all dates and
                zones
              </small>
            </Link>
          </div>
        </section>
      </div>
      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Tomorrow’s readiness</h2>
            <p>
              Nightly preparation:{" "}
              {nextPreparation?.status ?? "no run recorded"}
            </p>
            <p>
              {formatCalendarDate(tomorrow)} · all zones · paid commitments
              against capacity
            </p>
          </div>
          <Link prefetch={false} href="/farm/capacity">Review capacity →</Link>
        </div>
        <div className={styles.capacityGrid}>
          {CAPACITY_PRODUCTS.map((product, i) => {
            const result = capacityResults[i];
            const snapshot = result.error
              ? null
              : (result.data?.[0] as Capacity | undefined);
            const committed =
              Number(snapshot?.active_plan_quantity ?? 0) +
              Number(snapshot?.paid_once_quantity ?? 0);
            return (
              <article key={product.id}>
                <span>{product.name}</span>
                {snapshot &&
                [
                  snapshot.capacity_limit,
                  snapshot.available_quantity,
                  snapshot.active_plan_quantity,
                  snapshot.paid_once_quantity,
                ].every(
                  (value) =>
                    value !== null &&
                    value !== undefined &&
                    Number.isFinite(Number(value)),
                ) ? (
                  <>
                    <strong>
                      {formatCapacityQuantity(committed)} /{" "}
                      {formatCapacityQuantity(snapshot.capacity_limit)}{" "}
                      {product.shortUnit}
                    </strong>
                    <small>
                      {formatCapacityQuantity(snapshot.available_quantity)}{" "}
                      {product.shortUnit} available ·{" "}
                      {formatCapacityQuantity(
                        snapshot.checkout_holds_quantity ?? 0,
                      )}{" "}
                      held
                    </small>
                  </>
                ) : (
                  <p>
                    Capacity unavailable.{" "}
                    <Link prefetch={false} href="/farm/capacity">Check limits</Link>
                  </p>
                )}
              </article>
            );
          })}
        </div>
        <p className={styles.hint}>
          Outstanding replacements remain subject to their recorded resolution
          and capacity checks.
        </p>
      </section>
      <footer className={styles.footer}>
        <RefreshStatus updatedAt={new Date().toISOString()} />
        <span>Paid, delivered, and still owed are tracked separately.</span>
      </footer>
    </main>
  );
}
