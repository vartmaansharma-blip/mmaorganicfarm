# GPS routing — web increment and live installation

Based on main `8316f2a81757cf9c2ce19e01c21516ac8e186c89`. This implementation is a foreground web workflow. It does not implement an Android background service, locked-screen tracking, offline delivery replay, a field-tested ETA or a measured efficiency gain.

## Daily workflow

The existing manager-assigned run, driver, vehicle, load acknowledgement and release remain authoritative. `/farm/gps` adds the reviewed Pine/Ivory/Butter design, semi-ring delivery progress, route bars, assigned visits, timestamped position and optional map. Empty and unavailable-schema states link to the existing run workflow.

The manager saves a farm/return point, motorcycle or car/van profile, start mode and sequencing policy before departure. An explicit reuse option copies those settings to future runs on the same route and vehicle while the authorising manager remains active; pickup acknowledgement, navigation state and location are never inherited. The driver workspace opens the active assigned run first. Coordinates are deliberately not invented. The initial scope is a single run ending at its configured return point, with 1–25 distinct pending visits that all have confirmed entrance pins. Fixed time windows, road access restrictions beyond the provider's vehicle profile, multi-vehicle allocation and larger-route partitioning need further work; use manual sequencing for routes with constraints this increment cannot model.

- **Automatic road-based sequencing (default):** starting a checked run requests GPS access, shares a fresh fix, calculates a road proposal and adopts it under the active manager's saved policy. The driver does not need to request or approve each initial plan. Subsequent GPS fixes do not repeatedly trigger paid recalculation. Recorded outcomes advance through the accepted remaining sequence automatically.
- **Automatic, keep manager order:** the same automation estimates the supplied order without reordering it.
- **Review required:** the driver requests a proposal; a manager approves it and the driver accepts it before navigation. Acceptance checks that the starting point has not materially changed.

For **farm pickup**, the released run shows navigation to the configured farm; the driver explicitly confirms collecting the load they already acknowledged. The existing odometer/start command follows. For **already loaded**, the driver starts after load acknowledgement and release, wherever they are. GPS does not prove loading, arrival or delivery.

The active navigation leg is fixed. A driver can stop it with a reason before requesting a new route, or record its outcome through the existing delivery screen. Navigation and delivery recording remain separate. `DriverDay` follows an accepted GPS sequence when present, so its next-stop link does not revert to the old order. Completed/cancelled visits are removed from the pending queue without rewriting the released manifest or route-stop columns.

## Provider integration

The server uses Google Routes `computeRoutes`, explicit `DRIVE` or `TWO_WHEELER`, confirmed coordinates and a narrow field mask. It first calculates the original sequence, then optionally calculates an optimised sequence using the same origin/return/profile. The output must be a complete permutation and include every leg. An estimated slower proposal is discarded. No straight-line heuristic is presented as road optimisation. Estimates use `TRAFFIC_UNAWARE` and exclude service time, so they are clearly labelled driving estimates rather than delivery promises. Two-wheeler beta cautions are shown.

Road calls are default-off and require both server settings:

- `GPS_ROAD_ROUTING_ENABLED=true`
- `GPS_GOOGLE_ROUTES_KEY` — server-only, restricted to the Routes API with suitable quotas/budget controls.

An optional separately restricted browser key, `NEXT_PUBLIC_GPS_MAPS_EMBED_KEY`, enables a Google Maps Embed place map of the last reported position. Otherwise a normal Maps link is available. The embed is a position map, not a live route polyline. No paid account, key, quota or environment setting was created or changed by this task. Provider activation and real-destination transmission require separate approval.

Requests time out after 15 seconds per calculation. Planning reservations are limited to one per run per 30 seconds; successful request replays recover the stored proposal instead of invoking the provider again. A failed reservation needs a new request after the limit. Fewer than 1 or more than 25 pending visits, missing pins, failed provider responses, fallback routing and malformed permutations leave the manual workflow available. This is not a proof of globally optimal routing.

## Location and security

The browser asks for permission only on driver start/share actions. It watches position and refreshes a stationary position every 30 seconds while visible. It uploads no more often than every 15 seconds; SQL limits accepted updates to one per five seconds. Fixes need valid coordinates, accuracy at most 100 metres and capture time within two minutes (at most 15 seconds ahead). The UI labels fixes older than 90 seconds as out of date. Starting another sharing session revokes the older token; stopping sharing atomically revokes that token and deletes its latest fix, preventing delayed requests from recreating it.

Hiding the page clears the watcher and makes a best-effort stop call. Browser suspension or abrupt network failure can prevent that call; timestamp freshness remains authoritative. Closing, locking or leaving this screen does not provide continuous tracking. A native Android foreground-service app is the next increment. No background GPS reliability claim is made from these browser tests.

