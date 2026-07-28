const whatsappOrder =
  "https://wa.me/919818804419?text=Hello%20M%27ma%20Organic%20Farm%2C%20I%27d%20like%20to%20order%20fresh%20milk%20for%20my%20home%20in%20Jamshedpur.";

const whatsappStart =
  "https://wa.me/919818804419?text=Hello%20M%27ma%20Organic%20Farm%2C%20I%27d%20like%20to%20start%20fresh%20milk%20delivery%20to%20my%20home%20in%20Jamshedpur.";

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
    copy: "Made for people who care where their everyday dairy comes from.",
  },
  {
    number: "02",
    title: "Glass bottle feel",
    copy: "A more premium daily experience than plastic-packaged milk.",
  },
  {
    number: "03",
    title: "Easy first order",
    copy: "No account needed on the landing page. Start through WhatsApp or call.",
  },
];

const productAttributes = [
  {
    title: "Low fat",
    copy: "A lighter everyday milk profile for families that want a cleaner routine.",
  },
  {
    title: "Rich texture",
    copy: "A satisfying bottle feel that works well for tea, coffee, cereals and daily use.",
  },
  {
    title: "Fresh from farm",
    copy: "Dairy stays close to its source instead of feeling anonymous or mass-market.",
  },
  {
    title: "Glass bottle",
    copy: "A more premium delivery experience with a bottle customers can trust and recognize.",
  },
  {
    title: "Handled with care",
    copy: "Farm-led handling and delivery designed around freshness and consistency.",
  },
  {
    title: "Directly home",
    copy: "A simple order path through WhatsApp or call, made for Jamshedpur households.",
  },
];

const proofBars = [
  {
    value: "20 yrs",
    title: "Farm operating history",
    copy: "A daily dairy routine built over two decades.",
    fill: "92%",
  },
  {
    value: "500+",
    title: "Families served",
    copy: "Households already trusting the morning bottle.",
    fill: "78%",
  },
  {
    value: "1,000 L+",
    title: "Milk produced daily",
    copy: "Capacity for consistent fresh delivery.",
    fill: "86%",
  },
  {
    value: "₹62/L",
    title: "Clear milk pricing",
    copy: "Simple price before you call or message.",
    fill: "66%",
  },
];

