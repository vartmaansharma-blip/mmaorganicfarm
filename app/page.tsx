import { redirect } from "next/navigation";
import { AccountLink } from "@/app/components/account-link";
import { LandingSidebar } from "@/app/components/landing-sidebar";
import { createClient } from "@/lib/supabase/server";
import landingStyles from "./landing.module.css";

export const dynamic = "force-dynamic";

const orderPath = "/order";
const whatsappContact =
  "https://wa.me/919818804419?text=Hello%20M%27ma%20Organic%20Farm%2C%20I%20have%20a%20question%20about%20fresh%20milk%20delivery.";

const orderLoopText = "ORDER NOW • FRESH MILK • ";
const orderLoopLetters = Array.from(orderLoopText);

const facts = [
  ["₹62", "per litre"],
  ["Glass", "bottle delivery"],
  ["Fresh", "from farm"],
];

const trust = [
  {
    number: "01",
    title: "20 years operating",
    copy: "A long-running farm operation built around daily dairy care and consistency.",
  },
  {
    number: "02",
    title: "500+ families served",
    copy: "Milk delivery for households that trust the farm as part of their morning routine.",
  },
  {
    number: "03",
    title: "1,000+ L every day",
    copy: "Daily production capacity for fresh milk delivery across Jamshedpur homes.",
  },
];

const features = [
  {
    number: "01",
    title: "Fresh from farm",
    copy: "Dairy that feels close to its source, not anonymous or mass-market.",
  },
  {
    number: "02",
    title: "Glass bottle feel",
    copy: "A more premium daily experience than plastic-packaged milk.",
  },
  {
    number: "03",
    title: "Easy first order",
    copy: "Sign in, add your phone and address, then continue personally with the farm.",
  },
];

const officialPoints = [
  {
    label: "Official ordering",
    copy: "WhatsApp and call links go directly to M'ma Organic Farm.",
  },
  {
    label: "Current milk price",
    copy: "Milk is listed clearly at ₹62 per litre.",
  },
  {
    label: "Delivery area",
    copy: "Built for fresh milk delivery to Jamshedpur homes.",
  },
  {
    label: "Simple direct order",
    copy: "Message the farm first, then confirm your milk delivery personally.",
  },
];

