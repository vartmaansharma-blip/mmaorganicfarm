"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { loadCustomerNotifications } from "./actions";
import { NotificationIcon } from "./notification-icon";
import { NotificationList } from "./notification-list";
import styles from "./notifications.module.css";

export function CustomerNotificationBell() {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadCustomerNotifications>> | null>(null);
  const [unread, setUnread] = useState(0);
  const refresh = useCallback(async (mode: "count" | "preview") => {
    const request = ++generation.current;
    try {
      const next = await loadCustomerNotifications(mode);
      if (request !== generation.current) return;
      if (mode === "preview") setResult(next);
      if (next.status === "ok") setUnread(next.unread);
      if (next.status === "signed-out") setUnread(0);
    } catch {
      if (request === generation.current && mode === "preview") {
        setResult({ status: "error", message: "Notifications couldn’t be loaded. Try again." });
      }
    }
  }, []);

  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible") void refresh(dialog.current?.open ? "preview" : "count");
    };
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    window.addEventListener("mma:notifications-read", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      generation.current += 1;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("mma:notifications-read", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);

  return <>
    <button ref={trigger} className={styles.bell} type="button"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      aria-controls={id} aria-expanded={open} aria-haspopup="dialog"
      onClick={() => {
        setResult(null);
        dialog.current?.showModal();
        setOpen(true);
        void refresh("preview");
      }}>
      <NotificationIcon name="bell" />
      {unread ? <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span> : null}
    </button>
    <dialog ref={dialog} id={id} className={styles.preview} aria-labelledby={`${id}-heading`}
      onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close();
      }}>
      <div className={styles.previewHeader}>
        <div>
          <p className={styles.kicker}>My M’ma inbox</p>
          <h2 id={`${id}-heading`}>Notifications</h2>
        </div>
        <form method="dialog"><button className={styles.close} type="submit" aria-label="Close notifications"><NotificationIcon name="close" /></button></form>
      </div>
      <div className={styles.previewBody}>
        {!result ? <p className={styles.previewStatus} role="status">Loading notifications…</p> :
          result.status === "signed-out" ? <div className={styles.previewStatus}>
            <p>Your delivery and payment updates are in My M’ma.</p>
            <Link href="/sign-in?next=%2Faccount%2Fnotifications">Sign in to see your notifications</Link>
          </div> : result.status === "error" ? <div className={styles.error} role="alert">
            <p>{result.message}</p><button type="button" onClick={() => void refresh("preview")}>Retry</button>
          </div> : result.items.length ? <NotificationList compact items={result.items} onRead={() => void refresh("preview")} onNavigate={() => dialog.current?.close()} /> :
            <p className={styles.previewStatus}>You’re all caught up.</p>}
      </div>
      {result?.status === "ok" ? <div className={styles.previewFooter}>
        <span>{result.unread ? `${result.unread} unread` : "All read"}</span>
        <Link className={styles.viewAll} href="/account/notifications" onClick={() => dialog.current?.close()}>
          View all notifications <NotificationIcon name="chevron" size={16} />
        </Link>
      </div> : null}
    </dialog>
  </>;
}
