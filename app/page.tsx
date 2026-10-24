import Image from "next/image";
import Link from "next/link";
import { CapsuleNavigation } from "@/app/components/capsule-navigation";
import { LandingFilm } from "@/app/components/landing-film";
import { LandingConversionTracking } from "@/app/components/landing-conversion-tracking";
import { FarmReviews } from "@/app/components/farm-reviews";
import { BRAND_NAME, CONTACT_PHONE, DELIVERY_CHECK_LINK, DISPLAY_PHONE, FARM_PHOTOS, FARM_REVIEWS, FARM_VIDEO, LANDING_COPY, LANDING_FAQS, MILK_PLAN_EXAMPLE, PRIMARY_CTA_LABEL, TRIAL_ENQUIRY_LINK, WHATSAPP_LINK } from "@/lib/landing-content";
import landingStyles from "./landing.module.css";

const orderPath = "/milk";
const siteUrl = "https://mmaorganicfarm.vercel.app";
const formatRupees = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const trust = [
  { value: "20 years", label: "operating" },
  { value: "500+", label: "families served" },
  { value: "1,000+ L", label: "daily production" },
];
const policyLinks = [["Pricing", "/pricing"], ["Delivery", "/shipping"], ["Contact", "/contact"], ["Terms", "/terms"], ["Privacy", "/privacy"], ["Cancellations & refunds", "/cancellation-refunds"]] as const;
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "LocalBusiness", "@id": `${siteUrl}/#business`, name: BRAND_NAME, additionalType: "https://schema.org/FoodEstablishment", url: siteUrl, telephone: CONTACT_PHONE, image: `${siteUrl}/farm/bottle.webp`, priceRange: "₹62 per litre", address: { "@type": "PostalAddress", addressLocality: "Jamshedpur", addressCountry: "IN" }, areaServed: { "@type": "City", name: "Jamshedpur" }, description: "Farm-fresh milk delivery in glass bottles for eligible Jamshedpur homes." },
    { "@type": "Product", "@id": `${siteUrl}/#fresh-farm-milk`, name: "Fresh farm milk", image: `${siteUrl}/farm/bottle.webp`, brand: { "@type": "Brand", name: BRAND_NAME }, description: "Fresh milk in glass bottles. ₹62 per litre; choose quantities and dates in a 30-delivery plan.", offers: { "@type": "Offer", price: MILK_PLAN_EXAMPLE.pricePerLitre, priceCurrency: "INR", url: `${siteUrl}/milk`, priceSpecification: { "@type": "UnitPriceSpecification", price: MILK_PLAN_EXAMPLE.pricePerLitre, priceCurrency: "INR", unitText: "litre" }, eligibleRegion: { "@type": "City", name: "Jamshedpur" } } },
    { "@type": "FAQPage", mainEntity: LANDING_FAQS.map(item => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) },
  ],
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <LandingConversionTracking />
      <a className="skip-link" href="#main">Skip to content</a>
      <CapsuleNavigation />
      <main className={landingStyles.main} id="main">
        <section className={landingStyles.hero} id="home" aria-labelledby="hero-heading">
          <div className={landingStyles.heroCopy}>
            <p className={landingStyles.eyebrow}>M&apos;ma Organic Farm · Jamshedpur</p>
            <h1 id="hero-heading">Farm-fresh milk.<br />Delivered in glass.</h1>
            <p className={landingStyles.heroDescription}>{LANDING_COPY.en.tagline} <strong>₹62 per litre.</strong></p>
            <p className={landingStyles.hindi} lang="hi">{LANDING_COPY.hi.tagline}</p>
            <div className={landingStyles.heroActions}>
              <Link href={orderPath} className={landingStyles.primary} prefetch={false} data-conversion="hero_cta_click" data-location="hero">{PRIMARY_CTA_LABEL}</Link>
              <a href={WHATSAPP_LINK} className={landingStyles.outline} data-conversion="whatsapp_click" data-location="hero">Chat on WhatsApp</a>
            </div>
            <p className={landingStyles.reassurance}>Choose your days and litres. Review the total before payment.</p>
            <a className={landingStyles.textLink} href="#farm">Meet the farm behind your milk <span aria-hidden="true">↓</span></a>
          </div>
          <figure className={landingStyles.heroVisual}>
            <Image src="/hero/glass-milk.webp" alt="A serving glass filled with milk" width={800} height={1200} priority sizes="(max-width: 720px) 220px, (max-width: 1100px) 320px, 420px" />
            <figcaption>For your everyday glass.</figcaption>
          </figure>
        </section>

        <section className={`${landingStyles.section} ${landingStyles.farm}`} id="farm" aria-labelledby="farm-title">
          <div className={landingStyles.sectionHeading}><div><p className={landingStyles.eyebrow}>Meet your farm</p><h2 id="farm-title">A little closer<br />to where it begins.</h2></div><p>Photos from M&apos;ma Organic Farm. Take a look at the place behind your everyday milk.</p></div>
          <div className={landingStyles.farmGallery}>
            {FARM_PHOTOS.map(photo => <figure key={photo.src}><Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} sizes="(max-width: 720px) calc(100vw - 48px), 45vw" /><figcaption>{photo.caption}</figcaption></figure>)}
            {FARM_VIDEO && <figure className={landingStyles.farmVideo}><video controls preload="none" poster={FARM_VIDEO.poster}><source src={FARM_VIDEO.src} /><track kind="captions" src={FARM_VIDEO.captions} srcLang="en" label="English" default /></video><figcaption>{FARM_VIDEO.caption}</figcaption></figure>}
          </div>
          <dl className={landingStyles.trust} aria-label="The farm in numbers">{trust.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
        </section>

        <section className={landingStyles.section} id="milk" aria-labelledby="plan-title">
          <div className={landingStyles.sectionHeading}><div><p className={landingStyles.eyebrow}>A 30-delivery milk plan</p><h2 id="plan-title">Your routine.<br />Clearly priced.</h2></div><p>Choose the days and litres that suit your household. A plan covers 30 deliveries; it does not have to mean 30 consecutive calendar days.</p></div>
          <div className={landingStyles.planLayout}>
            <div className={landingStyles.planPhoto}><Image src="/farm/bottle.webp" alt="M'ma Organic Farm milk bottle at the farm" width={1122} height={1402} sizes="(max-width: 720px) calc(100vw - 48px), 40vw" /></div>
            <div className={landingStyles.planCard}>
              <p className={landingStyles.eyebrow}>A simple milk-only example</p><p className={landingStyles.planPrice}><strong>{formatRupees(MILK_PLAN_EXAMPLE.pricePerLitre)}</strong> / litre</p>
              <dl className={landingStyles.priceBreakdown}><div><dt>Milk per delivery</dt><dd>1 litre</dd></div><div><dt>Number of deliveries</dt><dd>{MILK_PLAN_EXAMPLE.deliveries}</dd></div><div><dt>Milk-only example total</dt><dd>{formatRupees(MILK_PLAN_EXAMPLE.milkTotal)}</dd></div></dl>
              <p className={landingStyles.finePrint}>Example: 1 L × {MILK_PLAN_EXAMPLE.deliveries} deliveries × ₹{MILK_PLAN_EXAMPLE.pricePerLitre}. Your final amount reflects the quantities, bottle option and add-ons you select.</p>
              <Link href={orderPath} className={landingStyles.primary} prefetch={false} data-conversion="plan_cta_click" data-location="plan_example">{PRIMARY_CTA_LABEL}</Link>
              <p className={landingStyles.policy}>Need to skip a day? A paid milk delivery skipped in your calendar moves to the end of your plan. <Link href="/cancellation-refunds">Read the full policy</Link>.</p>
              <a className={landingStyles.textLink} href={TRIAL_ENQUIRY_LINK} data-conversion="whatsapp_click" data-location="trial_enquiry">Ask about a 3-day trial</a>
            </div>
          </div>
          <ol className={landingStyles.steps} aria-label="How to start your milk plan"><li><span>01</span><h3>Sign in</h3><p>Start with your account to build your plan.</p></li><li><span>02</span><h3>Choose your routine</h3><p>Set your days and litres, then add delivery details.</p></li><li><span>03</span><h3>Review your plan</h3><p>Check the schedule, bottle option and total before payment.</p></li></ol>
        </section>

        <LandingFilm />

        <section className={`${landingStyles.section} ${landingStyles.delivery}`} id="after-glass-story" aria-labelledby="delivery-title">
          <div><p className={landingStyles.eyebrow}>Delivery in Jamshedpur</p><h2 id="delivery-title">Let&apos;s check<br />your doorstep.</h2><p>Delivery is available to eligible Jamshedpur homes. Confirm your area and delivery time with the farm before starting your plan.</p></div>
          <div><a href={DELIVERY_CHECK_LINK} className={landingStyles.outline} data-conversion="whatsapp_click" data-location="delivery_check">Check my delivery area</a><Link href="/shipping" className={landingStyles.textLink}>Read the delivery policy</Link></div>
        </section>

        <section className={landingStyles.section} id="about" aria-labelledby="story-title">
          <div className={landingStyles.story}><p className={landingStyles.eyebrow}>Our story</p><h2 id="story-title">A farm in your city.<br />A place in your routine.</h2><p>M&apos;ma Organic Farm produces milk for households in Jamshedpur and delivers it in glass bottles. We want choosing your everyday milk to feel personal: a visible farm, a clear plan, and a team you can speak to.</p><p>Get to know us, ask about your delivery, and choose a routine that fits your home.</p><a href={WHATSAPP_LINK} className={landingStyles.textLink} data-conversion="whatsapp_click" data-location="story">Talk to the farm</a></div>
        </section>
        <FarmReviews reviews={FARM_REVIEWS} />

        <section className={`${landingStyles.section} ${landingStyles.faq}`} aria-labelledby="faq-title">
          <div><p className={landingStyles.eyebrow}>Before your first delivery</p><h2 id="faq-title">A few good questions.</h2><p>For product details we haven&apos;t published, ask the farm directly before ordering.</p></div>
          <div className={landingStyles.faqItems}>{LANDING_FAQS.map(item => <details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><div><p>{item.answer}</p>{"contact" in item && item.contact && <a href={WHATSAPP_LINK} data-conversion="whatsapp_click" data-location="faq">Ask the farm on WhatsApp</a>}{"href" in item && <Link href={item.href}>{item.label}</Link>}</div></details>)}</div>
        </section>

        <section className={landingStyles.closing} aria-labelledby="closing-title"><p className={landingStyles.eyebrow}>Make room for your everyday milk</p><h2 id="closing-title">A fresh start<br />to your routine.</h2><p>₹62 per litre. Choose your 30-delivery plan and review the total before you pay.</p><div className={landingStyles.closingActions}><Link href={orderPath} className={landingStyles.primary} prefetch={false} data-conversion="plan_cta_click" data-location="closing">{PRIMARY_CTA_LABEL}</Link><a href={`tel:${CONTACT_PHONE}`} className={landingStyles.outline} data-conversion="call_click" data-location="closing">Call to order</a></div></section>

        <footer className={landingStyles.footer}><div><Link href="#home" className={landingStyles.footerBrand}><Image src="/mma-logo.png" alt="" width={72} height={60} /><strong>{BRAND_NAME}</strong></Link><p>Jamshedpur, Jharkhand, India.</p><a href={`tel:${CONTACT_PHONE}`} data-conversion="call_click" data-location="footer">{DISPLAY_PHONE}</a><a href={WHATSAPP_LINK} data-conversion="whatsapp_click" data-location="footer">Chat on WhatsApp</a></div><nav aria-label="Business information">{policyLinks.map(([label,href]) => <Link key={href} href={href}>{label}</Link>)}</nav><p className={landingStyles.copyright}>© 2026 {BRAND_NAME}</p></footer>
      </main>
      <nav className={landingStyles.mobileBar} aria-label="Quick milk plan actions"><Link href={orderPath} prefetch={false} data-conversion="sticky_bar_click" data-location="mobile_bar" aria-label={`Start plan · ₹62/L — ${PRIMARY_CTA_LABEL}`}>Start plan <span>· ₹62/L</span></Link><a href={WHATSAPP_LINK} data-conversion="whatsapp_click" data-location="mobile_bar" aria-label="Chat on WhatsApp"><Image src="/whatsapp.svg" alt="" width={24} height={24} /><span>WhatsApp</span></a></nav>
    </>
  );
}
