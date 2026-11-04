"use client";
import { useProductPricing } from "../../components/product-pricing";
import { FarmForm } from "../farm-form";

import { useMemo, useState } from "react";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import {
  formatCalendarDate,
} from "@/lib/delivery-calendar";
import { manualMonthlyRoutines } from "@/lib/manual-monthly-order";
import { quoteMonthlySchedule, recommendedDates } from "@/lib/monthly-schedule";
import { FARM_PRODUCTS } from "@/lib/farm-products";
import { MILK_PLAN_DAYS, type WeeklyMilkSchedule } from "@/lib/milk-plan";
import {
  calculateOrderPricing,
  type BottleChoice,
} from "@/lib/order-pricing";
import { recordCustomerOrder } from "./actions";
import { FormSubmitButton } from "../form-submit-button";
import styles from "./locations.module.css";
import confirmationStyles from "./payment-confirmation.module.css";

type CapacityDay = {
  product_key: "milk" | "paneer" | "ghee";
  available_quantity: number | string;
  delivery_date: string;
};

type ManualOrderFormProps = {
  firstPlanStart: string | null;
  capacityDays: CapacityDay[];
  customerName: string;
  minimumStartDate: string;
  profileReady: boolean;
  returnTo?: string;
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
  firstPlanStart,
  capacityDays,
  customerName,
  minimumStartDate,
  profileReady,
  returnTo,
  userId,
}: ManualOrderFormProps) {
  const { prices, revision } = useProductPricing();
  const [recordingId] = useState(() => crypto.randomUUID());
  const [confirmedRevision, setConfirmedRevision] = useState("");
  const [purchaseMode, setPurchaseMode] = useState<"once" | "plan">("plan");
  const [schedule, setSchedule] = useState<WeeklyMilkSchedule>([0, 0, 0, 0, 0, 0, 0]);
  const [milkLitres, setMilkLitres] = useState(0);
  const [startDate, setStartDate] = useState(minimumStartDate);
  const [bottleChoice, setBottleChoice] = useState<BottleChoice>("return");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>(
    Object.fromEntries(FARM_PRODUCTS.map((product) => [product.id, 0])),
  );

  const products = useMemo(
    () => FARM_PRODUCTS.flatMap((product) => {
      const quantity = productQuantities[product.id] ?? 0;
      return quantity > 0
        ? [{ ...product, price: prices[product.id], days: [], frequency: "once" as const, quantity }]
        : [];
    }),
    [productQuantities, prices],
  );
  const [productRepeat, setProductRepeat] = useState<Record<string, string>>({});
  const [productFirstDate, setProductFirstDate] = useState<Record<string, string>>({});
  const [productDates, setProductDates] = useState<Record<string, string[]>>({});
  const [productWeekdays, setProductWeekdays] = useState<Record<string, string[]>>({});
  const availableDates = purchaseMode === "plan" ? recommendedDates("milk", startDate) : [];
  const milkSelected = purchaseMode === "plan"
    ? schedule.some((quantity) => quantity > 0)
    : milkLitres > 0;
  const orderBottle = purchaseMode === "once"
    ? bottleChoice
    : milkSelected && bottleChoice === "new" ? "new" : milkSelected ? "return" : "none";
  const monthlyRules = purchaseMode === "plan" ? manualMonthlyRoutines(
    startDate,
    schedule,
    (["paneer", "ghee"] as const).map((id) => ({
      id,
      quantity: productQuantities[id] ?? 0,
      repeat: productRepeat[id] ?? "once",
      firstDate: productFirstDate[id] ?? startDate,
      dates: (productDates[id] ?? []).filter((date) => availableDates.includes(date)),
      weekdays: (productWeekdays[id] ?? []).map(Number),
    })),
  ) : null;
  const monthlyQuote = monthlyRules ? quoteMonthlySchedule({
    prices,
    bottleChoice: orderBottle,
    rules: monthlyRules,
    start: startDate,
    firstPlanStart: firstPlanStart ?? startDate,
  }) : null;
  const pricing = monthlyQuote ?? calculateOrderPricing({
    prices, bottleChoice: orderBottle, milkLitres: purchaseMode === "once" ? milkLitres : 0,
    products: purchaseMode === "once" ? products : [],
  });
  const capacityImpact = capacityDays.flatMap((day) => {
    const requested = purchaseMode === "once"
      ? day.delivery_date !== startDate ? 0 : day.product_key === "milk"
        ? milkLitres : productQuantities[day.product_key] ?? 0
      : monthlyQuote?.days.find((entry) => entry.date === day.delivery_date)
        ?.items.find((item) => item.id === day.product_key)?.quantity ?? 0;
    return requested > 0 ? [{ day, requested }] : [];
  }).sort((a, b) =>
    Number(b.requested > Number(b.day.available_quantity)) -
      Number(a.requested > Number(a.day.available_quantity)) ||
    a.day.delivery_date.localeCompare(b.day.delivery_date),
  );
  const confirmationKey = JSON.stringify([
    revision, pricing.total, purchaseMode, startDate, orderBottle,
    monthlyRules, milkLitres, productQuantities,
  ]);
  const capacityConflict = capacityImpact.some(
    ({ day, requested }) => requested > Number(day.available_quantity),
  );
  const orderReady = profileReady &&
    (purchaseMode === "plan" ? Boolean(monthlyQuote) : milkSelected || products.length > 0) &&
    !capacityConflict &&
    paymentConfirmed && confirmedRevision === confirmationKey;

  function updateSchedule(index: number, value: string) {
    setSchedule((current) => current.map((quantity, dayIndex) =>
      dayIndex === index ? safeQuantity(value) : quantity,
    ) as WeeklyMilkSchedule);
  }

  return (
    <FarmForm action={recordCustomerOrder} className={styles.orderWorkspace}>
      <input type="hidden" name="catalogueRevision" value={revision} /><input type="hidden" name="expectedTotalPaise" value={Math.round(pricing.total * 100)} />
      <input name="userId" type="hidden" value={userId} />
      <input name="recordingId" type="hidden" value={recordingId} />
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
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
            <span>Monthly schedule</span>
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
            <div key={product.id}>
            <label>
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
              <small>{product.unit} · {formatCheckoutAmount(prices[product.id] * 100)} each</small>
            </label>
            {purchaseMode === "plan" && (productQuantities[product.id] ?? 0) > 0 && (
              <>
                <label>
                  <span>{product.name} repeat</span>
                  <select name={`${product.id}Repeat`} value={productRepeat[product.id] ?? "once"}
                    onChange={(event) => setProductRepeat((current) => ({ ...current, [product.id]: event.target.value }))}>
                    <option value="once">Once</option>
                    <option value="weekly">Every week</option>
                    <option value="fortnightly">Every two weeks</option>
                    <option value="days">Choose weekdays</option>
                    <option value="custom">Choose exact dates</option>
                  </select>
                </label>
                {productRepeat[product.id] !== "custom" && (
                  <label>
                    <span>{productRepeat[product.id] === "days"
                      ? `${product.name} weekdays start from`
                      : `First ${product.name.toLowerCase()} delivery`}</span>
                    <input name={`${product.id}FirstDate`} type="date" min={startDate}
                      max={availableDates.at(-1)} required value={productFirstDate[product.id] ?? startDate}
                      onChange={(event) => setProductFirstDate((current) => ({ ...current, [product.id]: event.target.value }))} />
                  </label>
                )}
                {productRepeat[product.id] === "days" && (
                  <fieldset className={styles.productDays}>
                    <legend>{product.name} delivery weekdays</legend>
                    {MILK_PLAN_DAYS.map((day, index) => (
                      <label key={day.short}>
                        <input type="checkbox" name={`${product.id}Weekday`} value={index + 1}
                          checked={(productWeekdays[product.id] ?? []).includes(String(index + 1))}
                          onChange={(event) => {
                            const { checked, value } = event.target;
                            setProductWeekdays((current) => ({
                              ...current,
                              [product.id]: checked ? [...(current[product.id] ?? []), value]
                                : (current[product.id] ?? []).filter((day) => day !== value),
                            }));
                          }} />
                        <span>{day.short}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {productRepeat[product.id] === "custom" && (
                  <fieldset className={styles.productDates}>
                    <legend>{product.name} exact delivery dates</legend>
                    {availableDates.map((date) => (
                      <label key={date}>
                        <input type="checkbox" name={`${product.id}DeliveryDate`} value={date}
                          checked={(productDates[product.id] ?? []).includes(date)}
                          onChange={(event) => {
                            const { checked } = event.target;
                            setProductDates((current) => ({
                              ...current,
                              [product.id]: checked ? [...(current[product.id] ?? []), date]
                                : (current[product.id] ?? []).filter((entry) => entry !== date),
                            }));
                          }} />
                        <span>{formatCalendarDate(date)}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
              </>
            )}
            </div>
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
              value={orderBottle}
              disabled={purchaseMode === "plan" && !milkSelected}
            >
              <option value="return">Customer returns bottle</option>
              <option value="new">New bottle required</option>
              {(purchaseMode === "once" || !milkSelected) && <option value="none">No bottle</option>}
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
          <span>Live · Paid order</span>
        </div>
        <dl>
          <div><dt>Order</dt><dd>{purchaseMode === "plan" ? "Monthly schedule" : "One-time order"}</dd></div>
          <div><dt>Starts</dt><dd>{formatCalendarDate(startDate)}</dd></div>
          {purchaseMode === "plan" ? (
            <div>
              <dt>Schedule</dt>
              <dd>{MILK_PLAN_DAYS.flatMap((day, index) => schedule[index] > 0 ? [`${day.short} ${schedule[index]} L`] : []).join(" · ") || "Not selected"}</dd>
            </div>
          ) : null}
          <div><dt>Milk</dt><dd>{litreLabel(pricing.milkLitres)} · {formatCheckoutAmount(pricing.milkTotal * 100)}</dd></div>
          <div><dt>Farm products</dt><dd>{products.length ? products.map((product) => `${product.name} × ${monthlyQuote?.quantities[product.id] ?? product.quantity} · ${formatCheckoutAmount((pricing.productTotals[product.id] ?? 0) * 100)}`).join(", ") : "None"}</dd></div>
          {monthlyQuote && <div><dt>Delivery dates</dt><dd>{monthlyQuote.days.length}</dd></div>}
          <div><dt>Add-ons total</dt><dd>{formatCheckoutAmount((pricing.oneTimeAddOnsTotal + pricing.recurringAddOnsTotal) * 100)}</dd></div>
          <div><dt>Bottle charge</dt><dd>{formatCheckoutAmount(pricing.bottleCharge * 100)}</dd></div>
          <div><dt>Delivery</dt><dd>{formatCheckoutAmount(pricing.deliveryCharge * 100)}</dd></div>
          <div className={styles.previewTotal}><dt>Payment received</dt><dd>{formatCheckoutAmount(pricing.total * 100)}</dd></div>
        </dl>

        {monthlyQuote && (
          <details>
            <summary>Review dated deliveries</summary>
            <ul>
              {monthlyQuote.days.map(({ date, items }) => (
                <li key={date}>
                  {formatCalendarDate(date)} · {items.map(({ id, quantity }) =>
                    id === "milk" ? `${quantity} L milk` : `${quantity} × ${FARM_PRODUCTS.find((product) => product.id === id)!.name}`,
                  ).join(" · ")}
                </li>
              ))}
            </ul>
          </details>
        )}

        <section className={`${styles.capacityCheck} ${capacityConflict ? styles.capacityConflict : ""}`}>
          <div>
            <strong>Capacity impact</strong>
            <span>{capacityConflict ? "Change the quantity or date" : "Checked again before recording"}</span>
          </div>
          {capacityImpact.length ? (
            <ul>
              {capacityImpact.slice(0, 7).map(({ day, requested }) => (
                <li key={`${day.delivery_date}:${day.product_key}`}>
                  <span>{formatCalendarDate(day.delivery_date)} · {day.product_key}</span>
                  <b>{requested} needed · {Number(day.available_quantity)} available {day.product_key === "milk" ? "L" : "packs"}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p>Capacity is checked for every item and date before recording payment.</p>
          )}
        </section>

        {purchaseMode === "plan" && !monthlyQuote && (
          <p className={styles.formWarning}>Choose products and dates within the prepaid month.</p>
        )}
        {!profileReady ? (
          <p className={styles.formWarning}>Save the customer&apos;s phone and address before recording an order.</p>
        ) : null}
        <div className={styles.orderFields}>
          <label>
            <span>Payment method</span>
            <select name="paymentMethod" required defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span>Payment reference</span>
            <input maxLength={120} name="paymentReference" placeholder="Optional receipt or UPI reference" />
          </label>
        </div>
        <label className={confirmationStyles.confirmation}>
          <input
            checked={paymentConfirmed && confirmedRevision === confirmationKey}
            name="paymentConfirmed"
            onChange={(event) => (setConfirmedRevision(confirmationKey), setPaymentConfirmed(event.target.checked))}
            required
            type="checkbox"
            value="yes"
          />
          <span>I confirm the farm received this payment.</span>
        </label>
        <div className={styles.orderSubmit}>
          <p>Only record the order after the money has been received. The owner can correct a farm-recorded payment later.</p>
          {orderReady ? <FormSubmitButton pendingLabel="Recording paid order…">Record paid order</FormSubmitButton> : <button disabled type="button">Record paid order</button>}
        </div>
      </aside>
    </FarmForm>
  );
}

export function ManualOrderForm(props: ManualOrderFormProps) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className={styles.recordOrder}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Record paid order</summary>
      {open ? <OrderEditor {...props} /> : null}
    </details>
  );
}
