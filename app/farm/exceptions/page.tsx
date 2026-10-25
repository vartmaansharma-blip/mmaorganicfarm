import type { Metadata } from "next";
import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { todayInIndia, productName } from "@/lib/delivery-calendar";
import {
  DELIVERY_REASONS,
  validOperationalDate,
  outcomeLabel,
  reasonLabel,
  type ExceptionRow,
} from "@/lib/delivery-operations";
import { OperationFilters, ExceptionResolutionForm } from "../operation-forms";
import { InboxTabs } from "../workspace-parts";
import styles from "../operations-workbench.module.css";
export const metadata: Metadata = {
  title: "Delivery exceptions",
  robots: { index: false, follow: false },
};
export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const date = validOperationalDate(p.date) ?? todayInIndia();
  const { supabase } = await requireFarmManager("/farm/exceptions");
  const uuid = /^[0-9a-f-]{36}$/i;
  const area = uuid.test(p.area ?? "") ? p.area : null;
  const areaResult = await supabase
    .from("delivery_areas")
    .select("id,name")
    .eq("active", true)
    .order("name");
  if (areaResult.error) throw areaResult.error;
  const route = uuid.test(p.route ?? "") ? p.route : null;
  const driver = uuid.test(p.driver ?? "") ? p.driver : null;
  const page = Math.max(
    0,
    Math.min(10000, Number.parseInt(p.page ?? "0", 10) || 0),
  );
  const [result, routes, assignments] = await Promise.all([
    supabase.rpc("get_delivery_exceptions", {
      p_date: date,
      p_area: area,
      p_resolution: p.resolution ?? "pending",
      p_reason: p.reason ?? "",
      p_route: route,
      p_driver: driver,
      p_customer: (p.customer ?? "").slice(0, 100),
      p_offset: page * 25,
      p_limit: 25,
    }),
    supabase
      .from("delivery_routes")
      .select("id,name")
      .eq("active", true)
      .order("name"),
    supabase
      .from("daily_route_assignments")
      .select("driver_id")
      .eq("delivery_date", date),
  ]);
  if (result.error) throw result.error;
  if (routes.error) throw routes.error;
  if (assignments.error) throw assignments.error;
  const ids = [...new Set((assignments.data ?? []).map((r) => r.driver_id))];
  const names = ids.length
    ? await supabase
        .from("customer_profiles")
        .select("user_id,full_name")
        .in("user_id", ids)
    : { data: [], error: null };
  if (names.error) throw names.error;
  const data = result.data as { total: number; rows: ExceptionRow[] };
  const pageHref = (next: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
    q.set("date", date);
    q.set("page", String(next));
    return `/farm/exceptions?${q}`;
  };
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>Daily operations</span>
          <h1>Inbox</h1>
          <p>
            Resolve the customer obligation separately from the driver&apos;s
            report. Every decision keeps an audit record.
          </p>
        </div>
        <nav className={styles.links}>
          <Link prefetch={false} href={`/farm/delivery-sheet?date=${date}`}>Delivery sheet</Link>
          <Link prefetch={false} href={`/farm/reconciliation?date=${date}`}>
            Review reconciliation
          </Link>
        </nav>
      </header>
      <InboxTabs active="exceptions" />
      <OperationFilters path="/farm/exceptions">
        <label>
          Service date
          <input name="date" type="date" defaultValue={date} />
        </label>
        <label>
          Zone
          <select name="area" defaultValue={area ?? ""}>
            <option value="">All zones</option>
            {areaResult.data?.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Resolution
          <select name="resolution" defaultValue={p.resolution ?? "pending"}>
            <option value="pending">Needs decision</option>
            <option value="">All resolutions</option>
            <option value="retained">Retained obligation</option>
            <option value="rescheduled">Replacement approved</option>
            <option value="carry_forward">Carry-forward</option>
            <option value="not_required">Delivery complete</option>
          </select>
        </label>
        <label>
          Reason
          <select name="reason" defaultValue={p.reason ?? ""}>
            <option value="">All reasons</option>
            {DELIVERY_REASONS.map(([c, l]) => (
              <option value={c} key={c}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Route
          <select name="route" defaultValue={route ?? ""}>
            <option value="">All routes</option>
            {routes.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Driver
          <select name="driver" defaultValue={driver ?? ""}>
            <option value="">All assigned drivers</option>
            {names.data?.map((r) => (
              <option key={r.user_id} value={r.user_id}>
                {r.full_name ?? "Driver"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Customer
          <input
            name="customer"
            defaultValue={p.customer ?? ""}
            maxLength={100}
            placeholder="Customer name"
          />
        </label>
      </OperationFilters>
      <p className={styles.hint}>
        {data.total} matching visits. Showing{" "}
        {data.rows.length
          ? `${page * 25 + 1}–${page * 25 + data.rows.length}`
          : "0"}
        . Bottles are documented return checks, not a verified stock balance.
      </p>
      {data.rows.length ? (
        data.rows.map((row) => (
          <article
            className={styles.panel}
            data-attention={row.resolution === "pending"}
            key={row.visit_key}
          >
            <div className={styles.panelHeader}>
              <div>
                <h2>{row.customer}</h2>
                <p>
                  {row.route ?? "Route missing"} ·{" "}
                  {row.driver ?? "Driver missing"}
                </p>
              </div>
              <span className={styles.badge} data-state={row.resolution}>
                {row.resolution.replaceAll("_", " ")}
              </span>
            </div>
            <div className={styles.resolutionGrid}>
              <div>
                <h3>{outcomeLabel(row.outcome)}</h3>
                <p>
                  {reasonLabel(row.reason_code)}
                  {row.note ? ` · ${row.note}` : ""}
                </p>
                <div className={styles.items}>
                  {row.items?.map((item) => (
                    <span key={`${item.delivery_id}:${item.product_key}`}>
                      {productName(item.product_key)}:{" "}
                      {item.fulfilled_quantity ?? "Unknown"} / {item.quantity}{" "}
                      {item.unit}
                    </span>
                  ))}
                </div>
                <p className={styles.hint}>
                  Undelivered product quantities remain outstanding. A failed
                  attempt does not consume a prepaid entitlement.{" "}
                  {row.follow_up_date
                    ? `Follow-up: ${row.follow_up_date}.`
                    : ""}
                </p>
                {row.bottles_due > 0 ? (
                  <p>
                    {row.bottles_due} documented bottle return checks
                    outstanding.
                  </p>
                ) : null}
                <Link prefetch={false} href={`/farm/customers/${row.user_id}`}>
                  Open customer history →
                </Link>
                {!row.event_id ? (
                  <p className={styles.error}>
                    Legacy issue lacks a structured outcome. Record the actual
                    outcome in the delivery sheet before resolving it.
                  </p>
                ) : null}
              </div>
              {row.event_id &&
              ["pending", "retained", "carry_forward"].includes(
                row.resolution,
              ) ? (
                <ExceptionResolutionForm
                  date={date}
                  visitKey={row.visit_key}
                  eventId={row.event_id}
                />
              ) : (
                <p className={styles.saved}>
                  The recorded decision is preserved. Review its follow-up or
                  linked replacement in the delivery sheet.
                </p>
              )}
            </div>
          </article>
        ))
      ) : (
        <p className={styles.empty}>No visits match these filters.</p>
      )}
      <nav className={styles.pager} aria-label="Exception pages">
        {page > 0 ? <Link prefetch={false} href={pageHref(page - 1)}>← Previous</Link> : null}
        {(page + 1) * 25 < data.total ? (
          <Link prefetch={false} href={pageHref(page + 1)}>Next →</Link>
        ) : null}
      </nav>
    </main>
  );
}
