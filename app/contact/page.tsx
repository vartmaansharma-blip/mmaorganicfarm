import { FARM_PHONE_DISPLAY, FARM_PHONE_LINK, farmWhatsApp } from "@/lib/farm-contact";
import { publicMetadata } from "@/lib/public-metadata";
import type { Metadata } from "next";
import { PublicInformationLayout } from "@/app/components/public-information-layout";

export const metadata: Metadata = publicMetadata("/contact", "Contact", "Contact M'ma Organic Farm for fresh farm delivery in Jamshedpur.");

export default function ContactPage() {
  return (
    <PublicInformationLayout
      eyebrow="Contact the farm"
      title="Talk directly to M’ma."
      intro="Questions about products, delivery, or an existing order are handled directly by the farm team."
    >
      <section>
        <h2>Call</h2>
        <p><a href={FARM_PHONE_LINK}>{FARM_PHONE_DISPLAY}</a></p>
      </section>
      <section>
        <h2>WhatsApp</h2>
        <p>
          <a href={farmWhatsApp("Hello M'ma Organic Farm, I need help with an order.")}>
            Message M&apos;ma Organic Farm
          </a>
        </p>
      </section>
      <section>
        <h2>Service area</h2>
        <p>Jamshedpur, Jharkhand, India. Delivery availability is checked during ordering before payment is accepted.</p>
      </section>
      <section>
        <h2>Support</h2>
        <p>For delivery corrections or product concerns, contact the farm using the phone number above and include the name used for the order.</p>
      </section>
    </PublicInformationLayout>
  );
}
