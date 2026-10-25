"use client";
import { useState } from "react";
import { monthSchedule, type ProductRoutine } from "@/lib/monthly-schedule";
import { firstMonthEnds } from "@/lib/delivery-pricing";
import {
  addCalendarDays,
  formatCalendarDate,
  weekdayFromYmd,
} from "@/lib/delivery-calendar";
import { OutlineIcon } from "@/app/components/outline-icon";
import type { ShopProductId } from "@/lib/shop-draft";
import { shopProduct } from "@/lib/shop-products";
import styles from "./shared-calendar.module.css";
export function SharedCalendar({
  start,
  rules,
  preview = true,
  focusProduct,
  onToggleDate,
}: {
  start: string;
  rules: ProductRoutine[];
  preview?: boolean;
  focusProduct?: ShopProductId;
  onToggleDate?: (date: string) => void;
}) {
  const [selected, setSelected] = useState(start),
    end = firstMonthEnds(start),
    days = monthSchedule(start, rules);
  if (!end) return null;
  const dates: Array<string> = [];
  for (let d = start; d < end; d = addCalendarDays(d, 1)) dates.push(d);
  const active = selected >= start && selected < end ? selected : start,
    items = days.find((d) => d.date === active)?.items ?? [];
  const short = (date: string) =>
    new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
  return (
    <section className={styles.calendar} aria-label="Shared delivery calendar">
      <div className={styles.heading}>
        <h3>Your delivery calendar</h3>
        <p>
          {short(start)} – {short(addCalendarDays(end, -1))}
        </p>
      </div>
      <p className={styles.note}>
        {preview
          ? "Planned dates. Confirmed only after payment."
          : "Your confirmed deliveries."}{" "}
        All products stay together here.
      </p>
      <div
        className={styles.grid}
        role="group"
        aria-label="Choose a delivery date"
      >
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span className={styles.weekday} key={i} aria-hidden="true">
            {d}
          </span>
        ))}
        {Array.from({ length: weekdayFromYmd(start) - 1 }, (_, i) => (
          <span key={`empty-${i}`} aria-hidden="true" />
        ))}
        {dates.map((date) => {
          const dayItems = days.find((day) => day.date === date)?.items ?? [];
          return (
            <button
              key={date}
              data-date={date}
              type="button"
              aria-pressed={
                focusProduct
                  ? dayItems.some((item) => item.id === focusProduct)
                  : date === active
              }
              aria-label={`${formatCalendarDate(date)}: ${dayItems.length ? dayItems.map((item) => `${shopProduct(item.id).name} ${item.quantity} ${item.id === "milk" ? "litres" : "packs"}`).join(", ") : "No delivery"}`}
              onClick={() => {
                setSelected(date);
                onToggleDate?.(date);
              }}
              onKeyDown={(e) => {
                const index = dates.indexOf(date),
                  offset =
                    e.key === "ArrowLeft"
                      ? -1
                      : e.key === "ArrowRight"
                        ? 1
                        : e.key === "ArrowUp"
                          ? -7
                          : e.key === "ArrowDown"
                            ? 7
                            : 0;
                if (!offset) return;
                const next = dates[index + offset];
                if (next) {
                  e.preventDefault();
                  setSelected(next);
                  e.currentTarget.parentElement
                    ?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)
                    ?.focus();
                }
              }}
            >
              <span>{date.slice(8).replace(/^0/, "")}</span>
              <span className={styles.markers} aria-hidden="true">
                {dayItems.map((item) => (
                  <OutlineIcon key={item.id} name={item.id} size={10} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles.agenda}>
        {(onToggleDate
          ? dates.map((date) => ({
              date,
              items: days.find((day) => day.date === date)?.items ?? [],
            }))
          : days
        ).map((day) => (
          <button
            type="button"
            key={day.date}
            aria-pressed={
              focusProduct
                ? day.items.some((item) => item.id === focusProduct)
                : day.date === active
            }
            onClick={() => {
              setSelected(day.date);
              onToggleDate?.(day.date);
            }}
          >
            <span>{short(day.date)}</span>
            <span>
              {day.items.map((item) => shopProduct(item.id).name).join(" · ") ||
                "No delivery"}
            </span>
          </button>
        ))}
      </div>
      <div className={styles.day}>
        <h4>{formatCalendarDate(active)}</h4>
        {items.length ? (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <OutlineIcon name={item.id} size={18} />
                <span>{shopProduct(item.id).name}</span>
                <strong>
                  {item.quantity}
                  {item.id === "milk"
                    ? " L"
                    : ` × ${shopProduct(item.id).unit}`}
                </strong>
              </li>
            ))}
          </ul>
        ) : (
          <p>No delivery planned for this day.</p>
        )}
      </div>
    </section>
  );
}
