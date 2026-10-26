# Farm workspace interactions

The shared dashboard and driver shell use the existing M’ma typography, logo and colours. Motion explains a real action or state change and stays brief. No animation simulates delivery progress or successful writes.

| Interaction | Behaviour |
|---|---|
| Mobile navigation | Drawer and backdrop enter in 200–240 ms. The menu button changes into a close mark. Focus stays inside the menu; Escape closes it and restores focus. Background content is inert and body scrolling is locked only while open. Desktop resizing restores the normal layout. |
| Desktop navigation | The existing compact preference persists. Current location remains visible; a pending link indicator follows actual Next navigation state without shifting labels. |
| Loading | The route fallback shows labelled loading text and decorative skeletons while real records load. It contains no invented totals. |
| Forms | Hover, press and focus states reinforce interactive controls. Submission disables repeat saves and shows a spinner with `aria-busy`. Errors retain entries. An inline accessible result and a short visual confirmation follow a successful server response. |
| Run phases | The changed phase enters in 220 ms. If the previous action disappears and leaves focus on the document body or the workspace container, focus moves to the new phase heading without scrolling. Failed saves keep the current phase and entries. |
| Driver stops | A new stop enters briefly; recorded success uses sage and exceptions use amber. GPS never marks a stop complete. The explicit next-stop action remains the driver’s control. |
| Pull to refresh | A floating status pill avoids pushing the page content. Repeated pulls coalesce; unfinished edits, pending saves and offline state prevent refresh. Run forms now participate in the same protection as other dashboard forms. |
| Actionable dashboard cards | A small hover lift and press response distinguish links from static information. Keyboard focus remains visible. |
| Reduced motion and print | All animation and transitions in the farm shell stop under `prefers-reduced-motion`. Loading, saved state, menu access and error messages still work. Print hides transient overlays. |

Success notices dismiss after 4.2 seconds. They contain no required action and do not intercept pointer events; the persistent inline response remains available where present. Run success notices provide the accessible status when a phase replaces the submitted form, avoiding an announcement from a removed form.

## Verification

The driver browser suite exercises the full manager/driver handoff on Chromium and WebKit at 390 px and 1440 px. It checks mobile focus cycling, Escape, inert content, scroll restoration, delayed submission, absence of premature success, confirmed save feedback, run-transition focus and unfinished-edit refresh protection. The desktop contexts enable reduced motion and check computed animation/transition styles while completing the same journey. Both journeys also check overflow at 320 px.

The wider delivery-operations suite checks the shared shell across farm pages, forms, filters, navigation preferences, mobile menu, refresh and driver stop outcomes. These are local production-build journeys using synthetic data and native PostgreSQL with the test Auth/REST adapter. Hosted owner reads are checked separately; field phone, physical delivery, GPS and wage acceptance are outside these interaction checks.
