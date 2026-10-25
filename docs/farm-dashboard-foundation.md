# Farm dashboard foundation

Implementation review · 25 October 2026 · production release not authorized

## Design starts from the work

The existing screens are not the design constraint. Start with the daily jobs: establish paid service, prepare the workday, check capacity and addresses, assign drivers, approve dispatch, record physical outcomes, resolve outstanding service, and account for the day. Keep the existing authoritative records where their semantics fit; replace navigation and presentation that obstruct these jobs.

The shared shell owns brand, navigation, role context, responsive behaviour, focus treatment, working surfaces, and core colours. `farm-shell.module.css` defines the farm palette. Page modules own their layouts; operational forms and review panels share `operations-workbench.module.css`. Customer-facing marketing styles are not the dashboard's layout system.

The real `public/mma-logo.png` orange-heart M’ma Farms mark is used without redrawing, filtering, stretching, or recolouring. Its aspect ratio is preserved on a quiet light backing. Space Grotesk is used for navigation and operational content; Fraunces is restricted to main page titles. Operational quantities use explicit units and aligned figures. Yellow indicates work needing attention; colour always accompanies a label.

## Implemented surfaces

- Authenticated, role-aware shell with grouped desktop navigation, mobile page menu, active page, keyboard focus, and skip link. Drivers have a separate restricted entry point.
- Overview leads with the service-day goal and a clearly labelled current status. A vibrant green goal panel and warm yellow status marker sit above service date/zone, operational stage, grouped doorstep counts, actual milk quantities, route progress, decision links, tomorrow's paid commitments/capacity/holds, and 30-second refresh that pauses during form entry.
- Routes now starts with the chosen workday's actual route progress/load. Permanent setup and routing rules are a secondary disclosure. Stops, driver overrides, release, and ordering continue through the authoritative dispatch workspace.
- Deliveries includes route/outcome filters, original dispatch functions, driver outcomes, partial quantities, bottle-return recording, and permission-scoped contact details. Drivers have a focused current-stop workspace with the required quantities, customer instructions, call/navigation actions and a compact stop queue. Filtered manager views do not offer all-day release controls.
- Drivers can record a customer's spoken future request with the exact words, date and request kind. Manager approval of a normal full milk skip updates the unlocked draft and preserves prepaid service; today's delivery outcome is independent. Other requests remain follow-up until a reviewed plan/paid-order adjustment is completed. No automatic approval, unpaid additional milk, or silent quantity adjustment.
- Inbox connects delivery decisions with customer-request review. Zone filtering runs in the database before totals/pagination. Closeout reconciles quantities and obligations and preserves historical review versions.
- Orders and Subscriptions provide paginated, non-test operational records with customer drill-through. Delivery-count entitlements and unsupported calendar-period terms remain distinct.
- Bottles shows documented visit returns and explicitly unverified physical balances. Reports shows service-day outcomes and quantities with measurement definitions. Activity shows preparation run status, immutable attempt history, failures and manager retry alongside actual operational events.
- Owner-only Finance has payment-date filters and labels its bounded record totals. The manager cannot open this page or see the customer payment ledger. Settings links existing configuration and shows configured catalogue prices without pretending they are editable.
- Customer delivery outcomes distinguish physical fulfilment and approved follow-ups; the older generated timeline is now limited to upcoming work.

## Source-of-truth rules

A doorstep may combine multiple paid order/plan rows. Group by visit before counting completion. A partial visit is not fully delivered; unknown quantities cannot become delivered litres. Cancellation, skip, failure, replacement, fulfilment, and payment are distinct facts. Entire-day data is paginated before aggregation instead of assuming a single API response is complete.

The new reconciliation migration preserves original scheduled quantities, projects recorded outcomes, and links replacements to their original obligation. Immutable events, request keys, operational-day locking, RLS, and versioned review provide the accounting boundary. UI visibility is complemented by server role checks and database authorization.

## Deliberate availability limits

This is a working implementation foundation, not a claim that every future capability is complete:

- A quantity-based bottle/finished-stock ledger still needs dated opening counts, custody transfers, and audited movements. Existing boolean return records cannot establish that balance.
- Nightly preparation is implemented with a 21:05 IST target, a secret-protected server endpoint, a default-off environment flag, idempotent database work, failure records and manual retries. It prepares tomorrow's draft and default assignments; staff still review and release dispatch. It has not been activated in production. Recorded runs establish operation; configuration alone does not.
- Outbound messaging delivery receipts, embedded maps, GPS, and ETA computation are not integrated. The app does not fabricate their status.
- The merged calendar-month schema is integrated for dated generation, ordinary/partial fulfilment, finite completion and capacity. Monthly deliveries never consume legacy milk credits. Automatic monthly reschedules, skips and financial changes remain unavailable; keep those requests in explicit manager follow-up.
- Current reports are service-day reports, not a validated profit or historical on-time analytics product.
- Farm surfaces use the deliberate light cream operational palette. This change does not create a fully reviewed alternate dark farm theme.
- Hosted Supabase Auth/PostgREST and a production-equivalent preview still require separate verification. The local browser adapter is test infrastructure, not a second business backend.

## Release gate

Review the screenshots and the migration, validate a preview against an isolated production-equivalent Supabase environment, and obtain explicit approval before production migration or deployment. Do not merge merely because a build succeeds. No production database mutation, merge, or live deployment is included in this work.