const visualBenefits = [
  {
    title: "Bone-supporting calcium",
    copy: "A daily milk habit for family nutrition.",
  },
  {
    title: "Protein for daily strength",
    copy: "Useful in tea, coffee, breakfast and routine meals.",
  },
  {
    title: "Rich texture",
    copy: "The creamy bottle feel customers notice first.",
  },
  {
    title: "Fresh from farm",
    copy: "Less anonymous, more visible, easier to trust.",
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

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <aside className="sidebar" aria-label="Primary navigation">
        <a className="brand" href="#home" aria-label="M'ma Organic Farm home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-copy">
            <strong>M&apos;ma Organic Farm</strong>
          </span>
        </a>

        <nav>
          <a className="nav-link active" href="#home">
            <span>01</span>Landing
          </a>
          <a className="nav-link" href="#milk">
            <span>02</span>Milk
          </a>
          <a className="nav-link" href="#about">
            <span>03</span>About
          </a>
          <a className="nav-link" href="#farm">
            <span>04</span>Farm
          </a>
        </nav>

        <div className="sidebar-bottom">
          <p>
            Fresh milk for
            <br />
            Jamshedpur homes.
          </p>
          <a className="button button-dark sidebar-cta" href={whatsappOrder}>
            Shop now <span>↗</span>
          </a>
        </div>
      </aside>

      <main id="main">
        <section className="hero" id="home">
          <header className="topbar">
            <p>Jamshedpur · Fresh from farm</p>
            <a href="tel:+919818804419">Call +91 98188 04419</a>
          </header>

          <div className="hero-copy">
            <p className="eyebrow">M&apos;ma Organic Farm · ₹62 per litre</p>
            <h1>Fresh farm milk for Jamshedpur homes.</h1>
            <p className="hero-intro">
              Low fat, rich texture, fresh from farm and delivered directly home
              in a glass bottle. A cleaner daily milk routine from M&apos;ma
              Organic Farm.
            </p>
            <div className="hero-actions">
              <a className="button button-dark" href={whatsappOrder}>
                Shop now <span>↗</span>
              </a>
              <a className="button button-light" href="#milk">
                Explore the milk <span>↓</span>
              </a>
            </div>
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

        <div className="ticker" aria-hidden="true">
          <div>
            <span>
              FRESH FROM FARM ✦ 20 YEARS OPERATING ✦ 500+ FAMILIES ✦ 1,000 L+ DAILY ✦ GLASS BOTTLE ✦ ₹62 PER LITRE ✦
            </span>
            <span>
              FRESH FROM FARM ✦ 20 YEARS OPERATING ✦ 500+ FAMILIES ✦ 1,000 L+ DAILY ✦ GLASS BOTTLE ✦ ₹62 PER LITRE ✦
            </span>
          </div>
        </div>

        <section className="proof-section section" aria-label="M'ma milk confidence proof">
          <div className="section-heading proof-heading">
            <p className="eyebrow">Why people believe it</p>
            <h2>
              See the proof.
              <br />
              Then taste the milk.
            </h2>
            <p>
              Families do not read long tables. They trust what looks
              fresh, feels honest and has simple numbers behind it.
            </p>
          </div>

          <div className="proof-layout">
            <div className="proof-image">
              <img src="/farm-bottle.png" alt="M'ma Farms glass milk bottle at the farm" />
              <div className="proof-badge">
                <strong>Fresh</strong>
                <span>from farm</span>
              </div>
            </div>

            <div className="proof-panel">
              <div className="benefit-grid" aria-label="Milk benefits">
                {visualBenefits.map((item) => (
                  <article key={item.title}>
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                  </article>
                ))}
              </div>

              <div className="proof-bars" aria-label="M'ma Organic Farm proof bars">
                {proofBars.map((item) => (
                  <article key={item.title}>
                    <div className="proof-bar-top">
                      <strong>{item.value}</strong>
                      <span>{item.title}</span>
                    </div>
                    <div className="proof-track" aria-hidden="true">
                      <span style={{ width: item.fill }} />
                    </div>
                    <p>{item.copy}</p>
                  </article>
                ))}
              </div>

              <a className="button button-dark proof-cta" href={whatsappOrder}>
                Shop now <span>↗</span>
              </a>
            </div>
          </div>
        </section>

        <section className="image-belief-section" aria-label="Fresh milk visual proof">
          <div>
            <span>Glass bottle</span>
            <strong>Premium daily milk, not packet thinking.</strong>
          </div>
          <div>
            <span>Farm visible</span>
            <strong>Real cowshed and milking process in view.</strong>
          </div>
          <div>
            <span>Home routine</span>
            <strong>Fresh milk made simple for Jamshedpur homes.</strong>
          </div>
        </section>

        <section className="story-photo-section" aria-label="Farm image proof">
          <figure>
            <img src="/cowshed.jpeg" alt="Cows resting in the M'ma Organic Farm cowshed" />
            <figcaption>
              <span>Daily care</span>
              <strong>Healthy cows, cleaner routine, visible source.</strong>
            </figcaption>
          </figure>
          <figure>
            <img src="/milking-station.jpeg" alt="M'ma Organic Farm milking station" />
            <figcaption>
              <span>Farm process</span>
              <strong>The bottle starts here, not in a mystery supply chain.</strong>
            </figcaption>
          </figure>
        </section>

        <section className="quick-health-section section" aria-label="Fresh milk attributes">
          <div className="section-heading quick-health-heading">
            <p className="eyebrow">Good daily milk should feel obvious</p>
            <h2>
              Strong routine.
              <br />
              Cleaner bottle.
            </h2>
          </div>

          <div className="quick-health-grid">
            <article>
              <span>01</span>
              <h3>Calcium for bones</h3>
              <p>Milk is a natural part of bone-supporting nutrition for growing children, parents and active homes.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Protein for strength</h3>
              <p>A simple daily protein source for breakfast, tea, coffee, smoothies and household cooking.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Rich texture</h3>
              <p>The thicker, more satisfying feel that makes the bottle memorable after the first pour.</p>
            </article>
            <article>
              <span>04</span>
              <h3>Freshness first</h3>
              <p>Farm-led handling, clear pricing and direct home ordering keep the decision easy.</p>
            </article>
          </div>
        </section>

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
                A better everyday bottle: farm-fresh milk, rich texture, fair
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
              <a className="button button-yellow" href={whatsappOrder}>
                Order milk on WhatsApp <span>↗</span>
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
              built around trust, consistency and a better daily bottle for the
              people who depend on it.
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

        <section className="attributes-section section" aria-label="Milk product attributes">
          <div className="section-heading attributes-heading">
            <p className="eyebrow">Product attributes</p>
            <h2>
              What makes the
              <br />
              bottle worth choosing.
            </h2>
          </div>

          <div className="attributes-grid">
            {productAttributes.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
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
            <a className="button button-dark" href={whatsappStart}>
              Shop now on WhatsApp <span>↗</span>
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
        href={whatsappOrder}
        aria-label="Chat with M'ma Organic Farm on WhatsApp"
      >
        <img src="/whatsapp.svg" alt="" aria-hidden="true" />
        <small>Order milk</small>
      </a>
    </>
  );
}
