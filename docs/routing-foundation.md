# Routing foundation — 26 October 2026

## Scope and verified baseline

The current request prioritises delivery routing. The uploaded `memory.md` and M’ma 2.0 master prompt are design/reference material. Their conflicting historical priorities (customer site first versus reliability first) do not override that request. This increment preserves the existing application, business rules and design.

Implementation starts from GitHub `main` at `b528e31145fe71acc89dca7cb24ea49d0dbe4d79`. The later operational-editor update at `505bafa1701ef12e77fdbadc86bcbcb4fd9726c0` was integrated before final checks. Read-only inspection of MmaFarms (`gorlusptyzndobqviocv`) confirmed the existing routing, preparation and release functions. The older project memory was stale: dashboard, monthly scheduling, checkout recovery, account changes and immediate cancellation have since merged. This work does not recreate them.

Existing routing uses postal codes, locality/address terms, service areas and manual stop order. It already has dated driver overrides, default route drivers, Google Maps address links, preparation and manager release. It has no verified coordinate storage, road-time optimisation or live driver telemetry.

Confirmed defects in the inspected definitions:

- Equal automatic matches use route sort order/name to choose a winner.
- Release checks driver presence but not current active driver role, active route/area or split visit assignments.
- Daily driver assignment can change released work and its invoker permissions can prevent managers from validating driver records.
- Nullable staff-role comparisons in route refresh and automatic routing do not consistently reject a signed-in nonstaff caller.

## Authoritative chain

Paid order / active purchased plan → eligible dated product obligations → `daily_deliveries` and items → service area and customer route default → dated assignment (default or override) → manager routing review → released dispatch → assigned driver outcome → existing reconciliation.

Physical production capacity and a route's stop limit remain distinct. Calendar-month and legacy prepaid milk obligations are unchanged. Payment capture, plan activation, dispatch release and physical delivery remain separate facts.

Customer-confirmed destination → private-by-policy `customer_delivery_pins` → destination snapshot on matching unstarted, unreleased delivery rows → driver Maps directions. The driver reads the authorised delivery snapshot, not the customer's pin table.

## Implemented behavior

### Automatic assignment

Preserve an existing valid explicit route. Restrict new matches to a selected service area. Prefer postal matches; matching literal locality terms refine broad postal coverage. Without a postal match, locality rules precede a single-route area fallback. A more specific matching term can distinguish candidates. Equal best candidates remain unassigned for manager review. Punctuation-only rules do not match. The existing manager customer editor remains the resolution path.

Address matching currently supports the existing Latin-script normalisation. No transliteration, coordinate guessing, geographic containment or road-time optimisation is claimed.

### Confirmed entrance pins

My M’ma → Settings offers an optional “Use my current location” action. Location is requested only after a click, with high accuracy, a 15-second timeout and no cached position. Reported accuracy must be within 100 m. The customer can check the pin in Maps, discard it or explicitly confirm that it is their delivery entrance. Permission denial, poor accuracy and failed saves have visible feedback. Device/browser-reported location is not independent proof of GPS hardware or doorstep precision.

The server checks authentication, coordinate ranges, accuracy and the current address. The caller can save only their own pin. Direct client writes are denied. Customers see their own saved pin; managers can inspect pins; drivers cannot list them. Changing the address, locality, landmark, postal code or city invalidates the saved pin and clears matching future draft snapshots. Released and historical destinations are retained.

New and refreshed eligible delivery rows snapshot a pin only when their written destination matches the profile. Navigation uses the confirmed coordinates when present and the written address otherwise. Maps receives no invented driver origin; the phone's navigation app can request it. There is no continuous tracking, automatic geocoding or claim of optimal stop order, distance savings or arrival times.

### Readiness and release

The Routes workspace shows actual visit and pin counts plus actionable routing blockers. The same SQL check enforces release even through direct dispatch-table writes: complete address, active route in the correct active area, active driver role, consistent route/driver/address across a visit's commercial lines, and distinct-visit stop capacity. GPS remains optional; a written address is still required.

