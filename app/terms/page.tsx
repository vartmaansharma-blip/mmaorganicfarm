import type { Metadata } from "next";
import { PublicInformationLayout } from "@/app/components/public-information-layout";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "Terms for using and ordering from M'ma Organic Farm.",
};

export default function TermsPage() {
  return (
    <PublicInformationLayout
      eyebrow="Terms and conditions"
      title="Simple terms for daily delivery."
      intro="These terms explain how orders, schedules, payments, and farm delivery work. Last updated 13 August 2026."
    >
      <section>
        <h2>Using this website</h2>
        <p>Customers must provide accurate contact and delivery information. Account access is personal and should not be shared.</p>
      </section>
      <section>
        <h2>Orders and availability</h2>
        <p>Products are fresh and availability can vary. An order or recurring plan is accepted after the required details and payment are successfully confirmed.</p>
      </section>
      <section>
        <h2>Schedules</h2>
        <p>Customers are responsible for reviewing selected dates, quantities, products, and the delivery address. Schedule changes apply only after they are saved and accepted by the system.</p>
      </section>
      <section>
        <h2>Price and payment</h2>
        <p>The payable amount shown at checkout is based on the selected milk quantity, add-ons, schedule, and bottle choice. An increase after payment may require an additional payment.</p>
      </section>
      <section>
        <h2>Fresh products</h2>
        <p>Milk and other farm products are perishable. Customers should inspect delivery promptly and report a wrong, damaged, or unusable item on the day of delivery.</p>
      </section>
      <section>
        <h2>Questions</h2>
        <p>Contact <a href="tel:+919818804419">+91 98188 04419</a> before ordering if any term is unclear. These terms do not limit rights that cannot be excluded under applicable law.</p>
      </section>
    </PublicInformationLayout>
  );
}
