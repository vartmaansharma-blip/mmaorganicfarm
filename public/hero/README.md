# M’ma hero photography assets

The official logo is `../mma-logo.png`, unchanged. Generated glass cutouts use the user's supplied `ChatGPT Image 17 Oct 2026, 18_35_30.png` as their reference. Design direction comes from the conversation and supplied layout, not the outdated project notes. These are illustrative serving visuals, not documentary farm photography or evidence of composition or health benefits.

WebP cutouts retain transparent alpha and are capped at 800 px wide. The supplied full-screen macro is capped at 1600 px wide. Next.js provides responsive formats/sizes. Fonts are local with their OFL licenses in `../fonts/`.

| Asset | Purpose and origin |
| --- | --- |
| `glass-empty.webp` | Frame-matched empty edit of the generated front cutout. |
| `glass-milk.webp` | Frame-matched milk edit; a tapered SVG mask reveals the liquid smoothly. |
| `coffee-front.webp` | Reference-derived front glass, isolated from background, steam and floor. |
| `coffee-side.webp` | Earlier elevated-view study, retained but no longer used. |
| `coffee-side-v2.webp` | Replacement derived from the approved front photo with a gentler, more consistent camera elevation and genuine transparent alpha. |
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

Native scrolling drives absolute progress; no scroll interception or timer-based film playback. Time-based damping follows touch/trackpad scrolling and settles without overshoot. The liquid mask rises continuously before the camera changes. Short dissolves and separate holds keep the photographs distinct. The supplied macro fills the viewport and hides all visual chrome. It then dissolves into a final overhead composition with copy, navigation and Shop restored, as requested in the latest reference. The closing shot releases naturally into the site; reverse scrolling retraces the sequence.

Reduced motion and no JavaScript show a static finished glass without the long pinned sequence. The skip link and focus-only final-frame continuation provide keyboard exits. No heavy video or 3D runtime is loaded.

## Mobile scale and side-view matching

The original hero remains the first screen. Mobile glass height is now 42svh capped at 360px (short phones: 35svh capped at 234px), approximately 20% larger than production. The side layer uses a uniform 1.09229 scale with (-4.955827%, -3.344626%) translation: front alpha y=139..1074 and side y=164..1020 on 800×1200 canvases now align at the rim/base without stretching.

The bottom mouse/scroll cue is centered on laptop layouts and retains its original left alignment on phones. The existing desktop chapter rail fills continuously from the hero's normalized native scroll progress; it reverses with scrolling, reaches 100% at the final frame and disappears during the full-screen macro. It remains hidden on narrow screens as in production. Images/typography/layout otherwise follow the approved production design.


Camera changes now use short clock-driven transitions (110ms angle match, 220ms swirl push-in, 180ms overhead pull-back) between clean shot targets. They finish even when native scrolling stops; a small progress deadband prevents boundary jitter from repeatedly restarting a transition. The fill remains continuously scroll-controlled, reverse transitions start from current image weights, fast skips resolve to the requested shot, and reduced motion remains static. Pausing inside the former blend windows must leave exact 0/1 photographic weights rather than a persistent double exposure.


## Replacement second shot — current asset

`coffee-side-v2.webp` replaces the former second frame. It was generated with the built-in image tool from `coffee-front.webp`, not a new 3D model. Source PNG: exec-d2b047ba-7c2e-4868-9eae-abc85d75b947.png. The generated alpha is preserved while converting to 800×1200 WebP. The visible alpha span is x=81..719, y=108..1092. Current CSS uses scale .950203252 and translation (2.489837%, 3.031504%) to align rim/base with front y=139..1074. Earlier calibration notes above describe the superseded side image.

Final generation prompt:

Use case: precise-object-edit. Create a replacement second camera shot for a photographic website sequence. Input image is the authoritative edit target and identity reference: the exact approved tall, slender, tapered fluted glass with milk and coffee marbling. Change ONLY the camera viewpoint, lifting it very slightly (about 8 degrees) and moving it a little around the glass (about 10 degrees), to reveal a little more of the liquid surface. This must look like the SAME physical glass, SAME contents, SAME photographic lighting and exposure, taken in the same continuous studio photoshoot. Preserve the front glass's tall slender proportions, tapered walls, long straight grooves, thick FLAT clear base, fine lip thickness, liquid fill level safely below the rim, milk/coffee color balance and recognizable marbling. The second shot must not look squat, barrel-shaped, tilted, bulging, flared, shorter, or like another cup. Keep the glass upright and vertical; no leaning camera, no fisheye. The rim should be only a little more open than the reference, a shallow ellipse rather than a deep bowl. Keep the entire glass centered on the SAME portrait 2:3 canvas; visible rim at approximately 11.6% of canvas height and base at 89.5%, with comparable object width to reference, so it is naturally frame matched. Crisp optically realistic glass edges and milk detail, premium product photography with restrained warm neutral highlights, no extra glow. Genuine transparent background and zero-alpha outside the glass, no ground, floor, cast shadow, steam, props, text, border or other scene. Output only one complete isolated glass, not a contact sheet.

The swirl has a gentle photographic push-in: the glass grows toward the liquid as the full-screen texture arrives, then pulls back into the overhead finish. The angle match remains brief. All zoom/opacity motion is bounded in clock time (at most 220ms), with no blur filter or persistent in-between frame.
