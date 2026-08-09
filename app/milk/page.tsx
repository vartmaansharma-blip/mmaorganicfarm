import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MILK_PLAN_DAYS, type WeeklyMilkSchedule } from "@/lib/milk-plan";
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

type MilkPageProps = {
  searchParams: Promise<{ edit?: string }>;
};

export default async function MilkPage({ searchParams }: MilkPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=%2Fmilk");
  }

  const isEditing = params.edit === "plan";
  const { data: savedPlan } = isEditing
    ? await supabase
        .from("delivery_plans")
        .select(
          "start_date, bottle_choice, weekly_delivery_items(day_of_week, product_key, quantity)",
        )
        .eq("user_id", user.id)
        .in("status", ["pending_confirmation", "active", "paused"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const savedMilkByDay = new Map(
    (savedPlan?.weekly_delivery_items ?? [])
      .filter((item) => item.product_key === "milk")
      .map((item) => [item.day_of_week, Number(item.quantity)]),
  );
  const savedSchedule = savedPlan
    ? (MILK_PLAN_DAYS.map(
        (_, index) => savedMilkByDay.get(index + 1) ?? 0,
      ) as WeeklyMilkSchedule)
    : undefined;

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

      <MilkPlanBuilder
        initialBottleOption={
          savedPlan?.bottle_choice === "new" ? "new" : "return"
        }
        initialSchedule={savedSchedule}
        initialStartDate={savedPlan?.start_date ?? ""}
        isEditing={Boolean(savedPlan)}
      />
    </main>
  );
}
