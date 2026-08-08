"use client";

import Link from "next/link";
import { useState } from "react";
import {
  FARM_PRODUCTS,
  type FarmProductFrequency,
  type FarmProductId,
} from "@/lib/farm-products";
import {
  formatPlanStartDate,
  MILK_PLAN_DAYS,
  serializeWeeklyMilkSchedule,
  type WeeklyMilkSchedule,
} from "@/lib/milk-plan";
import styles from "./milk.module.css";

const PRICE_PER_LITRE = 62;
const NEW_BOTTLE_PRICE = 10;
const MAX_LITRES = 5;
const STEP = 1;
const initialSchedule: WeeklyMilkSchedule = [1, 1, 1, 1, 1, 2, 2];

type PurchaseMode = "once" | "plan";

const initialExtras: Record<FarmProductId, FarmProductFrequency | null> = {
  paneer: null,
  ghee: null,
  papaya: null,
  sweets: null,
};

function formatLitres(value: number) {
  return `${value} L`;
}

export function MilkPlanBuilder() {
  const [mode, setMode] = useState<PurchaseMode>("plan");
  const [onceQuantity, setOnceQuantity] = useState(1);
  const [schedule, setSchedule] = useState(initialSchedule);
  const [startDate, setStartDate] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [bottleOption, setBottleOption] = useState<"return" | "new">("return");
  const [extras, setExtras] = useState(initialExtras);

  const weeklyLitres = schedule.reduce((total, litres) => total + litres, 0);
  const weeklyEstimate = weeklyLitres * PRICE_PER_LITRE;
  const needsNewBottle = bottleOption === "new";
  const selectedMilkLitres = mode === "once" ? onceQuantity : weeklyLitres;
  const hasMilk = selectedMilkLitres > 0;
  const bottleCharge = needsNewBottle && hasMilk ? NEW_BOTTLE_PRICE : 0;
  const deliveryDays = schedule.filter((litres) => litres > 0).length;
  const selectedExtras = FARM_PRODUCTS.filter(({ id }) => extras[id]);
  const extrasTotal = selectedExtras.reduce((total, product) => {
    return total + product.price;
  }, 0);
  const weeklyExtrasTotal = selectedExtras.reduce((total, product) => {
    return total + (extras[product.id] === "weekly" ? product.price : 0);
  }, 0);
  const firstDeliveryExtrasTotal = selectedExtras.reduce((total, product) => {
    return total + (extras[product.id] === "once" ? product.price : 0);
  }, 0);

  function updateSchedule(index: number, delta: number) {
    setSchedule((current) =>
      current.map((litres, dayIndex) =>
        dayIndex === index
          ? Math.min(MAX_LITRES, Math.max(0, litres + delta))
          : litres,
      ) as WeeklyMilkSchedule,
    );
    setReviewed(false);
  }

  function updateOnceQuantity(delta: number) {
    setOnceQuantity((current) =>
      Math.min(MAX_LITRES, Math.max(0, Number((current + delta).toFixed(1)))),
    );
  }

  function chooseMode(nextMode: PurchaseMode) {
    setMode(nextMode);
    setReviewed(false);
  }

  function toggleExtra(id: FarmProductId) {
    setExtras((current) => ({
      ...current,
      [id]: current[id] ? null : "once",
    }));
    setReviewed(false);
  }

  function setExtraFrequency(
    id: FarmProductId,
    frequency: FarmProductFrequency,
  ) {
    setExtras((current) => ({ ...current, [id]: frequency }));
    setReviewed(false);
  }

  function orderHref(purchase: PurchaseMode) {
    const selected = selectedExtras
      .map(({ id }) => `${id}:${purchase === "plan" ? extras[id] : "once"}`)
      .join(",");
    const params = new URLSearchParams({
      purchase,
      bottle:
        purchase === "once" && onceQuantity === 0
          ? "none"
          : needsNewBottle
            ? "new"
            : "return",
      milk: String(purchase === "once" ? onceQuantity : weeklyLitres),
    });

    if (selected) params.set("extras", selected);
    if (purchase === "plan") {
      params.set("schedule", serializeWeeklyMilkSchedule(schedule));
      params.set("start", startDate);
    }
    return `/order?${params.toString()}`;
  }

  return (
    <section className={styles.builder} aria-labelledby="choose-order-title">
      <div className={styles.builderHeading}>
        <p className={styles.eyebrow}>Build your farm order</p>
        <h2 id="choose-order-title">One delivery. More from the farm.</h2>
      </div>

      <div className={styles.modeSwitch} aria-label="Purchase type">
        <button
          className={mode === "once" ? styles.modeActive : undefined}
          type="button"
          aria-pressed={mode === "once"}
          onClick={() => chooseMode("once")}
        >
          Order once
        </button>
        <button
          className={mode === "plan" ? styles.modeActive : undefined}
          type="button"
          aria-pressed={mode === "plan"}
          onClick={() => chooseMode("plan")}
        >
          Build a weekly plan
        </button>
      </div>

      {hasMilk ? (
        <fieldset className={styles.bottleChoice}>
        <legend>Choose one bottle option</legend>
        <div className={styles.bottleOptions}>
          <label>
            <input
              type="radio"
              name="bottle-option"
              checked={bottleOption === "return"}
              onChange={() => {
                setBottleOption("return");
                setReviewed(false);
              }}
            />
            <span>
              <strong>Return a bottle</strong>
              <small>₹62/L · hand it back on delivery</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="bottle-option"
              checked={bottleOption === "new"}
              onChange={() => {
                setBottleOption("new");
                setReviewed(false);
              }}
            />
            <span>
              <strong>No bottle to return</strong>
              <small>₹72 for 1 L · includes a ₹10 glass bottle</small>
            </span>
          </label>
        </div>
        </fieldset>
      ) : null}

      <section className={styles.extras} aria-labelledby="farm-add-ons-title">
        <div className={styles.extrasHeading}>
          <div>
            <p className={styles.stepLabel}>Add to the same order</p>
            <h3 id="farm-add-ons-title">More from M&apos;ma Organic Farm</h3>
          </div>
          <p>Choose any combination. Regular rates are included in your total.</p>
        </div>

        <div className={styles.extraGrid}>
          {FARM_PRODUCTS.map((product) => {
            const frequency = extras[product.id];

            return (
              <article
                className={frequency ? styles.extraSelected : undefined}
                key={product.id}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(frequency)}
                    onChange={() => toggleExtra(product.id)}
                  />
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.unit} · ₹{product.price}
                    </small>
                  </span>
                </label>

                {frequency && mode === "plan" ? (
                  <div className={styles.extraFrequency} aria-label={`${product.name} schedule`}>
                    <button
                      type="button"
                      aria-pressed={frequency === "once"}
                      onClick={() => setExtraFrequency(product.id, "once")}
                    >
                      First delivery
                    </button>
                    <button
                      type="button"
                      aria-pressed={frequency === "weekly"}
                      onClick={() => setExtraFrequency(product.id, "weekly")}
                    >
                      Every week
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {mode === "once" ? (
        <div className={styles.onceLayout}>
          <div className={styles.onceCopy}>
            <p className={styles.stepLabel}>Tomorrow&apos;s bottle</p>
            <h3>How much milk do you need?</h3>
            <p>Choose 0 L for an add-ons-only delivery.</p>
          </div>

          <div className={styles.onceAction}>
            <div className={styles.largeStepper} aria-label="One-time milk quantity">
              <button
                type="button"
                aria-label="Reduce one-time quantity"
                disabled={onceQuantity === 0}
                onClick={() => updateOnceQuantity(-STEP)}
              >
                −
              </button>
              <strong>{formatLitres(onceQuantity)}</strong>
              <button
                type="button"
                aria-label="Increase one-time quantity"
                disabled={onceQuantity >= MAX_LITRES}
                onClick={() => updateOnceQuantity(STEP)}
              >
                +
              </button>
            </div>
            <div className={styles.totalLine}>
              <span>Order total</span>
              <strong>
                ₹{onceQuantity * PRICE_PER_LITRE + bottleCharge + extrasTotal}
              </strong>
            </div>
            {selectedExtras.length ? (
              <p className={styles.extrasPriceNote}>
                {selectedExtras.length} farm add-on
                {selectedExtras.length === 1 ? "" : "s"} included in this total.
              </p>
            ) : null}
            {onceQuantity > 0 || selectedExtras.length > 0 ? (
              <Link
                className={styles.primaryAction}
                href={orderHref("once")}
              >
                Continue to delivery details <span>→</span>
              </Link>
            ) : (
              <button className={styles.primaryAction} type="button" disabled>
                Select milk or an add-on <span>→</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.planLayout}>
          <div className={styles.schedulePanel}>
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.stepLabel}>01 · Weekly quantity</p>
                <h3>Set each day</h3>
              </div>
              <button
                className={styles.resetButton}
                type="button"
                onClick={() => {
                  setSchedule(initialSchedule);
                  setReviewed(false);
                }}
              >
                Reset week
              </button>
            </div>

            <div className={styles.week}>
              {MILK_PLAN_DAYS.map((day, index) => (
                <div className={styles.day} key={day.label}>
                  <div className={styles.dayName}>
                    <strong>{day.short}</strong>
                    <span>{schedule[index] === 0 ? "Skip" : "Deliver"}</span>
                  </div>
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      aria-label={`Reduce ${day.label} quantity`}
                      disabled={schedule[index] === 0}
                      onClick={() => updateSchedule(index, -STEP)}
                    >
                      −
                    </button>
                    <output aria-label={`${day.label} quantity`}>
                      {formatLitres(schedule[index])}
                    </output>
                    <button
                      type="button"
                      aria-label={`Increase ${day.label} quantity`}
                      disabled={schedule[index] >= MAX_LITRES}
                      onClick={() => updateSchedule(index, STEP)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.dateSection}>
              <label>
                <span className={styles.stepLabel}>02 · Start date</span>
                <input
                  type="date"
                  value={startDate}
                  onInput={(event) => {
                    setStartDate(event.currentTarget.value);
                    setReviewed(false);
                  }}
                />
              </label>
            </div>

          </div>

          <aside className={styles.summary} aria-live="polite">
            <p className={styles.stepLabel}>Your weekly plan</p>
            <div className={styles.summaryMetric}>
              <strong>{formatLitres(weeklyLitres)}</strong>
              <span>each week</span>
            </div>
            <dl>
              <div>
                <dt>Delivery days</dt>
                <dd>{deliveryDays} / 7</dd>
              </div>
              <div>
                <dt>Weekly estimate</dt>
                <dd>₹{weeklyEstimate + weeklyExtrasTotal}</dd>
              </div>
              <div>
                <dt>Glass bottle</dt>
                <dd>{needsNewBottle ? "+₹10 once" : "Return on delivery"}</dd>
              </div>
              <div>
                <dt>Farm add-ons</dt>
                <dd>
                  {selectedExtras.length
                    ? `${selectedExtras.length} selected`
                    : "None"}
                </dd>
              </div>
              {firstDeliveryExtrasTotal > 0 ? (
                <div>
                  <dt>First delivery add-ons</dt>
                  <dd>₹{firstDeliveryExtrasTotal}</dd>
                </div>
              ) : null}
              {needsNewBottle || firstDeliveryExtrasTotal > 0 ? (
                <div>
                  <dt>First-week estimate</dt>
                  <dd>
                    ₹
                    {weeklyEstimate +
                      weeklyExtrasTotal +
                      firstDeliveryExtrasTotal +
                      bottleCharge}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Start</dt>
                <dd>{formatPlanStartDate(startDate)}</dd>
              </div>
            </dl>

            {reviewed ? (
              <div className={styles.reviewed} role="status">
                <strong>Plan ready to continue</strong>
                <p>Your weekly schedule is complete.</p>
              </div>
            ) : null}

            {reviewed ? (
              <Link
                className={styles.primaryAction}
                href={orderHref("plan")}
              >
                Continue to delivery details <span>→</span>
              </Link>
            ) : (
              <button
                className={styles.primaryAction}
                type="button"
                disabled={weeklyLitres === 0 || !startDate}
                onClick={() => setReviewed(true)}
              >
                Review milk plan <span>→</span>
              </button>
            )}
            <p className={styles.summaryNote}>
              ₹62 is the bottle-exchange price and requires a bottle returned
              on delivery. Without a return bottle, ₹10 is added once.
            </p>
          </aside>
        </div>
      )}
    </section>
  );
}
