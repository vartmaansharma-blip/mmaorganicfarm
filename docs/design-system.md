# M’ma customer design system

The current chat and deployed photographic hero govern the design. The October 24 task attachment and older `memory.md` are suggestions: useful gaps are adopted; outdated spelling, alternate palette values, light/system default and broad future features do not replace the accepted decisions.

M’ma combines farm warmth with digital precision. Fraunces supports editorial storytelling; Space Grotesk supports decisions, prices, forms and schedules. Preserve the genuine heart logo and natural photographic colors.

## One color contract

`app/globals.css` is the canonical source. The approved colors remain unchanged: farm green, sage, milk ivory, olive charcoal and honey gold. Dark is the first-visit default, even when the OS prefers light. An explicit stored light selection applies before hydration and persists between pages. Keep the existing `mama-theme` key for compatibility; it is not public brand copy.

- `--color-background`, `--color-surface`, `--color-surface-raised`, `--color-surface-hover`: page, quiet section, product panel and hover.
- `--color-text-primary`, `--color-text-secondary`, `--color-border`: readable hierarchy and dividers. Input boundaries use the stronger `--color-input-border`.
- `--color-accent`, `--color-accent-contrast`: farm identity and selected options. A choice is not a success message.
- `--color-action-primary`, `--color-action-primary-text`, `--color-action-primary-hover`: ordering actions.
- `--color-action-secondary`, `--color-action-secondary-text`: supporting actions.
- `--color-focus-ring`, `--color-input-background`, `--color-input-border`: keyboard and form roles.
- `--color-success`, `--color-warning`, `--color-error` and their `-surface` partners: genuine feedback states, always accompanied by words.

Existing `--hero-*` / `--ui-*` variables alias this contract. Do not fork another palette per page. The hero's liquid, original artwork, photo overlays and mobile glass menu remain intentional exceptions. Staff page structure is outside this migration.

## Reusable controls, without another component library

`app/components/customer-ui.module.css` provides CSS Module composition primitives. Use scoped classes to preserve each component's layout and existing events:

```css
.submitButton { composes: primary from "../components/customer-ui.module.css"; }
.backAction { composes: secondary from "../components/customer-ui.module.css"; }
.addressInput { composes: field from "../components/customer-ui.module.css"; }
.page { composes: surface from "../components/customer-ui.module.css"; }
```

Actions have a 48px minimum height, capsule shape, consistent interface type, visible focus, restrained press feedback, hover and disabled/loading presentation. Fields use 16px type, 48px minimum height and an 8px radius. Textareas can grow; phone wrappers retain a single shared boundary. Product panels use a 12px radius. Do not make form fields capsules or turn every story section into a card.

Scheduling controls have at least 44px touch targets. Extra-product days wrap as needed; weekly steppers reflow into readable columns instead of squeezing seven tiny controls across a narrow panel. Whole-litre values, existing limits, prices, order URLs and all business logic remain unchanged. Green/sage selections preserve readable on-selection text. Calendar selection keeps its existing `aria-current="date"` and gains a clear accent boundary/surface.

Compose `surface` on customer page roots for scoped keyboard focus and tabular numeric output. Do not apply these customer control rules globally to staff operations or the photographic hero.

## Type and interaction

Page headlines use a shared responsive 32–48px scale; the approved hero and larger product/storytelling display remain deliberately expressive. Interface section headings use Space Grotesk at practical weights. Caption text is at least 12px in the migrated customer modules. Avoid very heavy editorial headings and color-only links.

Theme changes update CSS only; they do not remount the builder, restart the hero, reset scroll or clear form values. No global crossfade is added. Button feedback takes 140ms and honors reduced motion. The approved camera sequence and scroll fill are unchanged. Keep the working mobile modal, focus containment, backdrop close and reduced-transparency fallback.

## Migration coverage and boundaries

Covered: authentication/recovery, existing `/milk` builder, delivery details, review, confirmation, account, calendar, policy pages and homepage action shape. No new public catalogue, new account system, new payment provider, customer intelligence or operations rewrite is introduced.

`/milk` currently authenticates before rendering the builder. A public `/shop` catalogue and `/our-story` route are absent; public Farm and Our Story navigation uses homepage anchors. These are separate customer-flow/content tasks. Moving authentication requires a deliberate persistence/security review, not a styling edit. Older household, intelligence, loyalty and provenance proposals require backend support and real operational evidence; they are not claimed as delivered.

## Verification

- `npm test`: production build plus source/unit and theme initialization/storage tests.
- `npm run typecheck`, `npm run lint`.
- `HERO_BROWSERS=chromium,webkit npm run test:browser`: optimized Next site, nine viewports, both themes, public routes, anonymous auth gates, menu, hero, readable fields and no state reset.
- `npm run test:customer-ui`: local-only fixtures exercise the real client milk builder and unready checkout control, with representative protected-page markup using the actual scoped CSS. Covers seven widths, both engines/themes, whole-litre order URL, selected products/date/quantity preservation, touch targets and overflow.

The fixture uses Next image/link adapters and synthetic data. It is not a deployed route, an authentication bypass, a real customer record or authenticated checkout acceptance. Authenticated server-rendered account/order/calendar content and successful payments still need separate permissioned acceptance coverage. No customer or calendar writes are made by these tests.

## Before/after screenshots

The [versioned screenshot index](screenshots/customer-system/README.md) includes real sign-in pages in both themes at 390px and 1440px. The before screenshots are the current production baseline; after screenshots are the candidate optimized Next build. Synthetic protected-page fixtures are kept separately in the delivery evidence.
