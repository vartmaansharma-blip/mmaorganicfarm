# Today: vibrant delivery design

## Composition

Keep the existing account navigation and other sections. Make Today a compact, visual delivery dashboard: saved address, one delivery card, exact product quantities, a four-stage strip, the last recorded update, next-delivery controls and a compact upcoming summary.

## Colour direction

Use a bright sky-blue scene, golden sun and address accent, red barn roof, mint fields, a yellow scooter, coral helmet and primary action, and lavender help card. Use dark navy text for readable contrast. Supporting surfaces should be pale and spacious so the colours have clear roles. Supply a complete dark-theme palette with the same distinct accent families and legible text.

## Animation direction

Draw the whole farm-to-door setting with hills, clouds, a barn, fence, trees, milk crate, scooter, home and doorstep confirmation. Animate packing when the recorded state is preparing. Animate the road, wheels, passing clouds and rider only while the recorded state is out for delivery. Show a brief confirmation when delivery is actually confirmed. Scheduled and inactive states must not imply the vehicle is moving. Pause motion when off-screen or the document is hidden; provide a pause control and respect reduced motion.

The scene is explicitly an illustration. A recorded delivery stage is not a live driver location or speed measurement. Show location and arrival-time availability honestly: no driver coordinates or ETA source currently exists in the delivery snapshot. Do not ship the prototype's sample location or arrival estimate.

## Constraints and release

Implement with isolated Today and scene styles so this design can be removed without dismantling other account pages. Preserve existing owned data loading, refresh/error retention, confirmed-quantity logic, payment links, skip cutoff and dispatch constraints. Do not introduce payment, refund, GPS, pricing or database mutations.

Verify the actual built page with the existing local Supabase protocol fixture in Chromium and WebKit, at 320/390/768/1440 pixels in both themes. Include delivery states, animation pause/resume, reduced motion, stale update/retry and anonymous access. Run typecheck, lint, production build and delivery interpretation tests. Inspect screenshots, then verify the exact PR commit's CI and Vercel preview before merging the Today-only PR.
