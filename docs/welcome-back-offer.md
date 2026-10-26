# Welcome-back offer

A customer cancels a paid plan immediately, without farm approval. The cancellation transaction creates a personal offer when the account has not already received one. Unpaid draft cancellations do not qualify. Historical eligible cancellations can retrieve their offer when the customer signs in.

## Offer rules

- One lifetime offer per customer account; a later cancellation never resets a redeemed offer.
- Each account receives its own random 16-character code, prefixed with MMA-. The code is bound to the authenticated owner, never a public shared coupon.
- 5% of the product subtotal of the first new prepaid calendar-month plan after cancellation. Exclude bottle and delivery charges. Round once to the nearest paise.
- Example: products ₹3,000, bottles ₹10, delivery ₹2 -> saving ₹150, amount payable ₹2,862.
- A code is attached to one draft checkout at a time. It can be removed before payment. Applying again never compounds the discount.
- Starting payment atomically freezes the exact reviewed total and plan. Uncertain payment outcomes retain the reservation. A verified paid order consumes the offer in the same database transaction as the paid status.
- Wrong-account, wrong-code, spent-code, already-returned, one-time-order and legacy credit-plan attempts are rejected by the server.
- Existing paid prices, purchased entitlements, completed delivery history, and no-refund policy remain intact.

## Customer journey

1. Customer cancels their plan in Account; it stops immediately and records a completed cancellation.
2. An eligible account receives one random code in its private offer record.
3. A WhatsApp marketing message can carry the image, personal code and the public welcome-back link after a Business API sender, approved template and marketing opt-in are connected.
4. Customer signs in at /welcome-back, copies their own code, builds their monthly basket, and applies the code on Review your order.
5. Checkout shows Products, Delivery, Bottles, Welcome-back offer 5%, and the final amount before Razorpay opens.

## WhatsApp creative prepared for provider approval

Header image: https://mmaorganicfarm.vercel.app/offers/welcome-back-v1.png

Welcome back to M’ma Organic Farm 🌿
Fresh mornings are waiting for you. Enjoy 5% off the products in your first monthly plan back.

Your personal, one-use code: {{personal_code}}
Apply it at checkout using the same account as your cancelled plan. Bottle charges and delivery are excluded.

Plan your fresh start: https://mmaorganicfarm.vercel.app/welcome-back

Button label: Plan my fresh start
Button URL: https://mmaorganicfarm.vercel.app/welcome-back

This is prepared content, not a live sending integration. No WhatsApp Business API sender/token or approved marketing template is configured in the current project. The deployed offer works on the website independently; automatic WhatsApp sending remains blocked on that external connection. Existing click-to-chat links cannot send automatically. Do not send real customer messages during testing.

## Image provenance

Built-in image-generation tool; product and logo references from public/farm-bottle.png and public/mma-logo.png. The output is a promotional lifestyle illustration, not new documentary photography. Final asset: public/offers/welcome-back-v1.png.

Final prompt:

Create a polished square 1200x1200 welcome-back campaign image for M’ma Organic Farm in India, using reference image 1 as the exact milk bottle product reference and image 2 as the exact farm heart logo. Preserve the bottle and its label faithfully. Design a warm, lively but calm editorial composition: milk bottle on a rustic breakfast table in soft morning sunlight, fresh green grass and a softly blurred farm beyond, a small cup of milk, tasteful orange/mango brand accents, ample clean cream negative space in the upper left. Place the supplied orange heart logo small and clean at upper right with no white rectangular tile. Main elegant readable dark forest green typography, verbatim: “Fresh mornings, again.” Secondary text verbatim: “5% off your first month back”. Bottom small readable line verbatim: “Your personal code. Your fresh start.” This is an evocative branded lifestyle promotion, not a claim of a newly photographed real farm location. No sample coupon code, no QR code, no fake buttons, no fabricated certification or health claims, no extra text, no watermark. Modern, welcoming, beautifully lit, high quality WhatsApp marketing creative.
