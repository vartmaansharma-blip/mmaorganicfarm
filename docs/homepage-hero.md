# M’ma Organic Farm: photographic homepage film

## Visual authority and continuity

The October 24 conversation, approved `M’ma Organic Farm Milk Hero.png` layout, and the two supplied coffee references control this design. The older uploaded `memory.md` is not a design source. The latest spelling is **M’ma Organic Farm**. The genuine orange/red heart logo is unchanged.

Fraunces headlines and Space Grotesk interface text are self-hosted under their OFL licenses. A shared olive-charcoal/milk-ivory palette, farm-green and sage identity, honey-gold actions, spacing and semantic feedback colors connect the homepage to sign-in, recovery, public information, shop, order, account, calendar, review and confirmation screens. Staff operations remain within their existing layout. This change does not rewrite authentication, ordering, capacity, payment or delivery logic.

## Mobile experience

The compact sticky header contains the genuine logo, Shop, a 44px theme switch and a 44px menu button. Dark is the first-visit default. A saved light choice applies before paint and persists across reloads and customer routes. The native drawer has five spacious destinations, active state, keyboard focus containment, Escape/backdrop closing, focus restoration and background scroll locking. Desktop retains a capsule. No-JavaScript navigation remains available.

The headline, two ordering/farm actions and photograph are balanced vertically on phones, with a shorter composition on small screens. All primary actions remain available without finishing the introduction.

## Film choreography

The hero uses a finite state machine: `FILLING → PLAYING_FORWARD → COMPLETED`. Native scrolling advances the curved milk mask during filling; a high-water mark prevents upward scrolling from draining it. At full milk, one elapsed-time `requestAnimationFrame` timeline plays the photographic sequence, even if scrolling stops or large wheel/touch deltas arrive. Scroll input never selects a photographic target. `lib/hero-motion.ts` contains the deterministic clock and image weights; the component owns DOM input, asset readiness, holding and lifecycle cleanup.

The current film is nominally **4.2 seconds after filling**, shortened from 6.221667 seconds at the user's request on 30 October. The source MP4 remains byte-identical; its selected source interval is `[0, 1.5s)` at native 1× speed (36 source frames). A single source-out seek to 1.499s confirms the last selected frame before exit. No source transcode, generation, speed ramp, loop or audio is added.

| Elapsed film time | Direction |
| --- | --- |
| 0–120ms | Milk registers. |
| 120–440ms | Coffee reveals outward and downward from the liquid surface rather than fading in across the whole glass. |
| 440–600ms | Short frontal coffee hold. |
| 600–1400ms | Fixed-angle downward quadratic camera arc, using one frontal photograph. |
| 1400–1440ms | Brief landing. |
| 1440–1900ms | A registered photographic dolly approaches the liquid inside the glass; the macro dissolves in only near the end of the push. |
| 1900–3400ms | Native-speed source excerpt 0–1.5s; video/still share the same crop and restrained 8% scale. |
| 3400–3900ms | A registered close-up dissolves into the enlarged overhead photograph, which pulls back to the complete rim. |
| 3900–4200ms | Overhead settles and scrolling releases. |

The camera path is a quadratic Bezier with control points `(0,0) → (-6%,0) → (0,6%)`, measured against the photograph canvas, and quintic time easing for zero endpoint velocity/acceleration. Positive camera Y means downward travel, so the entire frontal plate counter-translates upward; maximum lateral displacement is 3% and maximum vertical displacement is 6%. Its orientation and scale remain fixed. Milk, coffee and condensation share the moving wrapper; overhead remains stationary. `coffee-side-v2.webp` remains an unchanged source asset but is not rendered or requested. This is an honest 2D camera-translation study: it preserves the known silhouette and cannot reveal newly photographed reflections or hidden edges.

