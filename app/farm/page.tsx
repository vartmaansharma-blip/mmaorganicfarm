import type { Metadata } from "next";
import Link from "next/link";
import {
  CAPACITY_PRODUCTS,
  formatCapacityQuantity,
} from "@/lib/capacity-products";
import {
  formatCalendarDate,
  nextDeliveryDateInIndia,
  productName,
} from "@/lib/delivery-calendar";
import {
  canManageLocations,
  requireFarmStaff,
} from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTomorrowDeliverySheet, updateDeliveryStatus } from "./actions";
import styles from "./farm.module.css";

export const metadata: Metadata = {
  title: "Farm operations",
  robots: { index: false, follow: false },
};

type ProfileRow = {
  address_line: string | null;
  delivery_area_id: string | null;
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

type AreaGroup = {
  name: string;
  stops: Stop[];
};

type CapacitySnapshot = {
  active_plan_quantity: number | string;
  available_quantity: number | string;
  capacity_limit: number | string;
  checkout_holds_quantity: number | string;
  paid_once_quantity: number | string;
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
  const { role, supabase } = await requireFarmStaff();
  const admin = createAdminClient();
  const deliveryDate = nextDeliveryDateInIndia();
  const params = await searchParams;

  const [
    profilesResult,
    areasResult,
    plansResult,
    pausesResult,
    deliveriesResult,
  ] = await Promise.all([
    supabase
      .from("customer_profiles")
      .select("address_line, delivery_area_id"),
    supabase.from("delivery_areas").select("id, name, active, sort_order"),
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
    plansResult.error,
    pausesResult.error,
    deliveriesResult.error,
  ].find(Boolean);

  if (databaseError) throw databaseError;

  const capacityResults = await Promise.all(
    CAPACITY_PRODUCTS.map((product) =>
      admin.rpc("product_capacity_snapshot", {
        p_days: 1,
        p_product_key: product.id,
        p_start_date: deliveryDate,
      }),
    ),
  );
  const capacityError = capacityResults.find((result) => result.error)?.error;
  const capacityMigrationPending = Boolean(
    capacityError?.message.includes("product_capacity_snapshot"),
  );
  if (capacityError && !capacityMigrationPending) throw capacityError;
  const capacityByProduct = new Map(
    CAPACITY_PRODUCTS.map((product, index) => [
      product.id,
      capacityMigrationPending
        ? null
        : (((capacityResults[index].data ?? [])[0] ?? null) as CapacitySnapshot | null),
    ]),
  );

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const plans = (plansResult.data ?? []) as PlanRow[];
  const pauses = (pausesResult.data ?? []) as PauseRow[];
  const deliveries = (deliveriesResult.data ?? []) as DailyDeliveryRow[];
  const areaById = new Map(
    (areasResult.data ?? []).map((area) => [area.id, area]),
  );
  const areaGroups = new Map<string, AreaGroup>();
  const totals = new Map<string, number>();

  deliveries.forEach((delivery) => {
    const area = delivery.delivery_area_id
      ? areaById.get(delivery.delivery_area_id)
      : null;
    const areaKey = area?.id ?? "unassigned";
    const areaGroup: AreaGroup = areaGroups.get(areaKey) ?? {
      name: area?.name ?? "Unassigned area",
      stops: [],
    };

    areaGroup.stops.push({
      address: delivery.address_snapshot ?? "",
      bottleChoice: delivery.bottle_choice,
      id: delivery.id,
      items: delivery.daily_delivery_items ?? [],
      name: delivery.customer_name,
      phone: delivery.phone_snapshot,
      status: delivery.status,
      stopOrder: delivery.route_stop_order,
    });
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
      stops: area.stops.sort(
        (a, b) => (a.stopOrder ?? 9999) - (b.stopOrder ?? 9999),
      ),
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
    (profile) => !profile.address_line,
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
          <Link
            className={styles.locationLink}
            href={`/farm/delivery-sheet?date=${deliveryDate}`}
          >
            Print delivery sheet
          </Link>
          {canManageLocations(role) ? (
            <a
              className={styles.locationLink}
              href="/farm/exports/customers"
            >
              Export customers
            </a>
          ) : null}
          <Link className={styles.locationLink} href="/farm/locations">
            View customers
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
          <span>Needs address</span>
          <strong>{unassignedCount}</strong>
        </article>
      </section>

      <section className={styles.capacity} aria-labelledby="capacity-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionLabel}>After accepted orders</p>
            <h2 id="capacity-title">Tomorrow&apos;s remaining capacity</h2>
          </div>
          <Link href="/farm/capacity">Manage limits</Link>
        </div>
        {capacityMigrationPending ? (
          <p className={styles.capacityPending}>
            Multi-product capacity is in preview. Limits become editable after the
            database update is approved.
          </p>
        ) : null}
        <div className={styles.capacityList}>
          {CAPACITY_PRODUCTS.map((product) => {
            const snapshot = capacityByProduct.get(product.id);
            const accepted = snapshot
              ? Number(snapshot.active_plan_quantity) +
                Number(snapshot.paid_once_quantity)
              : 0;
            const checkout = snapshot
              ? Number(snapshot.checkout_holds_quantity)
              : 0;
            return (
              <article key={product.id}>
                <div>
                  <span>{product.name}</span>
                  <strong>
                    {formatCapacityQuantity(snapshot?.available_quantity ?? 0)}{" "}
                    {product.shortUnit}
                  </strong>
                  <small>remaining</small>
                </div>
                <dl>
                  <div>
                    <dt>Limit</dt>
                    <dd>
                      {formatCapacityQuantity(snapshot?.capacity_limit ?? 0)}{" "}
                      {product.shortUnit}
                    </dd>
                  </div>
                  <div>
                    <dt>Accepted</dt>
                    <dd>
                      {formatCapacityQuantity(accepted)} {product.shortUnit}
                    </dd>
                  </div>
                  <div>
                    <dt>Checkout</dt>
                    <dd>
                      {formatCapacityQuantity(checkout)} {product.shortUnit}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
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
            <p className={styles.sectionLabel}>Area → customer</p>
            <h2 id="routes-title">Delivery stops</h2>
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
                    {area.stops.length} stops
                  </span>
                </header>
                <div className={styles.routeList}>
                    <section className={styles.route}>
                      <ol>
                        {area.stops.map((stop, index) => (
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
