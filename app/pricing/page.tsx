import type { Metadata } from "next";
import { PublicInformationLayout } from "@/app/components/public-information-layout";
import { FARM_PRODUCTS } from "@/lib/farm-products";
import { MILK_PRICE_PER_LITRE } from "@/lib/order-pricing";

export const metadata: Metadata = {
  title: "Product Pricing",
  description:
    "Current M'ma Organic Farm product prices for Jamshedpur customers.",
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
          <div>
            <dt>Fresh milk · 1 litre</dt>
            <dd>₹{MILK_PRICE_PER_LITRE}</dd>
          </div>
          {FARM_PRODUCTS.map((product) => (
            <div key={product.id}>
              <dt>
                {product.name} · {product.unit}
              </dt>
              <dd>₹{product.price}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2>Glass bottle</h2>
        <p>
          Milk is ₹62 per litre with bottle return. New glass bottles add ₹10
          per litre; this is a bottle purchase, separate from delivery.
        </p>
      </section>
      <section>
        <h2>Delivery</h2>
        <p>
          One-time orders: ₹5 delivery, free when products total above ₹199.
          Scheduled orders: no delivery, platform, surge or miscellaneous fees
          for one calendar month from your first scheduled plan. After that
          month, delivery is ₹2 per delivery, free when that delivery’s products
          total above ₹199. The threshold excludes bottle purchases. Handling,
          platform and surge fees are not added.
        </p>
      </section>
      <section>
        <h2>One shared monthly calendar</h2>
        <p>
          Schedule milk, paneer or ghee independently within one prepaid
          calendar month. Review all selected dates before payment. There is no
          automatic renewal. Existing paid 30-delivery milk plans keep their
          purchased terms.
        </p>
      </section>
      <section>
        <h2>Final amount</h2>
        <p>
          The final amount depends on the products, quantities, and schedule
          selected by the customer. Any price change is shown before payment.
        </p>
      </section>
    </PublicInformationLayout>
  );
}
