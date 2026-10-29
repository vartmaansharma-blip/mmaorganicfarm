# Razorpay release boundaries

The live checkout guard is a safety-only release. It may be deployed with
`RAZORPAY_LIVE_CHECKOUT_ENABLED=false` before live-payment acceptance is complete.
Only the exact string `true` allows a new live provider order. Test orders still
require test credentials and farm approval; live keys remain blocked in previews.
Verification and webhooks remain available to recover existing payment attempts.

`GET /api/payments/razorpay/order` returns only the payment `mode` and
`liveCheckoutEnabled`, with no-store
caching, without contacting the database or Razorpay. A false value is not proof
that account credentials or webhook delivery work. Use it after deployment to
confirm the production runtime's mode and that it has not enabled new live checkout.

## Before enabling real customer charges

- Obtain verified authorization from the adult merchant account holder.
- Verify production live credentials and separate preview test credentials without
  exposing values. Existing payment attempts must retain a recovery path.
- Verify the current production webhook URL and signing secret, event delivery,
  retry behavior and simultaneous webhook/checkout verification.
- Complete an authenticated hosted test checkout without activating fulfilment,
  routes, real capacity or customer notifications.
- Reconcile existing pending provider orders from authoritative provider history;
  an uncertain payment must never prompt another charge.
- Verify capture processing is transactional and repeatable, including quantity
  adjustments, notifications, out-of-order authorization and partial failures.

Account activation or an issued live key alone does not enable this application's
live checkout or authorize a transaction.

## Atomic confirmation deployment

Install `20261029133430_razorpay_atomic_payment_confirmation.sql` before deploying
its application callers. It creates a private confirmation ledger and one
`SECURITY INVOKER` RPC executable only by `service_role`. Installation does not
rewrite existing orders, payments or notifications. The application fails with a
retry response if this RPC is missing; it never falls back to partial writes.

The RPC locks the order, validates provider references, amount, currency and test
mode, preserves captured status against delayed authorization, and commits all
fulfilment effects together. Replays of an applied quantity change preserve later
edits. Notification or capacity failures roll back the entire confirmation.
Previously completed legacy work is recovered without repeating its notification.
Cancelled orders/plans and additional captures retain financial evidence and return
`review_required` without granting service again. Such cases need farm review.

The webhook checks exact-body HMAC, validates captured INR evidence, and returns
503 for database lookup/recording failures or a missing local order. It records
an event only after successful capture processing. Duplicate event IDs and
simultaneous checkout verification share the same transactional effects.

Local acceptance covers concurrent connections, rollback and recovery, test
isolation, late authorization, cancellations, duplicate captures, binding and
permission denial. These tests use synthetic provider evidence and an isolated
PostgreSQL fixture. They do not establish hosted provider delivery, valid live
credentials, or a completed customer payment.

Changing Vercel credential targets affects future builds. Older immutable preview
deployments retain their original configuration; scope separation is not credential
rotation or revocation. Preview checkout remains unavailable until distinct test
credentials are configured. Keep the production activation gate false throughout.
