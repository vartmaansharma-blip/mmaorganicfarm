"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  customerNotificationDestination, customerNotificationTime, notificationCategory,
  type CustomerNotification,
} from "@/lib/customer-notifications";
import { readCustomerNotifications } from "./actions";
import { NotificationIcon } from "./notification-icon";
import styles from "./notifications.module.css";

const notificationDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric",
});
const notificationClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const categoryIcon = { Delivery: "delivery", Payment: "payment", Plan: "plan", Account: "bell" } as const;

function groupByDay(items: CustomerNotification[]) {
  const days: { label: string; stacks: CustomerNotification[][] }[] = [];
  const deliveryStacks = new Map<string, CustomerNotification[]>();
  for (const item of items) {
    const label = notificationDay.format(new Date(item.created_at));
    let day = days.at(-1);
    if (day?.label !== label) {
      day = { label, stacks: [] };
      days.push(day);
      deliveryStacks.clear();
    }
    const deliveryId = notificationCategory(item.kind) === "Delivery" ? item.delivery_id : null;
    const existing = deliveryId ? deliveryStacks.get(deliveryId) : undefined;
    if (existing) {
      existing.push(item);
      continue;
    }
    const stack = [item];
    day.stacks.push(stack);
    if (deliveryId) deliveryStacks.set(deliveryId, stack);
  }
  return days;
}

function Notice({ item, busy, onOpen, compact = false }: {
  item: CustomerNotification;
  busy: boolean;
  onOpen: (item: CustomerNotification, href?: string) => void;
  compact?: boolean;
}) {
  const titleId = useId();
  const category = notificationCategory(item.kind);
  const destination = customerNotificationDestination(item);

  return <article className={styles.notice} data-unread={!item.read_at} aria-labelledby={titleId}>
    <span className={styles.noticeIcon}><NotificationIcon name={categoryIcon[category]} /></span>
    <div className={styles.noticeBody}>
      <div className={styles.noticeMeta}>
        <span>{category}</span>
        {!item.read_at ? <span className={styles.newLabel}>Unread</span> : null}
        <time dateTime={item.created_at}>
          {compact ? customerNotificationTime(item.created_at) : notificationClock.format(new Date(item.created_at))}
        </time>
      </div>
      <h3 id={titleId}>{item.title}</h3>
      <p>{item.message}</p>
    </div>
    {destination || !item.read_at ? <div className={styles.noticeActions}>
      {destination ? <button type="button" className={styles.openNotice} disabled={busy}
        aria-label={`${destination.label} →`} aria-describedby={titleId} title={destination.label}
        onClick={() => onOpen(item, destination.href)}>
        <NotificationIcon name="chevron" size={18} />
      </button> : null}
      {!item.read_at ? <button type="button" className={styles.readNotice} disabled={busy}
        aria-label={`Mark ${item.title} as read`} title="Mark as read" onClick={() => onOpen(item)}>
        <NotificationIcon name="check" size={18} />
      </button> : null}
    </div> : null}
  </article>;
}

export function NotificationList({ items, onRead, onNavigate, compact = false }: {
  items: CustomerNotification[];
  onRead: () => void;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function read(item: CustomerNotification, href?: string) {
    setBusy(true);
    setError("");
    try {
      if (!item.read_at) {
        const result = await readCustomerNotifications(item.id);
        if (result.error) {
          setError(result.error);
          return;
        }
        onRead();
      }
      if (href) {
        onNavigate?.();
        router.push(href);
      }
    } catch {
      setError("The read status couldn’t be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const onOpen = (item: CustomerNotification, href?: string) => void read(item, href);

  return <>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {compact ? <ul className={styles.list} data-compact>
      {items.map(item => <li key={item.id}><Notice item={item} busy={busy} onOpen={onOpen} compact /></li>)}
    </ul> : groupByDay(items).map(day => <section key={day.label} className={styles.dayGroup} aria-label={day.label}>
      <h2 className={styles.dayLabel}>{day.label}</h2>
      <ul className={styles.list}>
        {day.stacks.map(([latest, ...earlier]) => <li className={styles.stack} key={latest.id}>
          <Notice item={latest} busy={busy} onOpen={onOpen} />
          {earlier.length ? <details className={styles.related}>
            <summary>
              <span className={styles.expandLabel}>{earlier.length} earlier delivery {earlier.length === 1 ? "update" : "updates"}</span>
              <span className={styles.collapseLabel}>Hide earlier updates</span>
              {earlier.some(item => !item.read_at) ? <span className={styles.relatedUnread}>{earlier.filter(item => !item.read_at).length} unread</span> : null}
              <NotificationIcon name="chevron" size={16} />
            </summary>
            <ul className={styles.list}>
              {earlier.map(item => <li key={item.id}><Notice item={item} busy={busy} onOpen={onOpen} /></li>)}
            </ul>
          </details> : null}
        </li>)}
      </ul>
    </section>)}
  </>;
}
