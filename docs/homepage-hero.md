# Mama Organic Farm: mobile-first homepage hero

## Scope and visual authority

The October 24 chat's approved cream hero image (`M’ma Organic Farm Milk Hero.png`) and coffee/glass references (`ChatGPT Image 17 Oct 2026, 18_35_30.png` and `18_36_24.png`) control this implementation. The older `memory.md` is not a design specification. No pouring stream, splashes, bottle orbit, theatrical background, new claims, or whole-site redesign.

The original `public/mma-logo.png` is unchanged. It is the genuine orange/red heart identity, displayed at its original aspect ratio. Fraunces and Space Grotesk are self-hosted with their OFL licenses. Tokens live in `app/globals.css`; hero and navigation styles are scoped modules.

## Mobile experience

A single sticky row contains the logo, an always-visible Shop action, a 44 px light/dark switch and a 44 px menu control. Dark is the default for first visits; a stored light choice is applied before paint and survives reload. The homepage content uses the same color tokens. Existing checkout/staff styling is retained within the original task scope. The native modal drawer has five spacious destinations, an active state, focus containment, Escape/backdrop closing, focus restoration, and background scroll locking. It closes on desktop resize. Shop keeps `/milk`; Farm and Our Story use existing `#farm` and `#about` content; My M’ma keeps the existing `/account` auth gate. Desktop retains a capsule. A no-JavaScript navigation fallback remains usable.

The headline and two CTAs appear above the glass. Small phones have a shorter photograph and tighter spacing. The existing ordering, payment, calendar, accounts and staff functionality is not rewritten.

## Motion sequence

Native scroll drives an absolute normalized progress value; reversing scroll reverses the sequence. No wheel/touch interception, timed introduction, or session-storage gate.

| Progress | View |
| --- | --- |
| 0–56% | Glass remains stationary while milk rises behind a curved meniscus and tapered mask. |
| 56–67% | Only after the level reaches its end, matched coffee ribbons appear. |
| 68–78% | Front photograph transitions to the elevated glass view. |
| 78–90% | A restrained closer view of the same elevated photograph. This is a detail view, not a third simulated camera rotation. |
| 90–100% | Return to the complete front glass and release naturally into existing homepage content. |

A 65 ms time-based response smooths coarse scroll updates consistently across refresh rates. The requestAnimationFrame loop stops after settling. Overscroll and skipped introductions immediately resolve to valid end states. The liquid mask is SVG geometry over photographic assets; it is not a cartoon glass. The fill surface stays below the rim.

Reduced-motion visitors get a complete static coffee-and-milk glass, no extended scroll sequence and no drawer animation. Images have intrinsic dimensions, responsive Next image delivery, and local compressed WebP sources. Copy remains HTML. Shop and Skip introduction are available throughout.

## Asset provenance

The glass cutouts are AI-assisted photographic derivatives generated from the user's supplied coffee-glass reference, then converted to WebP. They illustrate a serving suggestion, not a real farm photo shoot or evidence of farm operations. The genuine logo is never generated or repainted. Prompts and asset roles are recorded in `public/hero/README.md`.

## Reproduce verification

```sh
npm ci
npm test
npm run typecheck
npm run lint
npx playwright install chromium webkit
HERO_BROWSERS=chromium,webkit npm run test:browser
```

Browser checks use the production build. Without BASE_URL they start an isolated local server with a non-secret unreachable auth fixture, verifying only anonymous route gates. They do not log in, call production data APIs, purchase, change schedules, or claim live payment/customer acceptance. Set BASE_URL only for a separately authorized preview; local fixture-only auth checks are skipped in that mode. Screenshots/results default to ignored `work/hero-verification`.

Physical-device Safari/Android performance, real customer login, checkout and payment acceptance remain separate release checks. No merge or production deployment is authorized by these local checks.

## Verified on October 24, 2026

- Production build and all 33 unit/source regression tests pass.
- TypeScript passes. ESLint reports zero errors and six existing warnings in unchanged legacy patterns (baseline: eight warnings).
- Chromium and WebKit pass at 320 × 568, 390 × 844, 768 × 1024 and 1440 × 960: forward/reverse fill, stationary panel, no horizontal overflow, both themes and persisted light preference, mobile modal focus/closing/restoration, Farm/Home destinations and skipping.
- Reduced-motion static presentation passes in both engines. Browser runtime errors: zero.
- Extra checks: Chromium native synthesized touch scrolling raises the level; JavaScript-disabled navigation and static glass pass in both engines.
- Anonymous `/milk` and `/account` redirects pass against the isolated fixture. Authenticated customer ordering and live payment acceptance were not exercised.
- No physical iPhone/Android performance claim, merge, or production deployment.
