"use client";

import Link from "next/link";
import { useState } from "react";
import {
  FARM_PRODUCTS,
  serializeFarmProductSelections,
  type FarmProductFrequency,
  type FarmProductId,
  type FarmProductSelection,
} from "@/lib/farm-products";
import {
  formatPlanStartDate,
  MILK_PLAN_DAYS,
  serializeWeeklyMilkSchedule,
  type WeeklyMilkSchedule,
} from "@/lib/milk-plan";
import { nextDeliveryDateInIndia } from "@/lib/delivery-calendar";
import styles from "./milk.module.css";

const PRICE_PER_LITRE = 62;
const NEW_BOTTLE_PRICE = 10;
const MAX_LITRES = 5;
const STEP = 1;
const defaultSchedule: WeeklyMilkSchedule = [1, 1, 1, 1, 1, 2, 2];

type PurchaseMode = "once" | "plan";

type ExtraSchedule = Pick<
  FarmProductSelection,
  "days" | "frequency" | "quantity"
>;

type ExtraScheduleState = Record<FarmProductId, ExtraSchedule | null>;

const emptyExtras: ExtraScheduleState = {
  paneer: null,
  ghee: null,
  papaya: null,
  sweets: null,
};

const recommendedSchedules: Array<{
  description: string;
  extras: Partial<ExtraScheduleState>;
  label: string;
  milk: WeeklyMilkSchedule;
}> = [
  {
    label: "Everyday family",
    description: "1 L on weekdays, 2 L on weekends, with paneer on Tuesday.",
    milk: [1, 1, 1, 1, 1, 2, 2],
    extras: {
      paneer: { days: [2], frequency: "weekly", quantity: 1 },
    },
  },
  {
    label: "Lighter four-day",
    description: "Milk on Monday, Wednesday, Friday and Saturday, with papaya midweek.",
    milk: [1, 0, 1, 0, 1, 1, 0],
    extras: {
      papaya: { days: [3], frequency: "weekly", quantity: 1 },
    },
  },
];

function formatLitres(value: number) {
  return `${value} L`;
}

type MilkPlanBuilderProps = {
  initialExtras?: FarmProductSelection[];
  initialBottleOption?: "return" | "new";
  initialSchedule?: WeeklyMilkSchedule;
  initialStartDate?: string;
  isEditing?: boolean;
};

