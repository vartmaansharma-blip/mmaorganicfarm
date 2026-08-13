import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FARM_PRODUCTS,
  type FarmProductId,
  type FarmProductSelection,
} from "@/lib/farm-products";
import { MILK_PLAN_DAYS, type WeeklyMilkSchedule } from "@/lib/milk-plan";
import { createClient } from "@/lib/supabase/server";
import { MilkPlanBuilder } from "./milk-plan-builder";
import styles from "./milk.module.css";

export const metadata: Metadata = {
  title: "Farm Products",
  description:
    "Build one M'ma Organic Farm order with fresh milk, paneer, and ghee for your Jamshedpur home.",
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
          "start_date, bottle_choice, weekly_delivery_items(day_of_week, product_key, quantity), scheduled_delivery_items(delivery_date, product_key, quantity)",
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
  const savedWeeklyExtras = new Map<
    FarmProductId,
    { days: number[]; quantity: number }
  >();
  (savedPlan?.weekly_delivery_items ?? [])
    .filter((item) => item.product_key !== "milk")
    .forEach((item) => {
      const id = item.product_key as FarmProductId;
      const current = savedWeeklyExtras.get(id) ?? {
        days: [] as number[],
        quantity: Number(item.quantity),
      };
      current.days.push(item.day_of_week);
      savedWeeklyExtras.set(id, current);
    });
  const savedOnceExtras = new Map(
    (savedPlan?.scheduled_delivery_items ?? []).map((item) => [
      item.product_key as FarmProductId,
      Number(item.quantity),
    ]),
  );
  const savedExtras: FarmProductSelection[] = savedPlan
    ? FARM_PRODUCTS.reduce<FarmProductSelection[]>((result, product) => {
        const weekly = savedWeeklyExtras.get(product.id);
        const onceQuantity = savedOnceExtras.get(product.id);
        if (weekly) {
          result.push({
            ...product,
            days: weekly.days.sort((a, b) => a - b),
            frequency: "weekly",
            quantity: weekly.quantity,
          });
        } else if (onceQuantity) {
          result.push({
            ...product,
            days: [],
            frequency: "once",
            quantity: onceQuantity,
          });
        }
        return result;
      }, [])
    : [];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <Image src="/mma-logo.png" alt="" width={66} height={56} />
          <span>
            M&apos;ma Organic Farm
            <small>Farm shop</small>
          </span>
        </Link>
        <div className={styles.headerActions}>
          <span>3 products</span>
          <Link className={styles.back} href="/#milk">
            Back to farm
          </Link>
        </div>
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
          <p className={styles.eyebrow}>M&apos;ma farm shop</p>
          <h1 id="milk-title">Build your farm basket.</h1>
          <p className={styles.price}>
            Milk ₹62 <span>per litre with bottle return</span>
          </p>
          <p className={styles.intro}>
            Combine fresh milk with farm paneer and ghee. Choose a one-time
            basket or build a weekly delivery routine.
          </p>
          <dl className={styles.productFacts}>
            <div>
              <dt>Dairy</dt>
              <dd>Milk · 500 g paneer · 500 g ghee</dd>
            </div>
            <div>
              <dt>Order</dt>
              <dd>One combined farm delivery</dd>
            </div>
          </dl>
        </div>
      </section>

      <MilkPlanBuilder
        initialExtras={savedExtras}
        initialSchedule={savedSchedule}
        initialStartDate={savedPlan?.start_date ?? ""}
        isEditing={Boolean(savedPlan)}
      />
    </main>
  );
}
