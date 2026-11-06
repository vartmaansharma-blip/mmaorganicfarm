"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { customerNotificationTime, notificationCategory, type CustomerNotification } from "@/lib/customer-notifications";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { loadCustomerNotifications } from "./actions";
import { NotificationIcon } from "./notification-icon";
import { NotificationList } from "./notification-list";
import styles from "./notifications.module.css";

export function CustomerNotificationBell() {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; inList: boolean } | null>(null);
  const outsidePress = useRef(false);
  const dismissing = useRef<Animation | null>(null);
  const generation = useRef(0);
  const seen = useRef<CustomerNotification | null | undefined>(undefined);
  const [banner, setBanner] = useState<{ item: CustomerNotification; when: string } | null>(null);
  const [bannerFocused, setBannerFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadCustomerNotifications>> | null>(null);
  const [unread, setUnread] = useState(0);
  const refresh = useCallback(async (mode: "count" | "preview") => {
    const request = ++generation.current;
    try {
      const next = await loadCustomerNotifications(mode);
      if (request !== generation.current) return;
      if (mode === "preview") setResult(next);
      if (next.status === "ok") {
        setUnread(next.unread);
        const latest = next.items[0] ?? null;
        const previous = seen.current;
        if (latest && previous !== undefined && !latest.read_at && latest.id !== previous?.id
          && (!previous || latest.created_at >= previous.created_at) && !dialog.current?.open) {
          setBanner({ item: latest, when: Date.now() - Date.parse(latest.created_at) < 60_000 ? "Now" : customerNotificationTime(latest.created_at) });
        }
        seen.current = latest;
      }
      if (next.status === "signed-out") {
        setUnread(0);
        setBanner(null);
        seen.current = undefined;
      }
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
    const timer = window.setInterval(update, 20_000);
    window.addEventListener("focus", update);
    window.addEventListener("mma:notifications-read", update);
    window.addEventListener("mma:notifications-updated", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      generation.current += 1;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("mma:notifications-read", update);
      window.removeEventListener("mma:notifications-updated", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);

  useEffect(() => {
    if (!banner || bannerFocused) return;
    const timer = window.setTimeout(() => setBanner(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [banner, bannerFocused]);

  function openPreview() {
    setBanner(null);
    setBannerFocused(false);
    setResult(null);
    dialog.current?.showModal();
    setOpen(true);
    void refresh("preview");
  }

  function dismissWithSwipe() {
    const panel = dialog.current;
    if (!panel?.open || dismissing.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      panel.close();
      return;
    }
    const animation = panel.animate([
      { transform: "translateY(0)", opacity: 1 },
      { transform: "translateY(72px)", opacity: 0 },
    ], { duration: 190, easing: "cubic-bezier(.3,0,.5,1)", fill: "forwards" });
    dismissing.current = animation;
    void animation.finished.then(() => {
      if (dismissing.current === animation && panel.open) panel.close();
    }, () => {}).finally(() => {
      animation.cancel();
      if (dismissing.current === animation) dismissing.current = null;
    });
  }

  function outsidePanel(panel: HTMLDialogElement, x: number, y: number) {
    const rect = panel.getBoundingClientRect();
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
  }

  return <>
    <button ref={trigger} className={styles.bell} type="button"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      aria-controls={id} aria-expanded={open} aria-haspopup="dialog"
      onClick={openPreview}>
      <NotificationIcon name="bell" />
      {unread ? <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span> : null}
    </button>
    <dialog ref={dialog} id={id} className={styles.preview} aria-labelledby={`${id}-heading`}
      onClose={() => {
        swipe.current = null;
        outsidePress.current = false;
        dismissing.current?.cancel();
        dismissing.current = null;
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }}
      onPointerDown={event => {
        outsidePress.current = event.target === event.currentTarget
          && outsidePanel(event.currentTarget, event.clientX, event.clientY);
      }}
      onClick={event => {
        if (outsidePress.current && event.target === event.currentTarget
          && outsidePanel(event.currentTarget, event.clientX, event.clientY)) event.currentTarget.close();
        outsidePress.current = false;
      }}
      onTouchStart={event => {
        const touch = event.touches[0];
        const target = event.target as HTMLElement;
        const inList = Boolean(body.current?.contains(target));
        swipe.current = event.touches.length === 1 && event.target !== event.currentTarget
          && !target.closest("a, button, input, summary") && (!inList || (body.current?.scrollTop ?? 0) <= 0)
          ? { x: touch.clientX, y: touch.clientY, inList } : null;
      }}
      onTouchCancel={() => { swipe.current = null; }}
      onTouchEnd={event => {
        const start = swipe.current;
        swipe.current = null;
        if (!start || event.touches.length || (start.inList && (body.current?.scrollTop ?? 0) > 0)) return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        const deltaY = touch.clientY - start.y;
        if (deltaY >= 64 && deltaY > 1.5 * Math.abs(touch.clientX - start.x)) {
          if (event.cancelable) event.preventDefault();
          dismissWithSwipe();
        }
      }}>
      <div className={styles.previewGrip} aria-hidden="true" />
      <div className={styles.previewHeader}>
        <div>
          <p className={styles.kicker}>My M’ma inbox</p>
          <h2 id={`${id}-heading`}>Notifications</h2>
        </div>
        <form method="dialog"><button className={styles.close} type="submit" aria-label="Close notifications"><NotificationIcon name="close" /></button></form>
      </div>
      <div ref={body} className={styles.previewBody}>
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
    {banner ? createPortal(
      <div key={banner.item.id} className={styles.notificationBanner} aria-label="New notification"
        onFocus={() => setBannerFocused(true)}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setBannerFocused(false); }}>
        <button className={styles.bannerOpen} type="button" onClick={openPreview} aria-label={`Open notification: ${banner.item.title}`}>
          <span className={styles.bannerIcon}>
            <NotificationIcon name={notificationCategory(banner.item.kind) === "Payment" ? "payment" : "delivery"} />
          </span>
          <span className={styles.bannerContent} role="status">
            <span>M’ma Organic Farm <small>{banner.when}</small></span>
            <strong>{banner.item.title}</strong>
            <span className={styles.bannerMessage}>{banner.item.message}</span>
          </span>
        </button>
        <button className={styles.bannerDismiss} type="button" aria-label="Dismiss notification banner"
          onClick={() => { setBanner(null); setBannerFocused(false); }}>
          <NotificationIcon name="close" size={17} />
        </button>
      </div>, document.body,
    ) : null}
  </>;
}
