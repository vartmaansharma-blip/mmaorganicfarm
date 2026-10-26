"use client";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { PullToRefresh } from "./pull-to-refresh";
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
type Notice = { id: number; message: string; announce: boolean };
export function FarmWorkspaceShell({
  brand,
  navigation,
  staff,
  children,
  driver,
}: {
  brand: ReactNode;
  navigation: ReactNode;
  staff: ReactNode;
  children: ReactNode;
  driver: boolean;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const mobileButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const noticeNumber = useRef(0);
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
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
    const saved = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (
        !detail ||
        typeof detail.message !== "string" ||
        detail.message.length > 300
      )
        return;
      setNotice({
        id: ++noticeNumber.current,
        message: detail.message,
        announce: detail.announce === true,
      });
    };
    window.addEventListener("farm:saved", saved);
    return () => window.removeEventListener("farm:saved", saved);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);
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
      {notice ? (
        <div
          key={notice.id}
          className={styles.saveNotice}
          role={notice.announce ? "status" : undefined}
          aria-hidden={!notice.announce}
          data-farm-notice="saved"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path
              className={styles.noticeTick}
              pathLength="1"
              d="m7 12 3 3 7-7"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{notice.message}</span>
        </div>
      ) : null}
    </div>
  );
}
