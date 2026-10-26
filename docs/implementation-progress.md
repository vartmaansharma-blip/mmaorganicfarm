# Implementation progress

## 26 October 2026 — routing foundation

Current priority: reliable delivery routing, following the owner's current request. See `routing-foundation.md` for the verified baseline, data ownership, implemented scope, release order and remaining work.

Implemented locally: ambiguity-safe matching, optional confirmed entrance pins, delivery-coordinate snapshots, coordinate navigation with address fallback, manager readiness checks, release protections and route-permission corrections.

The owner authorised merging after passing checks. Local production build, 113 source/unit checks, 59 baseline database checks, 14 new-schema routing checks and all eight browser engine/width/schema combinations pass. The code supports the existing schema during rollout. No production migration has been applied for this increment. The farm's actual addresses, driver navigation and paid service-day fulfillment still require authorised hosted acceptance.
