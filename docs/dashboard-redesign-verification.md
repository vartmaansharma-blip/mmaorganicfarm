# Workspace redesign verification

25 October 2026. New workspace design; separate from the earlier functional release.

## Result

The shared brand header, remembered collapsible navigation, mango daily briefing, mint/sky summaries and rebuilt Capacity editor are implemented. Ordinary form saves report inline without a same-page navigation. The repeating Overview refresh and standalone refresh button are removed. Mobile pull-and-release refreshes the current scope and protects unfinished edits.

## Checks

- Production Webpack build and TypeScript: passed.
- ESLint: no errors; one existing public-site image warning.
- Unit checks: 85 passed. Native PostgreSQL integration checks: 34 passed.
- Chromium and WebKit journeys: passed, no recorded runtime errors. Widths include 320, 375, 390, 430 and 1440 pixels.
- Capacity default limit, date limit and restoring a normal limit: actual writes verified against the native database. The page URL and filters stay stable; the scrolled row stays in view and validation errors preserve entered values.
- Refresh: synthetic touch events exercise both browser engines. Repeated gestures coalesce into one request; product/page scope is retained; dirty forms and offline state block refresh. This is browser automation, not a real-device field test.
- Navigation: desktop collapse returns workspace width, mobile selection closes the menu, Escape closes it and returns focus, the brand remains visible, and every exercised page has no horizontal overflow at 320 pixels.
- Access: driver isolation, manager denial of owner-only Finance and the owner Finance view remain covered. Existing delivery outcome, customer request and closeout journeys pass.
- Sampled palette text pairs meet a contrast ratio of at least 4.5:1; the primary action is 5.0:1. This is not a claim of a full accessibility audit.

## Evidence boundary

Browser journeys run the production Next pages and real server actions against native PostgreSQL, with a test-only Auth/REST HTTP adapter and fictional records. They do not exercise hosted GoTrue/PostgREST or establish real-device gesture behaviour. No production schema changes or customer-data edits are part of this redesign. Hosted build, deployment revision and live routing are verified separately in the release handoff.

## Review references

- [Design plan and palette](dashboard-redesign-plan.md)
- [Overview](screenshots/delivery-operations/chromium-dashboard-overview.png)
- [Collapsed navigation](screenshots/delivery-operations/chromium-dashboard-collapsed.png)
- [Mobile overview](screenshots/delivery-operations/chromium-dashboard-mobile.png)
- [Capacity](screenshots/delivery-operations/chromium-page-capacity.png)
- [Mobile capacity and unfinished-edit guard](screenshots/delivery-operations/chromium-capacity-mobile.png)
