# Razorpay release boundaries

The live checkout guard is a safety-only release. It may be deployed with
`RAZORPAY_LIVE_CHECKOUT_ENABLED=false` before live-payment acceptance is complete.
Only the exact string `true` allows a new live provider order. Test orders still
require test credentials and farm approval; live keys remain blocked in previews.
Verification and webhooks remain available to recover existing payment attempts.

`GET /api/payments/razorpay/order` returns only `liveCheckoutEnabled`, with no-store
caching, without contacting the database or Razorpay. A false value is not proof
that account credentials or webhook delivery work. Use it after deployment to
confirm that the production runtime has not enabled new live checkout.

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
