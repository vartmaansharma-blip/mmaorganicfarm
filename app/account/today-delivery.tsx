"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { DeliveryDay, DeliveryItem, DeliverySnapshot, DeliveryState } from "@/lib/customer-delivery";
import { formatDeliveryQuantity, productName } from "@/lib/delivery-calendar";
import { SHOP_PRODUCTS } from "@/lib/shop-products";
import { DeliveryScene } from "./delivery-scene";
import styles from "./account.module.css";

export const deliveryLabels: Record<DeliveryState, string> = {
  scheduled: "Scheduled for today", preparing: "Getting your delivery ready", out: "On the way to you",
  delivered: "Delivered today", attention: "Your delivery needs attention", paused: "Deliveries are paused",
  skipped: "Today’s delivery is skipped", cancelled: "Today’s delivery is cancelled", none: "A quiet day at your doorstep", setup: "Your delivery isn’t confirmed yet",
};
const descriptions: Record<DeliveryState, string> = {
  scheduled: "Your items are scheduled. We’re waiting for the farm’s next delivery update.",
  preparing: "The farm team is getting your items ready for today’s delivery.",
  out: "Your delivery is out with the farm team. We’ll show the recorded result here.",
  delivered: "All of today’s items have been recorded as delivered. Enjoy a little farm goodness.",
  attention: "Some items are still outstanding or need confirmation. See each delivery below.",
  paused: "There’s no delivery while your plan is paused. Your next scheduled dates appear below.",
  skipped: "No delivery is expected for the skipped items today. Check your calendar for the next date.",
  cancelled: "These delivery records are cancelled. Contact the farm if you need help with the next step.",
  none: "No delivery is scheduled for today. Your next confirmed dates will appear below.",
  setup: "A saved order or plan is awaiting payment or farm confirmation. Check Orders for its payment status or contact the farm.",
};
const visitLabels: Record<DeliveryState, string> = { ...deliveryLabels, delivered: "Delivered", scheduled: "Scheduled", attention: "Outstanding items", out: "On the way", preparing: "Preparing", cancelled: "Cancelled", skipped: "Approved skip" };
const dayLabels: Record<DeliveryState, string> = {
  scheduled: "Scheduled", preparing: "Preparing", out: "On the way", delivered: "Delivered",
  attention: "Needs attention", paused: "Paused", skipped: "Skipped", cancelled: "Cancelled",
  none: "No delivery", setup: "Awaiting confirmation",
};
const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" });

function itemSummary(items: DeliveryItem[]) {
  return items.map(item => `${productName(item.product_key)} · ${formatDeliveryQuantity(item.quantity, item.unit)}`).join(", ");
}

function deliveryEditorHref(planId: string, date: string, target: "skip-delivery" | "quantity-change") {
  return `/calendar?${new URLSearchParams({ plan: planId, date })}#${target}`;
}

function DeliveryDayDialog({ day, today, stale, onClose }: {
  day: DeliveryDay; today: string; stale: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  const canEdit = day.editablePlans.length > 0 && !stale;

  return <dialog ref={dialog} className={styles.deliveryDialog} aria-labelledby="delivery-dialog-title" onClose={onClose}>
    <div className={styles.deliveryDialogHeader}>
      <div>
        <p className={styles.eyebrow}>Delivery details</p>
        <h2 id="delivery-dialog-title">{formatCalendarDate(day.date)}</h2>
      </div>
      <form method="dialog"><button type="submit" className={styles.refresh} aria-label="Close delivery details">Close</button></form>
    </div>
    <p className={styles.deliveryDialogStatus}>{dayLabels[day.state]}</p>
    {day.items.length ? <ul className={styles.deliveryDialogItems}>
      {day.items.map((item, index) => <li key={`${item.product_key}:${index}`}>
        <span>{productName(item.product_key)}</span>
        <strong>{formatDeliveryQuantity(item.quantity, item.unit)}</strong>
      </li>)}
    </ul> : null}
    {canEdit ? <>
      <p>Make changes before the delivery date starts in India and before the farm prepares it.</p>
      {day.editablePlans.map((plan, index) => <div key={plan.id} className={styles.deliveryDialogActions}>
        {day.editablePlans.length > 1 ? <h3>Weekly plan {index + 1} · {itemSummary(plan.items)}</h3> : null}
        <Link href={deliveryEditorHref(plan.id, day.date, "skip-delivery")}>Review skipping this delivery →</Link>
        {plan.items.some(item => item.product_key === "milk") ? <Link href={deliveryEditorHref(plan.id, day.date, "quantity-change")}>Review a milk quantity change →</Link> : null}
      </div>)}
    </> : day.state !== "none" ? <>
      <p>{stale ? "Refresh delivery updates before making changes." : day.date === today ? "Online changes close when the delivery date starts in India." : "Online changes are unavailable for this delivery."}</p>
      <Link className={styles.dialogHelp} href="/contact">Contact the farm →</Link>
    </> : null}
  </dialog>;
}
// Assemble parts explicitly: Safari and Node use different punctuation/spacing in en-IN.
function formatCalendarDate(value: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).formatToParts(new Date(`${value}T00:00:00Z`)).map(p => [p.type, p.value]));
  return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}`;
}
function time(value: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${parts.hour}:${parts.minute} ${parts.dayPeriod.toLowerCase()}`;
}

