import type { Metadata } from "next";
import { PublicInformationLayout } from "@/app/components/public-information-layout";

export const metadata: Metadata = {
  title: "Delivery Policy",
  description: "Delivery area, scheduling, and fulfilment information for M'ma Organic Farm.",
};

export default function ShippingPage() {
  return (
    <PublicInformationLayout
      eyebrow="Delivery policy"
      title="Fresh delivery, planned clearly."
      intro="M'ma Organic Farm currently serves eligible homes in Jamshedpur. Delivery details are confirmed before fulfilment."
    >
      <section>
        <h2>Where we deliver</h2>
        <p>Delivery is currently available in selected areas of Jamshedpur, Jharkhand. Entering an address does not guarantee service until the farm confirms availability.</p>
      </section>
      <section>
        <h2>When delivery starts</h2>
        <p>The earliest selectable start date is the next delivery day. The customer sees and confirms the schedule before the order proceeds.</p>
      </section>
      <section>
        <h2>Scheduled plans</h2>
        <p>Customers can choose delivery days and quantities. A skipped paid milk delivery is carried forward to the end of the active plan instead of being lost.</p>
      </section>
      <section>
        <h2>Delivery updates</h2>
        <p>If weather, access, product availability, or another operational issue affects delivery, the farm will contact the customer using their saved phone number.</p>
      </section>
    </PublicInformationLayout>
  );
}
