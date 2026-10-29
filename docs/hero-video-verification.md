# Approved coffee-swirl integration verification — 29 October 2026

Base: `main` at `4b0e36702ec8ce785f0c2e93893092cf5d8981d9`. Only the hero macro, its clock/media adapter, related documentation and test fixtures change.

## Verified source

`public/hero/coffee-macro-motion.mp4` is the unchanged approved source: SHA-256 `cc255f456ffa3304be88bcdc40fc1fd9671c46762b4ca0d82ed4039e5b206612`, 3,155,596 bytes, H.264/AVC, 1284×724, 3.041667 seconds and one video track with no audio track. The test parses the MP4 atoms and checks its full hash. Browser decoding independently confirms its dimensions/duration. The first decoded frame closely matches the approved macro still (mean absolute channel difference approximately 3/255 after equal-size comparison, including compression and watermark differences). The media is never transcoded.

## Checks

| Check | Result |
| --- | --- |
| Production build and `npm test` | Pass, 117 tests including media integrity, timeline, lifecycle-adapter and existing commerce/auth checks. |
| TypeScript | Pass. |
| ESLint | Zero errors; one pre-existing image warning in untouched `public-information-layout.tsx`. |
| Chromium, 390×844 and 1440×960, dark/light | Pass: first/final presented frames, moving decoded frames, no black decoded frames, 1× muted playback once, identical poster/video crop, visible credit, end before overhead, unlock, static reverse. |
| WebKit and additional lifecycle/fallback matrix | In progress; final results will be recorded before delivery. |
| Existing hero/public-route browser matrix | In progress. |
| Hosted preview | Pending draft feature-branch deployment and verification. |

## Reproduce

```sh
npm ci
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3199 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_hero_browser_fixture npm test
npm run typecheck
npm run lint
HERO_BROWSERS=chromium,webkit npm run test:hero-video
HERO_TEST_PORT=3104 HERO_BROWSERS=chromium,webkit npm run test:browser
```

Run the browser commands sequentially. Their local protocol fixture permits only anonymous catalogue GETs and rejects writes. It exists because the current homepage requires a catalogue response. There are no production credentials or customer records in these checks. Browser artifacts are in `work/hero-video-verification/` and `work/hero-verification/`.

## Release boundary

The clip visibly contains “KlingAI 4.0”. The source watermark remains untouched; the viewport credit preserves visible attribution under responsive crop. The approved clip was also imported, with the user's explicit authorization, into their Canva library as **M’ma approved coffee swirl — original silent clip** (`VAHZX5kjcws`). No Canva re-export replaces the approved file.

The [Kling general terms](https://kling.ai/docs/user-policy) §4.6 and [paid-service terms](https://kling.ai/docs/payment-policy) §3.1.2 distinguish regular-account restrictions and member commercial-use benefits (checked 29 October 2026). Account/date/plan or written permission covering this exact clip remains unverified. Keep the PR in draft and the deployment in preview pending that evidence. Import into Canva does not supply a license for the source.

Chromium and desktop WebKit with emulated phone sizes are browser-engine checks. They do not establish physical iPhone/Safari or Android device reliability. No live order, payment, database mutation, production merge or production deployment is part of this work.
