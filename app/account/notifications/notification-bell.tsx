"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { loadCustomerNotifications } from "./actions";
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
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 6-3 6-3 8h18c0-2-3-2-3-8M10 20h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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
        <h2 id={`${id}-heading`}>Notifications</h2>
        <form method="dialog"><button type="submit" aria-label="Close notifications">Close</button></form>
      </div>
      {!result ? <p role="status">Loading notifications…</p> : result.status === "signed-out" ?
        <p><Link href="/sign-in?next=%2Faccount%2Fnotifications">Sign in to see your notifications</Link></p> :
        result.status === "error" ? <p role="alert">{result.message} <button type="button" onClick={() => void refresh("preview")}>Retry</button></p> :
          <>
            {result.items.length ? <NotificationList compact items={result.items} onRead={() => void refresh("preview")} onNavigate={() => dialog.current?.close()} /> :
              <p>You’re all caught up.</p>}
            <Link className={styles.viewAll} href="/account/notifications" onClick={() => dialog.current?.close()}>View all notifications →</Link>
          </>}
    </dialog>
  </>;
}
