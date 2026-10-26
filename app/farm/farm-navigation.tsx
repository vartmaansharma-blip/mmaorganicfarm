"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { FarmStaffRole } from "@/lib/farm-dashboard";
import styles from "./farm-shell.module.css";
const groups = [
  {
    label: "Workday",
    items: [
      ["Overview", "/farm"],
      ["Routes", "/farm/routes"],
      ["Delivery runs", "/farm/runs"],
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
const iconPaths: Record<string, string> = {
  "/farm": "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  "/farm/runs": "M3 5h11v12H3z M14 9h4l3 4v4h-7 M6 17v2 M18 17v2 M6 9h5",
  "/farm/routes":
    "M6 5a2 2 0 1 0 0 .1M6 7v7a4 4 0 0 0 4 4h6 M18 16a2 2 0 1 0 0 4a2 2 0 0 0 0-4 M9 5h7a3 3 0 0 1 0 6h-4",
  "/farm/delivery-sheet":
    "M3 5h11v12H3z M14 9h4l3 4v4h-7 M6 17v2 M18 17v2 M6 9h5",
  "/farm/exceptions": "M3 4h18v16H3z M3 13h5l2 3h4l2-3h5 M8 8h8",
  "/farm/reconciliation": "M5 4h14v17H5z M9 4V2h6v2 M8 12l3 3 5-6",
  "/farm/locations":
    "M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8 M2 21v-3a6 6 0 0 1 12 0v3 M17 4a4 4 0 0 1 0 7 M17 15a5 5 0 0 1 5 5",
  "/farm/orders": "M5 6h14l2 15H3z M8 6V5a4 4 0 0 1 8 0v1",
  "/farm/subscriptions": "M4 6h16v15H4z M8 3v6 M16 3v6 M4 11h16 M9 16h6",
  "/farm/capacity": "M3 21V10l6 3V6l6 4V3h6v18z M7 17h2 M13 17h2 M18 14h1",
  "/farm/bottles": "M9 3h6v5l3 4v9H6v-9l3-4z M6 14h12",
  "/farm/payments": "M3 6h18v14H3z M3 10h18 M6 16h5",
  "/farm/reports": "M4 3v18h17 M8 17v-5 M13 17V8 M18 17V5",
  "/farm/activity": "M2 12h5l3-8 4 16 3-8h5",
  "/farm/settings":
    "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
};
const dated = new Set([
  "/farm",
  "/farm/routes",
  "/farm/runs",
  "/farm/delivery-sheet",
  "/farm/exceptions",
  "/farm/reconciliation",
  "/farm/bottles",
  "/farm/reports",
]);
function NavigationActivity() {
  const { pending } = useLinkStatus();
  return (
    <span
      className={styles.linkPending}
      data-pending={pending || undefined}
      aria-hidden="true"
    />
  );
}
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
      ? [
          {
            label: "Delivery",
            items: [
              ["My run", "/farm/runs"],
              ["My route", "/farm/delivery-sheet"],
            ],
          },
        ]
      : groups;
  const currentPath =
    pathname === "/farm/cancellations"
      ? "/farm/exceptions"
      : pathname === "/farm/staff"
        ? "/farm/settings"
        : pathname.startsWith("/farm/customers/")
          ? "/farm/locations"
          : pathname;
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
            title={label}
            aria-label={label}
            aria-current={path === currentPath ? "page" : undefined}
          >
            <svg
              className={styles.navIcon}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={iconPaths[path] ?? iconPaths["/farm"]} />
            </svg>
            <span className={styles.navLabel}>{label}</span>
            <NavigationActivity />
            <span className={styles.navTooltip} aria-hidden="true">
              {label}
            </span>
          </Link>
        ))}
    </section>
  ));
  return (
    <nav
      id="farm-navigation"
      className={styles.nav}
      aria-label="Farm operations"
    >
      {links}
    </nav>
  );
}
