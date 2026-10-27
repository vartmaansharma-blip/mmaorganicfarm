import { FarmPageNotice } from "../farm-page-notice";
import { FarmForm } from "../farm-form";
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
  requireFarmManager,
} from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { FormSubmitButton } from "../form-submit-button";
import {
  removeCapacityOverride,
  saveCapacityOverride,
  updateDefaultCapacity,
} from "./actions";
import styles from "./capacity.module.css";
import { CapacityDayRows } from "./capacity-day-rows";

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
  searchParams: Promise<{ error?: string; message?: string; product?: string }>;
}) {
  const params = await searchParams;
  const requestedProduct = params.product ?? "";
  const selectedKey = isCapacityProductId(requestedProduct)
    ? requestedProduct
    : "milk";
  const selectedProduct = capacityProduct(selectedKey);
  const { role, supabase } = await requireFarmManager(
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
  const tomorrowLimit = Number(days[0]?.capacity_limit ?? defaultLimit);
  const overrideDates = new Set(overrides.map(row => row.delivery_date));
  const shortageDays = days.filter(day => Number(day.available_quantity) < 0);
  const tomorrowPaid = Number(days[0]?.active_plan_quantity ?? 0) + Number(days[0]?.paid_once_quantity ?? 0);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Plan the farm’s supply</p><h1>Production capacity</h1><p>Know what’s promised, what’s available, and which days need attention.</p></div>
        <span className={styles.scopeLabel}>Next seven service days</span>
      </header>
      <nav className={styles.productTabs} aria-label="Capacity product">
        {CAPACITY_PRODUCTS.map(product => <Link prefetch={false} scroll={false} aria-current={product.id === selectedKey ? "page" : undefined} href={`/farm/capacity?product=${product.id}`} key={product.id}><span>{product.name}</span><strong>{formatCapacityQuantity(capacityByProduct.get(product.id)?.daily_limit ?? 0)} <small>{product.shortUnit} / day</small></strong></Link>)}
      </nav>
      <FarmPageNotice message={params.message} level="success" />
      <FarmPageNotice message={params.error} level="error" />
      {migrationPending ? <p className={styles.error}>Capacity records are unavailable. Editing is paused until the data connection is ready.</p> : null}
      <section className={styles.summary} aria-label="Capacity at a glance">
        <div><span>Normal daily capacity</span><strong>{formatCapacityQuantity(defaultLimit)} <small>{selectedProduct.shortUnit}</small></strong><p>{selectedProduct.name} · dates with a one-day limit keep their own setting.</p></div>
        <div><span>Tomorrow’s paid commitments</span><strong>{formatCapacityQuantity(tomorrowPaid)} <small>{selectedProduct.shortUnit}</small></strong><p>Against a limit of {formatCapacityQuantity(tomorrowLimit)} {selectedProduct.shortUnit}.</p></div>
        <div data-attention={shortageDays.length > 0 || undefined}><span>Days needing attention</span><strong>{shortageDays.length}</strong><p>{shortageDays.length ? "Recorded demand exceeds the current limit." : "No capacity shortfalls in this view."}</p></div>
      </section>
      <section className={styles.settingsStrip} aria-labelledby="normal-limit-title">
        <div><h2 id="normal-limit-title">The farm’s normal limit</h2><p>{defaultLimit === 0 ? "Set a capacity before accepting this product online." : "Set the usual daily supply; adjust individual dates below."}</p></div>
        {canManage ? <details className={styles.defaultEditor}><summary>Edit normal limit</summary><FarmForm action={updateDefaultCapacity} className={styles.defaultForm}><input name="productKey" type="hidden" value={selectedKey} /><label htmlFor="default-capacity">{selectedProduct.inputLabel}<input defaultValue={defaultLimit} id="default-capacity" min="0" name="dailyLimit" required step={selectedProduct.step} type="number" /></label><p>Applies to future dates without a one-day limit. Paid commitments are preserved.</p><FormSubmitButton pendingLabel="Saving…">Update limit</FormSubmitButton></FarmForm></details> : null}
      </section>
      <section className={styles.week} aria-labelledby="week-title">
        <div className={styles.sectionHeading}><div><p>{selectedProduct.name} · {selectedProduct.shortUnit}</p><h2 id="week-title">Seven-day availability</h2></div><span>Paid service + temporary holds + available supply</span></div>
        <div className={styles.tableWrap}><table className={styles.capacityTable}><thead><tr><th scope="col">Service day</th><th scope="col">Daily limit</th><th scope="col">Paid</th><th scope="col">Held</th><th scope="col">Available</th><th scope="col"><span className={styles.srOnly}>Change capacity</span></th></tr></thead><tbody>{days.map(day => <CapacityDayRows key={day.delivery_date} day={day} productKey={selectedKey} unit={selectedProduct.shortUnit} step={selectedProduct.step} override={overrideDates.has(day.delivery_date)} canManage={canManage} />)}</tbody></table></div>
        <p className={styles.footnote}>Paid includes plans and one-time orders. Holds are temporary checkout reservations. A shortfall is a supply decision to resolve; it does not cancel paid service.</p>
      </section>
      {canManage ? <section className={styles.override} aria-labelledby="override-title">
        <div className={styles.sectionHeading}><div><p>Plan further ahead</p><h2 id="override-title">One-day limits</h2></div><span>{overrides.length} upcoming {overrides.length === 1 ? "date" : "dates"}</span></div>
        <details className={styles.newOverride}><summary>Set a limit for another date</summary><FarmForm action={saveCapacityOverride} className={styles.overrideForm}><input name="productKey" type="hidden" value={selectedKey} /><label>Delivery date<input min={startDate} name="deliveryDate" required type="date" /></label><label>{selectedProduct.inputLabel}<input min="0" name="dailyLimit" required step={selectedProduct.step} type="number" /></label><FormSubmitButton pendingLabel="Saving…">Save day limit</FormSubmitButton></FarmForm></details>
        {overrides.length ? <details className={styles.allOverrides}><summary>Review all upcoming one-day limits</summary><div className={styles.overrideList}>{overrides.map(override => <div key={override.delivery_date}><span>{formatCalendarDate(override.delivery_date)}</span><strong>{formatCapacityQuantity(override.daily_limit)} {selectedProduct.shortUnit}</strong><FarmForm action={removeCapacityOverride}><input name="productKey" type="hidden" value={selectedKey} /><input name="deliveryDate" type="hidden" value={override.delivery_date} /><FormSubmitButton pendingLabel="Restoring…" className={styles.quietButton}>Use normal limit</FormSubmitButton></FarmForm></div>)}</div></details> : <p className={styles.footnote}>Every upcoming date currently follows the normal limit.</p>}
      </section> : null}
    </main>
  );
}
