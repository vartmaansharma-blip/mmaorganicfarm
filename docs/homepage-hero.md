# M’ma Organic Farm: photographic homepage film

## Visual authority and continuity

The October 24 conversation, approved `M’ma Organic Farm Milk Hero.png` layout, and the two supplied coffee references control this design. The older uploaded `memory.md` is not a design source. The latest spelling is **M’ma Organic Farm**. The genuine orange/red heart logo is unchanged.

Fraunces headlines and Space Grotesk interface text are self-hosted under their OFL licenses. A shared warm charcoal/ivory palette, yellow actions, spacing and semantic feedback colors connect the homepage to sign-in, recovery, public information, shop, order, account, calendar, review and confirmation screens. Staff operations remain within their existing layout. This change does not rewrite authentication, ordering, capacity, payment or delivery logic.

## Mobile experience

The compact sticky header contains the genuine logo, Shop, a 44px theme switch and a 44px menu button. Dark is the first-visit default. A saved light choice applies before paint and persists across reloads and customer routes. The native drawer has five spacious destinations, active state, keyboard focus containment, Escape/backdrop closing, focus restoration and background scroll locking. Desktop retains a capsule. No-JavaScript navigation remains available.

The headline, two ordering/farm actions and photograph are balanced vertically on phones, with a shorter composition on small screens. All primary actions remain available without finishing the introduction.

## Film choreography

Native scroll drives absolute progress; reverse scroll retraces it. There is no wheel/touch interception or forced playback. A 65ms time-based response smooths input and settles without overshoot. The animation loop stops when settled.

| Progress | Shot and transition |
| --- | --- |
| 0–48% | Stationary photographic glass; curved meniscus rises continuously inside tapered walls. |
| 48–57% | Matched coffee treatment dissolves into the fully filled glass. |
| 57–60% | Clear front-view hold. |
| 60–64% | Short dissolve into a separate elevated three-quarter photograph. |
| 64–72% | Side-view hold. |
| 72–76% | Short dissolve into a true overhead photograph. |
| 76–84% | Overhead hold. |
| 84–90% | Longer dissolve into the exact supplied coffee/milk macro, filling the viewport. Navigation and floating controls fade away. |
| 90–100% | Full-screen macro only: no copy, visible controls, logo or navigation. |
| Continued scroll | The macro scrolls upward like a curtain, directly revealing the actual site. No return to the glass. |

The measured scroll distance, rather than a fixed duration, controls these transitions. A focus-only continuation gives keyboard visitors a route out of the final frame. Skip introduction goes directly to content. Reduced motion and JavaScript-disabled visits show a finished static glass without the long pinned film.

The wide macro's responsive `sizes` accounts for its rendered width when it covers a portrait viewport, preventing a small mobile image from being stretched across the full screen.

## Assets and claims

Cutouts and distinct camera views are AI-assisted derivatives of the supplied glass reference. The macro is the exact supplied image converted to WebP. These are serving illustrations, not documentary farm photography or evidence of health benefits. Existing real farm photographs and existing business claims were preserved; no new composition, certification or health claims were invented. Asset roles/prompts are in `public/hero/README.md`.

## Reproduce checks

```sh
npm ci
npm test
npm run typecheck
npm run lint
npx playwright install chromium webkit
HERO_BROWSERS=chromium,webkit npm run test:browser
npm audit --omit=dev
```

Browser checks start the optimized production build with an unreachable, non-secret auth fixture. They verify anonymous `/milk` and `/account` gates without customer data or writes. The matrix covers 320×568, 390×844, 768×1024 and 1440×960; forward/reverse fill; stationary panel; shot order; image-only finale/direct exit; theme persistence; navigation focus/destinations/skip; reduced motion; nine public customer routes in both themes with shared typography and palette contrast checks.

The local checks do not claim physical iPhone/Android performance, authenticated ordering acceptance or a live payment test. No customer orders, delivery schedules or payments are created during verification. These unchanged backend journeys remain separate acceptance coverage.

## Release

The user explicitly authorized merge to main and production deployment after completion in the October 24 conversation. This supersedes the initial draft-only delivery instruction. Release uses the existing PR, preserving published history, after production build, source/unit tests, browser verification, visual inspection and a matching preview deployment. Next.js and compatible production transitive packages were updated to resolve advisories discovered during the release audit. Exact release SHA, preview/production status and verification results belong in the delivery report; this document does not assert a deployment occurred.
