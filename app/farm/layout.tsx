import Image from "next/image";
import type { ReactNode } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import { FarmNavigation } from "./farm-navigation";
import styles from "./farm-shell.module.css";
export const dynamic = "force-dynamic";
export default async function FarmLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { role } = await requireFarmStaff("/farm");
  const driverView = role === "driver";
  return (
    <div className={`${styles.shell} ${driverView ? styles.driverShell : ""}`}>
      <a className={styles.skip} href="#farm-workspace">
        Skip to workspace
      </a>
      <aside className={styles.sidebar}>
        <Link
          className={styles.brand}
          href={driverView ? "/farm/delivery-sheet" : "/farm"}
        >
          <span className={styles.brandMark}>
            <Image
              src="/mma-logo.png"
              alt="M’ma Farms"
              width={88}
              height={74}
              priority
            />
          </span>
          <span className={styles.brandCaption}>Farm operations</span>
        </Link>
        <Suspense fallback={<p>Loading navigation…</p>}>
          <FarmNavigation role={role} />
        </Suspense>
        <div className={styles.staff}>
          <span>Signed in as</span>
          <strong>
            {role === "admin"
              ? "Owner / admin"
              : role === "driver"
                ? "Delivery staff"
                : "Operations manager"}
          </strong>
          <Link href="/">Back to website ↗</Link>
        </div>
      </aside>
      <div id="farm-workspace" tabIndex={-1} className={styles.workspace}>
        {children}
      </div>
    </div>
  );
}
