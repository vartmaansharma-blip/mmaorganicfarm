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

Final results are added here after browser review of the current build and hosted preview. Historical video results describe the earlier full-length edit and are not current validation for this shorter sequence.
