import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { notificationFilters } from "@/lib/customer-notifications";
import { AccountNavigation } from "../account-navigation";
import accountStyles from "../account.module.css";
import { loadCustomerNotifications } from "./actions";
import { CustomerNotificationBell } from "./notification-bell";
import { NotificationInbox } from "./inbox";
import styles from "./notifications.module.css";

export const metadata: Metadata = { title: "Notification Centre", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: {
  searchParams: Promise<{ filter?: string; before?: string }>;
}) {
  const params = await searchParams;
  const filter = notificationFilters.find(item => item.key === params.filter)?.key ?? "all";
  const result = await loadCustomerNotifications("inbox", filter, typeof params.before === "string" ? params.before : null);
  if (result.status === "signed-out") redirect("/sign-in?next=%2Faccount%2Fnotifications");
  const first = `/account/notifications?filter=${filter}`;

  return <main className={accountStyles.page}>
    <header className={accountStyles.header}>
      <Link className={accountStyles.back} href="/account">← My M’ma</Link>
      <CustomerNotificationBell />
    </header>
    <div className={accountStyles.accountLayout}>
      <AccountNavigation />
      <section className={accountStyles.content}>
        <div className={accountStyles.pageHeading}>
          <div><p className={accountStyles.eyebrow}>My M’ma</p><h1>Notification Centre</h1>
            <p className={accountStyles.intro}>Your deliveries, payments and important messages.</p></div>
        </div>
        <nav aria-label="Notification filters" className={styles.filters}>
          {notificationFilters.map(item => <Link key={item.key} aria-current={filter === item.key ? "page" : undefined} href={`/account/notifications?filter=${item.key}`}>{item.label}</Link>)}
        </nav>
        {result.status === "error" ? <p className={styles.error} role="alert">{result.message} <Link href={first}>Try again</Link></p> : <>
          <NotificationInbox items={result.items} unread={result.unread} />
          {result.items.length === 0 ? <div className={accountStyles.emptyPanel}>
            <h2>{result.pendingPayment ? "Payment awaiting confirmation" : filter === "all" ? "You’re all caught up." : filter === "attention" ? "No actions needed." : "No notifications in this view."}</h2>
            {result.pendingPayment ? <Link href="/account?section=orders&order_view=pending">Review payments →</Link> : null}
          </div> : null}
          <nav className={styles.inboxToolbar} aria-label="Notification pages">
            {params.before ? <Link href={first}>← Newest notifications</Link> : <span />}
            {result.next ? <Link href={`${first}&before=${encodeURIComponent(result.next)}`}>Older notifications →</Link> : null}
          </nav>
        </>}
      </section>
    </div>
  </main>;
}
