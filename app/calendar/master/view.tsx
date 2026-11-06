import type { SupabaseClient } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { addCalendarDays, formatCalendarDate, nextDeliveryDateInIndia, productName, weekdayFromYmd } from "@/lib/delivery-calendar";
import {
  activeWeeklyPattern, calendarMonthDays, resolveMasterDelivery, scheduleProducts, scheduleWeekdays, weeklyQuantityOnDate,
  type DateException, type DeliverySnapshot, type PatternVersion, type ProductQuantities,
} from "@/lib/master-delivery-schedule";
import { firstMonthEnds } from "@/lib/delivery-pricing";
import { masterMonthRoutines, serializeRoutines } from "@/lib/monthly-schedule";
import { validShopDate } from "@/lib/shop-draft";
import { PageNavigationControls } from "@/app/components/page-navigation-controls";
import { DateSchedule, WeeklySchedule } from "./editor";
import styles from "./master.module.css";

type MasterData = { revision: number; versions: PatternVersion[]; exceptions: DateException[] };
const statuses: Record<DeliverySnapshot["state"] | "projected", string> = {
  paid: "Paid and confirmed", preparing: "Preparing", out: "Out for delivery",
  completed: "Completed", resolved: "Delivery recorded", covered: "No confirmed items for this date", projected: "Planned preference",
};

function monthStep(month: string, change: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + change);
  return date.toISOString().slice(0, 7);
}

function totalItems(items: { product_key: string; quantity: number | string }[]): ProductQuantities {
  const quantities: ProductQuantities = { milk: 0, paneer: 0, ghee: 0 };
  for (const item of items) {
    for (const id of scheduleProducts) if (id === item.product_key) quantities[id] += Number(item.quantity);
  }
  return quantities;
}

