# M’ma Organic Farm feature-integration audit

Audit date: 24 November 2026 (IST)  
Audited revision: `054fe982afcc6a72219580278dea82adf6a67c98` (`main`)

## Decision

`main` already contains the compatible, customer-facing work that was the
subject of the recent completed-feature release. Do **not** merge any of the
three remaining draft pull requests as a batch. Each was based on an older
revision and at least one requires production database work that is deliberately
not in deployable migration history. Combining them now would create an
unreviewable release and could expose order, payment, or staff-operation
behaviour before its schema and operating controls are approved.

This audit PR makes no database, payment, merchant, customer-record, or
production change. It is a release-readiness record and a safe hand-off for
the remaining work.

## Approved customer experience: implementation status

| Product decision | Status in `main` | Evidence and boundary |
| --- | --- | --- |
| Five-section My M’ma: Today, Schedule, My Plans, Orders, Account | Implemented | The primary account navigation remains five sections. Notification Centre is a secondary authenticated route, not a sixth section. |
| One customer Notification Centre from the site header and My M’ma | Implemented | PRs #52 and #53 added the shared bell, preview, inbox, filters, cursor paging, read state, owned-record links, error/retry handling, and a compact Today summary. |
| Customer and farm-staff notifications stay separate | Implemented | Customer reads use `customer_notifications` with customer RLS; farm notification work remains isolated in draft PR #21. No staff source is exposed through the customer bell. |
| Date-specific delivery details | Implemented | PR #49 added date-specific Today and calendar links with server-side eligibility rechecks. |
| Unified Week/Month delivery calendar and repeatable date exceptions | Code merged; activation remains blocked | PRs #57/#59 contain the interface and exact-dated hand-off. The corresponding persistence SQL is verification-only (`docs/verification/master-delivery-calendar.local.sql`), not a deployable migration or approved production install. |
| Correct net payment/refund adjustment for customer calendar edits | Not production-ready | The merged calendar UI intentionally does not establish an automatic paid-plan amendment or refund authority. Existing paid-amendment paths remain authoritative. Do not claim automatic settlement or refunds until a reviewed migration, provider workflow, and reconciliation test are approved. |
| Brand kit and transparent milk hero | Implemented and preserved | Brand/palette work, the transparent-milk final frame, and the approved latte reveal are on `main`. This audit makes no brand or unrelated storefront redesign. |

## Marketing, sales, and conversion review

The current release contains safe conversion improvements without deceptive
claims: the customer header links to My M’ma, cart choices are clearer, product
routes are direct, the storefront can request a delivery locality with manual
override, and the referral experience is explicitly gated by its backend
availability. The bell and Today summary direct signed-in customers toward real
delivery or payment actions rather than generating promotional activity.

Keep these guardrails for subsequent marketing work:

- Use verified product, availability, delivery, price, and referral terms only.
- Keep promotional conversion cues separate from private account notifications.
- Do not add fabricated scarcity, delivery promises, testimonials, discounts,
  customer counts, or payment-completion claims.
- A referral or fee experience must stay hidden or fail closed when its schema
  or operational approval is absent.

### Benchmark-quality experience bar

The intended standard is a highly visual, differentiated commerce experience,
not a text-led brochure. The existing cinematic product reveal, real product
photography, responsive shop presentation, motion safeguards, and direct
product-to-cart paths are the foundation. Future changes should earn their
place by improving one of four outcomes: product desire, buyer confidence,
purchase clarity, or repeat customer value. They must also retain fast loading,
keyboard and reduced-motion support, clear mobile hierarchy, and truthful
commercial content. A visual effect that delays shopping, obscures price or
delivery terms, or invents proof is not a conversion improvement.

## Open pull requests and disposition

| PR | Scope | Disposition | Why it is not included in this PR |
| --- | --- | --- | --- |
| #21 — farm notifications, milk intake, review preview | Internal staff notification centre, milk-intake audit trail, synthetic review mode | Keep draft and split before reconsidering | Requires two unapplied production migrations. Its review mode is synthetic and explicitly blocks production activation. It is not the customer Notification Centre. |
| #27 — selectable combined checkout | One gateway payment allocated to one-time and scheduled orders | Keep draft; superseded/overlapping payment work must be reconciled first | Based on an October revision, overlaps later combined-checkout work, and requires its own unapplied payment schema. Live checkout remains explicitly disabled pending merchant-owner authorization and provider verification. |
| #44 — order fees and bottle modes | Farm price settings, fee itemization, bottle choice | Keep draft; extract only after an approved migration and current-main rebase | Its branch includes a large stale lineage and stores required SQL under `docs/verification/`, outside migration history. It must not be released with an uninstalled schema or merged as a broad conflict resolution. |

## Recently completed work reviewed

| PRs | Result |
| --- | --- |
| #49, #50, #52, #53, #54, #55 | Date-specific delivery details, bottle/delivery presentation, customer Notification Centre and refinement, Today delivery management, and compact delivery visual release were merged. |
| #56, #57, #58, #59, #60 | Storefront/account/referral presentation, master calendar interface, approved latte reveal, the integration release, and the hidden-tab animation correction were merged. |
| #59 release boundary | The integration notes correctly state that locally verified SQL was not installed in production and database-dependent features must fail closed. That boundary remains in force. |

## Security and operational assessment

- The customer notification migration on `main` limits authenticated updates to
  `read_at`; customer queries also scope to the authenticated user. This is the
  correct boundary for the existing read-state feature.
- Notification links validate UUID-shaped related identifiers, then route into
  owned account views. They do not expose a staff inbox or act as authority to
  change delivery/payment state.
- The notification filters and five-item preview fetch bounded pages. The inbox
  uses a `(created_at, id)` cursor, avoiding an unlimited customer history read.
- Customer notifications are generated by stored delivery/payment workflows;
  opening or reading a notification does not alter orders, quantities, refunds,
  subscriptions, stock, or payments.
- Referral, calendar-persistence, combined-payment, fees, and farm-intake
  database changes require separately reviewable, versioned migrations with RLS
  and migration-history verification before any activation.

## Required next decisions

1. Keep the current production payment gate disabled until the authorized
   merchant owner completes provider, webhook, settlement, and controlled
   payment verification.
2. If calendar self-service is to alter paid plans, approve a dedicated
   financial-adjustment design first: authoritative ledger records, idempotent
   provider/refund actions, customer communication, inventory revalidation,
   and reconciliation. Do not infer it from the UI prototype.
3. Treat farm intake (#21), combined checkout (#27), and fee/bottle settings
   (#44) as separate feature releases. Rebase each onto the then-current main,
   convert approved SQL into versioned migrations, verify RLS/permissions, and
   obtain operational sign-off before opening a release candidate.

## Validation recorded for this audit PR

The audit branch changes documentation only. The application tree at audited
`main` is byte-for-byte identical to the validated checkout at
`92af6e6d90c2eda024a4cd0c4b4c67e58d503db1` (the parent of the current merge
commit), so validation was run there because this audit worktree does not carry
an installed dependency tree.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed with zero errors and one existing `no-img-element` performance warning in `app/components/public-information-layout.tsx`. |
| `npm run build -- --webpack` | Passed: optimized production build completed and generated all 25 static pages. |
| `node --experimental-strip-types --test tests/*.test.mjs` | Passed: 161/161 tests. |
| `git diff --check` | Passed on this audit branch. |

The default Turbopack build command cannot resolve `next/package.json` in the
shared local symlinked dependency layout, even though TypeScript and lint can
run there. The explicit webpack production build is the established portable
fallback and passed. This is a local tooling-layout issue, not a release claim
for a new application change.
