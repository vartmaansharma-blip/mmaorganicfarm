"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { DeliverySnapshot, DeliveryState } from "@/lib/customer-delivery";
import { productName } from "@/lib/delivery-calendar";
import { DeliveryScene } from "./delivery-scene";
import styles from "./account.module.css";
import vibrant from "./today-vibrant.module.css";

export const deliveryLabels: Record<DeliveryState, string> = {
  scheduled: "Scheduled for today", preparing: "Getting your delivery ready", out: "On the way to you",
  delivered: "Delivered today", attention: "Your delivery needs attention", paused: "Deliveries are paused",
  skipped: "Today’s delivery is skipped", cancelled: "Today’s delivery is cancelled", none: "A quiet day at your doorstep", setup: "Your delivery isn’t confirmed yet",
};
const descriptions: Record<DeliveryState, string> = {
  scheduled: "Confirmed on today’s schedule.",
  preparing: "Your farm favourites are being prepared.",
  out: "Out for delivery with the farm team.",
  delivered: "Recorded as delivered by the farm.",
  attention: "Check the outstanding quantities below.",
  paused: "No deliveries during your pause.",
  skipped: "No delivery expected for skipped items.",
  cancelled: "These delivery records are cancelled.",
  none: "Your next confirmed delivery appears below.",
  setup: "Payment or farm confirmation is still pending.",
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

export function TodayDelivery({ initial, address }: { initial: DeliverySnapshot | null; address?: string | null }) {
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
  return <div className={vibrant.today}>
    <Link className={vibrant.address} href="/account?section=settings">
      <span className={vibrant.addressIcon}><TodayIcon kind="pin" /></span>
      <span><strong>{address ? "Your delivery address" : "Add your delivery address"}</strong><small>{address ?? "Save your address in Settings"}</small></span>
      <span className={vibrant.addressAction}>Manage →</span>
    </Link>
    <section className={vibrant.deliveryCard} data-delivery-state={snapshot ? state : "error"} aria-labelledby="today-delivery-title">
      <div className={vibrant.hero}>
        <div className={vibrant.journey}>
          <div className={vibrant.deliveryTop}>
            <div><span className={vibrant.statusBadge}><span aria-hidden="true" />{snapshot ? visitLabels[state] : "Update unavailable"}</span><h2 id="today-delivery-title">{snapshot ? deliveryLabels[state] : "Delivery updates unavailable"}</h2><p className={vibrant.deliveryCopy}>{snapshot ? descriptions[state] : "Your schedule is safe. We’ll show the latest status when we reconnect."}</p></div>
            <button className={vibrant.refresh} type="button" onClick={() => void refresh(true)} disabled={busy} aria-label={busy ? "Refreshing delivery updates" : "Refresh delivery updates"}><TodayIcon kind="refresh" /></button>
          </div>
          <div className={vibrant.sceneArea}>{snapshot ? <DeliveryScene state={state} /> : <div className={vibrant.unavailable}><TodayIcon kind="help" /><span>Waiting for a farm update</span></div>}</div>
        </div>
        {snapshot ? <div className={vibrant.deliveryBag}>
          <div className={vibrant.bagHeading}><span className={vibrant.bagIcon}><TodayIcon kind="bag" /></span><h3>Your delivery</h3></div>
          {snapshot.visits.length ? snapshot.visits.map((visit, index) => <div className={vibrant.visit} key={visit.key}>
            {snapshot.visits.length > 1 ? <div className={vibrant.visitHeading}><strong>Delivery {index + 1}</strong><span>{visitLabels[visit.state]}</span></div> : null}
            {visit.items.map((item, i) => <div className={vibrant.deliveryItem} key={`${item.product_key}:${i}`}><span className={vibrant.productIcon}><TodayIcon kind={item.product_key === "milk" ? "bottle" : "bag"} /></span><div><strong>{item.quantity} <span>{item.unit}</span></strong><small>{productName(item.product_key)}</small></div>{item.fulfilled_quantity != null && ["attention", "delivered"].includes(state) ? <p className={vibrant.fulfilment}>{Number(item.fulfilled_quantity)} delivered · {Math.max(0, item.quantity - Number(item.fulfilled_quantity))} {item.unit} outstanding</p> : null}</div>)}
            {visit.followUpApproved && visit.followUp ? <p className={vibrant.followUp}>Approved follow-up: {formatCalendarDate(visit.followUp)}. Outstanding until delivered.</p> : visit.state === "attention" || visit.state === "skipped" ? <p className={vibrant.followUp}>See delivery history or contact the farm for a follow-up.</p> : null}
          </div>) : <p className={vibrant.emptyCopy}>{state === "setup" ? "Awaiting confirmation" : "No items due today"}</p>}
          {snapshot.visits.length && ["scheduled", "preparing", "out"].includes(state) ? <dl className={vibrant.tracking} aria-label="Delivery tracking availability"><div><dt><TodayIcon kind="clock" />Arrival time</dt><dd>No estimate yet</dd></div><div><dt><TodayIcon kind="pin" />Live location</dt><dd>Not shared yet</dd></div></dl> : null}
          {snapshot.completedAt ? <div className={vibrant.confirmed}><TodayIcon kind="check" /><span>Confirmed at <strong>{time(snapshot.completedAt)} IST</strong></span></div> : null}
        </div> : null}
      </div>
      {progress > 0 ? <ol className={vibrant.deliverySteps} aria-label="Delivery stages">{["Scheduled", "Preparing", "On the way", "Delivered"].map((label, i) => <li key={label} data-reached={i < progress} aria-current={i === progress - 1 ? "step" : undefined}><span className={vibrant.stepIcon}><TodayIcon kind={(["calendar", "bag", "scooter", "check"] as const)[i]} /></span><span>{label}</span></li>)}</ol> : null}
      {error ? <div className={vibrant.refreshError} role="status">{error}{snapshot ? <span>Showing the last successful update for {formatCalendarDate(snapshot.date)}.</span> : null}<Link href="/sign-in">Check sign-in</Link></div> : null}
      {snapshot ? <div className={vibrant.deliveryBottom}><span>{snapshot.completedAt ? `Confirmed at ${time(snapshot.completedAt)} IST` : snapshot.updatedAt ? `Farm update · ${time(snapshot.updatedAt)} IST` : `Schedule checked · ${time(snapshot.checkedAt)} IST`}</span><Link href={state === "setup" ? "/account?section=orders" : state === "attention" || state === "cancelled" ? "/contact" : "/account?section=deliveries"}>{state === "setup" ? "Orders & payment →" : state === "attention" || state === "cancelled" ? "Contact the farm ↗" : "Delivery details →"}</Link></div> : <div className={vibrant.deliveryBottom}><button className={vibrant.textAction} type="button" disabled={busy} onClick={() => void refresh(true)}>Try again →</button><Link href="/contact">Contact the farm ↗</Link></div>}
    </section>
    {snapshot ? <>
      <nav className={vibrant.actions} aria-label="Quick delivery actions">
        <Link className={vibrant.primaryAction} href={snapshot.confirmedPlans ? "/calendar" : snapshot.awaitingConfirmation ? "/account?section=orders" : "/milk"}><TodayIcon kind={snapshot.confirmedPlans ? "calendar" : "bag"} /><span><strong>{snapshot.confirmedPlans ? "Manage next delivery" : snapshot.awaitingConfirmation ? "Check your payment" : "Start a delivery plan"}</strong><small>{snapshot.confirmedPlans ? "Skip, adjust or pause future dates" : snapshot.awaitingConfirmation ? "Review pending orders" : "Choose your farm favourites"}</small></span><span aria-hidden="true">↗</span></Link>
        <Link className={vibrant.helpAction} href="/contact"><TodayIcon kind="help" /><span><strong>Get delivery help</strong><small>Talk to the farm</small></span><span aria-hidden="true">↗</span></Link>
      </nav>
      {snapshot.confirmedPlans ? <p className={vibrant.cutoff}><TodayIcon kind="lock" />Changes begin tomorrow. Today’s delivery needs farm assistance.</p> : null}
      <section className={vibrant.upcoming} aria-labelledby="coming-up-heading"><div className={vibrant.upcomingHeading}><h2 id="coming-up-heading">Coming up next</h2><Link href="/account?section=deliveries">View deliveries →</Link></div>{snapshot.upcoming.length ? <Link className={vibrant.nextDelivery} href={`/account?section=deliveries&date=${snapshot.upcoming[0].date}`}><span className={vibrant.nextIcon}><TodayIcon kind="calendar" /></span><span><strong>{formatCalendarDate(snapshot.upcoming[0].date)}</strong><small>{snapshot.upcoming[0].items.map(i => `${productName(i.product_key)} · ${i.quantity} ${i.unit}`).join(" · ")}</small></span><span aria-hidden="true">→</span></Link> : <p className={vibrant.emptyCopy}>No upcoming dates confirmed in the next 60 days.</p>}</section>
      <div className={vibrant.planLinks}><Link href="/account?section=deliveries">Your plans & delivery history →</Link><Link href="/account?section=orders">Orders & payments →</Link></div>
    </> : null}
  </div>;
}

type TodayIconKind = "pin" | "refresh" | "help" | "bag" | "bottle" | "clock" | "check" | "calendar" | "scooter" | "lock";
function TodayIcon({ kind }: { kind: TodayIconKind }) {
  const paths: Record<TodayIconKind, ReactNode> = {
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5 8a8 8 0 0 1 14-3l1 7M4 12l1 7a8 8 0 0 0 14-3" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3 2.4c-.5.3-.5 1-.5 1.6M12 16h.01" /></>,
    bag: <><path d="M4 7h16l-1 14H5L4 7Z" /><path d="M8 7V5a4 4 0 0 1 8 0v2m-7 6 2 2 4-4" /></>,
    bottle: <><path d="M9 2h6v5l4 5v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8l4-5V2Zm-1 0h8M6 13h12M6 18h12" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 10h18m-13 4h3m-3 3h3" /></>,
    scooter: <><circle cx="5" cy="18" r="3" /><circle cx="19" cy="18" r="3" /><path d="M5 15h5l2-7h4l3 7M9 18h5l3-4M14 4h3l2 5M2 11h5" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  };
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}
