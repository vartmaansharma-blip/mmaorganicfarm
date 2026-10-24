# One calendar, three products

New scheduled baskets use one prepaid calendar-month period. Existing paid 30-delivery milk plans retain their purchased quantities and terms. The catalogue remains milk, paneer and ghee.

## Customer interaction

Every new product draft opens in **Custom**, with editable recommended dates already selected: daily milk, Saturdays for paneer, and one ghee delivery at the beginning of the period. These recommendations never add an unselected product to the cart. Quantity applies per delivery. Daily, weekly and monthly presets remain optional; fortnightly, selected weekdays and a single delivery are under More options.

There is one saved basket, one shared start date and one shared calendar. Product pages edit a draft of that product while displaying other added products. Add/Update cart commits the draft; merely visiting a product page does not add it. Changing the prepaid period shifts the basket and drafts together, clamping dates at the new month's end. Paneer and ghee can be scheduled independently of milk.

The cart suggests missing paneer/ghee when milk has been added. Each suggestion shows its photograph, actual 500 g size and price, and opens that product's configuration. Recommendations disappear once added. There are no automatic additions or pre-checked paid extras.

The review shows exact combined dates and quantities, product totals, bottle charges, delivery and full amount. One doorstep date incurs one delivery fee. No automatic renewal or recurring debit is implied. Draft dates are labelled separately from paid deliveries. Auth is required for checkout and the account's confirmed calendar; browsing and public basket configuration remain available.

## Confirmed delivery policy

Milk ₹62/L, paneer ₹200/500 g, ghee ₹375/500 g; new milk bottles ₹10/L. One-time delivery ₹5, free above ₹199 in products (bottles excluded). Scheduled orders have no delivery/platform/surge/miscellaneous fees for one calendar month from the customer's first scheduled plan start. Thereafter delivery costs ₹2 per actual date, free when that date's combined products exceed ₹199. No other fees are introduced.

## Server and fulfilment

Canonical validated product rules expand into finite dated delivery rows, including milk. Server checkout recomputes the same dates and prices, checks exact invoice quantities and every stored dated row, and compares the final total. Capacity checks cover the whole prepaid month. An atomic checkout claim locks the same plan as draft editing, preventing changes during provider preparation. Only captured payment activates a plan. Monthly completion counts completed dated visits, independently of milk credits.

Monthly records are versioned as `calendar_month`; existing plans remain `milk_credits`. Restrictive customer policies prevent alternate direct writes to monthly plans, weekly rows, dated rows, exceptions or pauses. Existing paid milk-credit skip/carry and added-milk payment flows remain available. Paid monthly calendars currently show confirmed dates and direct customers to the farm for changes; no unsupported self-service carry-forward or automatic renewal is presented. Farm-managed changes must preserve prepaid quantities and check preparation/capacity.

## Verification

Pure tests cover custom defaults, recommendations, compact auth return serialization, malformed/duplicate/out-of-period dates, combined fees, month-end/leap-year dates, independent non-milk schedules, draft isolation and tampered invoices. `tests/monthly-postgres.mjs` applies the actual migration in a synthetic local PGlite PostgreSQL fixture and checks ownership, restrictive policies, draft replacement/provider freeze, atomic checkout claim, week-four capacity, actual delivery sheet generation, monthly non-milk completion and idempotent legacy milk credits. It does not use real customers or a payment provider.

Run with an isolated PGlite install (`PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node tests/monthly-postgres.mjs`). PGlite is a verification-only tool, not a website dependency. Browser/build evidence and release status are recorded in `docs/shop-and-cart.md` and the PR.
