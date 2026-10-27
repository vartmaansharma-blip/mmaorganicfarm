# Farm notification centre

## Behaviour

A single bell in the shared top header opens a floating panel over the current workspace. It does not add a navigation item, data column or permanent sidebar, and the underlying page keeps its width. The visual reference is [Apple’s Notification Centre](https://support.apple.com/en-gb/guide/mac-help/mchl2fb1258f/mac): grouped stacks, a right-side overlay, quick actions and links back to the relevant work. M’ma retains its own type, logo and palette.

Action messages move out of full-width work-row bars. Up to three compact alerts can appear together at the top right; each can be dismissed or opened in the centre. Success notices expire after six seconds; attention notices after ten. The last fifty action notices remain in the current browser tab’s session history, scoped to the signed-in user. Reloading that tab retains them; another staff account does not inherit them. Storage failure leaves the current in-memory notices usable. Form feedback remains accessible to assistive technology without expanding the row. Native required-field validation and persistent record-level warnings keep their existing meaning.

The supplied driver-deactivation example is a blocked action: access stays active until the existing assignment checks permit a change. Notification dismissal does not deactivate a driver or bypass that guard.

The panel is one chronological feed, organized into expandable stacks by activity. Each notification has a timestamp, a link to its workspace, and a discreet dismissal control. There are no read/unread states, counters, filters or mark-as-read controls. Keyboard focus stays in the panel; Escape or outside click closes it and restores the bell. The page behind is inert while open. Motion respects reduced-motion preferences. The panel fits narrow 320 px screens.

## Coordinated farm activity

Owners/co-founders (the existing admin role) and managers share a persistent operational feed generated in the same database transaction as the committed activity. Managers see delivery, run, customer-request, preparation, capacity and milk-intake activity. Payment and staff-access updates remain restricted to owners by the database. Drivers receive their own tab’s action messages. No new privileged role or external messaging integration is created. The database checks the current active role independently of UI visibility.

Covered sources are delivery outcome/review and spoken-request events, driver/vehicle/run events, captured non-test payments, immutable preparation attempts, capacity changes and override removal, staff access changes, cancellation updates, and milk-intake events. Event keys prevent repeated capture of the same source event. Repeated payment-capture status updates cannot duplicate the notification. Test orders/payments are excluded. Failed preparation notifications link to activity without copying raw database error details.

Self-service plan cancellation does not generate a spurious pending-review alert for the transient request state; the completed cancellation update is recorded instead. Dismissing an update changes only that viewer’s dismissal metadata. It does not approve dispatch, settle service exceptions, change payment evidence, or alter physical intake.

The feed displays the latest thirty days, with stable ID pagination and a separate dismissal record for each viewer. There is no historical backfill. On arrival in an already open dashboard, updates are checked while the document is visible every sixty seconds, on window focus, after a confirmed save and when the panel is opened. This is in-app refresh, not an operating-system push or an email/WhatsApp integration. Browser action failures stay in the actor’s tab; they are not presented as committed farm activity.

A failed feed read shows an unavailable/retry state and retains already loaded records. It never reports a failed read as an empty farm.

## Release

`supabase/migrations/20261027105812_farm_notifications.sql` creates two RLS-enabled, RPC-only tables, private role-checked functions, public invoker entry points, and notification triggers on existing authoritative event/state tables. No existing record is backfilled or rewritten. The immutable notification event is distinct from viewer dismissal records.

This feature is a review candidate until its exact migration and deployment are approved and verified. Native PostgreSQL and local production-build browser checks are evidence of their respective boundaries; they are not live activation evidence.
