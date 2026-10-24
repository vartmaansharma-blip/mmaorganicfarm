# Production-design-preserving improvements — 24 October 2026

The user rejected the conversion redesign and requested the earlier production visuals, with improvements that do not alter the design. The subsequent explicit visual changes are a larger mobile glass, a centered laptop scroll indicator (left-aligned on phones) and a continuously filling right-hand hero story rail. This supersedes the previous optional-film/static-milk-hero proposal. Preview only: no merge or live deployment is authorized.

## Design retained

- Restore the original always-present photographic hero, headline, two CTAs, chapter labels, full-screen swirl and closing overhead frame.
- Restore the production navigation, section order, layouts, photos, dark default, saved light theme, colors, borders and typefaces.
- Remove the rejected static hero, optional-film disclosure, mobile bottom conversion bar, new FAQ/delivery/story layouts and unused components/data.
- Preserve the original native scroll choreography and reduced-motion behavior. No 3D model or video runtime is added.

## Requested refinements

- Mobile glass canvas grows from 35svh/300px to 42svh/360px. Short phones use 35svh/234px instead of 29svh/195px. All views share the same larger container.
- Front alpha silhouette spans y=139..1074 on an 800×1200 canvas. Side spans y=164..1020. A uniform 1.09229 scale with (-4.955827%, -3.344626%) translation aligns their visible rims/bases without stretching.
- Center the bottom scroll cue on laptop layouts, placing its mouse icon above the label. Preserve the production left-aligned cue on phones and keep the skip link on the right.
- Fill the existing right-hand story rail using the hero's continuous scroll progress, 0–100%. Halfway through the hero is 50%, the final frame reaches 100%, and reverse scrolling empties it. The rail is hidden during the image-only swirl and retains the production breakpoint that hides it on narrow screens.
- Correct a short-desktop sizing defect where the absolutely positioned glass layers had an auto-sized zero-width container. An explicit height preserves the intended glass on short landscape viewports.

## Improvements retained behind the design

- Responsive next/image and smaller WebP versions of the same farm photographs, unchanged crop/layout; correct intrinsic hero dimensions; one prioritized initial hero image; later frames lazy loaded; no 3840-width image candidates.
- Self-hosted WOFF2 versions of the same licensed Fraunces and Space Grotesk faces, preserving visual defaults. Smaller favicon. Remove obsolete meta-keywords, improve milk Offer metadata, remove an unsupported stock-availability assertion, and use a 1200×630 share image matching the actual restored hero.
- Correct the existing dark price badge's unreadable dark text to white while keeping its layout/background; verified contrast exceeds 4.5:1.
- Existing ticker pauses on hover/keyboard focus and stops under reduced motion. Its duplicate text is hidden from assistive technology.
- Non-personal browser conversion events for hero/plan/WhatsApp/call clicks and authenticated plan-builder arrival. No remote collector, cookies or customer identifiers are added; a CTA click does not count as a builder start. Plan/auth/payment logic remains unchanged.
- Correct the milk-bottle alt text to the brand name and remove unsupported licensing/certification wording from the existing story. No public TODO placeholders, reviews, founder material, FSSAI number or other missing facts are invented.

## Verification and limitations

The production build and 37 source/unit checks pass. TypeScript passes; lint has zero errors and two pre-existing warnings. Browser checks cover Chromium/WebKit, both themes, 320/360/390/768/1200/1440 widths, forward/reverse film, macro/overhead/skip, menu focus/Escape/backdrop, reduced motion and nine public customer/policy routes. Follow-up evidence and current Lighthouse numbers are included with the preview delivery; the rejected redesign's score of 93 must not be attributed to this restored design.

A direct comparison against production at 390 and 1440 widths confirms unchanged header, headline and copy bounding boxes. At 390×844 the glass canvas grows from 295.39 to 354.47px (20%); desktop sizing remains unchanged at 1440×960. Header/copy image differences are below 0.3% of compared pixels, principally font rasterization. The subsequent scroll-cue/rail changes are the user's explicit additions.

No authenticated order, payment, customer/calendar write or physical-phone test has been performed. The event bridge is instrumented, not a remotely collecting analytics service. Missing owner facts are recorded in landing-owner-content-checklist.md. Main and production remain unchanged pending a later explicit release instruction.


Camera changes now use 110ms clock-driven dissolves between clean shot targets. They finish even when native scrolling stops; a small progress deadband prevents boundary jitter from repeatedly restarting a transition. The fill remains continuously scroll-controlled, reverse transitions start from current image weights, fast skips resolve to the requested shot, and reduced motion remains static. Pausing inside the former blend windows must leave exact 0/1 photographic weights rather than a persistent double exposure.
