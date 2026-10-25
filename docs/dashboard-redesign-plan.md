# M’ma dashboard redesign and interaction plan

25 October 2026. Plan first, then implement in the existing farm app. The earlier deployed version is the functional baseline, not the visual standard.

## What arriving should feel like

A recognisable M’ma workspace: warm, confident and calm. Within five seconds, a staff member should understand the selected service day, the current operational stage, what has been completed, and the next useful action. Successful work should produce a quiet acknowledgement beside the action. Normal work should never jump the user back to the top.

## Shared foundation for every page

- Put the existing transparent M’ma logo in a persistent top brand header above the workspace and navigation. Remove the added white tile and sidebar-only branding. Preserve the actual logo and its proportions. The brand remains visible on Overview, Capacity and every other farm page, including collapsed navigation and mobile.
- Use clean white surfaces, deep green text, bright leaf green actions, a mango daily briefing, sky-blue commitments and mint completed work. Coral identifies items requiring attention. Keep saturated accents in navigation, actions, small icons and progress bars; use lighter versions in summary cards. Labels must communicate the same meaning as colour. Remove the grey-green wash, old yellow capacity slab, black controls and tiny labels.
- Use one readable interface type system, consistent 8px spacing, 12px corners, 44px touch targets, aligned numeric quantities and visible units. Keep expressive typography to page titles. Keep long explanations in contextual disclosures.
- Keep the collapsible sidebar as the primary navigation, with clear groups, stable active-page indication, accessible compact labels and remembered collapse state. Mobile uses a clearly labelled menu. Remove redundant back/next-page navigation chrome; retain relevant task actions and necessary record pagination.
- Every page has a purpose, current scope, primary work area, and a clear empty/error/loading state. No invented live badges, success claims or unverified stock balances.

## Page-by-page design

| Page | Essential information and arrangement | Next useful action |
|---|---|---|
| Overview | Service day and current stage; concise progress; prioritised decisions; route readiness; tomorrow’s capacity. Replace the oversized slogan panel with a useful daily briefing. | Surface the highest-priority unresolved task and its reason; normal empty days explain how to prepare work. |
| Routes | Selected-day route progress, driver, visits and load in clean rows; preparation/release status together. Permanent zones/rules live in secondary disclosures. | Assign an unassigned route, resolve a readiness blocker or review dispatch. |
| Deliveries | Date/route/outcome controls, grouped visits, expected versus actual quantities, clear completion state. Driver view prioritises the current stop, instructions and large delivery actions. | Complete a visit, record an exception or capture a spoken future customer request. |
| Inbox | Delivery exceptions and customer requests as distinct views; reason, requested date, affected service and decision status visible. | Review one item in place with its note and outcome preserved. |
| Closeout | Outstanding visits and quantities first, then product reconciliation, documented bottle returns and review history. | Resolve a blocker or close a fully reconciled day. |
| Customers | Search, meaningful filters and readable customer rows; contact/routing details and account history on drill-through. Setup/import/order tools are secondary. | Correct a missing address/route or open the relevant customer record. |
| Customer detail | Customer identity and service status; delivery history, schedules, orders and payments clearly separated; edit forms next to their section. | Update that customer’s detail or investigate a specific service issue. |
| Orders | Product quantities, order/payment status, purchase type and customer together; payment and fulfilment stay distinct. | Open the associated customer or investigate an unresolved record. |
| Subscriptions | Plan model, active/paused/completed state, period or remaining entitlement, next service and customer. | Review the specific schedule without rewriting paid terms. |
| Capacity | Product selector; compact normal limit; seven-day capacity/paid demand/temporary holds/remaining table; obvious day overrides and shortfalls. Date changes are edited in their own row, with normal settings separate. | Change a default or one specific day, see the resulting availability, and continue at the same position. |
| Bottles | Documented return expectations and actual recorded returns; an explicit boundary around unverified physical stock. | Investigate a visit with an outstanding recorded return. |
| Finance | Owner-only received payments, bounded totals, date filters, customer drill-through and audited correction details. | Trace an entry; sensitive corrections remain explicit and reasoned. |
| Reports | Selected-day results, quantities and measurement definitions; compact comparisons and readable units. | Inspect the delivery evidence underlying a result. |
| Automation & activity | Job schedule/configuration, latest recorded run, result and failed-run recovery; chronological event history below. | Retry a failed preparation or inspect its recorded reason. |
| Settings | Grouped operations, product/pricing and service-policy sections; read-only facts clearly distinguished from editable settings. | Open the relevant configuration, without duplicating operational forms. |
| Staff | Role and active state, secure invitation, driver availability and clear access controls. | Invite or manage the relevant staff member. |

