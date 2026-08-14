import type { Metadata } from "next";
import Link from "next/link";
import {
  CAPACITY_PRODUCTS,
  capacityProduct,
  formatCapacityQuantity,
  isCapacityProductId,
} from "@/lib/capacity-products";
import {
  addCalendarDays,
  formatCalendarDate,
  nextDeliveryDateInIndia,
} from "@/lib/delivery-calendar";
import {
  canManageLocations,
  requireFarmStaff,
} from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  removeCapacityOverride,
  saveCapacityOverride,
  updateDefaultCapacity,
} from "./actions";
import styles from "./capacity.module.css";

export const metadata: Metadata = {
  title: "Production capacity",
  robots: { index: false, follow: false },
};

type CapacityDay = {
  active_plan_quantity: number | string;
  available_quantity: number | string;
  capacity_limit: number | string;
  checkout_holds_quantity: number | string;
  delivery_date: string;
  paid_once_quantity: number | string;
};

type CapacityRow = {
  daily_limit: number | string;
  product_key: string;
  updated_at: string;
};

export default async function CapacityPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const params = await searchParams;
  const requestedProduct = params.product ?? "";
  const selectedKey = isCapacityProductId(requestedProduct)
    ? requestedProduct
    : "milk";
  const selectedProduct = capacityProduct(selectedKey);
  const { role, supabase } = await requireFarmStaff(
    `/farm/capacity?product=${selectedKey}`,
  );
  const admin = createAdminClient();
  const startDate = nextDeliveryDateInIndia();
  const [capacitiesResult, overridesResult, snapshotResult] = await Promise.all([
    supabase
      .from("production_capacity")
      .select("product_key, daily_limit, updated_at")
      .in("product_key", CAPACITY_PRODUCTS.map((product) => product.id)),
    supabase
      .from("production_capacity_overrides")
      .select("delivery_date, daily_limit")
      .eq("product_key", selectedKey)
      .gte("delivery_date", startDate)
      .order("delivery_date"),
    admin.rpc("product_capacity_snapshot", {
      p_days: 7,
      p_product_key: selectedKey,
      p_start_date: startDate,
    }),
  ]);

  const migrationPending = Boolean(
    snapshotResult.error?.message.includes("product_capacity_snapshot"),
  );
  const databaseError =
    capacitiesResult.error ??
    overridesResult.error ??
    (migrationPending ? null : snapshotResult.error);
  if (databaseError) throw databaseError;

  const capacities = (capacitiesResult.data ?? []) as CapacityRow[];
  const capacityByProduct = new Map(
    capacities.map((capacity) => [capacity.product_key, capacity]),
  );
  const selectedCapacity = capacityByProduct.get(selectedKey) ?? {
    daily_limit: 0,
    product_key: selectedKey,
    updated_at: "",
  };

  const canManage = canManageLocations(role) && !migrationPending;
  const defaultLimit = Number(selectedCapacity.daily_limit);
  const days = migrationPending
    ? Array.from({ length: 7 }, (_, index): CapacityDay => ({
        active_plan_quantity: 0,
        available_quantity: 0,
        capacity_limit: 0,
        checkout_holds_quantity: 0,
        delivery_date: addCalendarDays(startDate, index),
        paid_once_quantity: 0,
      }))
    : ((snapshotResult.data ?? []) as CapacityDay[]);
  const overrides = overridesResult.data ?? [];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Order control</p>
          <h1>Production capacity</h1>
          <p>
            New orders are accepted only after future commitments and active
            checkouts are subtracted from each day.
          </p>
        </div>
        <Link href="/farm">Back to overview</Link>
      </header>

      <nav className={styles.productTabs} aria-label="Capacity product">
        {CAPACITY_PRODUCTS.map((product) => {
          const limit = capacityByProduct.get(product.id)?.daily_limit ?? 0;
          return (
            <Link
              aria-current={product.id === selectedKey ? "page" : undefined}
              className={product.id === selectedKey ? styles.activeTab : undefined}
              href={`/farm/capacity?product=${product.id}`}
              key={product.id}
            >
              <span>{product.name}</span>
              <strong>
                {formatCapacityQuantity(limit)} {product.shortUnit}
              </strong>
            </Link>
          );
        })}
      </nav>

      {migrationPending ? (
        <p className={styles.migrationNotice}>
          Preview mode: multi-product capacity is ready in code but is not active
          in the database yet. Editing remains locked until the migration is approved.
        </p>
      ) : null}

      <section className={styles.summary} aria-labelledby="normal-limit-title">
        <div>
          <span>{selectedProduct.name} · normal daily limit</span>
          <strong id="normal-limit-title">
            {formatCapacityQuantity(defaultLimit)} {selectedProduct.shortUnit}
          </strong>
          <p>
            This is the online quantity available before accepted plans,
            one-time orders, and unpaid checkout holds are deducted.
          </p>
          {defaultLimit === 0 ? (
            <p className={styles.setupNotice}>
              Set a limit before this product can be accepted online.
            </p>
          ) : null}
        </div>
        {canManage ? (
          <form action={updateDefaultCapacity}>
            <input name="productKey" type="hidden" value={selectedKey} />
            <label htmlFor="default-capacity">{selectedProduct.inputLabel}</label>
            <div>
              <input
                defaultValue={defaultLimit}
                id="default-capacity"
                min="0"
                name="dailyLimit"
                required
                step={selectedProduct.step}
                type="number"
              />
              <button type="submit">Update limit</button>
            </div>
          </form>
        ) : null}
      </section>

      <section className={styles.week} aria-labelledby="week-title">
        <div className={styles.sectionHeading}>
          <p>Next seven days · {selectedProduct.name}</p>
          <h2 id="week-title">Remaining before payment</h2>
        </div>
        <div className={styles.dayList}>
          {days.map((day) => {
            const accepted =
              Number(day.active_plan_quantity) + Number(day.paid_once_quantity);
            const checkout = Number(day.checkout_holds_quantity);
            return (
              <article className={styles.day} key={day.delivery_date}>
                <div className={styles.dayTitle}>
                  <strong>{formatCalendarDate(day.delivery_date)}</strong>
                  <span>
                    {formatCapacityQuantity(day.available_quantity)}{" "}
                    {selectedProduct.shortUnit} remaining
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Daily limit</dt>
                    <dd>
                      {formatCapacityQuantity(day.capacity_limit)}{" "}
                      {selectedProduct.shortUnit}
                    </dd>
                  </div>
                  <div>
                    <dt>Accepted</dt>
                    <dd>
                      {formatCapacityQuantity(accepted)} {selectedProduct.shortUnit}
                    </dd>
                  </div>
                  <div>
                    <dt>In checkout</dt>
                    <dd>
                      {formatCapacityQuantity(checkout)} {selectedProduct.shortUnit}
                    </dd>
                  </div>
                </dl>
                <div className={styles.meter} aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        ((accepted + checkout) /
                          Math.max(Number(day.capacity_limit), 1)) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {canManage ? (
        <section className={styles.override} aria-labelledby="override-title">
          <div className={styles.sectionHeading}>
            <p>Specific dates · {selectedProduct.name}</p>
            <h2 id="override-title">Change one day</h2>
          </div>
          <form action={saveCapacityOverride} className={styles.overrideForm}>
            <input name="productKey" type="hidden" value={selectedKey} />
            <label>
              Delivery date
              <input min={startDate} name="deliveryDate" required type="date" />
            </label>
            <label>
              {selectedProduct.inputLabel}
              <input
                min="0"
                name="dailyLimit"
                required
                step={selectedProduct.step}
                type="number"
              />
            </label>
            <button type="submit">Save day limit</button>
          </form>

          {overrides.length ? (
            <div className={styles.overrideList}>
              {overrides.map((override) => (
                <div key={override.delivery_date}>
                  <span>{formatCalendarDate(override.delivery_date)}</span>
                  <strong>
                    {formatCapacityQuantity(override.daily_limit)}{" "}
                    {selectedProduct.shortUnit}
                  </strong>
                  <form action={removeCapacityOverride}>
                    <input name="productKey" type="hidden" value={selectedKey} />
                    <input
                      name="deliveryDate"
                      type="hidden"
                      value={override.delivery_date}
                    />
                    <button type="submit">Use normal limit</button>
                  </form>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