export async function MasterCalendarView({ client, userId, params }: {
  client: SupabaseClient;
  userId: string;
  params: { view?: string; month?: string; date?: string; message?: string; error?: string };
}) {
  const minimum = nextDeliveryDateInIndia();
  const currentMonth = minimum.slice(0, 7);
  const earliest = monthStep(currentMonth, -11);
  const latest = monthStep(currentMonth, 11);
  const month = typeof params.month === "string" && validShopDate(`${params.month}-01`)
    && params.month >= earliest && params.month <= latest ? params.month : currentMonth;
  const view = params.view === "weekly" ? "weekly" : "monthly";
  const dates = view === "weekly"
    ? Array.from({ length: 14 }, (_, index) => addCalendarDays(minimum, index))
    : calendarMonthDays(month);
  const from = dates[0];
  const through = view === "weekly" ? addCalendarDays(firstMonthEnds(minimum), -1) : dates.at(-1)!;
  const href = (mode: string, targetMonth: string, date?: string) =>
    `/calendar?view=${mode}&month=${targetMonth}${date ? `&date=${date}` : ""}`;
  const active = params.date && dates.includes(params.date) ? params.date : dates.includes(minimum) ? minimum : from;
  const monthAnchor = active.slice(0, 7) === month ? active : `${month}-01`;

  const [prefs, plans, daily, oneTime] = await Promise.all([
    client.rpc("read_master_delivery_schedule", { p_from: from, p_through: through }),
    client.from("delivery_plans")
      .select("id,billing_model,start_date,period_end_exclusive,status,scheduled_delivery_items(delivery_date,product_key,quantity)")
      .eq("user_id", userId).eq("is_test", false).lte("start_date", through)
      .in("status", ["active", "paused", "completed"]),
    client.from("daily_deliveries")
      .select("id,plan_id,order_id,delivery_date,status,delivery_confirmed,daily_delivery_items(product_key,quantity,fulfilled_quantity)")
      .eq("user_id", userId).eq("is_test", false).gte("delivery_date", from).lte("delivery_date", through).neq("status", "cancelled"),
    client.from("orders").select("id,start_date,order_items(product_key,quantity)")
      .eq("user_id", userId).eq("is_test", false).eq("purchase_mode", "once").eq("status", "paid")
      .gte("start_date", from).lte("start_date", through),
  ]);
  const data = prefs.error ? null : prefs.data as MasterData | null;
  const unavailable = !data || plans.error || daily.error || oneTime.error;
  const snapshots = new Map<string, DeliverySnapshot>();
  const locked = new Set<string>();
  if (!unavailable) for (const date of dates) {
    const paid = (plans.data ?? []).filter(plan => plan.billing_model === "calendar_month"
      && date >= plan.start_date && date < plan.period_end_exclusive);
    const legacy = (plans.data ?? []).some(plan => plan.billing_model === "milk_credits"
      && ["active", "paused"].includes(plan.status) && date >= plan.start_date);
    const paidOnce = (oneTime.data ?? []).filter(order => order.start_date === date);
    const deliveries = (daily.data ?? []).filter(delivery => delivery.delivery_date === date);
    if (paid.length || legacy || paidOnce.length || deliveries.length) locked.add(date);
    const unprepared = paid.filter(plan => !deliveries.some(delivery => delivery.plan_id === plan.id))
      .flatMap(plan => plan.scheduled_delivery_items.filter(item => item.delivery_date === date));
    const unpreparedOnce = paidOnce.filter(order => !deliveries.some(delivery => delivery.order_id === order.id))
      .flatMap(order => order.order_items);
    const prepared = deliveries.flatMap(delivery => delivery.daily_delivery_items.map(item => ({
      product_key: item.product_key,
      quantity: item.fulfilled_quantity ?? item.quantity,
    })));
    if (!unprepared.length && !unpreparedOnce.length && !deliveries.length) {
      if (locked.has(date)) snapshots.set(date, { date, state: "covered", quantities: { milk: 0, paneer: 0, ghee: 0 } });
      continue;
    }
    const state = deliveries.some(d => d.status === "out_for_delivery") ? "out"
      : deliveries.some(d => d.status === "ready") ? "preparing"
      : deliveries.length && !unprepared.length && !unpreparedOnce.length && deliveries.every(d => d.delivery_confirmed) ? "completed"
      : deliveries.length && !unprepared.length && !unpreparedOnce.length && deliveries.every(d => ["delivered", "failed", "skipped"].includes(d.status)) ? "resolved"
      : "paid";
    snapshots.set(date, { date, state, quantities: totalItems([...unprepared, ...unpreparedOnce, ...prepared]) });
  }
  const hasCurrentPlan = plans.data?.some(plan => plan.status === "active" || plan.status === "paused");
  const purchaseRules = view === "weekly" && !unavailable && data && !hasCurrentPlan
    ? masterMonthRoutines(minimum, data.versions, data.exceptions) : null;
  const purchaseUrl = purchaseRules ? `/order?${new URLSearchParams({
    purchase: "plan", start: minimum, bottle: purchaseRules.some(rule => rule.id === "milk") ? "return" : "none",
    routine: serializeRoutines(purchaseRules, minimum),
  })}` : null;
  const selected = data ? resolveMasterDelivery(active, data.versions, data.exceptions, snapshots.get(active)) : null;
  const defaultPattern = data && activeWeeklyPattern(data.versions, active);
  const defaults = defaultPattern ? {
    milk: weeklyQuantityOnDate(defaultPattern.milk, active),
    paneer: weeklyQuantityOnDate(defaultPattern.paneer, active),
    ghee: weeklyQuantityOnDate(defaultPattern.ghee, active),
  } : null;

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/account"><Image src="/mma-logo.png" alt="My M’ma" width={58} height={48} /></Link>
      <div className="customer-header-actions"><Link href="/account?section=schedule">My M’ma</Link><PageNavigationControls /></div>
    </header>
    <div className={styles.content}>
      <div className={styles.title}>
        <p>MY M’MA · DELIVERIES</p>
        <h1>Master Delivery Calendar</h1>
        <p>Your regular week and your date changes, together.</p>
      </div>
      <nav className={styles.views} aria-label="Schedule views">
        <Link href={href("weekly", currentMonth)} aria-current={view === "weekly" ? "page" : undefined}>Weekly Schedule</Link>
        <Link href={href("monthly", month, monthAnchor)} aria-current={view === "monthly" ? "page" : undefined}>Monthly Calendar</Link>
        <Link className={styles.paidLink} href="/calendar">Paid deliveries <span aria-hidden="true">↗</span></Link>
      </nav>
      {params.error ? <p role="alert" className={styles.notice}>{params.error}</p> : null}
      {params.message ? <p role="status" className={styles.notice}>{params.message}</p> : null}
      {unavailable || !data || !selected || !defaults ? <section className={styles.editor}>
        <h2>Schedule preferences are unavailable</h2><p>You can still open paid deliveries and see your existing orders.</p>
      </section> : view === "weekly" ? <WeeklySchedule
        key={data.revision} pattern={activeWeeklyPattern(data.versions, minimum)} from={minimum} dates={dates}
        versions={data.versions} exceptions={data.exceptions} locked={[...locked]} revision={data.revision} month={month}
      /> : <>
        <section className={styles.editor} aria-label="Monthly Calendar">
          <div className={styles.monthHeading}>
            {month > earliest ? <Link aria-label="Previous month" href={href("monthly", monthStep(month, -1))}>‹</Link> : <span />}
            <h2>{new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${from}T00:00:00Z`))}</h2>
            {month < latest ? <Link aria-label="Next month" href={href("monthly", monthStep(month, 1))}>›</Link> : <span />}
          </div>
          <div className={styles.monthGrid}>
            {scheduleWeekdays.map(day => <abbr title={day} key={day}>{day.slice(0, 3)}</abbr>)}
            {Array.from({ length: weekdayFromYmd(from) - 1 }, (_, index) => <span aria-hidden="true" key={`pad-${index}`} />)}
            {dates.map(date => {
              const day = resolveMasterDelivery(date, data.versions, data.exceptions, snapshots.get(date));
              const products = scheduleProducts.filter(id => day.quantities[id] > 0);
              const exception = Object.keys(day.overrides).length > 0;
              return <Link key={date} href={href("monthly", month, date)}
                aria-label={`${formatCalendarDate(date)}${products.length ? `, ${products.map(id => `${productName(id)} ${day.quantities[id]}`).join(", ")}` : ", no products"}${exception ? ", date exception" : ""}`}
                aria-current={date === active ? "date" : undefined} data-state={day.state}>
                <strong>{Number(date.slice(-2))}</strong>
                <span className={styles.markers} aria-hidden="true">{products.map(id => <i key={id} data-product={id} />)}{exception ? <b>✦</b> : null}</span>
              </Link>;
            })}
          </div>
          <div className={styles.legend}><span>● Milk</span><span>● Paneer</span><span>● Ghee</span><span>✦ Date exception</span></div>
          <div className={styles.daySummary}>
            <h3>{formatCalendarDate(active)}</h3>
            <p>{statuses[selected.state]}</p>
            {active < minimum || locked.has(active) ? scheduleProducts.filter(id => selected.quantities[id] > 0).map(id =>
              <span key={id}>{productName(id)} <strong>{selected.quantities[id]} {id === "milk" ? "L" : "packs"}</strong></span>) : null}
          </div>
          {active >= minimum && !locked.has(active) ? <DateSchedule key={`${active}:${data.revision}`}
            date={active} defaults={defaults} overrides={selected.overrides} month={month} revision={data.revision}
          /> : null}
        </section>
        {locked.has(active) ? <Link className={styles.secondary} href={`/calendar?date=${active}`}>Open paid delivery controls</Link> : null}
      </>}
      {purchaseUrl ? <div className={styles.purchase}>
        <p>Review the dates and prices for one prepaid month.</p>
        <Link className={styles.primary} href={purchaseUrl} prefetch={false}>Continue to delivery details</Link>
      </div> : null}
      <p className={styles.note}>Planned preferences become deliveries once a scheduled order is paid and confirmed.</p>
    </div>
  </main>;
}
