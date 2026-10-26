import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { FARM_PRODUCTS } from "@/lib/farm-products";
import { MILK_PRICE_PER_LITRE } from "@/lib/order-pricing";
import { WorkspaceHeader } from "../workspace-parts";
import styles from "../operations-workbench.module.css";
export const metadata = {
  title: "Farm settings",
  robots: { index: false, follow: false },
};
export default async function SettingsPage() {
  const { role } = await requireFarmManager("/farm/settings");
  return (
    <main className={styles.page}>
      <WorkspaceHeader
        title="Settings"
        description="The farm's existing configuration, with staff access separated from daily operations."
      />
      <section className={styles.panel}>
        <h2>Operations</h2>
        <div className={styles.links}>
          <Link prefetch={false} href="/farm/routes">Service zones & route defaults</Link>
          <Link prefetch={false} href="/farm/capacity">Product capacity & date overrides</Link>
          {role === "admin" ? (
            <Link prefetch={false} href="/farm/staff">Staff & access</Link>
          ) : null}
        </div>
      </section>
      <section className={styles.panel}>
        <h2>Products & pricing</h2>
        <p className={styles.hint}>
          Current configured catalogue prices. Historical purchased prices are
          retained. Prices cannot be edited from this screen.
        </p>
        <div className={styles.reportRow}>
          <strong>Fresh milk · 1 litre</strong>
          <span>₹{MILK_PRICE_PER_LITRE}</span>
        </div>
        {FARM_PRODUCTS.map((product) => (
          <div className={styles.reportRow} key={product.id}>
            <strong>
              {product.name} · {product.unit}
            </strong>
            <span>₹{product.price}</span>
          </div>
        ))}
      </section>
      <section className={styles.panel}>
        <h2>Service policy</h2>
        <p>
          Full skips preserve prepaid service at plan end. Reduced prepaid milk
          is delivered the next calendar day. Only additional milk is charged;
          no automatic refunds.
        </p>
        <p className={styles.hint}>
          Customers cancel their own plans immediately, without approval. Delivery changes and other requests go to the Inbox for review.
        </p>
      </section>
    </main>
  );
}
