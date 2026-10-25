# M’ma Organic Farm: photographic homepage film

## Visual authority and continuity

The October 24 conversation, approved `M’ma Organic Farm Milk Hero.png` layout, and the two supplied coffee references control this design. The older uploaded `memory.md` is not a design source. The latest spelling is **M’ma Organic Farm**. The genuine orange/red heart logo is unchanged.

Fraunces headlines and Space Grotesk interface text are self-hosted under their OFL licenses. A shared olive-charcoal/milk-ivory palette, farm-green and sage identity, honey-gold actions, spacing and semantic feedback colors connect the homepage to sign-in, recovery, public information, shop, order, account, calendar, review and confirmation screens. Staff operations remain within their existing layout. This change does not rewrite authentication, ordering, capacity, payment or delivery logic.

## Mobile experience

The compact sticky header contains the genuine logo, Shop, a 44px theme switch and a 44px menu button. Dark is the first-visit default. A saved light choice applies before paint and persists across reloads and customer routes. The native drawer has five spacious destinations, active state, keyboard focus containment, Escape/backdrop closing, focus restoration and background scroll locking. Desktop retains a capsule. No-JavaScript navigation remains available.

The headline, two ordering/farm actions and photograph are balanced vertically on phones, with a shorter composition on small screens. All primary actions remain available without finishing the introduction.

## Film choreography

The hero uses a finite state machine: `FILLING → PLAYING_FORWARD → COMPLETED → PLAYING_REVERSE → FILLING`. Native scrolling controls only the curved milk mask during filling. At full milk, one elapsed-time `requestAnimationFrame` timeline plays every approved photograph, even if scrolling stops or large wheel/touch deltas arrive. Scroll input never selects a photographic target. `lib/hero-motion.ts` contains the deterministic clock and image weights; the component owns DOM input, asset readiness, holding and lifecycle cleanup.

| Film time | Shot and transition |
| --- | --- |
| 0–60ms | Filled frontal milk glass hold. |
| 60–180ms | Milk-to-coffee treatment. |
| 180–290ms | Matched elevated transition into `coffee-side-v2.webp`. |
| 290–520ms | Sharp elevated hold. |
| 520–740ms | Existing photographic push-in into `coffee-macro.webp`. |
| 740–1280ms | Full-screen macro; the named macro-hold stage starts at 900ms. |
| 1280–1460ms | Pull-back into `coffee-top.webp`. |
| 1460–1900ms | Clean overhead hold; final-settle stage starts at 1650ms. |

The identical timeline runs backward on upward reentry after the visitor has scrolled at least 24px into content. Partial automatic playback ignores incidental direction reversals. After reverse playback the glass is frontal and full; further upward scrolling lowers the milk. A 6% fill deadband rearms the forward trigger after reverse, preventing boundary jitter from immediately restarting it.

The panel's first-screen height/composition is unchanged. Its only sticky runway is **55svh of native filling**, replacing the former 305svh/270svh choreography. At the full-fill/reentry boundary, body positioning temporarily holds the panel at its natural sticky location; scrollbar compensation prevents width shifts. Wheel, touch momentum and scrolling keys are consumed only while held. Completing or cancelling restores the exact prior styles and boundary scroll position. There is no timed dead scroll runway after completion.

All six actual responsive image sources load eagerly and decode before the film clock starts. Preparation has a 1500ms maximum hold budget; a decode failure or timeout releases the hold and retains the frontal milk image for that visit. Late imagery cannot abruptly replace this fallback. The nominal film is 1900ms. Foreground frame delays are capped at 50ms per animation step so a main-thread stall stretches playback instead of skipping a stage. Document-hidden time is excluded, and the single loop resumes at the same point.

Skip introduction stays available during the macro as a visible keyboard-accessible action, and immediately cancels playback before normal anchor navigation. Other anchor/route navigation and opening the mobile menu also release the hold. Unmount and pagehide remove locks/chrome; a namespaced history-entry flag preserves completed playback on return. Direct content anchors bypass playback. Resize and theme changes retain film state/time. Reduced motion shows a static finished frontal coffee glass with no runway or forced hold; no-JavaScript visitors get the same static composition.

The progress meter combines milk fill (0–50%) and film time (50–100%). Its accessible value text explains filling, automatic playback, reverse playback and completion.

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

Browser checks start the optimized production build with an unreachable, non-secret auth fixture. The matrix covers Chromium and WebKit at 320×568, 360×740, 390×844, 768×1024, 1200×630 and 1440×960. It records every stage in both directions, exercises large wheel deltas, a cancelable touch-momentum event, keyboard input, theme/resize during playback, stationary fill/hold, stage order, image readiness, skip, reduced motion and existing navigation/public-page checks. Desktop and phone lifecycle scenarios cover visibility pause/resume (through the visibility-event adapter), route navigation/unmount, browser back/forward, direct anchors and preference changes. Slow/failed image routes check bounded preparation and stable fallback. These are desktop browser engines with emulated phone viewports/touch events, not physical Safari/iPhone tests.

`work/hero-verification/results.json` stores measured stage order/timing and checks. PNGs and WebM recordings are written alongside it; 390px/1440px recordings include forward and reverse playback. Exact results for a revision belong in `docs/hero-timed-verification.md` and its PR. The suite does not create orders, schedules or payments.

## Release boundary for this motion correction

This work targets a focused branch from `main` at `5d819602e686357265ac86d6aa8c766a285af25e`. PR #4 (customer controls/themes) and PR #5 (commerce) were inspected and remain separate. Their code is not included. The initial brief requested a PR without automatic merge. On 25 October 2026 the user subsequently authorized direct merge once this correction is complete. Complete local verification and a matching hosted preview check before merging, then verify the deployment triggered by the existing main-branch integration. Earlier release permissions describe earlier work.

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
