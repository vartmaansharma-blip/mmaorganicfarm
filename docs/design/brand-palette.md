# M’ma brand palette

The supplied HSL values are the source of truth in `app/globals.css`. Existing customer components resolve their semantic aliases to this palette; no UI framework or theme dependency is added.

- Green-black and cream provide the two page themes. New visitors start in light mode, independent of OS preference.
- Butter marks the main action and moving banner. Forest sections keep cream text in both themes; mint and meadow support surfaces and feedback.
- Navigation uses butter text and an indicator in dark mode, forest with cream text in light mode. Small light-theme accents use forest for contrast.
- The original bottle, film, photographs, logo, wording, routes and commerce controls remain. Photography gets only a restrained CSS tint and grade; the glass gets a soft butter halo. Existing colours inside original images, including the logo, are retained.
- Warnings and errors use amber with their existing labels. Product, payment, delivery and dispatch rules are unchanged.
- The `mma-theme` preference is applied before paint, with migration from the existing `mama-theme` preference. Class and existing data attributes stay synchronized; blocked storage does not disable the toggle.
- This colour release does not include the separate customer-portal layout or the previously proposed multicolour Today design.

## Verification

Run the application tests, typecheck, lint and build. With a build using the read-only local catalogue at port 4100, run `HERO_CATALOGUE_PORT=4100 npm run test:palette`, the existing hero/shop suites, and `ACCOUNT_FIXTURE_PORT=4100 npm run test:account`. Browser acceptance covers Chromium and WebKit, both themes, mobile and desktop, contrast, persistence, reduced motion, navigation and delivery states. Synthetic fixtures do not charge customers or mutate hosted data.