const siteUrl = "https://mmaorganicfarm-tvn8.vercel.app";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "@id": `${siteUrl}/#business`,
      name: "M'ma Organic Farm",
      url: siteUrl,
      telephone: "+919818804419",
      image: `${siteUrl}/hero-milk.png`,
      priceRange: "₹62 per litre",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Jamshedpur",
        addressCountry: "IN",
      },
      areaServed: {
        "@type": "City",
        name: "Jamshedpur",
      },
      description:
        "M'ma Organic Farm delivers fresh farm milk to Jamshedpur homes in glass bottles.",
    },
    {
      "@type": "Product",
      "@id": `${siteUrl}/#fresh-farm-milk`,
      name: "Fresh Farm Milk",
      brand: {
        "@type": "Brand",
        name: "M'ma Organic Farm",
      },
      image: `${siteUrl}/hero-milk.png`,
      description:
        "Fresh farm milk for Jamshedpur homes, offered at ₹62 per litre with glass bottle delivery.",
      offers: {
        "@type": "Offer",
        price: "62",
        priceCurrency: "INR",
        availability: "https://schema.org/InStock",
        url: `${siteUrl}/#milk`,
        eligibleRegion: {
          "@type": "City",
          name: "Jamshedpur",
        },
      },
    },
  ],
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=%2F");
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <LandingSidebar />

      <main className={landingStyles.main} id="main">
        <section className="hero" id="home">
          <header className="topbar">
            <p>Jamshedpur · Fresh from farm</p>
            <div className="topbar-actions">
              <AccountLink className="account-link" />
              <a
                className="order-orbit"
                href={orderPath}
                aria-label="Start a fresh M'ma milk order"
              >
                <span className="order-orbit-text" aria-hidden="true">
                  {orderLoopLetters.map((letter, index) => (
                    <span
                      key={`${letter}-${index}`}
                      style={{
                        transform: `rotate(${index * (360 / orderLoopLetters.length)}deg) translateY(var(--order-radius, -36px))`,
                      }}
                    >
                      {letter}
                    </span>
                  ))}
                </span>
                <span className="order-orbit-core" aria-hidden="true">↗</span>
              </a>
            </div>
          </header>

          <div className="hero-copy">
            <div className="hero-brand-lockup" aria-label="M'ma Organic Farm">
              <img src="/mma-logo.png" alt="" aria-hidden="true" />
              <span>M&apos;ma Organic Farm</span>
            </div>
            <p className="eyebrow">Official farm milk page · ₹62 per litre</p>
            <h1>Fresh farm milk, delivered daily in Jamshedpur.</h1>
            <p className="hero-intro">
              Low fat, rich texture, fresh from farm and delivered directly home
              in a glass bottle. A cleaner daily milk routine from M&apos;ma
              Organic Farm.
            </p>
            <div className="hero-actions">
              <a className="button button-dark" href={orderPath}>
                Shop now <span>↗</span>
              </a>
              <a className="button button-light" href="#milk">
                Explore the milk <span>↓</span>
              </a>
            </div>
            <p className="hero-reassurance">
              Sign in, share your delivery details, then speak directly with
              the farm.
            </p>
          </div>

          <a className="bottle-stage" href="#milk" aria-label="Explore M'ma farm fresh milk">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="bottle-shadow" />
            <img src="/hero-milk.png" alt="M'ma Farms fresh milk bottle" />
            <span className="bottle-note">Hover to pause · Click to explore</span>
          </a>

          <div className="hero-facts" aria-label="Key milk facts">
            {facts.map(([value, label]) => (
              <div key={value}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="confidence-strip" aria-label="Why families choose M'ma Organic Farm">
          {trust.map((item) => (
            <article key={item.number}>
              <span>{item.number}</span>
              <h2>{item.title}</h2>
              <p>{item.copy}</p>
            </article>
          ))}
        </section>

        <div className="ticker" aria-label="M'ma Organic Farm ordering summary">
          <div>
            <span>
              OFFICIAL M&apos;MA ORGANIC FARM ✦ FRESH FROM FARM ✦ 20 YEARS OPERATING ✦ 500+ FAMILIES ✦ ₹62 PER LITRE ✦ ORDER DIRECT ON WHATSAPP ✦
            </span>
            <span>
              OFFICIAL M&apos;MA ORGANIC FARM ✦ FRESH FROM FARM ✦ 20 YEARS OPERATING ✦ 500+ FAMILIES ✦ ₹62 PER LITRE ✦ ORDER DIRECT ON WHATSAPP ✦
            </span>
          </div>
        </div>

        <section className="milk-section section" id="milk">
          <div className="section-heading">
            <p className="eyebrow">The everyday bottle</p>
            <h2>
              One good thing,
              <br />
              every morning.
            </h2>
          </div>

          <div className="milk-layout">
            <article className="milk-visual">
              <img src="/farm-bottle.png" alt="M'ma Farms milk bottle at the farm" />
              <div className="price-tag">
                <strong>₹62</strong>
                <span>/ litre</span>
              </div>
            </article>

            <div className="milk-details">
              <p className="large-copy">
                A better everyday bottle: farm-fresh milk, rich texture, clear
                price, and a simple WhatsApp order path for your home.
              </p>
              <div className="feature-list">
                {features.map((item) => (
                  <div key={item.number}>
                    <span>{item.number}</span>
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                  </div>
                ))}
              </div>
              <a className="button button-yellow" href={orderPath}>
                Order milk <span>↗</span>
              </a>
            </div>
          </div>
        </section>

        <section className="about-section section" id="about">
          <div className="glass-story">
            <p className="eyebrow">Why M&apos;ma</p>
            <h2>
              20 years of farm dairy.
              <br />
              Trusted every morning.
            </h2>
            <p>
              M&apos;ma Organic Farm is for families who do not want milk to feel
              anonymous. For two decades, the farm has focused on health-minded
              dairy, careful handling and fresh milk delivery for Jamshedpur
              homes.
            </p>
            <p>
              The farm serves more than 500 families and produces over 1,000 L
              of milk each day. Its licensed and certification-led approach is
              built around trust, consistency and a better daily bottle.
            </p>
            <div className="story-metrics">
              <div>
                <strong>20 yrs</strong>
                <span>farm operation</span>
              </div>
              <div>
                <strong>500+</strong>
                <span>families served</span>
              </div>
              <div>
                <strong>1,000 L+</strong>
                <span>daily milk production</span>
              </div>
            </div>
          </div>
        </section>

        <section className="official-section section" aria-label="Official ordering details">
          <div className="section-heading official-heading">
            <p className="eyebrow">Official details</p>
            <h2>
              Clear enough
              <br />
              to order.
            </h2>
            <p>
              A professional landing page should answer the basic buying
              questions without making the customer search.
            </p>
          </div>

          <div className="official-grid">
            {officialPoints.map((item) => (
              <article key={item.label}>
                <h3>{item.label}</h3>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="farm-section section" id="farm">
          <div className="section-heading farm-heading">
            <p className="eyebrow">Behind every bottle</p>
            <h2>
              A real farm.
              <br />
              A visible process.
            </h2>
            <p>These are real moments from the farm, not stock photography.</p>
          </div>

          <div className="farm-gallery">
            <figure className="farm-card farm-card-large">
              <img src="/cowshed.jpeg" alt="Cows resting in the farm cowshed" />
              <figcaption>
                <span>01</span>Comfort and daily care
              </figcaption>
            </figure>
            <figure className="farm-card">
              <img src="/milking-station.jpeg" alt="Visitors viewing the farm milking station" />
              <figcaption>
                <span>02</span>The farm in view
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="closing-section">
          <p className="eyebrow">Start with one bottle</p>
          <h2>
            Try tomorrow&apos;s milk
            <br />
            the simple way.
          </h2>
          <p>Fresh from farm. Glass bottle. ₹62 per litre. Jamshedpur homes.</p>
          <div className="closing-actions">
            <a className="button button-dark" href={orderPath}>
              Shop now <span>↗</span>
            </a>
            <a className="button button-light" href="tel:+919818804419">
              Call to order <span>↗</span>
            </a>
          </div>
        </section>

        <footer>
          <a className="brand footer-brand" href="#home">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-copy">
              <strong>M&apos;ma Organic Farm</strong>
            </span>
          </a>
          <p>Fresh from farm · Jamshedpur</p>
          <p>© 2026 M&apos;ma Organic Farm</p>
        </footer>
      </main>

      <a
        className="whatsapp-float"
        href={whatsappContact}
        aria-label="Chat with M'ma Organic Farm on WhatsApp"
      >
        <img src="/whatsapp.svg" alt="" aria-hidden="true" />
        <small>Order milk</small>
      </a>
    </>
  );
}
