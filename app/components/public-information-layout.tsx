import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./public-information.module.css";

type PublicInformationLayoutProps = {
  children: ReactNode;
  eyebrow: string;
  intro: string;
  title: string;
};

const policyLinks = [
  ["Pricing", "/pricing"],
  ["Delivery", "/shipping"],
  ["Contact", "/contact"],
  ["Terms", "/terms"],
  ["Privacy", "/privacy"],
  ["Cancellations & refunds", "/cancellation-refunds"],
] as const;

export function PublicInformationLayout({
  children,
  eyebrow,
  intro,
  title,
}: PublicInformationLayoutProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <img src="/mma-logo.png" alt="" aria-hidden="true" />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <Link className={styles.back} href="/">
          Back to farm <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.intro}>{intro}</p>
        </section>
        <div className={styles.content}>{children}</div>
      </main>

      <footer className={styles.footer}>
        <p>© 2026 M&apos;ma Organic Farm · Jamshedpur, Jharkhand</p>
        <nav aria-label="Policy pages">
          {policyLinks.map(([label, href]) => (
            <Link href={href} key={href}>{label}</Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
