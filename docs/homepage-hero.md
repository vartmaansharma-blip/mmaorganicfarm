# M’ma Organic Farm: photographic homepage film

## Visual authority and continuity

The October 24 conversation, approved `M’ma Organic Farm Milk Hero.png` layout, and the two supplied coffee references control this design. The older uploaded `memory.md` is not a design source. The latest spelling is **M’ma Organic Farm**. The genuine orange/red heart logo is unchanged.

Fraunces headlines and Space Grotesk interface text are self-hosted under their OFL licenses. A shared olive-charcoal/milk-ivory palette, farm-green and sage identity, honey-gold actions, spacing and semantic feedback colors connect the homepage to sign-in, recovery, public information, shop, order, account, calendar, review and confirmation screens. Staff operations remain within their existing layout. This change does not rewrite authentication, ordering, capacity, payment or delivery logic.

## Mobile experience

The compact sticky header contains the genuine logo, Shop, a 44px theme switch and a 44px menu button. Dark is the first-visit default. A saved light choice applies before paint and persists across reloads and customer routes. The native drawer has five spacious destinations, active state, keyboard focus containment, Escape/backdrop closing, focus restoration and background scroll locking. Desktop retains a capsule. No-JavaScript navigation remains available.

The headline, two ordering/farm actions and photograph are balanced vertically on phones, with a shorter composition on small screens. All primary actions remain available without finishing the introduction.

## Film choreography

Native scroll drives absolute progress; reverse scroll retraces it. There is no wheel/touch interception or forced playback. A 65ms time-based response smooths input and settles without overshoot. The animation loop stops when settled.

| Progress | Shot and transition |
| --- | --- |
| 0–48% | Stationary glass; curved meniscus rises smoothly inside tapered walls. |
| 52.5% boundary | Coffee treatment arrives in a 110ms match dissolve. |
| 62% boundary | Matched elevated glass arrives in a 110ms angle dissolve. |
| 78% boundary | 220ms push-in into the supplied full-screen coffee/milk texture; all visible chrome leaves. |
| 78–93% | Image-only macro hold. |
| 93% boundary | 180ms pull-back into the closing overhead composition; navigation and actions return. |
| 93–100% | Clean overhead hold. |
| Continued scroll | The hero releases naturally into the actual site. |

Scroll controls the fill continuously and selects clean camera targets. Camera transitions finish in clock time even when scrolling stops; a small boundary deadband prevents jitter. Reverse transitions begin at current image weights. No photograph blur filter or persistent double exposure is used. A focus-only continuation gives keyboard visitors a route out of the full-screen insert. Skip introduction goes directly to content. Reduced motion and JavaScript-disabled visits show a finished static glass without the long pinned film.

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

Browser checks start the optimized production build with an unreachable, non-secret auth fixture. They verify anonymous `/milk` and `/account` gates without customer data or writes. The matrix covers 320×568, 390×844, 768×1024 and 1440×960; forward/reverse fill; stationary panel; shot order; image-only insert/closing overhead/direct content exit; theme persistence; navigation focus/destinations/skip; reduced motion; nine public customer routes in both themes with shared typography and palette contrast checks.

The local checks do not claim physical iPhone/Android performance, authenticated ordering acceptance or a live payment test. No customer orders, delivery schedules or payments are created during verification. These unchanged backend journeys remain separate acceptance coverage.

## Release

The user explicitly authorized merge to main and production deployment after completion in the October 24 conversation. This supersedes the initial draft-only delivery instruction. Release uses the existing PR, preserving published history, after production build, source/unit tests, browser verification, visual inspection and a matching preview deployment. Next.js and compatible production transitive packages were updated to resolve advisories discovered during the release audit. Exact release SHA, preview/production status and verification results belong in the delivery report; this document does not assert a deployment occurred.

## Approved palette and interaction contract — 24 October 2026

The user accepted the palette proposal and requested deployment. This supersedes the intermediate espresso palette and temporary release hold. “Tech meets food” means warm photography and editorial headlines, with precise, legible scheduling controls; it does not add new scheduling behavior.

| Role | Light | Dark (default) |
| --- | --- | --- |
| Page | Milk ivory `#F7F3E8` | Olive charcoal `#1E231D` |
| Surface / active navigation | `#E6EBDD` | `#2C3528` |
| Primary text | `#29271F` | `#F5F0E4` |
| Secondary text | `#626354` | `#C0C5B7` |
| Farm accent / selected schedule | Farm green `#3F563E` | Soft sage `#B9C6AA` |
| Selected text | `#F7F3E8` | `#1E231D` |
| Primary action | Honey gold `#F4C64B`, text `#29271F` | Same |

Earth brown `#8E6A48` is a supporting brand swatch, echoed in the coffee photography rather than used for interface text. Farm green ties the ticker and secondary actions to the sage farm-story surfaces. Footer uses the same olive charcoal as the dark theme. Status success/error/warning remain distinguishable with readable text.

Buttons use short 140–180ms press/arrow feedback. Existing farm-photo hover remains subtle; ticker can pause. Reduced motion removes these movements. The native mobile modal has a tinted glass surface, a softened modal backdrop, and opaque/reduced-transparency fallbacks; both prefixed and standard filter declarations are retained in the optimized CSS. No separate 3D view or customer-data writes are added.

## Shared customer controls

The canonical customer token and control usage contract is [design-system.md](design-system.md). Customer controls reuse the approved farm palette without changing the hero photographs, dimensions, type composition or scroll/camera motion.