A released visit's route, driver, order and destination cannot change silently. A dated driver replacement requires reopening. Delivery outcomes and cancellations remain supported; released visit deletion is blocked. Release/move concurrency is tested. A newly recorded paid obligation after release is retained as a distinct unassigned planned visit for manager review rather than appended to the driver manifest. It cannot be assigned until a safe operational resolution; dispatches that have started cannot simply be reopened under existing rules.

These are routing guards, not an immutable full product/quantity manifest. Broader stock, item-quantity versioning and emergency post-departure dispatch procedures remain further work.

## Validation and evidence

Commands and final results are recorded below after verification. The native routing suite applies the new migration to disposable PostgreSQL and tests real constraints, policies and functions. The browser suite uses the built Next.js app with fictional records and a local Auth/REST protocol adapter backed by that database. It is not a hosted GoTrue/PostgREST or real-device acceptance test.

Existing outcome suites deliberately construct historical released days incrementally and retain their previous schema baseline. Their regression results must be distinguished from the dedicated new-schema routing suite, which also verifies a real outcome write on a released route. All tested records are fictional; no real payment or customer delivery was created.

`tests/routing.browser.mjs` covers Chromium/WebKit at 390 and 1440 pixels: location capture, map review, explicit server save, saved snapshot, controlled permission denial, imprecise location, manager readiness, driver coordinate navigation and layout overflow. Page errors are checked before each deliberate browser-context teardown; WebKit teardown can report speculative Link prefetch cancellation. Device coordinates and denied permission are synthetic test inputs.

### Verified local results

- Optimised Next.js 16.4.3 Webpack production build and TypeScript: passed.
- Source/unit suite: 113 checks passed.
- ESLint: zero errors; one existing raw-image warning in `public-information-layout.tsx`.
- Disposable PostgreSQL: 73 checks passed across the final runs, comprising 59 prior-baseline checks and 14 checks applying this routing migration.
- Both migrated and existing-schema Chromium/WebKit, 390/1440 px: passed in all eight engine/width/schema combinations.
- Screenshots were visually inspected. Synthetic browser results are versioned under `docs/screenshots/routing-foundation/`; representative PNGs are delivered with the task outputs.

## Release and rollback

The reviewed SQL is staged at `supabase/pending-migrations/20261026113838_routing_foundation.sql`, outside the integration-watched migrations directory. Move it into the normal migrations stream only after exact-file approval, or apply the approved SQL explicitly with recorded migration history. Its SHA-256 is `09131d9ee17257295a59d7d0f1814d239f72dda5035b0d4f8276607a4b0c4c43`. It adds one RLS-protected pin table, three nullable destination snapshot columns, functions and triggers; it changes routing functions without backfilling customer/order/payment/plan records. Ordinary future operations will update routes and snapshots under those rules.

The app tolerates the old schema: only known missing additive destination-column errors trigger an address-only delivery query; other errors remain visible. GPS saving and enhanced routing checks show unavailable states until the migration exists. This permits the owner-authorised code merge without applying production DDL. Apply the reviewed migration to activate the new database behaviour, then run hosted acceptance with authorised customer, manager and driver accounts. Production migration requires separate approval for the exact file and MmaFarms project. The owner has authorised merging passing code into main.

For rollback, keep additive data columns/table, revert the app to the prior revision, and use a reviewed forward migration restoring prior function definitions and removing only the new triggers. Do not delete saved pin or delivery evidence to roll back. Restoring the earlier permissive routing functions also restores their audited weaknesses and therefore needs explicit risk review.

## Next routing increments

1. Review exceptions and verified delivery pins with farm staff on a real service day; confirm actual entrances and address quality.
2. Define driver availability, vehicle/load limits, stop durations and genuine delivery windows with farm data.
3. Add a routing-provider interface and evaluate India coverage/cost using actual confirmed pins. Produce proposals for manager approval before automating stop sequencing.
4. Define an emergency late-order/driver-change procedure after departure and add audited supplemental dispatches.
5. Test interrupted connectivity and durable driver outcome retries before claiming offline operation.

Live GPS tracking, paid routing APIs, automatic route optimisation and physical-delivery acceptance remain unimplemented. No new paid service is configured.
