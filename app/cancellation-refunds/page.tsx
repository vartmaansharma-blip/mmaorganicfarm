import type { Metadata } from "next";
import { PublicInformationLayout } from "@/app/components/public-information-layout";

export const metadata: Metadata = {
  title: "Cancellation and Refund Policy",
  description: "Cancellation, carry-forward, and refund rules for M'ma Organic Farm orders.",
};

export default function CancellationRefundsPage() {
  return (
    <PublicInformationLayout
      eyebrow="Cancellations and refunds"
      title="Fair rules for fresh products."
      intro="Milk and farm products are prepared against a delivery schedule. Contact the farm as early as possible when a plan needs to change. Last updated 9 August 2026."
    >
      <section>
        <h2>Before preparation</h2>
        <p>Contact the farm at <a href="tel:+919818804419">+91 98188 04419</a>. A cancellation request is reviewed against the order status and whether preparation or dispatch has begun.</p>
      </section>
      <section>
        <h2>After preparation</h2>
        <p>Because milk and farm products are perishable, an order that has already been prepared or dispatched normally cannot be cancelled for a change of mind.</p>
      </section>
      <section>
        <h2>Reducing paid milk</h2>
        <p>Reducing the quantity of a paid milk plan does not create a cash refund. The unused paid milk quantity is carried forward to a later eligible delivery.</p>
      </section>
      <section>
        <h2>Skipped delivery</h2>
        <p>A paid milk day skipped through the delivery calendar is added to the end of the plan. Add-ons follow the schedule shown when they were selected.</p>
      </section>
      <section>
        <h2>Wrong or unusable item</h2>
        <p>Report a missing, incorrect, damaged, or unusable product on the day of delivery. The farm will verify the issue and offer an appropriate replacement, credit, or refund where required by applicable law.</p>
      </section>
    </PublicInformationLayout>
  );
}