export function MilkPlanBuilder({
  initialExtras = [],
  initialBottleOption = "return",
  initialSchedule = defaultSchedule,
  initialStartDate = "",
  isEditing = false,
}: MilkPlanBuilderProps) {
  const minimumStartDate = nextDeliveryDateInIndia();
  const firstAvailableStartDate =
    initialStartDate >= minimumStartDate
      ? initialStartDate
      : minimumStartDate;
  const [mode, setMode] = useState<PurchaseMode>("plan");
  const [onceQuantity, setOnceQuantity] = useState(1);
  const [schedule, setSchedule] = useState(initialSchedule);
  const [startDate, setStartDate] = useState(firstAvailableStartDate);
  const [reviewed, setReviewed] = useState(false);
  const [bottleOption, setBottleOption] =
    useState<"return" | "new">(initialBottleOption);
  const [extras, setExtras] = useState<ExtraScheduleState>(() =>
    initialExtras.reduce(
      (result, extra) => ({
        ...result,
        [extra.id]: {
          days: extra.days,
          frequency: extra.frequency,
          quantity: extra.quantity,
        },
      }),
      { ...emptyExtras },
    ),
  );

  const weeklyLitres = schedule.reduce((total, litres) => total + litres, 0);
  const weeklyEstimate = weeklyLitres * PRICE_PER_LITRE;
  const needsNewBottle = bottleOption === "new";
  const selectedMilkLitres = mode === "once" ? onceQuantity : weeklyLitres;
  const hasMilk = selectedMilkLitres > 0;
  const bottleCharge = needsNewBottle && hasMilk ? NEW_BOTTLE_PRICE : 0;
  const selectedExtras = FARM_PRODUCTS.flatMap((product) => {
    const selection = extras[product.id];
    return selection ? [{ ...product, ...selection }] : [];
  });
  const extrasTotal = selectedExtras.reduce((total, product) => {
    return total + product.price * product.quantity;
  }, 0);
  const weeklyExtrasTotal = selectedExtras.reduce((total, product) => {
    return total +
      (product.frequency === "weekly"
        ? product.price * product.quantity * product.days.length
        : 0);
  }, 0);
  const firstDeliveryExtrasTotal = selectedExtras.reduce((total, product) => {
    return total +
      (product.frequency === "once" ? product.price * product.quantity : 0);
  }, 0);
  const scheduledDays = new Set(
    schedule.flatMap((litres, index) => (litres > 0 ? [index + 1] : [])),
  );
  selectedExtras.forEach((extra) => {
    if (extra.frequency === "weekly") {
      extra.days.forEach((day) => scheduledDays.add(day));
    }
  });
  const deliveryDays = scheduledDays.size;
  const hasIncompleteExtra = selectedExtras.some(
    (extra) => extra.frequency === "weekly" && extra.days.length === 0,
  );
  const hasPlanItems = weeklyLitres > 0 || selectedExtras.length > 0;

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
      [id]: current[id]
        ? null
        : { days: [], frequency: "once", quantity: 1 },
    }));
    setReviewed(false);
  }

  function setExtraFrequency(
    id: FarmProductId,
    frequency: FarmProductFrequency,
  ) {
    setExtras((current) => {
      const selection = current[id];
      if (!selection) return current;
      const firstMilkDay = schedule.findIndex((litres) => litres > 0) + 1;
      return {
        ...current,
        [id]: {
          ...selection,
          days:
            frequency === "weekly" && selection.days.length === 0
              ? [firstMilkDay || 1]
              : selection.days,
          frequency,
        },
      };
    });
    setReviewed(false);
  }

  function updateExtraQuantity(id: FarmProductId, delta: number) {
    setExtras((current) => {
      const selection = current[id];
      return selection
        ? {
            ...current,
            [id]: {
              ...selection,
              quantity: Math.min(5, Math.max(1, selection.quantity + delta)),
            },
          }
        : current;
    });
    setReviewed(false);
  }

  function toggleExtraDay(id: FarmProductId, day: number) {
    setExtras((current) => {
      const selection = current[id];
      if (!selection) return current;
      const days = selection.days.includes(day)
        ? selection.days.filter((scheduledDay) => scheduledDay !== day)
        : [...selection.days, day].sort((a, b) => a - b);
      return { ...current, [id]: { ...selection, days } };
    });
    setReviewed(false);
  }

  function applyRecommendedSchedule(
    milk: WeeklyMilkSchedule,
    recommendedExtras: Partial<ExtraScheduleState>,
  ) {
    setSchedule([...milk] as WeeklyMilkSchedule);
    setExtras({ ...emptyExtras, ...recommendedExtras });
    setReviewed(false);
  }

  function orderHref(purchase: PurchaseMode) {
    const selected = selectedExtras.map((extra) => ({
      ...extra,
      days: purchase === "plan" ? extra.days : [],
      frequency: purchase === "plan" ? extra.frequency : ("once" as const),
    }));
    const params = new URLSearchParams({
      purchase,
      bottle: selectedMilkLitres === 0
        ? "none"
        : needsNewBottle
          ? "new"
          : "return",
      milk: String(purchase === "once" ? onceQuantity : weeklyLitres),
    });

    if (selected.length) {
      params.set("extras", serializeFarmProductSelections(selected));
    }
    if (purchase === "plan") {
      params.set("schedule", serializeWeeklyMilkSchedule(schedule));
      params.set("start", startDate);
    }
    return `/order?${params.toString()}`;
  }

  return (
    <section className={styles.builder} aria-labelledby="choose-order-title">
      <div className={styles.builderHeading}>
        <p className={styles.eyebrow}>
          {isEditing ? "Update your delivery routine" : "Build your farm order"}
        </p>
        <h2 id="choose-order-title">
          {isEditing
            ? "Edit your weekly milk plan."
            : "One delivery. More from the farm."}
        </h2>
      </div>

      {isEditing ? (
        <p className={styles.editingNote}>
          Your saved schedule is loaded below. Review any changes before
          continuing.
        </p>
      ) : (
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
      )}

      {mode === "plan" && !isEditing ? (
        <section
          className={styles.recommended}
          aria-labelledby="recommended-title"
        >
          <div>
            <p className={styles.stepLabel}>Quick start</p>
            <h3 id="recommended-title">Two recommended schedules</h3>
          </div>
          <div className={styles.recommendedGrid}>
            {recommendedSchedules.map((preset) => (
              <button
                type="button"
                key={preset.label}
                onClick={() =>
                  applyRecommendedSchedule(preset.milk, preset.extras)
                }
              >
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
                <small>Use this routine →</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

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
            const selection = extras[product.id];

            return (
              <article
                className={selection ? styles.extraSelected : undefined}
                key={product.id}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(selection)}
                    onChange={() => toggleExtra(product.id)}
                  />
                  <span>
                    <strong>{product.name}</strong>
                    <small>
                      {product.unit} · ₹{product.price}
                    </small>
                  </span>
                </label>

                {selection ? (
                  <div className={styles.extraControls}>
                    <div
                      className={styles.extraQuantity}
                      aria-label={`${product.name} quantity`}
                    >
                      <button
                        type="button"
                        aria-label={`Reduce ${product.name} quantity`}
                        disabled={selection.quantity === 1}
                        onClick={() => updateExtraQuantity(product.id, -1)}
                      >
                        −
                      </button>
                      <strong>{selection.quantity}</strong>
                      <button
                        type="button"
                        aria-label={`Increase ${product.name} quantity`}
                        disabled={selection.quantity === 5}
                        onClick={() => updateExtraQuantity(product.id, 1)}
                      >
                        +
                      </button>
                    </div>

                    {mode === "plan" ? (
                      <>
                        <div
                          className={styles.extraFrequency}
                          aria-label={`${product.name} schedule`}
                        >
                          <button
                            type="button"
                            aria-pressed={selection.frequency === "once"}
                            onClick={() => setExtraFrequency(product.id, "once")}
                          >
                            First delivery
                          </button>
                          <button
                            type="button"
                            aria-pressed={selection.frequency === "weekly"}
                            onClick={() => setExtraFrequency(product.id, "weekly")}
                          >
                            Every week
                          </button>
                        </div>

                        {selection.frequency === "weekly" ? (
                          <div className={styles.extraDays}>
                            <span>Choose delivery days</span>
                            <div>
                              {MILK_PLAN_DAYS.map((day, index) => (
                                <button
                                  type="button"
                                  key={day.label}
                                  aria-pressed={selection.days.includes(index + 1)}
                                  onClick={() =>
                                    toggleExtraDay(product.id, index + 1)
                                  }
                                >
                                  {day.short}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
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
                  setStartDate(firstAvailableStartDate);
                  setBottleOption(initialBottleOption);
                  setExtras(
                    initialExtras.reduce(
                      (result, extra) => ({
                        ...result,
                        [extra.id]: {
                          days: extra.days,
                          frequency: extra.frequency,
                          quantity: extra.quantity,
                        },
                      }),
                      { ...emptyExtras },
                    ),
                  );
                  setReviewed(false);
                }}
              >
                {isEditing ? "Undo changes" : "Reset week"}
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
                <span className={styles.dateCopy}>
                  <span className={styles.stepLabel}>02 · Start date</span>
                  <small>Earliest delivery is tomorrow.</small>
                </span>
                <input
                  min={minimumStartDate}
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
                disabled={!hasPlanItems || !startDate || hasIncompleteExtra}
                onClick={() => setReviewed(true)}
              >
                {isEditing ? "Review updated plan" : "Review milk plan"}{" "}
                <span>→</span>
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
