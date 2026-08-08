import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MilkPlanBuilder } from "./milk-plan-builder";
import styles from "./milk.module.css";

export const metadata: Metadata = {
  title: "Farm Products",
  description:
    "Build one M'ma Organic Farm order with fresh milk, paneer, ghee, papaya, and milk sweets for your Jamshedpur home.",
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
          <p>Our farm · Jamshedpur</p>
          <Image
            src="/cowshed.jpeg"
            alt="Cows resting inside M'ma Organic Farm"
            fill
            sizes="(max-width: 980px) 100vw, 52vw"
            priority
          />
          <span>Raised and cared for at the farm</span>
        </div>

        <div className={styles.productCopy}>
          <p className={styles.eyebrow}>Choose from the farm</p>
          <h1 id="milk-title">One farm order</h1>
          <p className={styles.price}>
            Milk ₹62 <span>per litre with bottle return</span>
          </p>
          <p className={styles.intro}>
            Combine your milk with fresh paneer, ghee, papaya, and milk sweets.
            Choose once or build a weekly farm delivery.
          </p>
          <dl className={styles.productFacts}>
            <div>
              <dt>Dairy</dt>
              <dd>Milk · 1 kg paneer · ghee · sweets</dd>
            </div>
            <div>
              <dt>Produce</dt>
              <dd>Farm-picked papaya</dd>
            </div>
            <div>
              <dt>Order</dt>
              <dd>One combined farm delivery</dd>
            </div>
          </dl>
        </div>
      </section>

      <MilkPlanBuilder />
    </main>
  );
}