The manager read model refreshes every 20 seconds only while the GPS page is visible; configuration forms retain their typed values. Latest-position reads hide records after ten minutes and hide positions on terminal runs. Operational location is scoped to the run: active drivers can update their own released/in-progress run on its service day; only permitted staff read assigned work; customer identities cannot use GPS RPCs. All new tables are private, have RLS, and expose no direct authenticated/anonymous grants. Invoker wrappers delegate to narrowly granted private functions with explicit active-role/ownership checks and empty search paths. Only a service-role entrypoint can store road-provider results; a driver cannot forge proposal metrics with an authenticated RPC.

Proposals bind to the immutable run manifest, run/config versions and pending visit set. Approval/acceptance reject stale proposals. Automatic adoption records the authorising manager/config version and checks that this manager is still active. The existing operational-day lock serialises outcomes, custody and GPS changes. Commands use request keys for replay protection; mismatched actor/action/payload reuse is denied. Location upload bypasses the permanent event log so individual fixes are not copied into audit history; the planning reservation also excludes its transient position snapshot.

Only one latest fix per run is stored. Proposal origins are retained for starting-point validation. The service-only `purge_old_gps_positions()` command deletes fixes older than one day and removes proposal origins older than one day. The live `gps-location-cleanup` database job is active at minute 17 of each hour. Installation verified the schedule and service-role invocation; the first scheduled execution has not yet been observed. Audit events retain policy and decision metadata, not the stream of driver positions. Device-supplied GPS can be inaccurate or spoofed and is not independently verified evidence of distance or delivery.

## Live installation — 1 November 2026

The owner subsequently requested installation on the live system, extending the earlier local-only approval. PR #37 was merged as `82e106b1b94c7010e86e74b18cb8e1aba14c68f1`; its production deployment is READY. The reviewed pending SQL was promoted to `supabase/migrations/20261101143540_gps_route_execution.sql` and applied to the MmaFarms project. `20261101143557_gps_location_cleanup.sql` enables the native database scheduler and registers the hourly cleanup. Local filenames were aligned with the versions recorded by the hosted migration tool after CLI template creation.

Verification confirmed all five GPS tables have RLS and no direct anonymous/authenticated access, the active-admin workspace RPC returns the expected empty workspace, authenticated callers cannot store provider results, and the service role can invoke cleanup. Before/after commercial counts remained 87 orders, zero runs and zero delivery outcomes. No real run, destination, driver position or delivery outcome was created by installation. Security advisors introduced only the expected informational notices for private tables with no direct-access policies; existing warnings were unchanged.

Google Routes credentials are not present in production, so automatic road calls remain disabled pending provider setup. The manager must configure actual farm/return coordinates and create/release an assigned run before a driver can use the workflow. Do not invent farm coordinates. Restricted provider access, real Android testing and a permissioned farm pilot remain outstanding. Existing prices, payments, stock accounting and commercial delivery records were unchanged.

## Verification

Verified locally on 1 November 2026:

- Typecheck and production build passed. Lint passed with the existing `public-information-layout.tsx` image warning and no errors.
- All 134 unit tests passed.
- All 32 GPS, driver-run and routing database checks passed. The eight GPS checks were rerun after the final policy-reuse correction and passed, including disabling reuse without reviving an older policy.
- All eight GPS browser journeys passed: Chromium and WebKit, 390px and 1440px, light and dark themes. These cover both start modes, automatic adoption, optional review, GPS denial/stop, the delivery record following the accepted sequence, and no overflow at 320px.
- The existing Chromium 390px driver journey passed through load acknowledgement, release, delivery and balanced closeout; its unavailable-schema fallback also passed.
- Initial implementation checks used the base SHA above. The later explicitly requested live installation is documented separately; the Google provider remains unconfigured.

Commands:

```sh
npm run typecheck
npm run lint
npm run build
node --experimental-strip-types --test tests/*.test.mjs
node --test --test-concurrency=1 tests/database/gps-routing.integration.mjs tests/database/driver-runs.integration.mjs tests/database/routing-foundation.integration.mjs
node tests/gps-routing.browser.mjs
```

The database and browser suites execute the GPS schema migration in disposable PostgreSQL. The hourly scheduler migration is verified on hosted Postgres, where pg_cron is available. Browser provider responses come from an explicit test-process preload; production code has no fixture-provider mode. The tests use fictional households and synthetic coordinates; they do not charge a provider, create hosted accounts or write production deliveries. Evidence is generated in `work/gps-routing/`. The proposed CI and evidence-upload template is in `docs/verification/gps-routing-checks.yml`; it is inactive because GitHub rejected adding a workflow with the connected account's current permissions. A workflow-authorized account can review and move it into `.github/workflows/`. These checks do not replace a real-device/farm pilot.

Official references checked during implementation:

- [Google waypoint optimisation](https://developers.google.com/maps/documentation/routes/opt-way)
- [Compute Routes request/response and limits](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes)
- [Two-wheeler routing](https://developers.google.com/maps/documentation/routes/route_two_wheel)
- [Maps navigation modes](https://developers.google.com/maps/documentation/urls/get-started)
- [Android location and foreground services](https://developer.android.com/develop/sensors-and-location/location/permissions)
- [Supabase RLS and function permissions](https://supabase.com/docs/guides/database/postgres/row-level-security)
