# Routing and driver-run activation — 26 October 2026

## Outcome

The next unfinished release step was activating the routing and driver-run foundation already merged in PRs #18 and #19. The owner explicitly authorised completing the next step and making the necessary changes. Activation targeted **MmaFarms**, project `gorlusptyzndobqviocv`; GridMind was untouched.

| Foundation | Recorded live version | SHA-256 of reviewed SQL |
|---|---|---|
| Routing, entrance pins and release checks | `20261026172231` | `09131d9ee17257295a59d7d0f1814d239f72dda5035b0d4f8276607a4b0c4c43` |
| Drivers, vehicles and delivery-run custody | `20261026172251` | `f397c968fa249e8828f467480e350b0cc1329450fdc7229c77d87fd8a4e7746d` |

The originally pending SQL was applied sequentially, checked independently, then moved unchanged to matching migration-history filenames. This records the actual server-assigned versions and avoids representing applied work as pending. No new paid service was configured.

## Verified live

- MmaFarms was healthy before activation. No released current/future dispatch was present in the preflight.
- Both migration-history rows and the expected tables, columns and functions exist after activation.
- All six driver-run tables have RLS and deny direct anonymous/authenticated table access. The four public routing/run RPCs are invoker functions with an empty search path; authenticated execution is granted and anonymous execution is denied.
- Existing profile, plan, order, payment, delivery, item and staff fingerprints matched before and after both migrations. Delivery comparison excludes only the three newly added nullable snapshot columns. No business records were backfilled or test journeys written to production.
- Live admin workspace reads and driver-only workspace reads passed under the existing staff identities in transactional database role contexts. The driver response hides other routes. A nonstaff authenticated context was rejected. These role probes rolled back and did not alter business records.
- The deployed `/farm/runs` screen rendered through the owner's existing authenticated Chrome session and the hosted backend after activation. The live screen showed the actual empty vehicle/run setup, rather than the old missing-schema fallback. This verifies the hosted read path, not a real physical delivery journey.

## First-use improvement

An empty setup previously displayed a creation form whose required selectors contained no options. The run workspace now explains the three prerequisites and links directly to Driver team, Vehicles and the dated dispatch board. It disables run creation until those displayed choices exist. The database remains authoritative for assignments, stock, active-run reservations and release permission.

No driver availability, vehicle registration, capacity, load or compensation rate was invented. Farm staff must supply and confirm those real values before a physical run.

## Security advisor boundary

No new warning-level advisor class appeared. Six new informational [RLS-with-no-policy findings](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) are intentional: these tables have no client grants and are accessible through role-checked RPCs only. Adding permissive policies to silence the advisory would weaken this design.

Pre-existing [public definer-function warnings](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and disabled [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remain separate baseline items. The new exposed entry points use invoker functions and did not add public definer warnings.

## Acceptance boundary and next work

The complete write journey is covered using synthetic local records and native PostgreSQL in Chromium/WebKit. Hosted owner reads, live metadata and role boundaries have now been checked separately. Actual entrance accuracy, physical loading/delivery/return, field connectivity and odometer accuracy remain operational acceptance work. GPS distance, background tracking, adaptive routing and pay calculations are not part of this activation.

The next implementation stage is native-capable tracking and a durable offline event queue. Select and test the actual fleet phone platform before claiming locked-screen tracking or measured kilometres. First live dispatch also needs the real vehicle and driver details shown by the preparation checklist.
