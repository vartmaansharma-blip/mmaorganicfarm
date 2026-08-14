import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import styles from "./farm-shell.module.css";

export const dynamic = "force-dynamic";

export default async function FarmLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staff } = user
    ? await supabase
        .from("farm_staff")
        .select("role")
        .eq("user_id", user.id)
        .eq("active", true)
        .maybeSingle()
    : { data: null };

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
          <Link href="/farm">Deliveries</Link>
          <Link href="/farm/locations">Customers</Link>
          <Link href="/farm/capacity">Capacity</Link>
          <Link href="/farm/payments">Payments</Link>
          <Link href="/farm/cancellations">Requests</Link>
        </nav>

        <div className={styles.staff}>
          <span>Signed in as</span>
          <strong>{staff?.role ?? "Farm staff"}</strong>
          <Link href="/">Back to website</Link>
        </div>
      </aside>

      <div className={styles.workspace}>{children}</div>

      <nav className={styles.mobileNav} aria-label="Farm operations">
        <Link href="/farm">Deliveries</Link>
        <Link href="/farm/locations">Customers</Link>
        <Link href="/farm/capacity">Capacity</Link>
        <Link href="/farm/payments">Payments</Link>
        <Link href="/farm/cancellations">Requests</Link>
      </nav>
    </div>
  );
}
