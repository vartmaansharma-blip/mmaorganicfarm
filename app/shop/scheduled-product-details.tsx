"use client";

import Link from "next/link";
import { useState } from "react";
import { firstMonthEnds } from "@/lib/delivery-pricing";
import {
  addCalendarDays,
  nextDeliveryDateInIndia,
} from "@/lib/delivery-calendar";
import {
  quoteMonthlySchedule,
  recommendedDates,
  validateRoutines,
  type RepeatPattern,
} from "@/lib/monthly-schedule";
import { addCartProduct, cartRoutines, shiftShopPlan } from "@/lib/shop-cart";
import { type ShopProductId } from "@/lib/shop-draft";
import { shopProduct } from "@/lib/shop-products";
import { useShop } from "./shop-state";
import { SharedCalendar } from "./shared-calendar";
import styles from "./shop.module.css";
import { ProductPhotoStrip } from "./product-photo-strip";

const labels: Record<RepeatPattern, string> = {
  custom: "Custom",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  fortnightly: "Every two weeks",
  days: "Choose weekdays",
  once: "Once this month",
};

export function ScheduledProductDetails({ id }: { id: ShopProductId }) {
  const { state, update, setCartOpen, firstPlanStart, prices } = useShop();
  const p = shopProduct(id, prices),
    d = state.drafts.plan[id],
    cart = state.carts.plan;
  const [calendarOpen, setCalendarOpen] = useState(true);
  const start = cart.start,
    end = firstMonthEnds(start);
  const repeat = d.repeat ?? "custom",
    minimum = nextDeliveryDateInIndia();
  const dates = d.dates ?? recommendedDates(id, start);
  const draft = {
    ...d,
    repeat,
    ...(repeat === "custom"
      ? { dates, start: dates.slice().sort()[0] ?? start }
      : {}),
  };
  const prospective = addCartProduct(cart, id, draft, "plan");
  const rules = validateRoutines(start, cartRoutines(prospective));
  const quote = rules
    ? quoteMonthlySchedule({ prices,
        start,
        rules,
        firstPlanStart: firstPlanStart ?? start,
      })
    : null;
  const saved = cartRoutines(cart).filter((r) => r.id !== id);
  function change(next: Partial<typeof d>) {
    update({
      ...state,
      drafts: {
        ...state.drafts,
        plan: {
          ...state.drafts.plan,
          [id]: {
            ...d,
            ...next,
            ...(next.quantity
              ? {
                  schedule: d.schedule.map((q) =>
                    q > 0 ? next.quantity! : 0,
                  ) as typeof d.schedule,
                }
              : {}),
          },
        },
      },
    });
  }
  return (
    <main className={styles.productPage}>
      <Link className={styles.back} href="/shop">
        ← Back to the counter
      </Link>
      <div className={styles.detailGrid}>
        <ProductPhotoStrip id={id} />
        <div className={styles.detailCopy}>
          <p className={styles.eyebrow}>M’ma Organic Farm</p>
          <div className={styles.productTitle}>
            <h1>{p.name}</h1>
            <p>
              ₹{p.price} <span>/ {p.unit}</span>
            </p>
          </div>
          <p className={styles.description}>{p.description}</p>
          <section
            className={styles.configuration}
            aria-labelledby="routine-heading"
          >
            <h2 id="routine-heading">Your everyday, made easy.</h2>
            <div className={styles.quantityRow}>
              <span>
                {id === "milk"
                  ? "Litres per delivery"
                  : id === "paneer"
                    ? "500 g packs per delivery"
                    : "500 g jars per delivery"}
              </span>
              <div className={styles.stepper}>
                <button
                  type="button"
                  disabled={d.quantity <= 1}
                  aria-label={`Decrease ${id} quantity`}
                  onClick={() => change({ quantity: d.quantity - 1 })}
                >
                  −
                </button>
                <output aria-live="polite">{d.quantity}</output>
                <button
                  type="button"
                  disabled={d.quantity >= 5}
                  aria-label={`Increase ${id} quantity`}
                  onClick={() => change({ quantity: d.quantity + 1 })}
                >
                  +
                </button>
              </div>
            </div>
            <label className={styles.field}>
              Repeat
              <select
                value={repeat}
                onChange={(e) => {
                  change({ repeat: e.target.value as RepeatPattern });
                  setCalendarOpen(true);
                }}
                aria-label="Delivery repeat"
              >
                {(["custom", "daily", "weekly", "monthly"] as const).map(
                  (value) => (
                    <option key={value} value={value}>
                      {labels[value]}
                    </option>
                  ),
                )}
                {!["custom", "daily", "weekly", "monthly"].includes(repeat) ? (
                  <option value={repeat}>{labels[repeat]}</option>
                ) : null}
              </select>
            </label>
            {repeat === "custom" && !d.dates ? (
              <p className={styles.note}>
                Suggested dates are selected:{" "}
                {id === "milk"
                  ? "milk every day"
                  : id === "paneer"
                    ? "paneer on Saturdays"
                    : "one jar of ghee at the start"}
                . Tap dates to add or remove {p.name.toLowerCase()}. These are
                suggestions; choose what suits you.
              </p>
            ) : repeat === "custom" ? (
              <p className={styles.note}>
                Tap dates to add or remove {p.name.toLowerCase()}. Your other
                products stay saved.
              </p>
            ) : null}
            <details className={styles.optional}>
              <summary>More options</summary>
              <div className={styles.patterns}>
                {(["fortnightly", "days", "once"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={repeat === value}
                    onClick={() => change({ repeat: value })}
                  >
                    {labels[value]}
                  </button>
                ))}
              </div>
            </details>
            {repeat === "days" ? (
              <div
                className={styles.dayChoices}
                role="group"
                aria-label="Delivery weekdays"
              >
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (day, i) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={d.schedule[i] > 0}
                      onClick={() =>
                        change({
                          schedule: d.schedule.map((q, n) =>
                            n === i ? (q > 0 ? 0 : d.quantity) : q,
                          ) as typeof d.schedule,
                        })
                      }
                    >
                      {day}
                    </button>
                  ),
                )}
              </div>
            ) : null}
            <label className={styles.field}>
              Plan starts
              <input
                type="date"
                value={start}
                min={minimum}
                onChange={(e) => update(shiftShopPlan(state, e.target.value))}
              />
            </label>
            {repeat !== "custom" ? (
              <label className={styles.field}>
                First {p.name.toLowerCase()} delivery
                <input
                  type="date"
                  value={d.start}
                  min={start > minimum ? start : minimum}
                  max={end ? addCalendarDays(end, -1) : undefined}
                  onChange={(e) => change({ start: e.target.value })}
                />
              </label>
            ) : null}
            <p className={styles.note}>
              One prepaid calendar month. No automatic renewal. All products
              share this period.
            </p>
            {saved.length ? (
              <p className={styles.savedRoutine}>
                Already in your calendar:{" "}
                {saved.map((r) => shopProduct(r.id).name).join(" and ")}. Their
                dates stay saved.
              </p>
            ) : null}
            <button
              className={styles.calendarToggle}
              type="button"
              aria-expanded={calendarOpen}
              onClick={() => setCalendarOpen(!calendarOpen)}
            >
              {calendarOpen ? "Hide" : "View"} your shared calendar{" "}
              <span aria-hidden="true">{calendarOpen ? "−" : "+"}</span>
            </button>
            {calendarOpen ? (
              <SharedCalendar
                start={start}
                rules={cartRoutines(prospective)}
                focusProduct={repeat === "custom" ? id : undefined}
                onToggleDate={
                  repeat === "custom"
                    ? (date) =>
                        change({
                          dates: dates.includes(date)
                            ? dates.filter((d) => d !== date)
                            : [...dates, date].sort(),
                        })
                    : undefined
                }
              />
            ) : null}
            {quote ? (
              <>
                <div className={styles.total}>
                  <span>
                    {p.name} this month · {quote.quantities[id]}{" "}
                    {id === "milk" ? "L" : "packs"}
                  </span>
                  <strong>
                    ₹{quote.productTotals[id].toLocaleString("en-IN")}
                  </strong>
                </div>
                <p className={styles.note}>
                  {
                    quote.days.filter((day) =>
                      day.items.some((item) => item.id === id),
                    ).length
                  }{" "}
                  deliveries this month. Products arriving together share one
                  delivery charge.
                </p>
              </>
            ) : null}
            <button
              className={styles.primary}
              type="button"
              disabled={!quote || start < minimum}
              onClick={() => {
                update({
                  ...state,
                  carts: { ...state.carts, plan: prospective },
                  drafts: {
                    ...state.drafts,
                    plan: { ...state.drafts.plan, [id]: draft },
                  },
                });
                setCartOpen(true);
              }}
            >
              {cart[id] ? "Update cart" : "Add to cart"}{" "}
              <span aria-hidden="true">→</span>
            </button>
            {!quote ? (
              <p className={styles.note} role="status">
                Select at least one delivery date for each product within this
                month.
              </p>
            ) : null}
          </section>
        </div>
      </div>
      <nav className={styles.related} aria-label="More from M’ma">
        {(["milk", "paneer", "ghee"] as const)
          .filter((key) => key !== id)
          .map((key) => (
            <Link key={key} href={`/shop/${key}`}>
              {shopProduct(key).name} ↗
            </Link>
          ))}
      </nav>
    </main>
  );
}
