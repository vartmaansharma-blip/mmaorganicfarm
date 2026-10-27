import { dashboardReviewEnabled } from "@/lib/dashboard-review-mode";
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
  const { role, user } = await requireFarmStaff("/farm");
  const driverView = role === "driver";
  return (
    <FarmWorkspaceShell
      key={user.id}
      userId={user.id}
      management={role === "admin" || role === "manager"}
      driver={driverView}
      brand={
        <Link
          prefetch={false}
          className={styles.brand}
          href={driverView ? "/farm/runs" : "/farm"}
        >
          <span className={styles.brandMark}>
            <Image
              src="/mma-logo.png"
              alt="M’ma Farms"
              width={64}
              height={53}
              priority
            />
          </span>
          <span className={styles.brandCaption}>
            <strong>M’ma Organic Farm</strong>
            <small>Farm operations</small>
          </span>
        </Link>
      }
      navigation={
        <Suspense fallback={<p>Loading navigation…</p>}>
          <FarmNavigation role={role} />
        </Suspense>
      }
      staff={
        <div className={styles.staff}>
          <strong>
            {role === "admin"
              ? "Owner / admin"
              : role === "driver"
                ? "Delivery staff"
                : "Operations manager"}
          </strong>
          <Link prefetch={false} href="/">
            Back to website ↗
          </Link>
        </div>
      }
    >
      {dashboardReviewEnabled() ? (
        <div className={styles.reviewBanner}>
          <div>
            <strong>Dashboard review</strong>
            <span>Sample data · changes paused</span>
          </div>
          <nav aria-label="Review perspective">
            {[
              ["admin", "Owner / co-founder"],
              ["manager", "Manager"],
              ["driver", "Driver"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`/farm/review-role?role=${id}`}
                aria-current={role === id ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      ) : null}
      {children}
    </FarmWorkspaceShell>
  );
}
