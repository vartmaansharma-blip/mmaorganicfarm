import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import styles from "./farm-shell.module.css";

export const dynamic = "force-dynamic";

export default async function FarmLayout({ children }: { children: ReactNode }) {
  const { role } = await requireFarmStaff();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/farm">
          <Image src="/mma-logo.png" alt="" width={44} height={38} />
          <span>
            <strong>M&apos;ma Farm</strong>
            <small>Operations</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="Farm operations">
          <Link href="/farm">Overview</Link>
          <Link href="/farm/locations">Locations</Link>
          <span aria-disabled="true">Deliveries <small>Next</small></span>
          <span aria-disabled="true">Customers <small>Next</small></span>
          <span aria-disabled="true">Payments <small>Next</small></span>
        </nav>

        <div className={styles.staff}>
          <span>Signed in as</span>
          <strong>{role}</strong>
          <Link href="/account">Customer profile</Link>
        </div>
      </aside>

      <div className={styles.workspace}>{children}</div>

      <nav className={styles.mobileNav} aria-label="Farm operations">
        <Link href="/farm">Overview</Link>
        <Link href="/farm/locations">Locations</Link>
        <span aria-disabled="true">Deliveries</span>
      </nav>
    </div>
  );
}
