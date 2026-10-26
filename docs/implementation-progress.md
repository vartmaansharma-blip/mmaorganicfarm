# Implementation progress

## 26 October 2026 — routing and driver-run activation

- [x] Preserve the existing business and accounting architecture.
- [x] Implement and merge routing protections, confirmed entrance pins and driver-run custody.
- [x] Activate the reviewed routing and driver-run migrations on MmaFarms.
- [x] Verify migration history, RLS, RPC grants, role-scoped reads and unchanged existing business records.
- [x] Verify the authenticated live owner workspace.
- [x] Guide first-use preparation instead of allowing an empty run form to submit.
- [ ] Farm enters real vehicle registration/capacity and driver contact details; confirms actual availability and load.
- [ ] Field pilot verifies actual entrances, physical deliveries, return handling and odometer readings.
- [ ] Add native-capable GPS tracking and durable offline queues, then validate against odometer evidence.
- [ ] Add location/time-aware route proposals and controlled sequence changes.
- [ ] Add reviewed driver-pay statements after the farm supplies agreed rates and rules.

The pending files were activated as `20261026172231_routing_foundation.sql` and `20261026172251_driver_run_foundation.sql`; their reviewed contents and hashes are unchanged. Existing-schema fallbacks remain for older environments.

See [routing foundation](routing-foundation.md), [driver runs](driver-runs.md) and [activation verification](routing-activation.md). Completed software checks do not claim completion of a real delivery or a GPS/pay pilot.
