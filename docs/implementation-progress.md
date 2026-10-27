# Implementation progress

## 26 October 2026 — routing and driver-run activation

- [x] Preserve the existing business and accounting architecture.
- [x] Implement and merge routing protections, confirmed entrance pins and driver-run custody.
- [x] Activate the reviewed routing and driver-run migrations on MmaFarms.
- [x] Verify migration history, RLS, RPC grants, role-scoped reads and unchanged existing business records.
- [x] Verify the authenticated live owner workspace.
- [x] Guide first-use preparation instead of allowing an empty run form to submit.
- [x] Polish shared dashboard/driver navigation, loading, save feedback, run transitions and reduced-motion behaviour.
- [ ] Farm enters real vehicle registration/capacity and driver contact details; confirms actual availability and load.
- [ ] Field pilot verifies actual entrances, physical deliveries, return handling and odometer readings.
- [ ] Add native-capable GPS tracking and durable offline queues, then validate against odometer evidence.
- [ ] Add location/time-aware route proposals and controlled sequence changes.
- [ ] Add reviewed driver-pay statements after the farm supplies agreed rates and rules.

The pending files were activated as `20261026172231_routing_foundation.sql` and `20261026172251_driver_run_foundation.sql`; their reviewed contents and hashes are unchanged. Existing-schema fallbacks remain for older environments.

See [routing foundation](routing-foundation.md), [driver runs](driver-runs.md) and [activation verification](routing-activation.md). Completed software checks do not claim completion of a real delivery or a GPS/pay pilot.

Interaction behaviour and acceptance coverage: [farm workspace interactions](farm-interactions.md).

## 27 October 2026 — farm notifications and physical intake

GPS/background tracking and adaptive routing are paused at the owner’s request. The next independent feature is daily physical milk intake, with the requested top-header notification centre implemented alongside it.

- [x] Replace work-row action banners with stacked notices and user-scoped tab history.
- [x] Add the Apple-pattern bell overlay, grouped updates, dismiss actions, keyboard focus and reduced motion.
- [x] Connect committed operational events to a role-scoped persistent notification feed shared by owners and managers.
- [x] Record measured milk intake, audit corrections/voids and preserve physical quantities.
- [x] Test blocked driver deactivation without changing access or shifting the row/layout.
- [ ] Approve and activate the two reviewed migrations on MmaFarms.
- [ ] Verify the exact merged deployment and authenticated hosted owner workspace.

See [farm notifications](farm-notifications.md) and [daily milk intake](daily-milk-intake.md). Local evidence does not imply live activation.

Sign-in is preserved and paused on a separate, sample-data review preview. Owners/co-founders, managers and drivers can be inspected without an account; preview mutations are blocked. See [dashboard review](dashboard-review.md). This mode cannot activate in the production environment.
