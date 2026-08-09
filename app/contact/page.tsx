import type { Metadata } from "next";
import { PublicInformationLayout } from "@/app/components/public-information-layout";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact M'ma Organic Farm for fresh farm delivery in Jamshedpur.",
};

export default function ContactPage() {
  return (
    <PublicInformationLayout
      eyebrow="Contact the farm"
      title="Talk directly to M’ma."
      intro="Questions about products, delivery, or an existing order are handled directly by the farm team."
    >
      <section>
        <h2>Call</h2>
        <p><a href="tel:+919818804419">+91 98188 04419</a></p>
      </section>
      <section>
        <h2>WhatsApp</h2>
        <p>
          <a href="https://wa.me/919818804419?text=Hello%20M%27ma%20Organic%20Farm%2C%20I%20need%20help%20with%20an%20order.">
            Message M&apos;ma Organic Farm
          </a>
        </p>
      </section>
      <section>
        <h2>Service area</h2>
        <p>Jamshedpur, Jharkhand, India. Delivery availability is confirmed before an order is accepted.</p>
      </section>
      <section>
        <h2>Support</h2>
        <p>For delivery corrections or product concerns, contact the farm using the phone number above and include the name used for the order.</p>
      </section>
    </PublicInformationLayout>
  );
}
