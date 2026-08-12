import type { Metadata } from "next";
import Link from "next/link";
import {
  formatCalendarDate,
  nextDeliveryDateInIndia,
  productName,
} from "@/lib/delivery-calendar";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import { generateTomorrowDeliverySheet, updateDeliveryStatus } from "./actions";
import styles from "./farm.module.css";

export const metadata: Metadata = {
  title: "Farm operations",
  robots: { index: false, follow: false },
};

type ProfileRow = {
  delivery_area_id: string | null;
  delivery_route_id: string | null;
};

type PlanRow = {
  id: string;
  status: string;
};

type PauseRow = {
  end_date: string;
  plan_id: string;
  start_date: string;
};

type DailyItemRow = {
  product_key: string;
  quantity: number;
  unit: string;
};

type DailyDeliveryRow = {
  address_snapshot: string | null;
  bottle_choice: "new" | "none" | "return";
  customer_name: string;
  daily_delivery_items: DailyItemRow[];
  delivery_area_id: string | null;
  delivery_route_id: string | null;
  generated_at: string;
  id: string;
  phone_snapshot: string | null;
  route_stop_order: number | null;
  status: string;
};

type Stop = {
  address: string;
  bottleChoice: "new" | "none" | "return";
  id: string;
  items: DailyItemRow[];
  name: string;
  phone: string | null;
  status: string;
  stopOrder: number | null;
};

type RouteGroup = {
  name: string;
  stops: Stop[];
};

type AreaGroup = {
  name: string;
  routes: Map<string, RouteGroup>;
};

function formatQuantity(item: DailyItemRow) {
  const quantity = Number(item.quantity);
  if (/^1\s/.test(item.unit)) return `${quantity} × ${item.unit}`;
  return `${quantity} ${item.unit}${quantity === 1 ? "" : "s"}`;
}

function mapUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export default async function FarmDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { supabase } = await requireFarmStaff();
  const deliveryDate = nextDeliveryDateInIndia();
  const params = await searchParams;

  const [
    profilesResult,
    areasResult,
    routesResult,
    plansResult,
    pausesResult,
    deliveriesResult,
  ] = await Promise.all([
    supabase
      .from("customer_profiles")
      .select("delivery_area_id, delivery_route_id"),
    supabase.from("delivery_areas").select("id, name, active, sort_order"),
    supabase
      .from("delivery_routes")
      .select("id, area_id, name, code, active, sort_order"),
    supabase
      .from("delivery_plans")
      .select("id, status")
      .in("status", ["pending_confirmation", "active", "paused"]),
    supabase
      .from("delivery_pauses")
      .select("plan_id, start_date, end_date"),
    supabase
      .from("daily_deliveries")
      .select(
        "id, status, generated_at, customer_name, phone_snapshot, address_snapshot, bottle_choice, delivery_area_id, delivery_route_id, route_stop_order, daily_delivery_items(product_key, quantity, unit)",
      )
      .eq("delivery_date", deliveryDate),
  ]);

  const databaseError = [
    profilesResult.error,
    areasResult.error,
    routesResult.error,
    plansResult.error,
    pausesResult.error,
    deliveriesResult.error,
  ].find(Boolean);

  if (databaseError) throw databaseError;

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const plans = (plansResult.data ?? []) as PlanRow[];
  const pauses = (pausesResult.data ?? []) as PauseRow[];
  const deliveries = (deliveriesResult.data ?? []) as DailyDeliveryRow[];
  const areaById = new Map(
    (areasResult.data ?? []).map((area) => [area.id, area]),
  );
  const routeById = new Map(
    (routesResult.data ?? []).map((route) => [route.id, route]),
  );
  const areaGroups = new Map<string, AreaGroup>();
  const totals = new Map<string, number>();

  deliveries.forEach((delivery) => {
    const area = delivery.delivery_area_id
      ? areaById.get(delivery.delivery_area_id)
      : null;
    const route = delivery.delivery_route_id
      ? routeById.get(delivery.delivery_route_id)
      : null;
    const areaKey = area?.id ?? "unassigned";
    const routeKey = route?.id ?? `${areaKey}-unassigned`;
    const areaGroup: AreaGroup = areaGroups.get(areaKey) ?? {
      name: area?.name ?? "Unassigned area",
      routes: new Map<string, RouteGroup>(),
    };
    const routeGroup: RouteGroup = areaGroup.routes.get(routeKey) ?? {
      name: route?.name ?? "Route not assigned",
      stops: [],
    };

    routeGroup.stops.push({
      address: delivery.address_snapshot ?? "",
      bottleChoice: delivery.bottle_choice,
      id: delivery.id,
      items: delivery.daily_delivery_items ?? [],
      name: delivery.customer_name,
      phone: delivery.phone_snapshot,
      status: delivery.status,
      stopOrder: delivery.route_stop_order,
    });
    areaGroup.routes.set(routeKey, routeGroup);
    areaGroups.set(areaKey, areaGroup);

    (delivery.daily_delivery_items ?? []).forEach((item) => {
      totals.set(
        item.product_key,
        (totals.get(item.product_key) ?? 0) + Number(item.quantity),
      );
    });
  });

  const groups = [...areaGroups.values()]
    .map((area) => ({
      ...area,
      routes: [...area.routes.values()].map((route) => ({
        ...route,
        stops: route.stops.sort(
          (a, b) => (a.stopOrder ?? 9999) - (b.stopOrder ?? 9999),
        ),
      })),
    }))
    .sort((a, b) => {
      if (a.name === "Unassigned area") return 1;
      if (b.name === "Unassigned area") return -1;
      return a.name.localeCompare(b.name);
    });
  const pendingCount = plans.filter(
    (plan) => plan.status === "pending_confirmation",
  ).length;
  const unassignedCount = profiles.filter(
    (profile) => !profile.delivery_area_id || !profile.delivery_route_id,
  ).length;
  const pausedTomorrow = plans.filter(
    (plan) =>
      plan.status === "active" &&
      pauses.some(
        (pause) =>
          pause.plan_id === plan.id &&
          deliveryDate >= pause.start_date &&
          deliveryDate <= pause.end_date,
      ),
  ).length;
  const productTotals = [...totals.entries()].sort(([a], [b]) => {
    if (a === "milk") return -1;
    if (b === "milk") return 1;
    return a.localeCompare(b);
  });
  const generatedAt = deliveries
    .map((delivery) => delivery.generated_at)
    .sort()
    .at(-1);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Farm operations</p>
          <h1>Tomorrow&apos;s delivery plan</h1>
          <p className={styles.date}>{formatCalendarDate(deliveryDate)}</p>
        </div>
        <div className={styles.headerActions}>
          <form action={generateTomorrowDeliverySheet}>
            <button className={styles.generateButton} type="submit">
              Generate tomorrow&apos;s sheet
            </button>
          </form>
          <Link className={styles.locationLink} href="/farm/locations">
            Manage locations
          </Link>
        </div>
      </header>

      {params.message ? (
        <p className={styles.notice}>{params.message}</p>
      ) : null}
      {params.error ? (
        <p className={`${styles.notice} ${styles.error}`}>{params.error}</p>
      ) : null}

      <section className={styles.sheetStatus} aria-label="Daily sheet status">
        <div>
          <strong>{generatedAt ? "Daily sheet ready" : "Daily sheet not generated"}</strong>
          <span>
            {generatedAt
              ? `${deliveries.length} persistent stops saved for tomorrow.`
              : "Generate after paid plans are active. Pending checkout is never included."}
          </span>
        </div>
        <span>{pausedTomorrow} paused</span>
      </section>

      <section className={styles.metrics} aria-label="Tomorrow's totals">
        <article>
          <span>Customer stops</span>
          <strong>{deliveries.length}</strong>
        </article>
        <article>
          <span>Milk</span>
          <strong>{totals.get("milk") ?? 0} L</strong>
        </article>
        <article>
          <span>Pending checkout</span>
          <strong>{pendingCount}</strong>
        </article>
        <article>
          <span>Needs location</span>
          <strong>{unassignedCount}</strong>
        </article>
      </section>

      {productTotals.length ? (
        <section className={styles.production} aria-labelledby="production-title">
          <div>
            <p className={styles.sectionLabel}>Production list</p>
            <h2 id="production-title">Prepare for tomorrow</h2>
          </div>
          <div className={styles.productTotals}>
            {productTotals.map(([key, quantity]) => (
              <span key={key}>
                <strong>{quantity}</strong> {productName(key)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.routeSection} aria-labelledby="routes-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionLabel}>Date → area → route → customer</p>
            <h2 id="routes-title">Delivery routes</h2>
          </div>
          <span>{deliveries.length} stops</span>
        </div>

        {groups.length ? (
          <div className={styles.areaList}>
            {groups.map((area) => (
              <article className={styles.area} key={area.name}>
                <header>
                  <h3>{area.name}</h3>
                  <span>
                    {area.routes.reduce((sum, route) => sum + route.stops.length, 0)} stops
                  </span>
                </header>
                <div className={styles.routeList}>
                  {area.routes.map((route) => (
                    <section className={styles.route} key={route.name}>
                      <h4>{route.name}</h4>
                      <ol>
                        {route.stops.map((stop, index) => (
                          <li key={stop.id}>
                            <span className={styles.stopNumber}>
                              {stop.stopOrder ?? index + 1}
                            </span>
                            <div className={styles.stopCopy}>
                              <strong>{stop.name}</strong>
                              <span>{stop.address || "Address not saved"}</span>
                              <small>{stop.phone ?? "No phone saved"}</small>
                              <div className={styles.stopActions}>
                                {stop.address ? (
                                  <a
                                    href={mapUrl(stop.address)}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    Open map
                                  </a>
                                ) : null}
                                {stop.phone ? <a href={`tel:${stop.phone}`}>Call</a> : null}
                              </div>
                            </div>
                            <div className={styles.stopItems}>
                              {stop.items.map((item) => (
                                <span key={item.product_key}>
                                  {productName(item.product_key)} · {formatQuantity(item)}
                                </span>
                              ))}
                              {stop.bottleChoice !== "none" ? (
                                <span>
                                  Bottle · {stop.bottleChoice === "new" ? "Take new" : "Collect return"}
                                </span>
                              ) : null}
                              <small>{stop.status.replaceAll("_", " ")}</small>
                              {stop.status !== "delivered" && stop.status !== "cancelled" ? (
                                <form className={styles.statusForm} action={updateDeliveryStatus}>
                                  <input name="deliveryId" type="hidden" value={stop.id} />
                                  {stop.status === "planned" ? (
                                    <button name="status" value="ready">Ready</button>
                                  ) : null}
                                  {stop.status === "ready" ? (
                                    <button name="status" value="out_for_delivery">Send out</button>
                                  ) : null}
                                  {["ready", "out_for_delivery"].includes(stop.status) ? (
                                    <button className={styles.completeButton} name="status" value="delivered">Delivered</button>
                                  ) : null}
                                  {["ready", "out_for_delivery"].includes(stop.status) ? (
                                    <button name="status" value="failed">Failed</button>
                                  ) : null}
                                  {["planned", "ready", "failed"].includes(stop.status) ? (
                                    <button name="status" value="cancelled">Cancel stop</button>
                                  ) : null}
                                </form>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <strong>No active deliveries for tomorrow yet.</strong>
            <p>
              Generate the sheet after payment activates a plan. Pending plans are excluded.
            </p>
          </div>
        )}
      </section>

      <section className={styles.remaining} aria-labelledby="remaining-title">
        <div><p className={styles.sectionLabel}>Operations rule</p><h2 id="remaining-title">Delivery balance</h2></div>
        <p>Only a successful milk delivery uses one plan credit. Failed and cancelled stops keep the customer&apos;s balance unchanged.</p>
      </section>
    </main>
  );
}