## Save without losing your place

The code audit found redirects after capacity saves and many older administration actions. Those success/error navigations cause scroll resets and can discard open sections. The 30-second Overview route refresh is a separate behaviour and is not the capacity save path.

1. Use structured action results and inline feedback for Capacity; keep permissions and server validation intact. Successful writes revalidate data without navigating. Keep entered values on errors.
2. Apply a shared preservation boundary to older forms while converting action flows: retain the current route scope, selected filters, open details and the submitting section’s viewport position. Never replay a save or infer that a network error means a write failed.
3. Keep stable row/section identifiers. Reconcile changed data around the visible section, rather than adding a top-of-page banner that shifts the layout. Keep the form focused and prevent duplicate submissions.
4. If a record is removed from a filtered list after a successful action, retain a nearby acknowledgement and a stable neighbouring anchor. Genuine navigation, auth expiry and intentional ‘next stop’ actions remain explicit.

## Mobile pull-to-refresh

- At the top of the current page, an intentional pull-and-release refreshes its data. Simply scrolling to the top does not repeatedly trigger requests.
- Show a small pull/release/updating indicator in the shared header area. Remove standalone Refresh buttons and the repeating route-refresh timer.
- Preserve page, product, date, filters, open sections and sidebar state. Do not redirect to Overview or another page.
- Do not refresh over unsaved edits, a pending save or an active edit dialog. Explain that the edit must be saved or discarded first. Do not block normal vertical scrolling or form controls.
- Coalesce duplicate gestures into one request. Keep the current data on connection failure and show a quiet error. Verify the real gesture on touch-capable Chrome and WebKit; do not assume native browser reload preserves state.

## Execution and acceptance

Implement the shared header/navigation and preservation boundary first. Rebuild Capacity and its actions next. Then bring the other pages into the same layout/colour/typography system and revise Overview around the current work stage and next action. Review desktop, compact sidebar and narrow mobile screenshots for every major surface.

Acceptance includes: logo visible on every farm page with no added white tile; readable consistent design; no horizontal overflow at 320px; normal limit, date override and removal save without a scroll jump; validation errors preserve entered data; open sections/filters survive older-form saves; pull refresh changes only current-page data; repeated gestures cannot duplicate work; dirty forms block refresh; driver/manager/owner guards remain intact. Run TypeScript, lint, the production build and relevant operational/browser tests. Review the production-equivalent preview before releasing the redesign.

## Colour revision: lively, clear and recognisably M’ma

The first restrained treatment had too many similar grey-green tones. The target is a fresh farm morning: bright leaf green, sunlight and open sky, on clean white surfaces. The benchmark is a workspace staff enjoy entering and can understand immediately.

| Colour | Exact value | Where it belongs |
|---|---|---|
| Leaf green | `#087F5B` | Active navigation, primary actions, brand accents and completed progress |
| Mango | `#FFC857` | Daily briefing badge and next-action accents; use `#FFF1C2` for its larger background |
| Sky blue | `#38BDF8` | Delivery/commitment accents; `#E0F4FF` summary surfaces with dark text |
| Coral | `#F47561` | Attention accents; `#FFE5DF` surfaces for recorded issues, with explicit labels |
| Mint | `#DCF7E9` | Capacity/completion summaries, paired with dark green text |
| White / deep green | `#FFFFFF` / `#173C32` | Records, tables, reading surfaces and main text |

Use bright colour at the top of each page and in useful signals, then let the work area breathe. Avoid a different colour for every row. Never set ordinary text in bright yellow, sky or coral on white. No decoration should imply that a task is complete or that a record is live.

Overview combines the mango briefing, green actions and mint/sky summary cards. Capacity uses a green selected product, mint normal supply, sky paid commitments and a labelled coral shortfall only when one exists. Customers, Routes, Finance and Reports reuse the same tokens. Staff and Settings retain clear white forms with coloured section accents.

Check the actual Overview and Capacity screens at desktop and mobile sizes, plus the collapsed sidebar. Check text contrast, focus, error visibility and colour-blind legibility. Apply the same system across all pages only after checking these representative surfaces.
