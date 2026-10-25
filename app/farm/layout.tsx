import Image from "next/image";
import type { ReactNode } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import { FarmNavigation } from "./farm-navigation";
import { FarmWorkspaceShell } from "./farm-workspace-shell";
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
    <FarmWorkspaceShell driver={driverView} brand={
        <Link
          prefetch={false}
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
      } navigation={
        <Suspense fallback={<p>Loading navigation…</p>}>
          <FarmNavigation role={role} />
        </Suspense>
      } staff={
        <div className={styles.staff}>
          <span>Signed in as</span>
          <strong>
            {role === "admin"
              ? "Owner / admin"
              : role === "driver"
                ? "Delivery staff"
                : "Operations manager"}
          </strong>
          <Link prefetch={false} href="/">Back to website ↗</Link>
        </div>
      }>
        {children}
    </FarmWorkspaceShell>
  );
}