export function AccountDate({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  useEffect(() => {
    const update = () => {
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(p => [p.type, p.value]));
      setDate(`${parts.year}-${parts.month}-${parts.day}`);
    };
    const interval = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", update); };
  }, []);
  return <time className={styles.todayDate} dateTime={date}>{formatCalendarDate(date)}</time>;
}

export function TodayDelivery({ initial, editablePlanId }: { initial: DeliverySnapshot | null; editablePlanId?: string }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [error, setError] = useState(initial ? "" : "We couldn’t load your delivery updates. Please try again.");
  const [busy, setBusy] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const lastAttempt = useRef(0);
  const refresh = useCallback(async (manual = false) => {
    if (inFlight.current || (!manual && (document.hidden || Date.now() - lastAttempt.current < 15_000))) return;
    const controller = new AbortController();
    inFlight.current = controller;
    lastAttempt.current = Date.now();
    setBusy(true);
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/account/delivery", { cache: "no-store", signal: controller.signal });
      if (response.status === 401) throw new Error("Your session has expired. Sign in again to refresh delivery updates.");
      if (!response.ok) throw new Error("We couldn’t refresh your delivery updates. Please try again.");
      const next: DeliverySnapshot = await response.json();
      setSnapshot(next);
      setError("");
    } catch (cause) {
      // Keep the last successful result visible; a failed request never becomes an empty day.
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "The update is taking longer than usual. Please try again.");
    } finally { window.clearTimeout(timeout); inFlight.current = null; setBusy(false); }
  }, []);
  useEffect(() => {
    const onFocus = () => { void refresh(); };
    const interval = window.setInterval(onFocus, 60_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); inFlight.current?.abort(); };
  }, [refresh]);
  const state = snapshot?.state ?? "none";
  const progress = ({ scheduled: 1, preparing: 2, out: 3, delivered: 4 } as Partial<Record<DeliveryState, number>>)[state] ?? 0;
  const next = snapshot?.upcoming[0];
  const featureNext = Boolean(next && ["none", "paused", "skipped", "delivered", "cancelled"].includes(state));
  const current = snapshot ? {
    date: snapshot.date,
    state: snapshot.state,
    items: snapshot.visits.flatMap(visit => visit.items),
    editablePlans: [],
  } : null;
  const selectedDay = selectedDate === current?.date ? current :
    snapshot?.week.find(day => day.date === selectedDate) ??
    snapshot?.upcoming.find(day => day.date === selectedDate);
  const nextItems = next?.items ?? [];
  const image = SHOP_PRODUCTS.find(product => product.id === nextItems[0]?.product_key);
  const nextPlan = next?.editablePlans.length === 1 && !error ? next.editablePlans[0] : null;
  const nextMilk = nextPlan?.items.some(item => item.product_key === "milk");
  return <div className={styles.todaySurface}>
    {featureNext && next ? <section className={styles.nextFeature} aria-labelledby="next-delivery-title">
      <div className={styles.nextFeatureHeading}><p className={styles.eyebrow}>Your next delivery</p><span>{dayLabels[next.state]}</span></div>
      <div className={styles.nextFeatureBody}>
        {image ? <Image src={image.image} width={76} height={76} alt="" /> : null}
        <div>
          <h2 id="next-delivery-title"><time dateTime={next.date}>{formatCalendarDate(next.date)}</time></h2>
          <ul>{next.items.map((item, index) => <li key={`${item.product_key}:${item.unit}:${index}`}><span>{productName(item.product_key)}</span><strong>{formatDeliveryQuantity(item.quantity, item.unit)}</strong></li>)}</ul>
        </div>
      </div>
      {error && snapshot ? <p>Last checked {formatCalendarDate(snapshot.date)}.</p> : null}
      <button type="button" onClick={() => setSelectedDate(next.date)}>Manage delivery →</button>
    </section> : null}
    <section className={styles.deliveryCard} data-delivery-state={snapshot ? state : "error"} aria-labelledby="today-delivery-title">
      <div className={styles.deliveryTop}>
        <div><p className={styles.eyebrow}>Today’s delivery</p><h2 id="today-delivery-title">{snapshot ? deliveryLabels[state] : "Delivery updates unavailable"}</h2><p className={styles.deliveryCopy}>{snapshot ? descriptions[state] : "Your schedule is safe. We’ll show the latest delivery status when we can reconnect."}</p></div>
        <button className={styles.refresh} type="button" onClick={() => void refresh(true)} disabled={busy} aria-label={busy ? "Refreshing delivery updates" : "Refresh delivery updates"}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 8a8 8 0 0 1 14-3l1 7M4 12l1 7a8 8 0 0 0 14-3"/></svg><span>{busy ? "Updating" : "Refresh"}</span></button>
      </div>
      {error ? <div className={styles.refreshError} role="status">{error}{snapshot ? <span>Showing the last successful update for {formatCalendarDate(snapshot.date)}.</span> : null}<a href="/sign-in">Check sign-in</a></div> : null}
      {snapshot ? <>
        <DeliveryScene state={state} />
        {progress > 0 ? <ol className={styles.deliverySteps} aria-label="Delivery stages">{["Scheduled", "Preparing", "On the way", "Delivered"].map((label, i) => <li key={label} data-reached={i < progress} aria-current={i === progress - 1 ? "step" : undefined}>{label}</li>)}</ol> : null}
        {snapshot.visits.length ? <div className={styles.visitList}>{snapshot.visits.map((visit, index) => <div className={styles.visit} key={visit.key}>
          <div className={styles.visitHeading}><strong>{snapshot.visits.length > 1 ? `Delivery ${index + 1}` : "Your items"}</strong><span>{visitLabels[visit.state]}</span></div>
          {visit.items.map((item, i) => <div className={styles.deliveryItem} key={`${item.product_key}:${i}`}><span>{productName(item.product_key)}</span><strong>{item.quantity} {item.unit}</strong>{item.fulfilled_quantity != null && ["attention", "delivered"].includes(state) ? <small>{Number(item.fulfilled_quantity)} delivered · {Math.max(0, item.quantity - Number(item.fulfilled_quantity))} {item.unit} outstanding</small> : null}</div>)}
          {visit.followUpApproved && visit.followUp ? <p className={styles.followUp}>Farm-approved follow-up: {formatCalendarDate(visit.followUp)}. It remains outstanding until delivered.</p> : visit.state === "attention" || visit.state === "skipped" ? <p className={styles.followUp}>Check delivery history for any recorded follow-up, or contact the farm for an update.</p> : null}
        </div>)}</div> : null}
        <div className={styles.deliveryBottom}>
          <span>{snapshot.completedAt ? `Confirmed at ${time(snapshot.completedAt)} IST` : snapshot.updatedAt ? `Farm update · ${time(snapshot.updatedAt)} IST` : `Schedule checked · ${time(snapshot.checkedAt)} IST`}</span>
          {state === "setup" ? <Link href="/account?section=orders&order_view=pending">Orders & payment →</Link> :
            state === "attention" || state === "cancelled" ? <Link href="/contact">Contact the farm ↗</Link> :
              <button type="button" className={styles.textAction} onClick={() => setSelectedDate(snapshot.date)}>Delivery details →</button>}
        </div>
      </> : <div className={styles.deliveryBottom}><button className={styles.textAction} type="button" disabled={busy} onClick={() => void refresh(true)}>Try again →</button><a href="/contact">Contact the farm ↗</a></div>}
    </section>
    {snapshot ? <>
      <nav className={styles.todayActions} aria-label="Quick delivery actions">
        {next && nextPlan ? <>
          <Link className={styles.todayActionPrimary} href={deliveryEditorHref(nextPlan.id, next.date, "skip-delivery")}><span aria-hidden="true">−</span><span><strong>Skip a delivery</strong><small>Review the next date</small></span></Link>
          {nextMilk ? <Link className={styles.todayActionSecondary} href={deliveryEditorHref(nextPlan.id, next.date, "quantity-change")}><span aria-hidden="true">↕</span><span><strong>Change quantity</strong><small>Adjust milk for the next date</small></span></Link> : null}
        </> : next && !featureNext ? <button type="button" className={styles.todayActionPrimary} onClick={() => setSelectedDate(next.date)}>
          <span aria-hidden="true">↗</span><span><strong>Next delivery</strong><small>{formatCalendarDate(next.date)}</small></span>
        </button> : !next && !snapshot.confirmedPlans ? <Link className={styles.todayActionPrimary} href={snapshot.awaitingConfirmation ? "/account?section=orders&order_view=pending" : "/milk"}>
          <span aria-hidden="true">↗</span><span><strong>{snapshot.awaitingConfirmation ? "Check your payment" : "Start a delivery plan"}</strong><small>{snapshot.awaitingConfirmation ? "Review any pending payment" : "Choose milk and farm favourites"}</small></span>
        </Link> : null}
        {editablePlanId && !error ? (
          <Link className={styles.todayActionSecondary} href={`/calendar?plan=${editablePlanId}#pause-heading`}><span aria-hidden="true">Ⅱ</span><span><strong>Pause deliveries</strong><small>Choose dates away</small></span></Link>
        ) : <Link className={styles.todayActionSecondary} href="/contact">
          <span aria-hidden="true">?</span><span><strong>Get delivery help</strong><small>Something missing or incorrect?</small></span>
        </Link>}
      </nav>
      <section className={styles.nextDeliveryPanel} aria-labelledby="coming-up-heading">
        <div className={styles.nextDeliveryHeading}><h2 id="coming-up-heading">Coming up · 7 days</h2><Link href="/account?section=schedule">View schedule →</Link></div>
        <ul className={styles.deliveryWeek}>
          {snapshot.week.map(day => <li key={day.date}>
            <button type="button" data-state={day.state} aria-label={`${formatCalendarDate(day.date)} · ${dayLabels[day.state]}`} onClick={() => setSelectedDate(day.date)}>
              <time dateTime={day.date}><span>{weekday.format(new Date(`${day.date}T00:00:00Z`))}</span><strong>{Number(day.date.slice(-2))}</strong></time>
              <span>{dayLabels[day.state]}</span>
            </button>
          </li>)}
        </ul>
        {!snapshot.upcoming.length ? <p className={styles.emptyCopy}>No upcoming deliveries found in the next 60 days.</p> : null}
      </section>
      {snapshot.paymentPending ? <section className={styles.nextDeliveryPanel} aria-labelledby="needs-attention-heading">
        <div className={styles.nextDeliveryHeading}><h2 id="needs-attention-heading">Needs your attention</h2></div>
        <Link className={styles.summaryRow} href="/account?section=orders&order_view=pending">
          <span><strong>Payment awaiting confirmation</strong><small>See payment status in Orders</small></span><span aria-hidden="true">→</span>
        </Link>
      </section> : null}
      {selectedDay ? <DeliveryDayDialog key={selectedDay.date} day={selectedDay} today={snapshot.date} stale={Boolean(error)} onClose={() => setSelectedDate(null)} /> : null}
    </> : null}
  </div>;
}
