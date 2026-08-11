import type { Metadata } from "next";
import Link from "next/link";
import {
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
  active_plan_litres: number | string;
  available_litres: number | string;
  capacity_limit: number | string;
  checkout_holds_litres: number | string;
  delivery_date: string;
  paid_once_litres: number | string;
};

function litres(value: number | string) {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default async function CapacityPage() {
  const { role, supabase } = await requireFarmStaff("/farm/capacity");
  const admin = createAdminClient();
  const startDate = nextDeliveryDateInIndia();
  const [capacityResult, overridesResult, snapshotResult] = await Promise.all([
    supabase
      .from("production_capacity")
      .select("daily_limit, updated_at")
      .eq("product_key", "milk")
      .single(),
    supabase
      .from("production_capacity_overrides")
      .select("delivery_date, daily_limit")
      .eq("product_key", "milk")
      .gte("delivery_date", startDate)
      .order("delivery_date"),
    admin.rpc("milk_capacity_snapshot", {
      p_days: 7,
      p_start_date: startDate,
    }),
  ]);

  const databaseError =
    capacityResult.error ?? overridesResult.error ?? snapshotResult.error;
  if (databaseError) throw databaseError;
  if (!capacityResult.data) throw new Error("Milk capacity is not configured.");

  const canManage = canManageLocations(role);
  const defaultLimit = Number(capacityResult.data.daily_limit);
  const days = (snapshotResult.data ?? []) as CapacityDay[];
  const overrides = overridesResult.data ?? [];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Order control</p>
          <h1>Milk capacity</h1>
          <p>
            Orders are accepted automatically when their delivery dates have stock.
          </p>
        </div>
        <Link href="/farm">Back to overview</Link>
      </header>

      <section className={styles.summary} aria-labelledby="normal-limit-title">
        <div>
          <span>Normal daily limit</span>
          <strong id="normal-limit-title">{litres(defaultLimit)} L</strong>
          <p>
            Set this to the quantity available for online customers after regular
            offline commitments.
          </p>
        </div>
        {canManage ? (
          <form action={updateDefaultCapacity}>
            <label htmlFor="default-capacity">Litres per day</label>
            <div>
              <input
                defaultValue={defaultLimit}
                id="default-capacity"
                min="0"
                name="dailyLimit"
                required
                step="0.5"
                type="number"
              />
              <button type="submit">Update limit</button>
            </div>
          </form>
        ) : null}
      </section>

      <section className={styles.week} aria-labelledby="week-title">
        <div className={styles.sectionHeading}>
          <p>Next seven days</p>
          <h2 id="week-title">Available before payment</h2>
        </div>
        <div className={styles.dayList}>
          {days.map((day) => {
            const committed =
              Number(day.active_plan_litres) + Number(day.paid_once_litres);
            return (
              <article className={styles.day} key={day.delivery_date}>
                <div className={styles.dayTitle}>
                  <strong>{formatCalendarDate(day.delivery_date)}</strong>
                  <span>{litres(day.available_litres)} L available</span>
                </div>
                <dl>
                  <div><dt>Daily limit</dt><dd>{litres(day.capacity_limit)} L</dd></div>
                  <div><dt>Accepted</dt><dd>{litres(committed)} L</dd></div>
                  <div><dt>In checkout</dt><dd>{litres(day.checkout_holds_litres)} L</dd></div>
                </dl>
                <div className={styles.meter} aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        ((committed + Number(day.checkout_holds_litres)) /
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
            <p>Specific dates</p>
            <h2 id="override-title">Change one day</h2>
          </div>
          <form action={saveCapacityOverride} className={styles.overrideForm}>
            <label>
              Delivery date
              <input min={startDate} name="deliveryDate" required type="date" />
            </label>
            <label>
              Available litres
              <input min="0" name="dailyLimit" required step="0.5" type="number" />
            </label>
            <button type="submit">Save day limit</button>
          </form>

          {overrides.length ? (
            <div className={styles.overrideList}>
              {overrides.map((override) => (
                <div key={override.delivery_date}>
                  <span>{formatCalendarDate(override.delivery_date)}</span>
                  <strong>{litres(override.daily_limit)} L</strong>
                  <form action={removeCapacityOverride}>
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
