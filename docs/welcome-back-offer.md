# Welcome-back offer

A customer cancels a paid plan immediately, without farm approval. The cancellation transaction creates a personal offer when the account has not already received one. Unpaid draft cancellations do not qualify. Historical eligible cancellations can retrieve their offer when the customer signs in.

## Offer rules

- Only the first-ever plan cancellation can qualify. A second cancellation never creates, renews or re-enables an offer, even if the first code was unused. Repeated request retries for the same already-cancelled plan count as one cancellation.
- One lifetime offer per customer account. The coupon section is hidden completely for new customers, customers with no cancellation, and customers who cancelled a second plan.
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

Header image: https://mmaorganicfarm.vercel.app/offers/welcome-back-v2.png

Welcome back to M’ma Organic Farm 🌿
Fresh mornings are waiting for you. Enjoy 5% off the products in your first monthly plan back.

Your personal, one-use code: {{personal_code}}
Apply it at checkout using the same account as your cancelled plan. Bottle charges and delivery are excluded.

Plan your fresh start: https://mmaorganicfarm.vercel.app/welcome-back

Button label: Plan my fresh start
Button URL: https://mmaorganicfarm.vercel.app/welcome-back

This is prepared content, not a live sending integration. No WhatsApp Business API sender/token or approved marketing template is configured in the current project. The deployed offer works on the website independently; automatic WhatsApp sending remains blocked on that external connection. Existing click-to-chat links cannot send automatically. Do not send real customer messages during testing.

## Image provenance

Built-in image-generation tool; product and logo references from public/farm-bottle.png and public/mma-logo.png. The output is a promotional lifestyle illustration, not new documentary photography. Final asset: public/offers/welcome-back-v2.png.

Selected direction: black backdrop, milk in the centre, paneer on the left, ghee on the right, mist behind the products, ivory and gold type. Headline: M’ma awaits you. The personal code stays in message text, not in the public artwork.

Final prompt:

Create a striking square luxury dairy welcome-back WhatsApp campaign image, 1536x1536 feel, with a near-black charcoal studio background. Use reference image 1 for the exact M’ma milk bottle and its existing label; reference image 2 for the paneer itself; reference image 3 for the exact M’ma 500 g cow ghee jar and label; reference image 4 for the actual orange heart logo. Hero composition: tall cool white milk bottle exactly centred, a sculptural steel plate of fresh paneer and neat cubes lower left, golden ghee jar lower right; the three products form a balanced confident triangular arrangement on a slightly reflective dark slate pedestal. Soft pearl-white mist curls BEHIND the products only, dramatic soft rim light, warm amber highlights on ghee, crisp creamy whites, appetising textures, subtle reflections, deep blacks. The smoke is theatrical backdrop mist, products should look cool/fresh, not hot or steaming. Design as an arresting premium Indian farm brand campaign, art-directed and atmospheric, restrained not cluttered. Top centre in large elegant ivory editorial serif typography, exact text: “M’ma awaits you.” Under headline in small warm gold refined typography, exact text: “Your fresh start tastes better.” Bottom elegant high-contrast offer strip integrated in black, exact text: “5% off your first month back”. Tiny line below, exact text: “With your personal, one-use code”. Use small exact orange heart brand mark top right, without a white rectangular background. Preserve authentic product label designs. No public coupon code, no QR, no fake buttons, no flames, no extra products, no fake certifications, no extra claims, no watermarks. Clear typography readable at phone size; real breathing room around headline and products. This should feel cinematic, welcoming, memorable, a confident invitation back to M’ma Organic Farm.
