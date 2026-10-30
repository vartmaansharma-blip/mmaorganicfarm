# Hero and shop choreography — 30 October 2026

## Design benchmark

The user explicitly selected Linear, Stripe and Apple as the quality benchmark. The following are primary-source observations; the specific timings and treatments below are our design decisions, not claims that these companies endorse this implementation.

- [Linear's interface refresh](https://linear.app/now/behind-the-latest-design-refresh) emphasizes focus, predictable placement and reducing competing visual weight. Applied here: a stable glass silhouette, restrained camera travel, quiet controls and one focal action per beat.
- [Stripe's globe development](https://stripe.com/blog/globe) describes a purposeful spatial model and authored curved paths. Applied here: deterministic geometry, measured screen origins and a continuous path rather than independently timed image switches. The present glass is a 2D photographic study, not a reconstructed 3D object.
- [Apple's motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion) connects concise, purposeful motion with response to accessibility and input. Applied here: forward-only progression, shorter dwell, readable settled states, immediate skip, hover/focus/visibility suspension and static reduced motion.

No external site's brand, assets, shaders or proprietary interaction code is copied. No food brand is a benchmark for this revision.

## Homepage

The film runs 4.7 seconds after the native milk fill. The coffee reveal originates at the surface. A fixed-angle quadratic traverse follows, keeping rim, base and both glass edges visible. A registered photographic push approaches the liquid before a short close-up dissolve; the overhead starts enlarged and pulls back to its original frame. An early oval-mask prototype was rejected during visual review because it looked like a floating insert. Source media range is 0–2 seconds at 1×; the original H.264 file remains unchanged and silent. A confirmed source-out frame gates exit. The final composition remains on upward return; neither milk nor film rewinds or replays.

## Shop

The opening image is a new olive still life, with a low rectangular cane basket containing the original milk bottle, ghee jar and a new wrapped-paneer presentation concept. It is an illustrative collection, not a purchasable bundle. The basket opens the milk product page without a fabricated bundle price.

The arched 4:5 image frame stays fixed and shows the full basket without a destructive cover crop. The incoming image reveals through a curved mask over the outgoing image, with a small independent photographic drift. Captions change within a stable grid. The basket rests for 6.5 seconds, individual products for 5.5 seconds; progression is forward only and stops at ghee. There are no Pause, Play or Next actions. Hover, keyboard focus, page visibility and viewport visibility suspend automatic advancement while the visitor interacts. Incoming images must decode first. Reduced motion opens with the static basket; its image link and the complete catalogue remain available.

The hero's initial arrival is a short, non-blocking stagger; navigation and catalogue remain available. Individual product images link directly to their matching product pages. Pricing, ordering and checkout behavior are retained.

## Product pages

The existing main photograph and the user-supplied lifestyle/serving photograph appear in a stable frame. Thumbnails sit beside the frame on desktop and underneath on phones. The gallery automatically advances every six seconds after decoding the incoming image, with an overlapping dissolve and a small horizontal drift. Thumbnail selection, horizontal swipe and arrow keys offer direct browsing. Hover, focus, touch, hidden tabs and offscreen galleries suspend automatic advancement; reduced motion is static with immediate manual selection. Both one-time and scheduled product views use the same component. Purchase state stays independent of photo selection. Full supporting photographs are contained without destructive cropping. See [product-gallery-plan.md](product-gallery-plan.md) for provenance.

## Media provenance

- Original coffee source, metadata, checksum and rights caveat remain in [homepage-hero.md](homepage-hero.md).
- Basket image, references, exact generation prompt and paneer packaging concept are recorded in [shop-basket-image.md](shop-basket-image.md).

## Validation

Runtime revision: `d46e22374b120815b2bc4d21f80ecac13a3d4d27`, on top of `main` at `7910c2c2e288f4b647f8f4c60a8ea589338d0921`. The matching protected preview is [this deployment](https://mmaorganicfarm-nlifqytl3-vartmaansharma-blips-projects.vercel.app), `dpl_CUWWCe5MseeegQMfjGjsghpNmbfn`, READY with a successful Vercel check. The user subsequently paused the glass-sidebar feature. Its code is preserved locally on `codex/paused-glass-sidebar` and excluded from this release. Final application code and public assets match the fully exercised runtime revision above; the final commit restores existing navigation and records evidence.

- Optimized build, TypeScript and all 127 unit/source/regression tests pass. ESLint: zero errors, one pre-existing warning in an untouched file.
- Hosted homepage: eight Chromium/WebKit × 320/390/768/1440px cases pass, including forward-only fill and return, fixed orientation, the complete glass inside the frame, menu/keyboard/navigation and released scrolling. Four phone/desktop lifecycle cases pass. Nine connected public routes pass in both themes in both engines, with no page runtime errors.
- Hosted video: all eight Chromium/WebKit × 390/1440px × dark/light cases pass source-range, native-speed, movement, black-frame, credit, exact source-out pixels and no-replay checks. Both engines pass visibility/resume, skip and five failed/slow/denied/stalled/reduced-motion cases. One WebKit desktop/light run produced only 18 presentation samples while three browser suites were active; its source-out pixels were already exact. The unchanged isolated rerun produced 42 distinct samples over the complete two-second source range and passed every assertion. This initial failure and rerun are preserved in the evidence.
- Local shop: 16 engine/width/theme cases plus focus/visibility/reduced-motion lifecycle checks pass. Hosted shop: four phone/desktop cases plus both lifecycle checks pass. The fixed frame, masked reveal, no controls and product links are verified.
- Local product galleries: all 24 engine/phone-desktop/theme/product cases plus reduced motion in both engines pass. Hosted: all 12 engine/phone-desktop/product cases in dark mode plus both reduced-motion cases pass. Automatic progression, thumbnails, keyboard, pointer swipe, full supporting photographs, stable frame, chosen quantity and scheduled-mode galleries are checked. Shop/gallery timer waits use Playwright's clock; actual photographic transitions render before captures.

Measured results are in [hero-choreography-results.json](hero-choreography-results.json). Representative captures: [phone glass](screenshots/hero-choreography/phone-glass.png), [phone overhead](screenshots/hero-choreography/phone-overhead.png), [desktop overhead](screenshots/hero-choreography/desktop-overhead.png), [phone basket](screenshots/hero-choreography/phone-basket.png), [desktop basket](screenshots/hero-choreography/desktop-basket.png), [phone product gallery](screenshots/hero-choreography/phone-product-gallery.png), [desktop product gallery](screenshots/hero-choreography/desktop-product-gallery.png).

These are desktop browser engines and emulated phone viewports, not physical-device tests. Exact-clip commercial-use evidence remains unverified. Attribution is preserved. No database migration, payment activation or customer write is included. Historical video results describe the earlier full-length reversible edit and are not current validation for this sequence.
