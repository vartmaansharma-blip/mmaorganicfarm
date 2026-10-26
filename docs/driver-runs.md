# Driver runs: stage 1

A manager can connect an existing individual driver login, a dated availability confirmation, an independently identified vehicle, a route manifest and a physically recorded load. The driver checks the load, starts the released run, records existing delivery outcomes, and records the return. The manager reconciles delivered, returned and lost stock before closing custody.

## Screens and design

`/farm/runs` is role aware. Managers have Delivery runs, Driver team and Vehicles views. Drivers see only their own runs, availability and the next permitted action. Contact details for a run are withheld from its workspace response until release. Existing `/farm/delivery-sheet` remains the stop and outcome screen; links preserve the selected route when advancing to the next stop.

The design retains the M’ma logo and existing typography. Forest green, warm cream and restrained gold distinguish the briefing, product quantities and main action. The driver's briefing becomes shorter once a run is assigned. Controls are labelled; forms retain entries on failure and acknowledge saved server state. Nothing silently saves while offline. Explicit refresh retrieves the other person's latest action.

## Operating sequence

1. Invite or activate the driver's individual account through Farm staff. Save the phone number, operations note and preferred vehicle in Driver team. The preference fills the vehicle choice when that driver is selected; a manager can choose another vehicle.
2. Register a vehicle, ownership and approved carrying capacities. Milk is in litres; paneer and ghee are counts of 500 g packs. Availability is confirmed separately for each service date.
3. Prepare the day's dispatch in Routes. Create a run from an unstarted prepared route. The date-specific driver assignment is set only while dispatch is draft; a released assignment cannot be silently replaced.
4. Enter the physical load. Planned demand is shown as a reference and is never automatically treated as loaded. The load must cover the manifest and stay within vehicle and stop limits.
5. The assigned driver accepts or rejects the load. Managers cannot accept it for the driver. Changing the load or refreshing the manifest resets this acknowledgement.
6. The manager releases the run. Existing whole-day dispatch checks still apply; another incomplete route can block the day's first release. A changed route must be refreshed and checked again. One released, active or returned run can hold each driver or vehicle at a time, including across service dates.
7. On the service day the driver enters the opening odometer and starts the run. Existing accounting commands record delivery outcomes. Location never marks a delivery complete. An adopted run must be started before its driver can record outcomes.
8. On return the driver enters a closing odometer. Unrecorded stops need a return note and remain for manager review. Returning does not close custody or free the resources.
9. The manager resolves missing outcomes through the existing delivery workflow, then enters actual returned and lost quantities. Every loaded product must balance: loaded = recorded delivered + returned + lost. A loss needs an explanation. Closing custody does not settle outstanding service exceptions or change prepaid entitlements.

A run can be cancelled before it starts, with a reason. Its reservations are released and its history is retained. The underlying paid deliveries remain on dispatch. A closed run's quantities cannot be rewritten; an audited stock-adjustment flow is outside this stage. This stage supports one run per route per service date; multiple trips on the same route need a separate future extension.

## Measurement boundaries

Opening and closing readings are self-reported odometer evidence. Their difference is displayed as **Odometer · reported**. Start and return are server timestamps; elapsed minutes include stops and breaks. These are not GPS distance, driving time, verified payable hours or an approved wage statement. No rates, payable amounts, reimbursements or disbursements are generated.

Google Maps navigation already uses a confirmed customer entrance where available, otherwise the written address. Maps obtains its own phone origin. This stage retains manager-approved stop order. Continuous GPS capture, native background tracking, road-based reordering, offline evidence sync and reviewed driver-pay statements remain subsequent stages in the approved operating model.

## Database and release

`supabase/pending-migrations/20261026164039_driver_run_foundation.sql`

SHA-256: `f397c968fa249e8828f467480e350b0cc1329450fdc7229c77d87fd8a4e7746d`

This file is intentionally outside automatic migrations. No live schema changes or customer-record writes were performed. It works with both the current schema and the separately pending routing/GPS-pin migration. An unapplied run schema shows a graceful setup message and a link to the existing route; unrelated RPC errors are not masked as an empty workday.

New tables have RLS and no direct authenticated or anonymous grants. Public invoker RPCs delegate to private definer functions with an empty search path and explicit active-staff role checks. Commands log before/after state, actor, payload and a unique request key. Replays of the same request return the same result; another actor or payload cannot reuse the key. Run versions reject stale forms. Day locks match existing outcome accounting; unique reservations and serialised resource commands prevent duplicate custody.

Before production activation, review this exact SQL, apply only to the approved MmaFarms project, check grants and live migration history, then run an authenticated staff acceptance check on the production-equivalent preview. Production deployment remains a separate approval step.

## Verification

- Production Webpack build and TypeScript pass.
- 113 existing unit/source tests pass.
- All 83 native PostgreSQL regression checks pass, including all 10 driver-run scenarios. The same 10 run scenarios also pass without the GPS-pin migration. It covers permissions, physical load limits, stale versions, retries, load rejection, changed manifests, journey gating, stock balance, future starts, resource conflicts, cancellation, concurrent creation and partial fulfilment.
- Full browser journeys pass in Chromium and WebKit at 390 and 1440 pixels. Both engines also check 320-pixel overflow. Each journey creates the vehicle and profile, confirms driver availability, prepares and checks the load, releases, starts, records a delivery, returns, rejects an unbalanced closeout without clearing entries, and closes a balanced run. No page errors were observed. Legacy-schema fallback also passes.
- Browser evidence uses synthetic records and a local Auth/REST adapter backed by disposable native PostgreSQL. It is not evidence of hosted GoTrue/PostgREST, real GPS, production activation or a field pilot.
- ESLint reports no errors and one pre-existing raw-image warning in `app/components/public-information-layout.tsx`.

Reproduce locally (requires native PostgreSQL/browser execution permissions):

```sh
node node_modules/next/dist/bin/next build --webpack
node --test --test-concurrency=1 tests/database/*.integration.mjs
RUNS_WITH_PINS=false node --test tests/database/driver-runs.integration.mjs
node tests/driver-runs.browser.mjs
```

Browser result summaries are in `docs/screenshots/driver-runs/results.json`; screenshots are generated locally and delivered with the task outputs.
