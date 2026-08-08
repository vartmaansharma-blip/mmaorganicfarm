import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MilkPlanBuilder } from "./milk-plan-builder";
import styles from "./milk.module.css";

export const metadata: Metadata = {
  title: "Fresh Milk",
  description:
    "Choose a one-time fresh milk order or build a weekly M'ma Organic Farm milk plan for your Jamshedpur home.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MilkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=%2Fmilk");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <Image src="/mma-logo.png" alt="" width={66} height={56} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <Link className={styles.back} href="/#milk">
          Back to farm
        </Link>
      </header>

      <section className={styles.product} aria-labelledby="milk-title">
        <div className={styles.visual}>
          <p>Fresh from farm · Jamshedpur</p>
          <Image
            src="/farm-bottle.png"
            alt="M'ma Organic Farm milk bottle at the farm"
            width={900}
            height={1100}
            priority
          />
          <span>1 litre · Glass bottle</span>
        </div>

        <div className={styles.productCopy}>
          <p className={styles.eyebrow}>The everyday bottle</p>
          <h1 id="milk-title">Fresh farm milk</h1>
          <p className={styles.price}>
            ₹62 <span>per litre</span>
          </p>
          <p className={styles.intro}>
            Build a milk routine around your household. Order once for tomorrow,
            or set a different quantity for every day of the week.
          </p>
          <dl className={styles.productFacts}>
            <div>
              <dt>Format</dt>
              <dd>1 litre glass bottle</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>Jamshedpur homes</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>Fresh from the farm</dd>
            </div>
          </dl>
        </div>
      </section>

      <MilkPlanBuilder />
    </main>
  );
}
