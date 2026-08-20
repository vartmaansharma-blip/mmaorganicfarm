import type { Metadata } from "next";
import Link from "next/link";
import { CAPACITY_PRODUCTS, formatCapacityQuantity } from "@/lib/capacity-products";
import { formatCalendarDate, nextDeliveryDateInIndia, productName, todayInIndia } from "@/lib/delivery-calendar";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTomorrowDeliverySheet, prepareTodayDeliverySheet } from "./actions";
import styles from "./farm.module.css";

export const metadata: Metadata = { title: "Farm operations", robots: { index: false, follow: false } };

type CapacitySnapshot = {
  active_plan_quantity: number | string;
  available_quantity: number | string;
  capacity_limit: number | string;
  paid_once_quantity: number | string;
};

type DeliveryRow = {
  daily_delivery_items: { product_key: string; quantity: number | string }[];
  delivery_route_id: string | null;
  generated_at: string;
  id: string;
  status: string;
};

function capacityPercent(snapshot: CapacitySnapshot | null) {
  const limit = Number(snapshot?.capacity_limit ?? 0);
  const accepted = Number(snapshot?.active_plan_quantity ?? 0) + Number(snapshot?.paid_once_quantity ?? 0);
  return limit > 0 ? Math.min(100, Math.round((accepted / limit) * 100)) : 0;
}

