# M’ma shop and cart

The public `/shop` counter and `/shop/milk`, `/shop/paneer`, `/shop/ghee` pages use the approved forest, cream, sage and honey design system. The supplied milk and paneer photographs and the approved 500 g ghee image are served as WebP assets. The original ghee reference said 1 L; its label was corrected to the confirmed 500 g catalogue size. No 3D model or new homepage photographic treatment is introduced.

## Customer flow

- The shop photograph advances every six seconds with a 420 ms horizontal transition. Tapping it opens that product. There are no hero buttons or slideshow selectors. Opening the cart, changing the theme or switching order mode does not stop autoplay. Reduced motion disables automatic advancement and transitions; all three products remain available below the hero.
- Scheduled is the initial mode. One-time and scheduled drafts and carts are separate. Changes remain in the current browser tab through navigation, reload and sign-in. Storage failure leaves an in-memory cart usable. No personal contact information is stored in the cart.
- Add to cart takes a snapshot of the chosen product, quantity and schedule. Subsequent draft changes require Update cart. The header shows added product lines, rather than unadded configuration drafts or the number of future milk deliveries.
- The cart drawer supports quantities, removal and one common delivery/start date. Milk schedules with variable daily quantities are labelled explicitly and edited on the milk page. Weekly add-ons cannot retain a removed milk day. An empty or incomplete schedule cannot continue.
- One-time milk, paneer and ghee form one basket and one delivery fee. Scheduled paneer/ghee join a milk plan; the cart does not silently add milk. Standalone recurring paneer/ghee subscriptions are not represented as supported backend functionality.
- Order choices cross the existing sign-in boundary in a validated relative return URL, without contact data. Delivery details and server-created orders continue through the existing authenticated checkout, ownership checks, capacity reservations and Razorpay verification.
- A server-confirmed paid order clears only the unchanged cart bound to that owned order. Pending/failed payment, an unrelated order, or later cart edits do not clear it. Optional storage failure preserves the cart.
- The outline cart, theme switch and outline menu are shared across customer and farm-operation pages. Authentication/recovery and the checkout/payment flow omit these controls, as requested. Native modal dialogs support keyboard focus, Escape, focus return, backdrop dismissal and body scroll locking. Controls have 44 px targets, readable date fields and reduced-motion behavior.

## Confirmed delivery policy

Prices: milk ₹62/litre, paneer ₹200/500 g, ghee ₹375/500 g. New glass bottles cost ₹10/litre; bottle purchases do not count towards the free-delivery threshold.

- One-time: ₹5 delivery; free when the products subtotal is **above ₹199**.
- Scheduled: no delivery, platform, surge or miscellaneous fees for **one calendar month from the customer’s first scheduled plan start**. Month ends clamp to the last valid day (31 January → 28/29 February). The anniversary is outside the waiver.
- Thereafter: ₹2 per actual scheduled delivery; free when that delivery’s products total is above ₹199. The entire prepaid plan total is not the threshold basis. Matching paneer/ghee are included in that day’s subtotal.
- No platform, handling, surge or miscellaneous charges are added after the waiver either. Only the specified delivery charge applies. A paid-plan milk increase continues to charge only the added milk.

The waiver uses the earliest non-test paid plan order or active/paused/completed legacy plan, not a browser flag or a fresh draft. Customer-facing order creation, old authenticated builder, staff manual order pricing and payment repricing use the same policy. The payment endpoint recomputes all 30 milk deliveries and actual weekly add-on occurrences from owned server records and compares the full stored total before opening the provider payment.

## Verification and limits

- TypeScript, zero-error lint (two existing warnings) and 53 source/unit checks.
- Optimized Next.js production build with webpack. A local Node 26 Turbopack compilation stalled; the supported webpack production build completes. The hosted preview build must also pass before merge.
- Actual anonymous app: Chromium and WebKit, 320/390/768/1440 px, dark/light; cart quantities/removal, independent modes, reload/navigation recovery, outline icons, focus return, 44 px targets, combined checkout URL and preserved sign-in return; autoplay and reduced-motion checks; unauthenticated payment endpoint returns 401.
- Homepage film, immersive frame, skip, menu, forward/reverse fill and connected policy-page regressions are checked separately. Financial checks cover the per-delivery threshold, bottle exclusion, calendar-month expiry, add-on occurrences, tampered stored totals, adjustment pricing and cart-to-order matching.

These checks do not represent a successful provider payment, authenticated customer-order write, physical-device test or operational fulfilment acceptance. No live customer or calendar records are created by the browser verification. Existing `/milk?edit=plan` remains available; Farm and Our Story use homepage anchors. A separate Our Story route and standalone recurring non-milk subscriptions remain outside this change.

Run `npm run typecheck`, `npm run lint`, `node --experimental-strip-types --test tests/*.test.mjs`, `npx next build --webpack`, `npm run test:shop` (against a running app), and `BASE_URL=http://127.0.0.1:3210 npm run test:browser`. Browser reports and screenshots are local artifacts under `work/`.
