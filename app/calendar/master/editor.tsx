"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { addCalendarDays, formatCalendarDate, productName, weekdayFromYmd } from "@/lib/delivery-calendar";
import {
  resolveMasterDelivery, scheduleProducts, scheduleWeekdays,
  type DateException, type PatternVersion, type WeeklyPattern, type ProductQuantities,
} from "@/lib/master-delivery-schedule";
import { saveMasterSchedule } from "./actions";
import styles from "./master.module.css";

export function CalendarDates({ children, weekly }: { children: ReactNode; weekly: boolean }) {
  return <div className={`${styles.monthGrid} ${weekly ? styles.weekGrid : ""}`}
    role="group" aria-label="Delivery dates"
    onKeyDown={event => {
      if (!(event.target instanceof HTMLAnchorElement) || !event.target.dataset.date) return;
      const date = event.target.dataset.date;
      const offsets: Record<string, number> = {
        ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
        Home: 1 - weekdayFromYmd(date), End: 7 - weekdayFromYmd(date),
      };
      const offset = offsets[event.key];
      if (offset === undefined) return;
      event.preventDefault();
      event.currentTarget.querySelector<HTMLAnchorElement>(`a[data-date="${addCalendarDays(date, offset)}"]`)?.focus();
    }}>{children}</div>;
}