The photographic camera uses measured image bounds and an exponential scale curve to move the liquid focal point toward viewport center. The macro dissolves in during the last 24% of this push, after the glass has expanded across the view. On exit, the overhead photograph starts enlarged and centered, then scales and translates back into the original composition. Texture overlap happens while both images are close-ups; there is no floating oval/iris wipe. The macro still and video share one rendering rectangle and crop. Chrome recedes early in the approach and returns during the final 20% of the pullback, after the overhead glass clears the copy. The hero clips overflow without creating an additional scroll container.

The glass also carries eight sparse condensation beads. They grow while pinned, release into an accelerating downward run, collect a neighbouring bead with approximate volume addition, and leave a faint short wet trail. An SVG overlay clips them to the glass body; the original photographs are unchanged. The existing animation loop drives this ambient flow, pauses it when hidden, and stops updating it outside the visible glass. It fades away for the macro and overhead and is removed for reduced motion. The overlay is decorative and cannot intercept navigation.

As requested on 30 October, the introduction is strictly one-way. Once started, input cannot reverse its clock; once completed, upward reentry keeps the overhead composition and allows native scrolling without acquiring another hold. There is no reverse state, rearm deadband or replay trigger. Home links, direct anchors, back/forward and menu cancellation retain completion. The milk fill also retains its highest visible level. A fresh page visit can start a new introduction, while the existing history flag restores completed entries.

The panel's first-screen height/composition is unchanged. Its only sticky runway is **55svh of native filling**, replacing the former 305svh/270svh choreography. At the full-fill/reentry boundary, body positioning temporarily holds the panel at its natural sticky location; scrollbar compensation prevents width shifts. Wheel, touch momentum and scrolling keys are consumed only while held. Completing or cancelling restores the exact prior styles and boundary scroll position. There is no timed dead scroll runway after completion.

All five actual responsive image sources load eagerly and decode before the film clock starts. Preparation has a 1500ms maximum hold budget; a decode failure or timeout releases the hold and retains the frontal milk image for that visit. Late imagery cannot abruptly replace this fallback. The nominal film is 4200ms. Foreground photographic frame delays are capped at 50ms per step, so a main-thread stall stretches those transitions rather than skipping a stage. The primary film timeline starts video only on reaching the full macro cue. Within that allocated hold it consumes native media time, at 1×, and requires a presented source-out frame at 1.499s before opening the overhead cue; media time owns the selected excerpt, so wall-clock drift cannot race it. Hidden time pauses both the film and media, and resume continues from the same frame. Video loading or stalled decoding has a 2000ms visible-time budget before the exact still takes over and the nominal timeline completes. Late loads cannot replace the selected fallback.

Skip introduction stays available during the macro as a visible keyboard-accessible action, and immediately cancels playback before normal anchor navigation. Other anchor/route navigation and opening the mobile menu also release the hold. Unmount and pagehide remove locks/chrome; a namespaced history-entry flag preserves completed playback on return. Direct content anchors bypass playback. Resize and theme changes retain film state/time. Reduced motion shows a static finished frontal coffee glass with no runway or forced hold; no-JavaScript visitors get the same static composition.

The progress meter combines milk fill (0–50%) and film time (50–100%). Its accessible value text explains filling, automatic playback and completion.

The wide macro's responsive `sizes` accounts for its rendered width when it covers a portrait viewport, preventing a small mobile image from being stretched across the full screen.

The native video has `muted`, `playsInline`, `preload="none"`, no controls, no loop, no autoplay attribute, no audio track, a presentation-only accessibility role and the exact `coffee-macro.webp` poster. Its source is assigned only after filling begins; arrival, reduced motion and direct content entry make no MP4 request. A presented-frame callback reveals the decoded video over the still with a short 160ms dissolve. Failed/unsupported playback and rejected autoplay use the still. Visibility, skip, navigation, page lifecycle and unmount pause/cancel the media adapter. At the selected 1.5s source out, one buffered seek to the last retained frame makes the retained image deterministic in WebKit. A presented-frame callback (or `seeked` plus two paints) opens the overhead gate; a failed final seek uses the same 2000ms bounded fallback. This is a fixed end action, not frame-by-frame scrubbing. There is no added runtime, animation framework or second clip. Reduced motion retains the established static frontal composition with no forced macro sequence or video request.

