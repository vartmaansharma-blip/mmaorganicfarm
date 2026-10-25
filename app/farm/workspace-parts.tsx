import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./operations-workbench.module.css";
export function WorkspaceHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        <span>M’ma operations</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children ? <div className={styles.links}>{children}</div> : null}
    </header>
  );
}
export function InboxTabs({ active }: { active: "exceptions" | "requests" }) {
  return (
    <nav className={styles.tabs} aria-label="Inbox views">
      <Link
        href="/farm/exceptions"
        aria-current={active === "exceptions" ? "page" : undefined}
      >
        Delivery exceptions
      </Link>
      <Link
        href="/farm/cancellations"
        aria-current={active === "requests" ? "page" : undefined}
      >
        Customer requests
      </Link>
      <Link href="/farm/activity">System activity</Link>
    </nav>
  );
}
export function PageLinks({
  path,
  page,
  hasMore,
  query = "",
}: {
  path: string;
  page: number;
  hasMore: boolean;
  query?: string;
}) {
  return (
    <nav className={styles.pager} aria-label="Result pages">
      {page > 0 ? (
        <Link href={`${path}?${query}&page=${page - 1}`}>← Previous</Link>
      ) : null}
      <span>Page {page + 1}</span>
      {hasMore ? (
        <Link href={`${path}?${query}&page=${page + 1}`}>Next →</Link>
      ) : null}
    </nav>
  );
}
export function resultPage(value?: string) {
  return Math.max(0, Math.min(10000, Number.parseInt(value ?? "0", 10) || 0));
}