export default async function FarmDashboardPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { supabase } = await requireFarmManager();
  const admin = createAdminClient();
  const today = todayInIndia();
  const tomorrow = nextDeliveryDateInIndia();
  const params = await searchParams;

  const [profilesResult, plansResult, tomorrowResult, todayResult, routesResult, assignmentsResult, requestsResult, todayDispatchResult] = await Promise.all([
    supabase.from("customer_profiles").select("user_id,address_line,delivery_route_id"),
    supabase.from("delivery_plans").select("user_id").eq("is_test", false).eq("status", "active"),
    supabase.from("daily_deliveries").select("id,status,generated_at,delivery_route_id,daily_delivery_items(product_key,quantity)").eq("delivery_date", tomorrow).eq("is_test", false),
    supabase.from("daily_deliveries").select("id,status,delivery_confirmed,bottle_return_required,bottle_returned,assigned_driver_id").eq("delivery_date", today).eq("is_test", false),
    supabase.from("delivery_routes").select("id,name").eq("active", true),
    supabase.from("route_driver_assignments").select("route_id,driver_id"),
    supabase.from("cancellation_requests").select("id", { count: "exact", head: true }).eq("status", "requested"),
    supabase.from("delivery_dispatches").select("status").eq("delivery_date", today).maybeSingle(),
  ]);
  const databaseError = [profilesResult.error, plansResult.error, tomorrowResult.error, todayResult.error, routesResult.error, assignmentsResult.error, requestsResult.error, todayDispatchResult.error].find(Boolean);
  if (databaseError) throw databaseError;

  const capacityResults = await Promise.all(CAPACITY_PRODUCTS.map((product) => admin.rpc("product_capacity_snapshot", { p_days: 1, p_product_key: product.id, p_start_date: tomorrow })));
  const capacityByProduct = new Map(CAPACITY_PRODUCTS.map((product, index) => [product.id, capacityResults[index].error ? null : (((capacityResults[index].data ?? [])[0] ?? null) as CapacitySnapshot | null)]));
  const activeCustomerIds = new Set((plansResult.data ?? []).map((plan) => plan.user_id));
  const profiles = profilesResult.data ?? [];
  const tomorrowStops = (tomorrowResult.data ?? []) as DeliveryRow[];
  const todayStops = todayResult.data ?? [];
  const unrouted = profiles.filter((profile) => activeCustomerIds.has(profile.user_id) && !profile.delivery_route_id).length;
  const missingAddress = profiles.filter((profile) => activeCustomerIds.has(profile.user_id) && !profile.address_line).length;
  const todayOpen = todayStops.filter((stop) => !stop.delivery_confirmed && !["delivered", "cancelled", "failed"].includes(stop.status)).length;
  const todayBottleReturns = todayStops.filter((stop) => stop.bottle_return_required && !stop.bottle_returned).length;
  const assignedRouteIds = new Set((assignmentsResult.data ?? []).map((assignment) => assignment.route_id));
  const routesWithoutDriver = (routesResult.data ?? []).filter((route) => !assignedRouteIds.has(route.id)).length;
  const generatedAt = tomorrowStops.map((stop) => stop.generated_at).sort().at(-1);
  const productionTotals = new Map<string, number>();
  tomorrowStops.forEach((stop) => stop.daily_delivery_items.forEach((item) => productionTotals.set(item.product_key, (productionTotals.get(item.product_key) ?? 0) + Number(item.quantity))));
  const exceptionCount = unrouted + missingAddress + routesWithoutDriver + (requestsResult.count ?? 0);
  const todayReleased = todayDispatchResult.data?.status === "released";

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p>Farm operations</p><h1>Daily control</h1><span>{formatCalendarDate(today)} · show only what needs a decision</span></div>
      <div className={styles.headerActions}>{todayReleased ? null : <form action={prepareTodayDeliverySheet}><button type="submit">Prepare today</button></form>}<form action={generateTomorrowDeliverySheet}><button type="submit">Generate tomorrow</button></form><Link href={`/farm/delivery-sheet?date=${today}`}>{todayReleased ? "Run released routes" : "Review today"}</Link></div>
    </header>

    {params.message ? <p className={styles.notice}>{params.message}</p> : null}
    {params.error ? <p className={`${styles.notice} ${styles.error}`}>{params.error}</p> : null}

    <section className={styles.metrics} aria-label="Farm status">
      <article data-attention={todayOpen > 0}><span>Today still open</span><strong>{todayOpen}</strong><small>delivery stops</small></article>
      <article><span>Tomorrow prepared</span><strong>{tomorrowStops.length}</strong><small>{generatedAt ? "sheet generated" : "generate when ready"}</small></article>
      <article data-attention={unrouted > 0}><span>Need a route</span><strong>{unrouted}</strong><small>active customers</small></article>
      <article data-attention={exceptionCount > 0}><span>Exceptions</span><strong>{exceptionCount}</strong><small>manager decisions</small></article>
    </section>

    <section className={styles.priority}>
      <div className={styles.sectionHeading}><div><p>Act first</p><h2>Exceptions</h2></div><span>{exceptionCount ? `${exceptionCount} to review` : "Operations ready"}</span></div>
      <div className={styles.exceptionGrid}>
        <Link data-attention={todayOpen > 0} href={`/farm/delivery-sheet?date=${today}`}><strong>{todayOpen}</strong><span>Today&apos;s unfinished stops</span><small>Complete, fail, or reschedule each stop.</small></Link>
        <Link data-attention={todayBottleReturns > 0} href={`/farm/delivery-sheet?date=${today}`}><strong>{todayBottleReturns}</strong><span>Bottles still due</span><small>Record returns from today&apos;s route.</small></Link>
        <Link data-attention={unrouted + routesWithoutDriver > 0} href="/farm/routes"><strong>{unrouted + routesWithoutDriver}</strong><span>Routing exceptions</span><small>{unrouted} customers · {routesWithoutDriver} routes without drivers</small></Link>
        <Link data-attention={(requestsResult.count ?? 0) > 0} href="/farm/cancellations"><strong>{requestsResult.count ?? 0}</strong><span>Customer requests</span><small>Approve or reject open requests.</small></Link>
      </div>
    </section>

    <section className={styles.tomorrow}>
      <div className={styles.sectionHeading}><div><p>{formatCalendarDate(tomorrow)}</p><h2>Tomorrow&apos;s production and capacity</h2></div><Link href="/farm/capacity">Edit limits</Link></div>
      <div className={styles.capacityGrid}>
        {CAPACITY_PRODUCTS.map((product) => {
          const snapshot = capacityByProduct.get(product.id) ?? null;
          const accepted = Number(snapshot?.active_plan_quantity ?? 0) + Number(snapshot?.paid_once_quantity ?? 0);
          const percent = capacityPercent(snapshot);
          return <article key={product.id}><div><span>{product.name}</span><strong>{formatCapacityQuantity(snapshot?.available_quantity ?? 0)} {product.shortUnit} available</strong></div><meter min={0} max={100} high={95} low={80} optimum={0} value={percent}>{percent}%</meter><small>{formatCapacityQuantity(accepted)} of {formatCapacityQuantity(snapshot?.capacity_limit ?? 0)} {product.shortUnit} committed · {percent}% used</small></article>;
        })}
      </div>
      {productionTotals.size ? <div className={styles.production}><strong>Prepare</strong>{[...productionTotals].map(([key, quantity]) => <span key={key}>{productName(key)} <b>{quantity}</b></span>)}</div> : <p className={styles.empty}>No paid deliveries are prepared for tomorrow yet.</p>}
    </section>

    <section className={styles.readiness}>
      <div><p>Tomorrow&apos;s sheet</p><h2>{generatedAt ? "Prepared" : "Not generated"}</h2><span>{generatedAt ? `${tomorrowStops.length} paid delivery stops are ready.` : "Generate after route and capacity exceptions are resolved."}</span></div>
      <div className={styles.readinessActions}><Link href="/farm/routes">Check routes</Link><Link href={`/farm/delivery-sheet?date=${tomorrow}`}>Open tomorrow</Link></div>
    </section>
  </main>;
}
