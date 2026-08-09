import type { Metadata } from "next";
import { PublicInformationLayout } from "@/app/components/public-information-layout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How M'ma Organic Farm handles customer and delivery information.",
};

export default function PrivacyPage() {
  return (
    <PublicInformationLayout
      eyebrow="Privacy policy"
      title="Only the details delivery needs."
      intro="This policy explains what information M'ma Organic Farm collects and why. Last updated 9 August 2026."
    >
      <section>
        <h2>Information collected</h2>
        <ul>
          <li>Name and email from account sign-in.</li>
          <li>Phone number and delivery address when an order is started.</li>
          <li>Selected products, quantities, delivery schedules, and order status.</li>
          <li>Payment status and provider reference needed to reconcile an order.</li>
        </ul>
      </section>
      <section>
        <h2>How it is used</h2>
        <p>Information is used to authenticate customers, arrange delivery, manage schedules, contact customers about an order, provide support, and maintain necessary business records.</p>
      </section>
      <section>
        <h2>Storage and payments</h2>
        <p>Customer account and delivery information is stored using Supabase. Online payments are handled by the selected payment provider; M&apos;ma Organic Farm does not store complete card or bank credentials on this website.</p>
      </section>
      <section>
        <h2>Sharing</h2>
        <p>Delivery details may be shown to authorised farm and delivery staff who need them to fulfil the order. Information is not sold to advertisers.</p>
      </section>
      <section>
        <h2>Access and correction</h2>
        <p>Customers can review saved details in Profile. For a correction or deletion request, call <a href="tel:+919818804419">+91 98188 04419</a>. Some records may be retained when required for security, payment, or legal obligations.</p>
      </section>
    </PublicInformationLayout>
  );
}
