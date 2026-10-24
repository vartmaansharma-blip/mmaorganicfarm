import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SHOP_PRODUCTS } from "@/lib/shop-products";
import { ShopHero } from "./shop-hero";
import styles from "./shop.module.css";
export const metadata: Metadata = {
  title: "Farm Shop",
  description:
    "Discover M’ma milk, paneer and ghee. Choose a single delivery or build your delivery routine.",
  alternates: { canonical: "/shop" },
  robots: { index: true, follow: true },
};
export default function ShopPage() {
  return (
    <main>
      <ShopHero />
      <section className={styles.catalogue} aria-labelledby="counter-title">
        <div className={styles.sectionHeading}>
          <h2 id="counter-title">From our counter.</h2>
          <p>Three everyday favourites</p>
        </div>
        <div className={styles.products}>
          {SHOP_PRODUCTS.map((p) => (
            <Link
              href={`/shop/${p.id}`}
              className={styles.productCard}
              key={p.id}
            >
              <Image
                src={p.image}
                alt={p.alt}
                width={800}
                height={1000}
                sizes="(max-width: 600px) 80px, 30vw"
              />
              <div>
                <h3>{p.name}</h3>
                <p>
                  ₹{p.price} / {p.unit}
                </p>
              </div>
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>
      <section className={styles.answers} aria-labelledby="know-title">
        <h2 id="know-title">Good to know.</h2>
        <details>
          <summary>One delivery or a routine?</summary>
          <p>
            Choose One-time for a single delivery, or Scheduled to build your
            delivery routine. Milk, paneer and ghee can each have their own
            dates within one shared prepaid month. Choose only what you need.
          </p>
        </details>
        <details>
          <summary>What will I pay?</summary>
          <p>
            Product prices are shown beside each item. Milk is ₹62 per litre
            with bottle return; new glass bottles add ₹10 per litre. One-time
            delivery is ₹5 and free above ₹199 in products. Scheduled orders
            have a one-month fee waiver from your first plan, then ₹2 per
            delivery, free above ₹199 for that delivery. Review your full order
            before payment.
          </p>
          <Link href="/pricing">See pricing details →</Link>
        </details>
        <details>
          <summary>Can you deliver to my home?</summary>
          <p>
            Enter your delivery details at checkout so the farm can check your
            address and available capacity. A selected date is not a confirmed
            delivery until your order is accepted.
          </p>
          <Link href="/shipping">Delivery information →</Link>
        </details>
      </section>
    </main>
  );
}
