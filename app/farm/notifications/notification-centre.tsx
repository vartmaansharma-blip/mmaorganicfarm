"use client";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { dismissFarmNotifications, loadFarmNotifications } from "./actions";
import {
  notificationHref,
  notificationTime,
  type FarmNotification,
} from "@/lib/farm-notifications";
import type { FarmNotice } from "@/lib/farm-notices";
import styles from "./notifications.module.css";

export function FarmNotificationCentre({
  open,
  onOpenChange,
  management,
  notices,
  onLocalDismiss,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  management: boolean;
  notices: FarmNotice[];
  onLocalDismiss: (ids: string[]) => void;
}) {
  const button = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    request = useRef(0);
  const [items, setItems] = useState<FarmNotification[]>([]);
  const [loading, setLoading] = useState(management),
    [error, setError] = useState("");
  const [more, setMore] = useState(false),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async (before: string | null = null) => {
      if (!management) return;
      const generation = ++request.current;
      try {
        const result = await loadFarmNotifications(before);
        if (generation !== request.current) return;
        if (!result.data) {
          setError(result.error ?? "Notifications couldn’t be loaded.");
          return;
        }
        setError("");
        setMore(result.data.items.length > 30);
        const rows = result.data.items.slice(0, 30);
        setItems((old) =>
          before
            ? [
                ...old,
                ...rows.filter(
                  (row) => !old.some((item) => item.id === row.id),
                ),
              ]
            : rows,
        );
      } catch {
        if (generation === request.current)
          setError("Notifications couldn’t be loaded. Try again.");
      } finally {
        if (generation === request.current) setLoading(false);
      }
    },
    [management],
  );
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(frame);
  }, [load, open]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void load();
    };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("farm:saved", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("farm:saved", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const close = useCallback(() => {
    onOpenChange(false);
    requestAnimationFrame(() => button.current?.focus());
  }, [onOpenChange]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key === "Tab") {
        const controls = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),a[href],summary",
          ) ?? [],
        ).filter((el) => el.getClientRects().length > 0);
        if (!controls.length) return;
        const index = controls.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey
          ? index <= 0
            ? controls.length - 1
            : index - 1
          : (index + 1) % controls.length;
        event.preventDefault();
        controls[next]?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", keyboard);
    };
  }, [open, close]);
  async function dismiss(id: string) {
    if (busy) return;
    if (id.startsWith("local:")) {
      onLocalDismiss([id.slice(6)]);
      return;
    }
    setBusy(true);
    ++request.current;
    try {
      const result = await dismissFarmNotifications([id]);
      if (!result.data) {
        setError(result.error ?? "The notification couldn’t be dismissed.");
        return;
      }
      setItems((old) => old.filter((item) => item.id !== id));
      setError("");
    } catch {
      setError("The notification couldn’t be dismissed. Try again.");
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }
  const visibleItems: FarmNotification[] = [
    ...notices.map((item) => ({
      id: `local:${item.id}`,
      category: "Your actions",
      severity:
        item.level === "error" ? ("attention" as const) : ("info" as const),
      title: item.level === "error" ? "Action needs attention" : "Update saved",
      message: item.message,
      href: item.href,
      created_at: item.created_at,
    })),
    ...items,
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const groups = new Map<string, FarmNotification[]>();
  for (const item of visibleItems) {
    const group = groups.get(item.category) ?? [];
    group.push(item);
    groups.set(item.category, group);
  }
  const card = (item: FarmNotification) => (
    <article
      key={item.id}
      className={styles.card}
      data-attention={item.severity === "attention" || undefined}
    >
      <time className={styles.cardTime} dateTime={item.created_at}>
        {notificationTime(item.created_at)}
      </time>
      <button
        className={styles.dismiss}
        disabled={busy}
        aria-label={`Dismiss ${item.title}`}
        onClick={() => void dismiss(item.id)}
      >
        ×
      </button>
      <Link href={notificationHref(item.href)} prefetch={false} onClick={close}>
        <h3>{item.title}</h3>
        <p>{item.message}</p>
      </Link>
    </article>
  );
  return (
    <>
      <button
        ref={button}
        className={styles.bell}
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="farm-notifications"
        onClick={() => onOpenChange(!open)}
      >
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div className={styles.overlay}>
              <button
                className={styles.backdrop}
                tabIndex={-1}
                aria-label="Close notifications overlay"
                onClick={close}
              />
              <div
                ref={panel}
                id="farm-notifications"
                role="dialog"
                aria-modal="true"
                aria-labelledby="farm-notifications-title"
                className={styles.panel}
              >
                <header className={styles.heading}>
                  <div>
                    <h2 id="farm-notifications-title">Notifications</h2>
                    <p>
                      {management ? "Around the farm" : "Your recent activity"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close notifications"
                    onClick={close}
                  >
                    ×
                  </button>
                </header>
                <div className={styles.body} aria-busy={loading || busy}>
                  {error ? (
                    <div className={styles.error} role="alert">
                      <p>{error}</p>
                      <button onClick={() => void load()}>Try again</button>
                    </div>
                  ) : null}
                  {loading && !visibleItems.length ? (
                    <p role="status" className={styles.empty}>
                      Gathering farm updates…
                    </p>
                  ) : null}
                  {!loading && !error && !visibleItems.length ? (
                    <div className={styles.empty}>
                      <span aria-hidden="true">✓</span>
                      <h3>All quiet for now</h3>
                      <p>Recent farm updates will appear here.</p>
                    </div>
                  ) : null}
                  {[...groups].map(([category, rows]) => (
                    <section
                      className={styles.group}
                      key={category}
                      aria-label={category}
                    >
                      {rows.length > 1 ? (
                        <details className={styles.stack}>
                          <summary>
                            <span className={styles.stackSummary}>
                              <small>{category}</small>
                              <strong>{rows[0].title}</strong>
                              <em>{rows[0].message}</em>
                              <time dateTime={rows[0].created_at}>
                                {notificationTime(rows[0].created_at)}
                              </time>
                            </span>
                            <span>
                              {rows.length}
                              <i aria-hidden="true">⌄</i>
                            </span>
                          </summary>
                          <div>{rows.map(card)}</div>
                        </details>
                      ) : (
                        <>
                          <h3 className={styles.groupTitle}>{category}</h3>
                          {card(rows[0])}
                        </>
                      )}
                    </section>
                  ))}
                  {more ? (
                    <button
                      className={styles.older}
                      disabled={loading || busy}
                      onClick={() => {
                        setLoading(true);
                        void load(items.at(-1)?.id ?? null);
                      }}
                    >
                      {loading ? "Loading…" : "Earlier notifications"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
