"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { FarmStaffRole } from "@/lib/farm-dashboard";
import styles from "./farm-shell.module.css";
const groups = [
  {
    label: "Workday",
    items: [
      ["Overview", "/farm"],
      ["Routes", "/farm/routes"],
      ["Deliveries", "/farm/delivery-sheet"],
      ["Inbox", "/farm/exceptions"],
      ["Closeout", "/farm/reconciliation"],
    ],
  },
  {
    label: "Customers",
    items: [
      ["Customers", "/farm/locations"],
      ["Orders", "/farm/orders"],
      ["Subscriptions", "/farm/subscriptions"],
    ],
  },
  {
    label: "Farm",
    items: [
      ["Production & capacity", "/farm/capacity"],
      ["Bottles", "/farm/bottles"],
    ],
  },
  {
    label: "Business",
    items: [
      ["Finance", "/farm/payments"],
      ["Reports", "/farm/reports"],
    ],
  },
  {
    label: "Control",
    items: [
      ["Automation & activity", "/farm/activity"],
      ["Settings", "/farm/settings"],
    ],
  },
];
const dated = new Set([
  "/farm",
  "/farm/routes",
  "/farm/delivery-sheet",
  "/farm/exceptions",
  "/farm/reconciliation",
  "/farm/bottles",
  "/farm/reports",
]);
export function FarmNavigation({ role }: { role: FarmStaffRole }) {
  const pathname = usePathname();
  const query = useSearchParams();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.get("date") ?? "")
    ? query.get("date")
    : null;
  const area = /^[0-9a-f-]{36}$/i.test(query.get("area") ?? "")
    ? query.get("area")
    : null;
  const visibleGroups =
    role === "driver"
      ? [{ label: "Delivery", items: [["My route", "/farm/delivery-sheet"]] }]
      : groups;
  const currentPath =
    pathname === "/farm/cancellations"
      ? "/farm/exceptions"
      : pathname === "/farm/staff"
        ? "/farm/settings"
        : pathname.startsWith("/farm/customers/")
          ? "/farm/locations"
          : pathname;
  const current =
    visibleGroups
      .flatMap((group) => group.items)
      .find((item) => item[1] === currentPath)?.[0] ?? "Farm operations";
  const links = visibleGroups.map((group) => (
    <section key={group.label} className={styles.navGroup}>
      <h2>{group.label}</h2>
      {group.items
        .filter(([, path]) => role === "admin" || path !== "/farm/payments")
        .map(([label, path]) => (
          <Link
            prefetch={false}
            key={path}
            href={
              date && dated.has(path)
                ? `${path}?${new URLSearchParams({ date, ...(area && ["/farm", "/farm/routes", "/farm/delivery-sheet", "/farm/exceptions"].includes(path) ? { area } : {}) })}`
                : path
            }
            aria-current={path === currentPath ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
    </section>
  ));
  return (
    <>
      <nav className={styles.nav} aria-label="Farm operations">
        {links}
      </nav>
      <details className={styles.mobileMenu}>
        <summary>
          {current}
          <span>Switch page</span>
        </summary>
        <nav aria-label="Farm pages">{links}</nav>
      </details>
    </>
  );
}
