# Master Delivery Calendar audit

Baseline `f45299ecda155a62c54f1f03aad928f402a6298a` from `origin/main`. Source inspection and local fixtures establish the baseline. Hosted customer and driver acceptance is a separate check.

| Area | Baseline | Reuse and remaining work |
| --- | --- | --- |
| Shop schedule and checkout | Partially implemented | `app/shop/scheduled-product-details.tsx`, `app/shop/shared-calendar.tsx` and `lib/monthly-schedule.ts` already handle repeat modes and price a finite prepaid month. The master preference shares weekday resolution with the Shop. The Weekly Schedule can now pass one resolved month with exact per-date quantities to the existing checkout. |
| Recurring preferences | Missing | `weekly_delivery_items` requires a plan ID. Monthly purchase rules in `delivery_plans.schedule_rules` describe one prepaid period. Customer-level, effective-dated versions provide continuity without rewriting purchases. |
| Individual dates | Partially implemented | `delivery_exceptions` and `delivery_pauses` handle eligible legacy plans. They require a plan ID and keep their existing semantics. Customer-level projected exceptions apply before a paid plan exists. Existing paid controls retain authority for paid changes. |
| Monthly and weekly views | Partially implemented | `app/calendar/page.tsx` already shows legacy controls and paid monthly lines. The first phase adds a weekly product matrix and conventional month grid to the same route. Both resolve the same preferences. |
| Payments and capacity | Implemented for existing supported purchases; master purchase unverified | The Razorpay APIs, `lib/monthly-checkout.ts` and the monthly claim function verify saved rows, totals, capacity and capture. The master-calendar quote uses the same monthly materialization and payment path. Hosted capture and paid amendments remain separate checks. |
| Confirmed delivery and driver manifest | Implemented for existing paid paths; master amendments missing | Nightly preparation consumes paid plans and dated items. Released visits and reconciliation retain their audit history. The preference write path does not generate orders or manifest stops. |
| Site, hero and notifications | Implemented; broader directive pending | The cinematic hero, product gallery, and customer notification centre are present on the baseline. This calendar phase preserves them. The directive’s new marketing, driver stock, and paid amendment requirements need separate review. |

The local SQL grants access through customer-scoped functions. An optimistic revision rejects edits from stale devices. Weekly versions apply from the next delivery day. Explicit zero skips the product on the selected date and clearing the exception restores the weekly preference. Existing paid and confirmed records remain authoritative in the calendar.
