"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { PullToRefresh } from "./pull-to-refresh";
import styles from "./farm-shell.module.css";
let fallbackPreference = false;
const preferenceKey = "mma-farm-sidebar-v2";
function readPreference() { try { return window.localStorage.getItem(preferenceKey) === "compact"; } catch { return fallbackPreference; } }
function subscribePreference(callback: () => void) {
  window.addEventListener("storage", callback); window.addEventListener("farm:navigation-preference", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("farm:navigation-preference", callback); };
}
export function FarmWorkspaceShell({ brand, navigation, staff, children, driver }: {
  brand: ReactNode; navigation: ReactNode; staff: ReactNode; children: ReactNode; driver: boolean;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const mobileButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const collapsed = useSyncExternalStore(subscribePreference, readPreference, () => false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (menuOpen && window.matchMedia("(max-width:999px)").matches) sidebar.current?.querySelector<HTMLAnchorElement>("a")?.focus();
  }, [menuOpen]);
  function closeMenu() { setMenuOpen(false); mobileButton.current?.focus(); }
  function toggleSidebar() {
    fallbackPreference = !collapsed;
    try { window.localStorage.setItem(preferenceKey, !collapsed ? "compact" : "expanded"); } catch { /* Storage is optional. */ }
    window.dispatchEvent(new Event("farm:navigation-preference"));
  }
  return (
    <div ref={surface} onKeyDown={event => {
      if (!menuOpen || !window.matchMedia("(max-width:999px)").matches) return;
      if (event.key === "Escape") { event.preventDefault(); closeMenu(); }
      if (event.key === "Tab") {
        const links = sidebar.current?.querySelectorAll<HTMLAnchorElement>("a[href]");
        const first = mobileButton.current, last = links?.[links.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }} className={`${styles.shell} ${driver ? styles.driverShell : ""} ${collapsed ? styles.collapsed : ""}`}>
      <a className={styles.skip} href="#farm-workspace">Skip to workspace</a>
      <header className={styles.topbar}>
        <div className={styles.topbarBrand}>
          <button type="button" className={styles.collapseButton} onClick={toggleSidebar} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} aria-controls="farm-sidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>
          </button>
          <button type="button" ref={mobileButton} className={styles.mobileToggle} onClick={() => setMenuOpen(value => !value)} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="farm-sidebar">☰</button>
          {brand}
        </div>
        <div className={styles.topbarContext}><span className={styles.workspaceLabel}>Your farm, in focus.</span>{staff}</div>
      </header>
      <PullToRefresh surface={surface} />
      {menuOpen ? <button type="button" className={styles.menuBackdrop} aria-label="Close navigation overlay" onClick={closeMenu} /> : null}
      <aside ref={sidebar} id="farm-sidebar" className={styles.sidebar} data-open={menuOpen || undefined} onClick={event => { if ((event.target as Element).closest("a")) setMenuOpen(false); }}>
        <span className={styles.navCaption}>FARM WORKSPACE</span>{navigation}
      </aside>
      <div id="farm-workspace" tabIndex={-1} className={styles.workspace}>{children}</div>
    </div>
  );
}
