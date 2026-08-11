import type { Metadata } from "next";
import { PublicInformationLayout } from "@/app/components/public-information-layout";
import { FARM_PRODUCTS } from "@/lib/farm-products";
import { MILK_PRICE_PER_LITRE, NEW_BOTTLE_CHARGE } from "@/lib/order-pricing";

export const metadata: Metadata = {
  title: "Product Pricing",
  description: "Current M'ma Organic Farm product prices for Jamshedpur customers.",
};

export default function PricingPage() {
  return (
    <PublicInformationLayout
      eyebrow="Clear pricing"
      title="Farm products, honestly priced."
      intro="Current prices are shown before delivery details are collected. Availability is confirmed when the order is placed."
    >
      <section>
        <h2>Current prices</h2>
        <dl>
          <div><dt>Fresh milk · 1 litre</dt><dd>₹{MILK_PRICE_PER_LITRE}</dd></div>
          {FARM_PRODUCTS.map((product) => (
            <div key={product.id}>
              <dt>{product.name} · {product.unit}</dt>
              <dd>₹{product.price}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2>Glass bottle</h2>
        <p>Return a compatible bottle with each milk delivery, or add a new glass bottle for ₹{NEW_BOTTLE_CHARGE} per bottle. The order review shows the full bottle charge before payment.</p>
      </section>
      <section>
        <h2>Final amount</h2>
        <p>The final amount depends on the products, quantities, schedule, and bottle choice selected by the customer. Any price change is shown before payment.</p>
      </section>
    </PublicInformationLayout>
  );
}