## Assets and claims

Cutouts and distinct camera views are AI-assisted derivatives of the supplied glass reference. The macro is the exact supplied image converted to WebP. These are serving illustrations, not documentary farm photography or evidence of health benefits. Existing real farm photographs and existing business claims were preserved; no new composition, certification or health claims were invented. Asset roles/prompts are in `public/hero/README.md`.

## Reproduce checks

```sh
npm ci
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3199 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_hero_browser_fixture npm test
npm run typecheck
npm run lint
npx playwright install chromium webkit
HERO_BROWSERS=chromium,webkit npm run test:browser
node tests/hero-video.browser.mjs
npm audit --omit=dev
```

Browser checks start the optimized production build with a local, non-secret, read-only catalogue fixture. Use the fixture environment above at build time because Next.js embeds public environment values; run the two browser suites sequentially so they can each own port 3199. The matrix covers Chromium and WebKit at 320×568, 360×740, 390×844, 768×1024, 1200×630 and 1440×960. It records every forward stage and verifies completed upward reentry, exercises large wheel deltas, a cancelable touch-momentum event, keyboard input, theme/resize during playback, stationary fill/hold, stage order, image readiness, skip, reduced motion and existing navigation/public-page checks. Desktop and phone lifecycle scenarios cover visibility pause/resume (through the visibility-event adapter), route navigation/unmount, browser back/forward, direct anchors and preference changes. Slow/failed image routes check bounded preparation and stable fallback. These are desktop browser engines with emulated phone viewports/touch events, not physical Safari/iPhone tests.

`work/hero-verification/results.json` stores measured stage order/timing and checks. PNGs and WebM recordings are written alongside it; 390px/1440px recordings include forward playback and completed upward reentry. Exact results for a revision belong in `docs/hero-timed-verification.md` and its PR. The suite does not create orders, schedules or payments.

## Historical release boundary for the earlier motion correction

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


## Approved video and current release boundary — 29 October 2026

The supplied `mma-coffee-swirl-silent.mp4` is served byte for byte at `public/hero/coffee-macro-motion.mp4`: 3,155,596 bytes, H.264/AVC (`avc1`), 1284×724, 73 frames at 24fps (3.041667s), exactly one video track and no audio track. SHA-256: `cc255f456ffa3304be88bcdc40fc1fd9671c46762b4ca0d82ed4039e5b206612`. The MP4 atom/hash regression test checks these properties. Its first-frame composition is closely matched to the still, with normal compression/mark differences; the still-to-video dissolve avoids a hard hand-off.

The original has a visible bottom-right **KlingAI 4.0** watermark. It is unchanged. A separate visible “Video generated with Kling AI” credit remains in the viewport even when portrait cover cropping places the embedded mark beyond the screen. Attribution is never used as proof of commercial rights.

Kling’s [general terms](https://kling.ai/docs/user-policy) §4.6 restrict commercial output use without permission; its [paid-service terms](https://kling.ai/docs/payment-policy) §3.1.2 describe member commercial-use benefits. Checked 29 October 2026. The clip alone does not establish the generating account, date, membership or written permission. This branch is a **draft PR/preview only** pending evidence covering this exact clip; no production merge or rollout is authorized by this integration brief. Earlier release authorizations above apply to earlier work. Importing the source into Canva for inspection does not change these rights.

See [video verification](hero-video-verification.md) for the final checks and device limitations.

## Current release authority — 30 October 2026

The user requested completing and fixing the hero/shop revisions, creating a PR and merging it into main. This supersedes the earlier draft-only instruction for these code changes. Verify the current feature preview before merging, then verify the deployment generated by main. Commercial-use evidence for the supplied Kling source remains unverified; the original mark and viewport attribution remain intact. No payment activation, database write or migration is part of this visual revision.
