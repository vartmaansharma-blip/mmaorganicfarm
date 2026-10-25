# Checkout reliability audit — 25 October 2026

Target: `vartmaansharma-blip/mmaorganicfarm`, Vercel `mmaorganicfarm`, Supabase **MmaFarms** (`gorlusptyzndobqviocv`). GridMind was not queried or changed.

## Production evidence

- PR #5 is merged at `1ab8c5f006046203b411d8e40935ee5fb888ef8e`. Vercel deployment `dpl_5WZ97ci8XFdn8aJFamq3pjcXxnfQ` is READY, targets production and serves `mmaorganicfarm.vercel.app` at that SHA.
- Vercel recorded two missing `save_pending_monthly_plan` schema-cache errors at 05:36 UTC, and one scheduled-offer lookup error at 05:33 UTC. Supabase also recorded a missing `billing_model` column before migration.
- Migration history confirms `20261025053844 monthly_product_schedules`. PostgREST logged the reload notification at 05:38:44 UTC and a successful cache load at 05:38:46 UTC (11:08:46 IST). The required plan columns, test flags and RPC identities/ACLs are present. These failures predate migration; they are not evidence of a current stale cache. No cache reload or DDL was performed in this audit.
- The sampled logs after migration contained no corresponding new errors. This does not establish that checkout succeeds: there was no authenticated order submission or provider transaction during this audit.
- Production shop and milk product pages render, including the independent monthly calendar. An existing signed-in legacy pending calendar also loads. No calendar control was submitted.
- Vercel metadata shows the configured Supabase and Razorpay variable names apply to both preview and production. Secret values and the actual configured Razorpay mode/credential validity were not retrieved or verified.

## Reproduced defects and changes

1. A definitive Razorpay order-creation rejection left a monthly order in `pending_payment` without a provider ID. Recover only the claim acquired by this request, release its hold while frozen, and conditionally restore the draft. Network failures, timeouts, rate limits and server errors remain frozen for reconciliation. Re-read the provider ID after a successful claim to reuse an order bound by a concurrent request.
2. Test payments were recorded without `is_test`, followed by normal order activation. Require key/order mode agreement, reject live keys on previews and carry the test flag onto payments. Test capture records only the payment: it never marks the order paid, activates a plan, consumes production capacity or inserts a customer notification. This also avoids the database's paid-one-time-order route assignment trigger. Test orders must already be explicitly marked by the farm; normal customer drafts are not silently relabelled.
3. A failed client verification request left an unhandled callback and could allow an unsafe retry. Show an actionable pending-confirmation message, keep Pay disabled after provider submission, and link to the profile. Test result screens do not claim a real order or delivery activation.
4. Sign-in return validation accepted slash/backslash and control-character URLs that browsers normalize into external destinations. Use one same-origin validator for email sign-in, sign-up, page redirects and OAuth callback, preserving valid checkout choices.
5. Completed monthly plans vanished from the calendar lookup, and schema/query failures were treated as absence of a plan. Include completed plans, surface query errors with a retry boundary, and distinguish schema-cache failures in plan-saving feedback.

## Validation

- 75 source/unit/regression tests passed, including 13 new reliability tests with synthetic clients/provider responses. These cover definite versus uncertain provider outcomes, competing/rebound checkout claims, test/live isolation, verification network failure, auth return paths, completed calendars and schema-cache feedback.
- TypeScript passed. Lint: zero errors; one existing image warning in `public-information-layout.tsx`.
- Optimized Next.js webpack production build passed.
- Existing synthetic local PostgreSQL suite passed: monthly migration, ownership/RLS, custom dates, full-month capacity, provider freeze, actual sheet generation, nonmilk completion and legacy idempotency. No production database writes were used for these checks.
- Hosted preview evidence is reported with the PR and handoff; it must not be inferred from local tests.

## Remaining release boundaries

- This PR is a preview/review candidate. It does not merge or deploy production and contains no schema migration.
- No real customer payment was initiated, no production customer record changed, and no Razorpay transaction was created. Successful provider capture, authenticated hosted checkout and a production release remain unverified.
- An uncertain provider outcome deliberately needs farm reconciliation; automatic retries are unsafe without provider-side reconciliation/idempotency. This change does not repair historical stuck orders.
- Existing Supabase advisories: leaked-password protection disabled; the monthly RPC is intentionally authenticated SECURITY DEFINER with an explicit identity check; webhook-event RLS has no client policies (server-only use). Two route foreign-key indexes are missing. These advisories were observed, not changed by this PR.

References: [Supabase cache reload](https://supabase.com/docs/guides/troubleshooting/refresh-postgrest-schema), [Supabase verified user lookup](https://supabase.com/docs/reference/javascript/auth-getuser), [Razorpay test/live API keys](https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/).