function Submit({ children, disabled = false }: { children: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={styles.primary} disabled={disabled || pending}>
    {pending ? "Saving…" : children}
  </button>;
}

function quantitiesText(quantities: ProductQuantities) {
  return scheduleProducts.filter(id => quantities[id] > 0)
    .map(id => `${productName(id)} ${quantities[id]} ${id === "milk" ? "L" : "packs"}`).join(" · ") || "No delivery";
}

function BulkQuantity({ label, editing, edit, apply, children }: {
  label: string; editing: boolean; edit: () => void; apply: (amount: number) => void; children: React.ReactNode;
}) {
  return editing ? <input type="number" inputMode="numeric" min={0} max={5} step={1}
    aria-label={`Quantity for ${label}`} placeholder="0–5" ref={element => element?.focus()}
    onBlur={event => {
      const amount = event.currentTarget.valueAsNumber;
      apply(amount);
    }}
    onKeyDown={event => {
      if (event.key !== "Enter" && event.key !== "Escape") return;
      event.preventDefault();
      if (event.key === "Escape") event.currentTarget.value = "";
      event.currentTarget.blur();
    }}
  /> : <button className={styles.bulkTarget} type="button" aria-label={`Edit all ${label} quantities`} onClick={edit}>{children}</button>;
}

export function WeeklySchedule({ pattern, from, dates, versions, exceptions, locked, revision, month, active }: {
  pattern: WeeklyPattern; from: string; dates: string[]; versions: PatternVersion[];
  exceptions: DateException[]; locked: string[]; revision: number; month: string; active: string;
}) {
  const [week, setWeek] = useState(pattern);
  const [target, setTarget] = useState<string | null>(null);
  const changed = JSON.stringify(pattern) !== JSON.stringify(week);
  const nextVersion = [...versions, { effective_from: from, quantities: week }];
  const changes = dates.flatMap(date => {
    if (date < from || locked.includes(date)) return [];
    const before = resolveMasterDelivery(date, versions, exceptions).quantities;
    const after = resolveMasterDelivery(date, nextVersion, exceptions).quantities;
    return scheduleProducts.some(id => before[id] !== after[id]) ? [{ date, before, after }] : [];
  });

  function applyBulk(amount: number, product?: keyof WeeklyPattern, column?: number) {
    setTarget(null);
    if (!Number.isInteger(amount) || amount < 0 || amount > 5) return;
    setWeek(previous => {
      const next = { ...previous };
      for (const id of scheduleProducts) {
        if (product && product !== id) continue;
        next[id] = previous[id].map((value, index) => column === undefined || column === index ? amount : value);
      }
      return next;
    });
  }

  return <form action={saveMasterSchedule} className={styles.editor}>
    <div className={styles.patternHeading}>
      <h2>Weekly pattern</h2>
      <p>Repeats from {formatCalendarDate(from)}. 1–5 litres or packs. 0 skips.</p>
    </div>
    <input type="hidden" name="view" value="weekly" />
    <input type="hidden" name="month" value={month} />
    <input type="hidden" name="date" value={active} />
    <input type="hidden" name="revision" value={revision} />
    <input type="hidden" name="quantities" value={JSON.stringify(week)} />
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Weekly quantities">
      <table className={styles.matrix} role="table">
        <thead><tr><th scope="col">Item</th>{scheduleWeekdays.map((day, index) =>
          <th key={day} scope="col"><BulkQuantity label={day} editing={target === day}
            edit={() => setTarget(day)} apply={amount => applyBulk(amount, undefined, index)}>
            <abbr title={day}>{day.slice(0, 3)}</abbr>
          </BulkQuantity></th>)}</tr></thead>
        <tbody>{scheduleProducts.map(id => <tr key={id}>
          <th scope="row"><BulkQuantity label={productName(id)} editing={target === id}
            edit={() => setTarget(id)} apply={amount => applyBulk(amount, id)}>
              {id === "milk" ? "Milk" : id === "paneer" ? "Paneer" : "Ghee"}
            </BulkQuantity></th>
          {scheduleWeekdays.map((day, index) => <td key={day}>
            <input type="number" inputMode="numeric" min={0} max={5} step={1} required
              aria-label={`${productName(id)}, ${day}, ${id === "milk" ? "litres" : "packs"}`}
              value={week[id][index]} onFocus={event => event.currentTarget.select()}
              onChange={event => {
                const amount = event.currentTarget.valueAsNumber;
                if (!Number.isInteger(amount) || amount < 0 || amount > 5) return;
                setWeek(previous => ({ ...previous, [id]: previous[id].map((value, dayIndex) => dayIndex === index ? amount : value) }));
              }} />
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {changed ? <section className={styles.changes} aria-label="Dates affected by this change">
      <h3>Changes in the next 14 days</h3>
      <p>The pattern repeats each week. Existing date exceptions and paid commitments retain their quantities.</p>
      {changes.length ? <ul>{changes.map(({ date, before, after }) => <li key={date}>
        <strong>{formatCalendarDate(date)}</strong><span>{quantitiesText(before)} → {quantitiesText(after)}</span>
      </li>)}</ul> : <p>No projected dates change in the displayed period.</p>}
    </section> : null}
    <Submit disabled={!changed}>Save recurring schedule</Submit>
  </form>;
}

export function DateSchedule({ date, defaults, overrides, revision, month, view }: {
  date: string; defaults: ProductQuantities; overrides: Partial<ProductQuantities>;
  revision: number; month: string; view: "weekly" | "monthly";
}) {
  const initial = { milk: overrides.milk ?? null, paneer: overrides.paneer ?? null, ghee: overrides.ghee ?? null };
  const [draft, setDraft] = useState(initial);
  return <form action={saveMasterSchedule} className={styles.dateEditor}>
    <input type="hidden" name="view" value={view} />
    <input type="hidden" name="scope" value="date" />
    <input type="hidden" name="date" value={date} />
    <input type="hidden" name="month" value={month} />
    <input type="hidden" name="revision" value={revision} />
    <input type="hidden" name="quantities" value={JSON.stringify(draft)} />
    <div className={styles.dateInputs}>{scheduleProducts.map(id => <label key={id}>
      {productName(id)}
      <span>Weekly {defaults[id]} {id === "milk" ? "L" : "packs"}</span>
      <input type="number" inputMode="numeric" min={0} max={5} step={1} value={draft[id] ?? ""}
        placeholder={String(defaults[id])}
        onFocus={event => event.currentTarget.select()}
        onChange={event => {
          const value = event.currentTarget.value === "" ? null : event.currentTarget.valueAsNumber;
          if (value === null || (Number.isInteger(value) && value >= 0 && value <= 5)) {
            setDraft(previous => ({ ...previous, [id]: value }));
          }
        }} />
    </label>)}</div>
    <p className={styles.dateHint}>1–5 litres or packs · 0 skips · blank uses weekly</p>
    <div className={styles.actions}>
      <button className={styles.secondary} type="button" onClick={() => setDraft({ milk: 0, paneer: 0, ghee: 0 })}>Skip this date</button>
      <button className={styles.secondary} type="button" aria-label="Restore weekly quantities" onClick={() => setDraft({ milk: null, paneer: null, ghee: null })}>Reset</button>
      <Submit disabled={JSON.stringify(draft) === JSON.stringify(initial)}>Save date</Submit>
    </div>
  </form>;
}
