"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { FarmNotificationCentre } from "./notifications/notification-centre";
import { PullToRefresh } from "./pull-to-refresh";
import { storedFarmNotices, type FarmNotice } from "@/lib/farm-notices";
import styles from "./farm-shell.module.css";
let fallbackPreference = false;
const preferenceKey = "mma-farm-sidebar-v2";
function readPreference() {
  try {
    return window.localStorage.getItem(preferenceKey) === "compact";
  } catch {
    return fallbackPreference;
  }
}
function subscribePreference(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("farm:navigation-preference", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("farm:navigation-preference", callback);
  };
}
function subscribeViewport(callback: () => void) {
  const query = window.matchMedia("(max-width:999px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function readViewport() {
  return window.matchMedia("(max-width:999px)").matches;
}
export function FarmWorkspaceShell({
  brand,
  navigation,
  staff,
  children,
  driver,
  management = false,
  userId,
}: {
  brand: ReactNode;
  navigation: ReactNode;
  staff: ReactNode;
  children: ReactNode;
  driver: boolean;
  management?: boolean;
  userId: string;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const mobileButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const toastTimers = useRef(new Map<string, number>());
  const collapsed = useSyncExternalStore(
    subscribePreference,
    readPreference,
    () => false,
  );
  const mobile = useSyncExternalStore(
    subscribeViewport,
    readViewport,
    () => false,
  );
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [notices, setNotices] = useState<FarmNotice[]>([]);
  const [toasts, setToasts] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);
  const notificationStorageKey = `mma-farm-notices-v1:${userId}`;
  const toggleNotifications = useCallback((open: boolean) => {
    setNotificationsOpen(open);
    if (open) {
      setMenuOpen(false);
      setToasts([]);
    }
  }, []);
  const modalOpen = mobile && menuOpen;
  useEffect(() => {
    const scroll = () => setScrolled(window.scrollY > 12);
    scroll();
    window.addEventListener("scroll", scroll, { passive: true });
    const query = window.matchMedia("(max-width:999px)");
    const resize = () => {
      if (!query.matches) setMenuOpen(false);
    };
    query.addEventListener("change", resize);
    return () => {
      window.removeEventListener("scroll", scroll);
      query.removeEventListener("change", resize);
    };
  }, []);
  useEffect(() => {
    if (!modalOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [modalOpen]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored = storedFarmNotices(
          window.sessionStorage.getItem(notificationStorageKey),
        );
        setNotices((current) =>
          [
            ...stored.filter(
              (item) => !current.some((notice) => notice.id === item.id),
            ),
            ...current,
          ].slice(-50),
        );
      } catch {
        /* Storage is optional. */
      }
      setRestored(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [notificationStorageKey]);
  useEffect(() => {
    if (!restored) return;
    try {
      window.sessionStorage.setItem(
        notificationStorageKey,
        JSON.stringify(notices),
      );
    } catch {
      /* Notices still work without storage. */
    }
  }, [notices, restored, notificationStorageKey]);
  useEffect(() => {
    const timers = toastTimers.current;
    const received = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (
        !detail ||
        typeof detail.message !== "string" ||
        !detail.message.trim() ||
        detail.message.length > 1000
      )
        return;
      const item: FarmNotice = {
        id: crypto.randomUUID(),
        message: detail.message,
        level: detail.level === "error" ? "error" : "success",
        href: String(detail.href ?? "/farm"),
        created_at: new Date().toISOString(),
        announce: detail.announce === true,
      };
      setNotices((old) => [...old, item].slice(-50));
      setToasts((old) => [...old, item.id].slice(-3));
      timers.set(
        item.id,
        window.setTimeout(
          () => {
            setToasts((old) => old.filter((id) => id !== item.id));
            timers.delete(item.id);
          },
          item.level === "error" ? 10000 : 6000,
        ),
      );
    };
    window.addEventListener("farm:notice", received);
    return () => {
      window.removeEventListener("farm:notice", received);
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);
  function closeMenu() {
    setMenuOpen(false);
    mobileButton.current?.focus();
  }
  function toggleSidebar() {
    fallbackPreference = !collapsed;
    try {
      window.localStorage.setItem(
        preferenceKey,
        !collapsed ? "compact" : "expanded",
      );
    } catch {
      /* Storage is optional. */
    }
    window.dispatchEvent(new Event("farm:navigation-preference"));
  }
  return (
    <div
      inert={notificationsOpen}
      ref={surface}
      onKeyDown={(event) => {
        if (!modalOpen) return;
        if (event.key === "Escape") {
          event.preventDefault();
          closeMenu();
        }
        if (event.key === "Tab") {
          const controls = Array.from(
            sidebar.current?.querySelectorAll<HTMLElement>(
              "a[href],button:not(:disabled)",
            ) ?? [],
          );
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
      }}
      className={`${styles.shell} ${driver ? styles.driverShell : ""} ${collapsed ? styles.collapsed : ""}`}
    >
      <a className={styles.skip} href="#farm-workspace">
        Skip to workspace
      </a>
      <header
        className={styles.topbar}
        data-scrolled={scrolled || undefined}
        onClick={(event) => {
          if (modalOpen && (event.target as Element).closest("a")) closeMenu();
        }}
      >
        <div className={styles.topbarBrand}>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            aria-controls="farm-sidebar"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M9 4v16" />
            </svg>
          </button>
          <button
            type="button"
            ref={mobileButton}
            className={styles.mobileToggle}
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="farm-sidebar"
          >
            <span
              className={styles.menuGlyph}
              data-open={menuOpen || undefined}
              aria-hidden="true"
            >
              <i />
              <i />
            </span>
          </button>
          {brand}
        </div>
        <div className={styles.topbarContext}>
          <span className={styles.workspaceLabel}>Your farm, in focus.</span>
          <FarmNotificationCentre
            management={management}
            notices={notices}
            onLocalDismiss={(ids) =>
              setNotices((old) => old.filter((item) => !ids.includes(item.id)))
            }
            open={notificationsOpen}
            onOpenChange={toggleNotifications}
          />
          {staff}
        </div>
      </header>
      <PullToRefresh surface={surface} />
      <button
        type="button"
        tabIndex={-1}
        className={styles.menuBackdrop}
        data-open={modalOpen || undefined}
        aria-hidden={!modalOpen}
        disabled={!modalOpen}
        aria-label="Close navigation overlay"
        onClick={closeMenu}
      />
      <aside
        ref={sidebar}
        id="farm-sidebar"
        className={styles.sidebar}
        data-open={modalOpen || undefined}
        inert={mobile && !menuOpen}
        role={modalOpen ? "dialog" : undefined}
        aria-modal={modalOpen || undefined}
        aria-label={modalOpen ? "Farm navigation" : undefined}
        onClick={(event) => {
          if ((event.target as Element).closest("a")) closeMenu();
        }}
      >
        <div className={styles.sidebarHeading}>
          <span className={styles.navCaption}>FARM WORKSPACE</span>
          <button
            className={styles.menuClose}
            type="button"
            aria-label="Close menu"
            onClick={closeMenu}
          >
            ×
          </button>
        </div>
        {navigation}
      </aside>
      <div
        id="farm-workspace"
        tabIndex={-1}
        inert={modalOpen}
        className={styles.workspace}
      >
        {children}
      </div>
      <div className={styles.noticeStack} aria-label="Recent action notices">
        {notices
          .filter((item) => toasts.includes(item.id))
          .slice()
          .reverse()
          .map((notice) => (
            <div
              key={notice.id}
              className={styles.actionNotice}
              data-level={notice.level}
              data-farm-notice={notice.level === "error" ? "error" : "saved"}
            >
              <span className={styles.noticeIcon} aria-hidden="true">
                {notice.level === "error" ? "!" : "✓"}
              </span>
              <div
                role={
                  notice.announce
                    ? notice.level === "error"
                      ? "alert"
                      : "status"
                    : undefined
                }
              >
                <strong>
                  {notice.level === "error"
                    ? "Action needs attention"
                    : "Update saved"}
                </strong>
                <p>{notice.message}</p>
                <button type="button" onClick={() => toggleNotifications(true)}>
                  View notifications
                </button>
              </div>
              <button
                className={styles.dismissNotice}
                type="button"
                aria-label="Dismiss action notice"
                onClick={() =>
                  setToasts((old) => old.filter((id) => id !== notice.id))
                }
              >
                ×
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
