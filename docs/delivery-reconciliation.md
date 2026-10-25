# Delivery exception and reconciliation migration

The additive migrations, in order, are:

1. `supabase/migrations/20261024191731_daily_delivery_reconciliation.sql`
2. `supabase/migrations/20261025101515_nightly_dispatch_preparation.sql`
3. `supabase/migrations/20261025102357_driver_customer_requests.sql`

It must be reviewed against an existing farm database with the ordered legacy baseline present. It is not a standalone empty-project bootstrap. The executable, isolated baseline list is maintained in `tests/database/runtime.mjs` as `baselineFiles`; the list begins with customer profiles/plans/calendar and ends with the route dispatch workbench, route-retirement audit and the merged monthly-product-schedules migration. The test creates minimal local Auth identities and executes those files in order before the migration.

The migration adds immutable delivery events, outcome projections, actual product quantities, entitlement baselines/movements, linked replacements, and versioned daily reviews. It updates existing dispatch/outcome entry points so they cannot bypass the accounting boundary. It introduces no payment capture, automated refund, purchased-term rewrite, or automatic monthly financial adjustment.

Public operational functions delegate to role-checked private implementations. Driver access is restricted to assigned released visits; managers review exceptions and closeout; customer history is limited to the customer or authorized managers. Private and public grants are explicitly restricted. Native database tests exercise authorization as database roles rather than trusting page visibility.

## Automatic preparation

The Vercel schedule invokes `/api/cron/prepare-dispatch` at a target of 21:05 IST (`15:35 UTC`). Provider plan and timing constraints must be verified in the preview; the schedule is not an exact-time delivery guarantee. Configure a server-only `CRON_SECRET` of at least 32 characters and set `FARM_AUTOMATION_ENABLED=true` only after review. `.env.example` keeps the feature off by default; no live secret or environment setting is changed by this task.

The endpoint validates its bearer secret and invokes a service-role-only database command. The job prepares tomorrow's paid delivery draft and default driver assignments, logs completed attempts, retains failed runs and rolls back partial preparation. It does not release dispatch, charge customers or send messages. Released/closed days are preserved. A manager can retry failed preparation from Activity; successful repeated calls reuse the existing run. System work uses a null actor rather than impersonating a member of staff.

## Spoken requests at delivery

A driver may capture a future request only from their assigned released visit today. The request stores the exact customer words, requested date, customer, source visit and staff member, with an immutable creation event. Capturing the request does not alter today's outcome or any prepaid quantity.

Managers can approve a full milk skip for an identified, verified active delivery-count plan on an unlocked future day. Approval skips milk only, refreshes that plan's draft work and retains other products. It rejects released/closed days, quantity overrides, replacement work, ambiguous plans and passed dates. Decisions are audited and idempotent. Quantity changes and other requests can be declined or kept for follow-up; this command cannot pretend that a quantity change has been applied. Extra milk requires payment, and reduced prepaid quantity follows the next-calendar-day rule in the reviewed adjustment workflow. For calendar-month plans, this request remains a manager follow-up until the dated plan adjustment is reviewed.

## Validation commands

- `npm run typecheck`
- `npm run lint`
- `node --experimental-strip-types --test tests/*.test.mjs`
- `npm run test:db`
- `npm run build -- --webpack`
- `npm run test:operations:browser`

The database tests use disposable native PostgreSQL. Browser checks use the actual production Next build, native PostgreSQL and a narrowly scoped test Auth/REST adapter. They are not evidence that hosted GoTrue/PostgREST or deployed environment configuration works.

The default Turbopack build previously stalled in this environment; the completed production build uses the explicit Webpack option above. The build/test results must identify the actual command used.

## Review important limits

Full skip preserves the original service and moves it to a valid plan-end date; reduced milk follows the next-calendar-day rule, with capacity conflicts surfaced. Delivery failure records physical facts separately from the manager's service resolution. Replacement completion must consume the original entitlement once. Closing a day cannot erase outstanding prepaid service; review corrections create new versions.

The daily bottle reconciliation uses documented legacy return expectations. It does not verify physical farm/customer stock balances. Calendar-month fulfilment preserves dated quantities and finite plan completion without consuming a milk-credit count. Billing and entitlement models must agree. Monthly rescheduling and carry-forward through the legacy adapter remain blocked.

No migration has been applied to production by this task. Review migration history and take the normal database backup before an approved release; do not apply a legacy baseline blindly over an existing production schema.

## Current main integration

Rebased on `2b943d5` after customer design, shop/monthly schedules and checkout reliability merged. The monthly schema must already be present before these additive migrations. Existing calendar-month plans are classified as calendar-period entitlements; new monthly RPC inserts receive that classification automatically. Paid dated generation, ordinary/partial outcomes, nonmilk completion, period bounds and full-month capacity reservation are preserved. Automatic monthly entitlement adjustments require their own reviewed policy and are not routed through legacy milk credits.
