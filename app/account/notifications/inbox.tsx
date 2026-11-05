"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CustomerNotification } from "@/lib/customer-notifications";
import { readCustomerNotifications } from "./actions";
import { NotificationList } from "./notification-list";
import styles from "./notifications.module.css";

export function NotificationInbox({ items, unread }: { items: CustomerNotification[]; unread: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function refresh() {
    router.refresh();
    window.dispatchEvent(new Event("mma:notifications-read"));
  }
  async function readAll() {
    setBusy(true);
    setError("");
    try {
      const result = await readCustomerNotifications(null);
      if (result.error) setError(result.error);
      else refresh();
    } catch {
      setError("The read status couldn’t be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return <>
    <div className={styles.inboxToolbar}>
      <span>{unread ? `${unread} unread` : "All read"}</span>
      {unread ? <button disabled={busy} type="button" onClick={() => void readAll()}>{busy ? "Saving…" : "Mark all as read"}</button> : null}
    </div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {items.length ? <NotificationList items={items} onRead={refresh} /> : null}
  </>;
}
