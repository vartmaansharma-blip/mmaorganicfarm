import type { Metadata } from "next";
import Link from "next/link";
import {
  formatCalendarDate,
  nextDeliveryDateInIndia,
  productName,
  weekdayFromYmd,
} from "@/lib/delivery-calendar";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import styles from "./farm.module.css";

export const metadata: Metadata = {
  title: "Farm operations",
  robots: { index: false, follow: false },
};

type ProfileRow = {
  address_line: string | null;
  delivery_area_id: string | null;
  delivery_route_id: string | null;
  full_name: string | null;
  landmark: string | null;
  phone: string | null;
  postal_code: string | null;
  route_stop_order: number | null;
  user_id: string;
};

type PlanRow = {
  id: string;
  start_date: string;
  status: string;
  user_id: string;
};

type DeliveryItemRow = {
  day_of_week?: number;
  delivery_date?: string;
  plan_id: string;
  product_key: string;
  quantity: number;
  unit: string;
};

type ExceptionRow = {
  action: "override" | "skip";
  delivery_date: string;
  plan_id: string;
  product_key: string;
  quantity: number | null;
  unit: string | null;
};

type PauseRow = {
  end_date: string;
  plan_id: string;
  start_date: string;
};

type PlannedItem = {
  productKey: string;
  quantity: number;
  unit: string;
};

