# Individual product galleries — implemented

The shop's automatic collection hero and each product's photo gallery have separate roles. The shop hero has no Pause, Play or Next controls; its basket opens milk and each subsequent image opens its corresponding product page.

## Interaction

Each product opens with its existing main image. The supporting photograph follows automatically after a six-second hold and a successful decode. A restrained overlapping dissolve and slight horizontal drift keep the photographic frame stable. The gallery cycles between its two images.

Thumbnails sit beside the main frame on desktop and below it on phones. Visitors can select a thumbnail, swipe horizontally, or focus the photograph and use arrow keys. Hover, keyboard focus, active touch, hidden tabs and leaving the viewport suspend automatic advancement. Reduced motion keeps the first image static and allows immediate manual selection. There is no opt-in Play action.

The same `ProductGallery` component is used by one-time and scheduled product pages. Image state does not update product quantity, dates, schedule, cart or pricing. Supporting photographs use `object-fit: contain` so the full composition remains visible, including the paneer salad and ghee drip.

## Source images

The original supplied Desktop paths were unavailable. The already-authored `feat/product-extra-imagery` branch contained the matching images. These three WebP assets were visually inspected and copied byte-for-byte from commit `0b0f4b6ccccbcc5e89b0a70ff9b31188342c728b`; none of that branch's ordering, page or motion code was merged.

| Product | Supporting asset | Supplied reference |
| --- | --- | --- |
| Milk | `public/shop/milk-pasture.webp` | Farm Fresh Milk by the Pasture.png |
| Paneer | `public/shop/paneer-serving.webp` | Floating Paneer Salad Toss.png |
| Ghee | `public/shop/ghee-serving.webp` | M’ma Farms Pure Cow Ghee Drip.png |

No new product imagery was generated for these galleries. The basket is a separate generated image documented in [shop-basket-image.md](shop-basket-image.md).

## Verification

`tests/product-gallery.browser.mjs` checks automatic progression, responsive thumbnails, keyboard and pointer swipe, complete supporting-image framing, no layout shift, preservation of the chosen quantity, galleries in scheduled mode, reduced motion and runtime errors in Chromium and WebKit at phone and desktop widths and both themes. Timer waits are advanced with Playwright's clock; photographic transitions are allowed to render before visual captures. This is browser emulation, not a physical-device claim.
