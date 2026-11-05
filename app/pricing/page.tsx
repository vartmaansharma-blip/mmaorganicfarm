import { deliveryThresholdCopy } from "@/lib/delivery-pricing";
import { DEFAULT_ORDER_FEES } from "@/lib/product-prices";
import { publicMetadata } from "@/lib/public-metadata";
import { readProductCatalogue } from "@/lib/product-prices-server";
import type { Metadata } from "next";
import { PublicInformationLayout } from "@/app/components/public-information-layout";
import { FARM_PRODUCTS } from "@/lib/farm-products";

export const metadata: Metadata = publicMetadata("/pricing", "Product Pricing", "Current M'ma Organic Farm product prices for Jamshedpur customers.");

export default async function PricingPage() {
  const { prices } = await readProductCatalogue();
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
            <dd>₹{prices.milk}</dd>
          </div>
          {FARM_PRODUCTS.map((product) => (
            <div key={product.id}>
              <dt>
                {product.name} · {product.unit}
              </dt>
              <dd>₹{prices[product.id]}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2>Glass bottle</h2>
        <p>
          Milk is ₹{prices.milk} per litre with bottle return. New glass bottles add ₹{prices.bottle}
          per litre; this is a bottle purchase, separate from delivery.
        </p>
      </section>
      <section>
        <h2>Delivery</h2>
        <p>
          One-time delivery is ₹{prices.delivery_once ?? DEFAULT_ORDER_FEES.delivery_once}.
          Scheduled delivery is ₹{prices.delivery_scheduled ?? DEFAULT_ORDER_FEES.delivery_scheduled} per delivery after your first month.
          {deliveryThresholdCopy(prices)} The threshold excludes bottle purchases. Delivery is free on dates shared by one-time and scheduled orders checked out together.
        </p>
        <p>
          Handling is ₹{prices.handling ?? 0} per order and the platform fee is ₹{prices.platform ?? 0} per order.
          The first-month scheduled fee waiver includes delivery, handling and platform fees.
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
