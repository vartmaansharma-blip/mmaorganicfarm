"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DeliverySnapshot, DeliveryState } from "@/lib/customer-delivery";
import { productName } from "@/lib/delivery-calendar";
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

export function TodayDelivery({ initial }: { initial: DeliverySnapshot | null }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [error, setError] = useState(initial ? "" : "We couldn’t load your delivery updates. Please try again.");
  const [busy, setBusy] = useState(false);
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
  return <div className={styles.todaySurface}>
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
        <div className={styles.deliveryBottom}><span>{snapshot.completedAt ? `Confirmed at ${time(snapshot.completedAt)} IST` : snapshot.updatedAt ? `Farm update · ${time(snapshot.updatedAt)} IST` : `Schedule checked · ${time(snapshot.checkedAt)} IST`}</span><Link href={state === "setup" ? "/account?section=orders" : state === "attention" || state === "cancelled" ? "/contact" : "/account?section=deliveries"}>{state === "setup" ? "Orders & payment →" : state === "attention" || state === "cancelled" ? "Contact the farm ↗" : "Delivery details →"}</Link></div>
      </> : <div className={styles.deliveryBottom}><button className={styles.textAction} type="button" disabled={busy} onClick={() => void refresh(true)}>Try again →</button><a href="/contact">Contact the farm ↗</a></div>}
    </section>
    {snapshot ? <div className={styles.todayGrid}>
      <section className={styles.quietPanel} aria-labelledby="coming-up-heading"><h2 id="coming-up-heading">Coming up</h2>{snapshot.upcoming.length ? snapshot.upcoming.map(day => <Link className={styles.summaryRow} href={`/account?section=deliveries&date=${day.date}`} key={day.date}><span><strong>{formatCalendarDate(day.date)}</strong><small>{day.items.map(i => `${productName(i.product_key)} · ${i.quantity} ${i.unit}`).join(" · ")}</small></span><span aria-hidden="true">↗</span></Link>) : <p className={styles.emptyCopy}>No upcoming dates confirmed in the next 60 days.</p>}<Link className={styles.textAction} href="/account?section=deliveries">View deliveries →</Link></section>
      <section className={styles.quietPanel} aria-labelledby="your-plan-heading"><h2 id="your-plan-heading">Your plans</h2><Link className={styles.summaryRow} href="/account?section=deliveries"><span><strong>{snapshot.confirmedPlans ? `${snapshot.confirmedPlans} confirmed ${snapshot.confirmedPlans === 1 ? "plan" : "plans"}` : "A routine that fits your day"}</strong><small>{snapshot.awaitingConfirmation ? "An order or plan still needs confirmation." : snapshot.confirmedPlans ? "Your schedules, changes and delivery history." : "Choose fresh milk and farm favourites."}</small></span><span aria-hidden="true">↗</span></Link><Link className={styles.summaryRow} href="/account?section=orders"><span><strong>Orders & payments</strong><small>Receipts, one-time orders and payment status.</small></span><span aria-hidden="true">↗</span></Link><Link className={styles.textAction} href="/milk">Explore the farm shop →</Link></section>
    </div> : null}
  </div>;
}
