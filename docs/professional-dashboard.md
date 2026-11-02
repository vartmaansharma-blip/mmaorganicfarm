# Professional farm dashboard

The farm workspace uses a compact operations theme, independently scoped from the public website. Neutral surfaces, sans-serif headings, restrained green actions and amber attention states replace editorial panels, mixed pastel palettes and decorative greetings. Public pages, the logo, catalogue prices, customer terms, payment settings and database schema are unchanged by this dashboard change.

## Coverage

The shared theme covers overview, delivery runs, GPS, delivery sheet, routes, customer directory and profiles, capacity, Inbox and requests, closeout, orders, finance, subscriptions, bottles, reports, activity, settings and staff. It also covers driver views, loading/error states, forms, disclosures and print output. Styling lives in the farm CSS modules; existing dark/light preference persistence is reused.

Navigation includes a local workspace search over the links already permitted for the signed-in role. Search never broadens access; date/zone links retain their existing scope. The mobile navigation focus loop includes the search field. The theme control is available in the dashboard header.

The overview prioritises the service-day status, next action, delivery quantities, exceptions and upcoming capacity. Its small progress graphic means recorded outcomes, including partial and unsuccessful visits; it does not mean every delivery succeeded. An empty day is not treated as complete. A released dispatch with pending visits links directly to the delivery sheet. Capacity bars retain the recorded quantities and limits. Run and GPS headers use operational labels and preserve their existing actions and custody checks.

## Verification

The browser fixture uses disposable local PostgreSQL, fictional staff/households and the existing test Auth/REST adapter. It makes no Google routing request, real payment or hosted write. The fixture server now drains active database requests before shutdown so native PostgreSQL does not terminate a pending test read.

Run after building:

```sh
npm run typecheck
npm run lint
npm run build
node --experimental-strip-types --test tests/*.test.mjs
npm run test:farm-ui
node tests/driver-runs.browser.mjs
node tests/gps-routing.browser.mjs
```

`test:farm-ui` covers 19 manager screens and three driver screens in Chromium and WebKit, at phone and desktop sizes, in light and dark themes: 176 page combinations. It checks page loading, sampled text contrast, overflow, workspace search, mobile keyboard focus, theme persistence and print colour. Screenshots/results are written to `work/farm-premium/`; they contain fictional data. This is automated browser verification, not a claim of physical-device acceptance or a complete accessibility audit.

Verified locally on 2 November 2026:

- Typecheck and production build passed. Lint has zero errors and the existing public-information image warning.
- All 134 unit tests passed. The existing route-editor overflow guard now tolerates CSS whitespace formatting while retaining the same requirement.
- All 176 page combinations passed with zero sampled text-contrast findings and zero page overflow. A further 40 targeted combinations passed after final overview, capacity and keyboard refinements.
- All four existing driver journeys passed across Chromium/WebKit and phone/desktop: load check, release, departure, delivery, balanced closeout, focus/unsaved-change guards and narrow-width layout. The unavailable-schema fallback passed.
- All eight GPS journeys passed across Chromium/WebKit, phone/desktop and both themes, covering farm pickup, already loaded starts, automatic sequencing, optional review, permission denial and stopping location sharing.

Evidence is in `work/farm-premium/full-results.json`, `results.json`, `driver-regression-results.json` and the GPS suite's `work/gps-routing/` outputs. This branch is for visual review before merge/deployment.
