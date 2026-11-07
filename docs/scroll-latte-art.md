# Scroll-driven latte art

## Assets

The user selected `ChatGPT Image 7 Nov 2026, 12_45_46.png` as the final artwork, superseding the earlier full latte reference. `public/hero/latte-heart-approved.webp` is a lossless WebP conversion at its original 1254×1254 size. It includes the main heart, M’ma Farms lettering and smaller overlapping heart.

`public/hero/milk-overhead-fixed.webp` is a lossless WebP conversion of the supplied `Overhead Glass of Creamy Latte with Foamy Edges.png`, at its original 1317×1194 size. Both retain every nonzero-alpha RGB pixel and all alpha values. Only invisible RGB values in fully transparent pixels differ after WebP encoding. No cropping, retouching, logo replacement or texture generation is applied to either selected image.

Source PNG SHA-256:

- Artwork: `5fdcddb888059248c893544792829da2f28a7caf380aac4360081402a60098fb`
- Milk/glass: `b53cb7d5bc149d668fafc2af34b1971a87ae0d217e60ce0b23d335032d179f33`

The original photographs, macro video, official site logo and individual milk/paneer/ghee pages remain in place. The newly approved milk plate replaces the overhead closing plate before the latte segment starts; it remains fixed throughout the reveal.

## Motion

The original 55svh milk-fill runway and introductory film remain. A separate 125svh native scroll runway follows the film. The existing requestAnimationFrame adapter computes progress from actual section geometry, including responsive min-height rules. The film remains one-way; the new latte segment reverses freely and adds no scroll lock.

`lib/hero-latte.ts` resolves plain milk through 15%, crema through 35%, main heart through 55%, M’ma through 75%, and Farms/small heart through 90%. The last 10% holds the finished artwork. There is no elapsed-time animation in this segment.

`app/components/latte-art.tsx` puts the fixed plate and SVG on one 1317×1194 contain canvas. The exact selected overlay is positioned once in that canvas. A clip inside the milk protects the original bubbles and rim. SVG mask paths spread around the heart before flowing through the lettering. Path width, feathering and a local mask fade soften the start of each stroke. The complete image never changes opacity. There is no second milk photo, video replacement or whole-image crossfade during formation.

Reduced motion and JavaScript-disabled browsers show the completed composition without a scroll runway. The existing skip link, navigation and ordering links remain. No React state update runs per scroll frame, no animation library is added, and a completed off-screen segment stops its mask/camera work.

## Verification

- `npm run typecheck`
- `npm run lint` (one existing public-information image warning)
- `next build --webpack` locally because this workspace shares dependencies through a symlink; normal CI uses `npm run build`.
- `node --experimental-strip-types --test tests/*.test.mjs`
- `npm run test:latte`
- `npm run test:browser`
- `npm run test:product-gallery`

The dedicated browser check covers Chromium and WebKit at 390px and 1440px in light/dark themes; captures 0/25/50/75/100%; verifies unchanged base URL, opacity, transform and bounding box; compares pixels outside the allowed artwork; reverses the scroll; jumps rapidly; restores mid-scroll after reload; and checks reduced motion, no JavaScript, overflow and runtime errors. Allow at most one RGB channel level outside the artwork for browser compositing noise; report actual counts in results.json. This is local synthetic catalogue testing, not live customer or low-end Android hardware performance acceptance.

Artifacts are written to `work/hero-verification/latte/` by default and uploaded with the existing hero evidence. The existing `test:browser` command runs the introductory hero suite followed by the dedicated latte suite, so the current CI workflow covers the feature without changing workflow permissions. The approved artwork is a raster; the staged masks approximate barista formation and do not simulate real fluid physics. Human visual review of the preview remains part of release approval. No database, payment settings or production deployment changes are included.