type Stop = {
  address: string;
  items: PlannedItem[];
  name: string;
  phone: string;
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

function plannedItemsForDate({
  date,
  exceptions,
  scheduled,
  weekly,
}: {
  date: string;
  exceptions: ExceptionRow[];
  scheduled: DeliveryItemRow[];
  weekly: DeliveryItemRow[];
}) {
  const itemMap = new Map<string, PlannedItem>();
  const weekday = weekdayFromYmd(date);

  weekly
    .filter((item) => item.day_of_week === weekday)
    .forEach((item) => {
      itemMap.set(item.product_key, {
        productKey: item.product_key,
        quantity: Number(item.quantity),
        unit: item.unit,
      });
    });

  scheduled
    .filter((item) => item.delivery_date === date)
    .forEach((item) => {
      itemMap.set(item.product_key, {
        productKey: item.product_key,
        quantity: Number(item.quantity),
        unit: item.unit,
      });
    });

  exceptions
    .filter((item) => item.delivery_date === date)
    .forEach((item) => {
      if (item.action === "skip") {
        itemMap.delete(item.product_key);
      } else if (item.quantity && item.unit) {
        itemMap.set(item.product_key, {
          productKey: item.product_key,
          quantity: Number(item.quantity),
          unit: item.unit,
        });
      }
    });

  return [...itemMap.values()];
}

function formatQuantity(item: PlannedItem) {
  return `${item.quantity} ${item.unit}${item.quantity === 1 ? "" : "s"}`;
}

export default async function FarmDashboardPage() {
  const { supabase } = await requireFarmStaff();
  const deliveryDate = nextDeliveryDateInIndia();

  const [
    profilesResult,
    areasResult,
    routesResult,
    plansResult,
    weeklyResult,
    scheduledResult,
    exceptionsResult,
    pausesResult,
  ] = await Promise.all([
    supabase
      .from("customer_profiles")
      .select(
        "user_id, full_name, phone, address_line, postal_code, landmark, delivery_area_id, delivery_route_id, route_stop_order",
      ),
    supabase.from("delivery_areas").select("id, name, active, sort_order"),
    supabase
      .from("delivery_routes")
      .select("id, area_id, name, code, active, sort_order"),
    supabase
      .from("delivery_plans")
      .select("id, user_id, status, start_date")
      .in("status", ["pending_confirmation", "active", "paused"]),
    supabase
      .from("weekly_delivery_items")
      .select("plan_id, product_key, day_of_week, quantity, unit"),
    supabase
      .from("scheduled_delivery_items")
      .select("plan_id, product_key, delivery_date, quantity, unit"),
    supabase
      .from("delivery_exceptions")
      .select("plan_id, delivery_date, product_key, action, quantity, unit"),
    supabase
      .from("delivery_pauses")
      .select("plan_id, start_date, end_date"),
  ]);

  const databaseError = [
    profilesResult.error,
    areasResult.error,
    routesResult.error,
    plansResult.error,
    weeklyResult.error,
    scheduledResult.error,
    exceptionsResult.error,
    pausesResult.error,
  ].find(Boolean);

  if (databaseError) throw databaseError;

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const plans = (plansResult.data ?? []) as PlanRow[];
  const weekly = (weeklyResult.data ?? []) as DeliveryItemRow[];
  const scheduled = (scheduledResult.data ?? []) as DeliveryItemRow[];
  const exceptions = (exceptionsResult.data ?? []) as ExceptionRow[];
  const pauses = (pausesResult.data ?? []) as PauseRow[];
  const profileByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const areaById = new Map(
    (areasResult.data ?? []).map((area) => [area.id, area]),
  );
  const routeById = new Map(
    (routesResult.data ?? []).map((route) => [route.id, route]),
  );
  const areaGroups = new Map<string, AreaGroup>();
  const totals = new Map<string, number>();
  let pausedTomorrow = 0;

  plans
    .filter((plan) => plan.status === "active" && plan.start_date <= deliveryDate)
    .forEach((plan) => {
      const isPaused = pauses.some(
        (pause) =>
          pause.plan_id === plan.id &&
          deliveryDate >= pause.start_date &&
          deliveryDate <= pause.end_date,
      );
      if (isPaused) {
        pausedTomorrow += 1;
        return;
      }

      const items = plannedItemsForDate({
        date: deliveryDate,
        exceptions: exceptions.filter((item) => item.plan_id === plan.id),
        scheduled: scheduled.filter((item) => item.plan_id === plan.id),
        weekly: weekly.filter((item) => item.plan_id === plan.id),
      });
      if (!items.length) return;

      const profile = profileByUser.get(plan.user_id);
      const area = profile?.delivery_area_id
        ? areaById.get(profile.delivery_area_id)
        : null;
      const route = profile?.delivery_route_id
        ? routeById.get(profile.delivery_route_id)
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
        address: [profile?.address_line, profile?.landmark, profile?.postal_code]
          .filter(Boolean)
          .join(", "),
        items,
        name: profile?.full_name ?? "Customer",
        phone: profile?.phone ?? "No phone saved",
        stopOrder: profile?.route_stop_order ?? null,
      });
      areaGroup.routes.set(routeKey, routeGroup);
      areaGroups.set(areaKey, areaGroup);

      items.forEach((item) => {
        totals.set(
          item.productKey,
          (totals.get(item.productKey) ?? 0) + item.quantity,
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
  const deliveryCount = groups.reduce(
    (sum, area) =>
      sum + area.routes.reduce((routeSum, route) => routeSum + route.stops.length, 0),
    0,
  );
  const pendingCount = plans.filter(
    (plan) => plan.status === "pending_confirmation",
  ).length;
  const unassignedCount = profiles.filter(
    (profile) => !profile.delivery_area_id || !profile.delivery_route_id,
  ).length;
  const productTotals = [...totals.entries()].sort(([a], [b]) => {
    if (a === "milk") return -1;
    if (b === "milk") return 1;
    return a.localeCompare(b);
  });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Farm operations</p>
          <h1>Tomorrow&apos;s delivery plan</h1>
          <p className={styles.date}>{formatCalendarDate(deliveryDate)}</p>
        </div>
        <Link className={styles.locationLink} href="/farm/locations">
          Manage locations
        </Link>
      </header>

      <section className={styles.metrics} aria-label="Tomorrow's totals">
        <article>
          <span>Customer stops</span>
          <strong>{deliveryCount}</strong>
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
          <span>{pausedTomorrow} paused</span>
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
                          <li key={`${stop.name}-${index}`}>
                            <span className={styles.stopNumber}>
                              {stop.stopOrder ?? index + 1}
                            </span>
                            <div className={styles.stopCopy}>
                              <strong>{stop.name}</strong>
                              <span>{stop.address || "Address not saved"}</span>
                              <small>{stop.phone}</small>
                            </div>
                            <div className={styles.stopItems}>
                              {stop.items.map((item) => (
                                <span key={item.productKey}>
                                  {productName(item.productKey)} · {formatQuantity(item)}
                                </span>
                              ))}
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
              Pending plans will appear here only after verified payment activates them.
            </p>
          </div>
        )}
      </section>

      <section className={styles.remaining} aria-labelledby="remaining-title">
        <div>
          <p className={styles.sectionLabel}>Work remaining</p>
          <h2 id="remaining-title">Next connected stages</h2>
        </div>
        <ol>
          <li><span>01</span>Verified payment activates the selected plan</li>
          <li><span>02</span>Generate real daily delivery records</li>
          <li><span>03</span>Driver marks out for delivery, delivered, or failed</li>
          <li><span>04</span>Use one milk credit only after successful delivery</li>
          <li><span>05</span>Send customer confirmations and exceptions</li>
        </ol>
      </section>
    </main>
  );
}
