import { createClient } from "@/lib/supabase/server";
import { firstScheduledPlanStart } from "@/lib/first-scheduled-plan";
import type { ReactNode } from "react";
import { CapsuleNavigation } from "@/app/components/capsule-navigation";
import { OrderMode, ShopPricingProvider } from "./shop-state";
import styles from "./shop.module.css";
export const dynamic = "force-dynamic";
export default async function ShopLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const firstPlanStart = user
    ? await firstScheduledPlanStart(supabase, user.id)
    : null;
  return (
    <div className={styles.page}>
      <ShopPricingProvider firstPlanStart={firstPlanStart}>
        <CapsuleNavigation shopPage />
        <OrderMode />
        {children}
        <footer className={styles.footer}>
          <p>M’ma Organic Farm · Goodness, thoughtfully delivered.</p>
          <nav aria-label="Shop information">
            <a href="/shipping">Delivery</a>
            <a href="/pricing">Pricing</a>
            <a href="/contact">Contact us</a>
          </nav>
        </footer>
      </ShopPricingProvider>
    </div>
  );
}
