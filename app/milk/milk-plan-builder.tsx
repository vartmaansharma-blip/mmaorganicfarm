"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./milk.module.css";

const PRICE_PER_LITRE = 62;
const MAX_LITRES = 5;
const STEP = 0.5;
const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const initialSchedule = [
  { short: "Mon", label: "Monday", litres: 1 },
  { short: "Tue", label: "Tuesday", litres: 1 },
  { short: "Wed", label: "Wednesday", litres: 1 },
  { short: "Thu", label: "Thursday", litres: 1 },
  { short: "Fri", label: "Friday", litres: 1 },
  { short: "Sat", label: "Saturday", litres: 2 },
  { short: "Sun", label: "Sunday", litres: 2 },
];

type PurchaseMode = "once" | "plan";

function formatLitres(value: number) {
  return Number.isInteger(value) ? `${value} L` : `${value.toFixed(1)} L`;
}

function formatDate(value: string) {
  return value
    ? dateFormatter.format(new Date(`${value}T00:00:00`))
    : "Choose date";
}

export function MilkPlanBuilder() {
  const [mode, setMode] = useState<PurchaseMode>("plan");
  const [onceQuantity, setOnceQuantity] = useState(1);
  const [schedule, setSchedule] = useState(initialSchedule);
  const [startDate, setStartDate] = useState("");
  const [reviewed, setReviewed] = useState(false);

  const weeklyLitres = schedule.reduce(
    (total, day) => total + day.litres,
    0,
  );
  const weeklyEstimate = weeklyLitres * PRICE_PER_LITRE;
  const deliveryDays = schedule.filter((day) => day.litres > 0).length;

  function updateSchedule(index: number, delta: number) {
    setSchedule((current) =>
      current.map((day, dayIndex) =>
        dayIndex === index
          ? {
              ...day,
              litres: Math.min(
                MAX_LITRES,
                Math.max(0, Number((day.litres + delta).toFixed(1))),
              ),
            }
          : day,
      ),
    );
    setReviewed(false);
  }

  function updateOnceQuantity(delta: number) {
    setOnceQuantity((current) =>
      Math.min(MAX_LITRES, Math.max(STEP, Number((current + delta).toFixed(1)))),
    );
  }

  function chooseMode(nextMode: PurchaseMode) {
    setMode(nextMode);
    setReviewed(false);
  }

  return (
    <section className={styles.builder} aria-labelledby="choose-order-title">
      <div className={styles.builderHeading}>
        <p className={styles.eyebrow}>Choose how you order</p>
        <h2 id="choose-order-title">Milk that follows your week.</h2>
      </div>

      <div className={styles.modeSwitch} aria-label="Purchase type">
        <button
          className={mode === "once" ? styles.modeActive : undefined}
          type="button"
          aria-pressed={mode === "once"}
          onClick={() => chooseMode("once")}
        >
          Buy once
        </button>
        <button
          className={mode === "plan" ? styles.modeActive : undefined}
          type="button"
          aria-pressed={mode === "plan"}
          onClick={() => chooseMode("plan")}
        >
          Start milk plan
        </button>
      </div>

      {mode === "once" ? (
        <div className={styles.onceLayout}>
          <div className={styles.onceCopy}>
            <p className={styles.stepLabel}>Tomorrow&apos;s bottle</p>
            <h3>How much milk do you need?</h3>
            <p>Choose the quantity for one delivery.</p>
          </div>

          <div className={styles.onceAction}>
            <div className={styles.largeStepper} aria-label="One-time milk quantity">
              <button
                type="button"
                aria-label="Reduce one-time quantity"
                disabled={onceQuantity <= STEP}
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
              <span>One-time total</span>
              <strong>₹{onceQuantity * PRICE_PER_LITRE}</strong>
            </div>
            <Link className={styles.primaryAction} href="/order?purchase=once">
              Continue to delivery details <span>→</span>
            </Link>
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
              {schedule.map((day, index) => (
                <div className={styles.day} key={day.label}>
                  <div className={styles.dayName}>
                    <strong>{day.short}</strong>
                    <span>{day.litres === 0 ? "Skip" : "Deliver"}</span>
                  </div>
                  <div className={styles.stepper}>
                    <button
                      type="button"
                      aria-label={`Reduce ${day.label} quantity`}
                      disabled={day.litres === 0}
                      onClick={() => updateSchedule(index, -STEP)}
                    >
                      −
                    </button>
                    <output aria-label={`${day.label} quantity`}>
                      {formatLitres(day.litres)}
                    </output>
                    <button
                      type="button"
                      aria-label={`Increase ${day.label} quantity`}
                      disabled={day.litres >= MAX_LITRES}
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
                <dd>₹{weeklyEstimate}</dd>
              </div>
              <div>
                <dt>Start</dt>
                <dd>{formatDate(startDate)}</dd>
              </div>
            </dl>

            {reviewed ? (
              <div className={styles.reviewed} role="status">
                <strong>Plan ready to continue</strong>
                <p>Your weekly schedule is complete.</p>
              </div>
            ) : null}

            {reviewed ? (
              <Link className={styles.primaryAction} href="/order?purchase=plan">
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
              Estimated at ₹62 per litre. Final delivery details are confirmed
              with the farm.
            </p>
          </aside>
        </div>
      )}
    </section>
  );
}
