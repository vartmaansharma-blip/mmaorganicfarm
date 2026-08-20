"use client";

import { useMemo, useState } from "react";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import {
  formatCalendarDate,
  weekdayFromYmd,
} from "@/lib/delivery-calendar";
import { FARM_PRODUCTS } from "@/lib/farm-products";
import { MILK_PLAN_DAYS, type WeeklyMilkSchedule } from "@/lib/milk-plan";
import {
  calculateOrderPricing,
  calculatePlanPricing,
  type BottleChoice,
} from "@/lib/order-pricing";
import { recordCustomerOrder } from "./actions";
import styles from "./locations.module.css";

type CapacityDay = {
  available_quantity: number | string;
  delivery_date: string;
};

type ManualOrderFormProps = {
  capacityDays: CapacityDay[];
  customerName: string;
  minimumStartDate: string;
  profileReady: boolean;
  userId: string;
};

function safeQuantity(value: string) {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 0 && quantity <= 5
    ? quantity
    : 0;
}

function litreLabel(quantity: number) {
  return `${Number.isInteger(quantity) ? quantity : quantity.toFixed(1)} L`;
}

function OrderEditor({
  capacityDays,
  customerName,
  minimumStartDate,
  profileReady,
  userId,
}: ManualOrderFormProps) {
  const [purchaseMode, setPurchaseMode] = useState<"once" | "plan">("plan");
  const [schedule, setSchedule] = useState<WeeklyMilkSchedule>([0, 0, 0, 0, 0, 0, 0]);
  const [milkLitres, setMilkLitres] = useState(0);
  const [startDate, setStartDate] = useState(minimumStartDate);
  const [bottleChoice, setBottleChoice] = useState<BottleChoice>("return");
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>(
    Object.fromEntries(FARM_PRODUCTS.map((product) => [product.id, 0])),
  );

  const products = useMemo(
    () => FARM_PRODUCTS.flatMap((product) => {
      const quantity = productQuantities[product.id] ?? 0;
      return quantity > 0
        ? [{ ...product, days: [], frequency: "once" as const, quantity }]
        : [];
    }),
    [productQuantities],
  );
  const pricing = useMemo(
    () => purchaseMode === "plan"
      ? calculatePlanPricing({ bottleChoice, products, schedule, startDate })
      : calculateOrderPricing({ bottleChoice, milkLitres, products }),
    [bottleChoice, milkLitres, products, purchaseMode, schedule, startDate],
  );
  const capacityImpact = useMemo(() => {
    if (purchaseMode === "once") {
      const day = capacityDays.find((candidate) => candidate.delivery_date === startDate);
      return day && milkLitres > 0
        ? [{ day, requested: milkLitres }]
        : [];
    }

    return capacityDays.flatMap((day) => {
      if (day.delivery_date < startDate) return [];
      const requested = schedule[weekdayFromYmd(day.delivery_date) - 1] ?? 0;
      return requested > 0 ? [{ day, requested }] : [];
    });
  }, [capacityDays, milkLitres, purchaseMode, schedule, startDate]);
  const capacityConflict = capacityImpact.some(
    ({ day, requested }) => requested > Number(day.available_quantity),
  );
  const milkSelected = purchaseMode === "plan"
    ? schedule.some((quantity) => quantity > 0)
    : milkLitres > 0;
  const orderReady = profileReady &&
    (milkSelected || products.length > 0) &&
    !capacityConflict;

  function updateSchedule(index: number, value: string) {
    setSchedule((current) => current.map((quantity, dayIndex) =>
      dayIndex === index ? safeQuantity(value) : quantity,
    ) as WeeklyMilkSchedule);
  }

  return (
    <form action={recordCustomerOrder} className={styles.orderWorkspace}>
      <input name="userId" type="hidden" value={userId} />
      <div className={styles.orderEditor}>
        <fieldset className={styles.orderType}>
          <legend>Order type</legend>
          <label>
            <input
              checked={purchaseMode === "plan"}
              name="purchaseMode"
              onChange={() => setPurchaseMode("plan")}
              type="radio"
              value="plan"
            />
            <span>30-delivery plan</span>
          </label>
          <label>
            <input
              checked={purchaseMode === "once"}
              name="purchaseMode"
              onChange={() => setPurchaseMode("once")}
              type="radio"
              value="once"
            />
            <span>One-time order</span>
          </label>
        </fieldset>

        {purchaseMode === "plan" ? (
          <div className={styles.planOnly}>
            <span className={styles.formLabel}>Seven-day milk schedule</span>
            <div className={styles.scheduleInputs}>
              {MILK_PLAN_DAYS.map((day, index) => (
                <label key={day.short}>
                  <span>{day.short}</span>
                  <input
                    inputMode="decimal"
                    max="5"
                    min="0"
                    name={`milkDay${index + 1}`}
                    onChange={(event) => updateSchedule(index, event.target.value)}
                    step="1"
                    type="number"
                    value={schedule[index]}
                  />
                </label>
              ))}
            </div>
          </div>
        ) : (
          <label className={styles.onceMilk}>
            <span className={styles.formLabel}>Milk litres</span>
            <input
              inputMode="decimal"
              max="5"
              min="0"
              name="milkLitres"
              onChange={(event) => setMilkLitres(safeQuantity(event.target.value))}
              step="1"
              type="number"
              value={milkLitres}
            />
          </label>
        )}

        <div className={styles.orderFields}>
          {FARM_PRODUCTS.map((product) => (
            <label key={product.id}>
              <span>{product.name}</span>
              <input
                inputMode="numeric"
                max="5"
                min="0"
                name={`${product.id}Quantity`}
                onChange={(event) => setProductQuantities((current) => ({
                  ...current,
                  [product.id]: safeQuantity(event.target.value),
                }))}
                step="1"
                type="number"
                value={productQuantities[product.id] ?? 0}
              />
              <small>{product.unit} · {formatCheckoutAmount(product.price * 100)} each</small>
            </label>
          ))}
          <label>
            <span>Delivery starts</span>
            <input
              min={minimumStartDate}
              name="startDate"
              onChange={(event) => setStartDate(event.target.value)}
              required
              type="date"
              value={startDate}
            />
          </label>
          <label>
            <span>Bottle</span>
            <select
              name="bottleChoice"
              onChange={(event) => setBottleChoice(event.target.value as BottleChoice)}
              value={bottleChoice}
            >
              <option value="return">Customer returns bottle</option>
              <option value="new">New bottle required</option>
              <option value="none">No bottle</option>
            </select>
          </label>
        </div>
      </div>

      <aside className={styles.orderPreview} aria-live="polite">
        <div className={styles.previewHeading}>
          <div>
            <small>Prepared for</small>
            <h4>{customerName}</h4>
          </div>
          <span>Live · Payment pending</span>
        </div>
        <dl>
          <div><dt>Order</dt><dd>{purchaseMode === "plan" ? "30-delivery plan" : "One-time order"}</dd></div>
          <div><dt>Starts</dt><dd>{formatCalendarDate(startDate)}</dd></div>
          {purchaseMode === "plan" ? (
            <div>
              <dt>Schedule</dt>
              <dd>{MILK_PLAN_DAYS.flatMap((day, index) => schedule[index] > 0 ? [`${day.short} ${schedule[index]} L`] : []).join(" · ") || "Not selected"}</dd>
            </div>
          ) : null}
          <div><dt>Milk</dt><dd>{litreLabel(pricing.milkLitres)} · {formatCheckoutAmount(pricing.milkTotal * 100)}</dd></div>
          <div><dt>Farm products</dt><dd>{products.length ? products.map((product) => `${product.name} × ${product.quantity} · ${formatCheckoutAmount((pricing.productTotals[product.id] ?? 0) * 100)}`).join(", ") : "None"}</dd></div>
          <div><dt>Add-ons total</dt><dd>{formatCheckoutAmount((pricing.oneTimeAddOnsTotal + pricing.recurringAddOnsTotal) * 100)}</dd></div>
          <div><dt>Bottle charge</dt><dd>{formatCheckoutAmount(pricing.bottleCharge * 100)}</dd></div>
          <div className={styles.previewTotal}><dt>Total due</dt><dd>{formatCheckoutAmount(pricing.total * 100)}</dd></div>
        </dl>

        <section className={`${styles.capacityCheck} ${capacityConflict ? styles.capacityConflict : ""}`}>
          <div>
            <strong>Capacity impact</strong>
            <span>{capacityConflict ? "Change the quantity or date" : "Available for this draft"}</span>
          </div>
          {capacityImpact.length ? (
            <ul>
              {capacityImpact.slice(0, 7).map(({ day, requested }) => (
                <li key={day.delivery_date}>
                  <span>{formatCalendarDate(day.delivery_date)}</span>
                  <b>{litreLabel(requested)} needed · {litreLabel(Number(day.available_quantity))} available</b>
                </li>
              ))}
            </ul>
          ) : milkSelected ? (
            <p>The selected date is outside this seven-day preview. Capacity will be checked again before payment.</p>
          ) : (
            <p>Add milk to see its effect on daily farm capacity.</p>
          )}
        </section>

        {!profileReady ? (
          <p className={styles.formWarning}>Save the customer&apos;s phone and address before recording an order.</p>
        ) : null}
        <div className={styles.orderSubmit}>
          <p>This creates a live order tagged as payment pending. It does not consume confirmed capacity until payment.</p>
          <button disabled={!orderReady} type="submit">Record order</button>
        </div>
      </aside>
    </form>
  );
}

export function ManualOrderForm(props: ManualOrderFormProps) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className={styles.recordOrder}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Record order</summary>
      {open ? <OrderEditor {...props} /> : null}
    </details>
  );
}
