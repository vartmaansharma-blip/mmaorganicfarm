# M’ma hero photography assets

The official logo is `../mma-logo.png`, unchanged. Generated glass cutouts use the user's supplied `ChatGPT Image 17 Oct 2026, 18_35_30.png` as their reference. Design direction comes from the conversation and supplied layout, not the outdated project notes. These are illustrative serving visuals, not documentary farm photography or evidence of composition or health benefits.

WebP cutouts retain transparent alpha and are capped at 800 px wide. The supplied full-screen macro is capped at 1600 px wide. Next.js provides responsive formats/sizes. Fonts are local with their OFL licenses in `../fonts/`.

| Asset | Purpose and origin |
| --- | --- |
| `glass-empty.webp` | Frame-matched empty edit of the generated front cutout. |
| `glass-milk.webp` | Frame-matched milk edit; a tapered SVG mask reveals the liquid smoothly. |
| `coffee-front.webp` | Reference-derived front glass, isolated from background, steam and floor. |
| `coffee-side.webp` | Separate generated elevated three-quarter photograph, not a crop of the front. |
| `coffee-top.webp` | Separate generated overhead photograph with a circular rim and visible liquid surface. |
| `coffee-macro.webp` | The exact supplied `ChatGPT Image 17 Oct 2026, 18_36_24.png`, converted to WebP; full-viewport insert before the closing overhead shot. |
| `coffee-angle.webp` | Earlier elevated-view study, retained but no longer used. |

## Asset prompts

Front: Extract only the exact traditional Indian grooved glass and its coffee-and-milk contents. Preserve the slender tapered silhouette and liquid marbling. Remove all background, steam, floor, shadows, glow and decorative lighting. Full upright front view, near-level camera, thick clear base and long flutes. Calm level below the rim. Portrait 2:3, centered, full glass visible. Genuine transparent alpha, soft neutral light, no text, logo, props, pouring or splashes.

Empty edit: Keep exact glass silhouette, pixel positions of rim and base, crop, size, camera and groove positions. Remove all milk, coffee, foam and bubbles. Transparent clear optical glass, preserving thickness and highlights. Same canvas, transparent background, no halo, floor, props, steam, or new artwork. Do not move, resize or reframe the glass.

Milk edit: Keep exact glass silhouette, rim/base positions, groove shapes, size, camera and canvas. Change only the liquid to creamy natural white milk at the same fill level and meniscus, safely below the rim. Remove brown coffee/foam; retain photographic texture and refracting grooves. Transparent alpha, neutral warm light, no floor/background/glow/shadows/stream/splashes. Do not move, resize or reframe the glass.

Side view: The same traditional tapered fluted cutting-chai glass with marbled coffee and milk. A distinct elevated three-quarter camera angle showing the rim ellipse and liquid surface. Full glass centered on a transparent portrait canvas. Match front-view exposure and warm neutral lighting. No floor, cast shadow, background, steam, props, text, splash or overflow.

Overhead: A true top-down camera looking straight into the same grooved glass, circular rim visible. Photographic marbling of cream, caramel and dark coffee inside. Keep the whole rim visible, centered, isolated on transparent alpha. Soft warm neutral studio light, no saucer, handle, floor, background, steam, props or text.

## Motion and accessibility

Native scrolling drives absolute progress; no scroll interception or timer-based film playback. Time-based damping follows touch/trackpad scrolling and settles without overshoot. The liquid mask rises continuously before the camera changes. Short dissolves and separate holds keep the photographs distinct. The supplied macro fills the viewport and hides all visual chrome. It then dissolves into a final overhead composition with copy and navigation restored, as requested in the latest reference. The closing shot releases naturally into the site; reverse scrolling retraces the sequence.

The film is now mounted only after a visitor chooses “Watch the glass story”; its frames and animation code are not requested on initial page load. Reduced motion shows a static finished glass without the long pinned sequence. Without JavaScript, the main milk hero and native FAQs work and the optional film is not mounted. The skip link and focus-only final-frame continuation provide keyboard exits. No heavy video or 3D runtime is loaded.


## Side-view composition alignment

Front and side alpha silhouettes originally had heights of 935 and 856 pixels on their 800×1200 canvases. The side layer uses a uniform scale of 1.09229 and translation of (-4.955827%, -3.344626%) relative to its own canvas. This aligns the photographed rim/base with the front without stretching the glass. Browser verification measures the displayed endpoints within 2px at 320, 360, 390, 768 and 1440 widths. The circular overhead shot remains a distinct camera perspective.
