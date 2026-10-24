# Landing-page improvement audit — 24 October 2026

The supplied review is advisory. The latest user instruction requests a preview first and explicitly prohibits deployment to production. Do not merge to main or release without new approval. Preserve the approved dark-default/light theme, genuine heart logo, typography and optional photographic film. Do not modify plan-builder, authentication or payment logic.

## Findings before changes

- The first screen names neither the delivery city nor the price. Ordering is accessible, but a 270–305svh pinned introduction separates visitors from farm evidence and product detail.
- Competing labels (Shop, Shop M'ma, Build my weekly plan, Start my milk plan) blur the 30-delivery product. Responsive duplicated text exists in the same header link, and the anonymous homepage exposes an ambiguous My M'ma label.
- Real farm photos appear near the bottom. Statistics repeat in a strip, marquee and story; licensing/certification wording has no supporting record in this task.
- There is no concise FAQ, delivery-check entry point, plan-total example, or mobile bottom conversion bar. Existing footer routes and the telephone/WhatsApp number are present; the number is not newly invented.
- Homepage farm PNG/JPEG images bypass next/image; the film eagerly fetches several frames, including a 3840-width full-screen candidate on phones. The logo and two film layers are prioritized.
- Metadata includes obsolete keyword tags and a portrait share image. No conversion analytics provider or event instrumentation was found.
- Existing policy routes have substantive content. Homepage copy must stay within those policies rather than inventing delivery times, milk type, A2 status, processing, bottle deposit, refunds or a guaranteed trial.

## Implementation decisions

1. Put milk, Jamshedpur, ₹62/L and a consistent plan CTA in an immediately usable hero. Add a bilingual tagline and a mobile conversion bar. Keep the film only behind an explicit optional disclosure; reserve its overhead shot for its ending.
2. Move existing farm photos immediately after the hero, show supplied statistics once, explain a 1L × 30-delivery milk-only example, and link the actual skip/cancellation policies. A trial link asks about availability on WhatsApp; it does not promise a product the checkout cannot sell.
3. Add factual delivery/help copy and accessible native FAQs. Keep a real-review component and expandable media support ready, but render neither fake reviews nor empty founder/video panels.
4. Remove unsupported certification/health wording. Keep missing owner information in a private content checklist, not public TODO text. Retain the brand name without claiming organic certification.
5. Optimize the actual photographs, lazy-load optional motion, add a 1200×630 sharing image, clean heading/brand/navigation markup, and measure comparable mobile Lighthouse runs.
6. Instrument non-personal conversion intent through a documented browser event/dataLayer bridge. Do not pretend that events are being remotely collected without a configured analytics destination.

## Deliberately deferred

Verified FSSAI record, certification evidence for Organic claims, exact delivery times/localities, milk type/processing, detailed bottle return/deposit terms, owner/founder material, consented customer reviews, farm video, Google Business Profile and full translation require owner-supplied facts. No public placeholders, invented testimonials, founder story or guaranteed trial will be published.


## Side-view calibration

The 800×1200 front cutout has a visible glass span from y=139 to y=1074. The side cutout spans y=164 to y=1020. A uniform 1.09229 scale with (-4.955827%, -3.344626%) translation aligns the visible rim and base without changing the side image's proportions. Browser checks compare both silhouette endpoints at every supported viewport; the overhead circular shot intentionally has a different perspective.

## Local optimized-build verification

- `npm test`: production build plus all 34 existing source/unit checks pass. TypeScript passes. ESLint has no errors; two pre-existing warnings remain in checkout navigation and the public-information logo.
- Chromium and WebKit cover 320×568, 360×740, 390×844, 768×1024 and 1440×960, both saved themes, drawer keyboard/focus/Escape/backdrop/destinations, optional film mounting, forward/reverse fill, image-only macro, closing overhead, skip and unmount cleanup, no-JavaScript CTA/FAQ, reduced motion and nine connected public routes.
- Requests for optional frames are absent on initial load. No 3840-width candidate remains; the largest image optimizer width is 1920. Film frames load after explicit opening so scrolling does not outrun lazy-loading each shot.
- Photographic side-view calibration preserves aspect ratio. Initial and final camera perspectives intentionally differ; the rim/base height of front and side now matches.
- No real customer order, payment, authenticated calendar change or physical-device test was performed. Anonymous `/milk` still goes through the existing sign-in gate. The only plan-page change is a non-personal arrival event after authentication; plan, auth and payment logic is unchanged.

### Comparable mobile Lighthouse lab results

Lighthouse 13.5.0, the same Playwright Chromium executable, local optimized Next build, 390×844 mobile viewport, default simulated mobile 4G/CPU throttling. The results describe this lab run, not field performance or conversion uplift.

| Metric | Before | After |
| --- | ---: | ---: |
| Performance | 61 | 93 |
| Accessibility | 96 | 100 |
| Best practices / SEO | 100 / 100 | 100 / 100 |
| LCP | 5.891 s | 3.238 s |
| CLS | 0 | 0 |
| TBT | 678.5 ms | 31 ms |
| Total transferred bytes | 2,912,035 | 406,051 |

LCP improves substantially but does **not** yet meet the requested 2.5-second target. Reduced image loading, WOFF2 fonts and a smaller favicon lower initial page weight by about 86%. The film is kept on demand to preserve its photographic camera changes without charging its payload to the ordering page's first load. React/Next runtime and render-blocking CSS remain opportunities for further profiling. No claim of improved sales or production speed is made from a Lighthouse score.

### Analytics contract

`mma:conversion` is a browser CustomEvent carrying only `event` and `location`; an already-present `dataLayer` also receives the event plus `source: mma_landing`. Events: hero_cta_click, sticky_bar_click, plan_cta_click, whatsapp_click, call_click, film_open, plan_builder_start. A plan link click does not count as a builder start; the arrival component runs on the authenticated builder page. No remote destination, cookies, customer identifiers, free-text messages or conversion dashboard are installed.

### Release state

Preview-only by the latest user instruction. Keep main and the production alias unchanged. This branch is for reviewing the experience before any later release approval.
