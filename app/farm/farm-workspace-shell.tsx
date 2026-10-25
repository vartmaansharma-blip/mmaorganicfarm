"use client";

import { useState, type ReactNode } from "react";
import styles from "./farm-shell.module.css";

export function FarmWorkspaceShell({ brand, navigation, staff, children, driver }: {
  brand: ReactNode; navigation: ReactNode; staff: ReactNode; children: ReactNode; driver: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={`${styles.shell} ${driver ? styles.driverShell : ""} ${collapsed ? styles.collapsed : ""}`}>
      <a className={styles.skip} href="#farm-workspace">Skip to workspace</a>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          {brand}
          <button type="button" className={styles.collapseButton}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed} aria-controls="farm-navigation"
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => setCollapsed(value => !value)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" />
              <path d={collapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"} />
            </svg>
          </button>
        </div>
        {navigation}
        {staff}
      </aside>
      <div id="farm-workspace" tabIndex={-1} className={styles.workspace}>{children}</div>
    </div>
  );
}
