"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  customerNotificationDestination, customerNotificationTime, notificationCategory,
  type CustomerNotification,
} from "@/lib/customer-notifications";
import { readCustomerNotifications } from "./actions";
import styles from "./notifications.module.css";

export function NotificationList({ items, onRead, onNavigate, compact = false }: {
  items: CustomerNotification[];
  onRead: () => void;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function read(item: CustomerNotification, href?: string) {
    setBusy(item.id);
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
      setBusy(null);
    }
  }

  return <>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <ul className={styles.list} data-compact={compact}>
      {items.map(item => {
        const category = notificationCategory(item.kind);
        const destination = customerNotificationDestination(item);
        return <li key={item.id} data-unread={!item.read_at}>
          <div className={styles.cardMeta}>
            <span><span aria-hidden="true">{category === "Payment" ? "₹" : category === "Delivery" ? "◇" : "○"}</span> {category}{item.read_at ? "" : " · Unread"}</span>
            <time dateTime={item.created_at}>{customerNotificationTime(item.created_at)}</time>
          </div>
          <h3>{item.title}</h3>
          <p>{item.message}</p>
          <div className={styles.cardActions}>
            {destination ? <button type="button" disabled={Boolean(busy)} onClick={() => void read(item, destination.href)}>{destination.label} →</button> : null}
            {!item.read_at ? <button type="button" disabled={Boolean(busy)} aria-label={`Mark ${item.title} as read`} onClick={() => void read(item)}>Mark as read</button> : null}
          </div>
        </li>;
      })}
    </ul>
  </>;
}
