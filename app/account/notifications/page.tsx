import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { notificationFilters } from "@/lib/customer-notifications";
import { AccountNavigation } from "../account-navigation";
import accountStyles from "../account.module.css";
import { loadCustomerNotifications } from "./actions";
import { CustomerNotificationBell } from "./notification-bell";
import { NotificationInbox } from "./inbox";
import { NotificationIcon } from "./notification-icon";
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
  const empty = {
    all: { title: "You’re all caught up.", copy: "Delivery and payment updates from the farm will appear here." },
    attention: { title: "No actions needed.", copy: "There’s nothing waiting for you to review." },
    deliveries: { title: "No delivery notices.", copy: "Delivery and plan updates will appear here." },
    payments: { title: "No payment notices.", copy: "Payment confirmations will appear here." },
  }[filter];

  return <main className={accountStyles.page}>
    <header className={accountStyles.header}>
      <Link className={styles.backLink} href="/account"><span aria-hidden="true">←</span> Back to Today</Link>
      <CustomerNotificationBell />
    </header>
    <div className={accountStyles.accountLayout}>
      <AccountNavigation />
      <section className={`${accountStyles.content} ${styles.inbox}`}>
        <header className={styles.masthead}>
          <span className={styles.mastheadIcon}><NotificationIcon name="bell" size={24} /></span>
          <div>
            <p className={styles.kicker}>My M’ma inbox</p>
            <h1>Notification Centre</h1>
            <p className={styles.intro}>Delivery updates, payments and messages from the farm.</p>
          </div>
        </header>
        <nav aria-label="Notification filters" className={styles.filters}>
          {notificationFilters.map(item => <Link key={item.key} aria-current={filter === item.key ? "page" : undefined} href={`/account/notifications?filter=${item.key}`}>{item.label}</Link>)}
        </nav>
        {result.status === "error" ? <div className={styles.error} role="alert">
          <p>{result.message}</p><Link href={first}>Try again</Link>
        </div> : <>
          <NotificationInbox items={result.items} unread={result.unread} />
          {result.pendingPayment ? <section className={styles.attention}>
            <span className={styles.noticeIcon}><NotificationIcon name="attention" /></span>
            <div>
              <p className={styles.kicker}>Action needed</p>
              <h2>Payment awaiting confirmation</h2>
              <p>Check the latest status in your orders.</p>
            </div>
            <Link href="/account?section=orders&order_view=pending">Review payments →</Link>
          </section> : result.items.length === 0 ? <div className={styles.emptyState}>
            <span className={styles.noticeIcon}><NotificationIcon name={filter === "all" || filter === "attention" ? "check" : filter === "deliveries" ? "delivery" : "payment"} /></span>
            <h2>{params.before ? "No older notifications." : empty.title}</h2>
            <p>{params.before ? "Return to the newest notices to continue." : empty.copy}</p>
          </div> : null}
          {params.before || result.next ? <nav className={styles.pagination} aria-label="Notification pages">
            {params.before ? <Link href={first}>← Newest notifications</Link> : null}
            {result.next ? <Link data-direction="older" href={`${first}&before=${encodeURIComponent(result.next)}`}>Older notifications →</Link> : null}
          </nav> : null}
        </>}
      </section>
    </div>
  </main>;
}
