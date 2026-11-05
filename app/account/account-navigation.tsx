import Link from "next/link";
import styles from "./account.module.css";

export const accountSections = ["today", "schedule", "plans", "orders", "settings"] as const;
export type AccountSection = (typeof accountSections)[number];
const labels = { today: "Today", schedule: "Schedule", plans: "My Plans", orders: "Orders", settings: "Account" };
const paths = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>,
  schedule: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h3m-3 3h3"/></>,
  plans: <><path d="M4 7a8 8 0 0 1 14-2l2 2M20 17a8 8 0 0 1-14 2l-2-2"/><path d="M20 3v4h-4M4 21v-4h4"/></>,
  orders: <><path d="M6 3h12v19l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6m-6 4h6m-6 4h3" /></>,
  settings: <><circle cx="12" cy="8" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></>,
};
export function AccountNavigation({ section }: { section?: AccountSection }) {
  return <aside className={styles.sidebar}>
    <Link className={styles.accountTitle} href="/account">My M’ma<span>Your everyday, from the farm.</span></Link>
    <nav className={styles.accountNav} aria-label="Your account">
      {accountSections.map(key => <Link key={key} href={key === "today" ? "/account" : `/account?section=${key}`} aria-current={section === key ? "page" : undefined}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[key]}</svg>{labels[key]}
      </Link>)}
    </nav>
    <div className={styles.sidebarHelp}><span>A little help?</span><a href="/contact">Talk to the farm ↗</a></div>
  </aside>;
}
