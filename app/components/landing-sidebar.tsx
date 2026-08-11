import { AccountLink } from "@/app/components/account-link";
import styles from "./landing-sidebar.module.css";

export function LandingSidebar() {
  return (
    <aside className={styles.sidebar} aria-label="Primary navigation">
      <a className={styles.brand} href="#home" aria-label="M'ma Organic Farm home">
        <span className={styles.brandMark} aria-hidden="true" />
        <span className={styles.brandCopy}>M&apos;ma Organic Farm</span>
      </a>

      <nav className={styles.navigation}>
        <a className={`${styles.navLink} ${styles.active}`} href="#home">
          <span>01</span>Home
        </a>
        <a className={styles.navLink} href="/milk">
          <span>02</span>Shop
        </a>
        <a className={styles.navLink} href="#about">
          <span>03</span>About
        </a>
        <a className={styles.navLink} href="#farm">
          <span>04</span>Farm
        </a>
        <AccountLink
          authenticatedLabel="Profile"
          className={styles.navLink}
          prefix="05"
        />
      </nav>

      <div className={styles.bottom}>
        <p>Fresh milk for Jamshedpur homes.</p>
        <a className={styles.orderButton} href="/milk">
          Shop now <span>↗</span>
        </a>
      </div>
    </aside>
  );
}
