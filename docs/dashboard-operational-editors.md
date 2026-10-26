# Dashboard editing plan

The dashboard is the operating workspace for the owner. Editors save in place, preserve scroll and show an inline result. Every financial or service change records who changed it, the reason, and its before/after values.

## Prices

Move milk, paneer, ghee and bottle prices into the farm database. Settings provides labelled rupee inputs and a reason field. Product cards, baskets, delivery details, manual orders, additions and payment verification use the same price book. A price revision is captured when an order is created, so existing paid purchases and already-prepared payment amounts retain the agreed prices. New prices apply to new purchases. Customers and delivery staff cannot change catalogue prices.

## Customers

Retain the existing customer editor for name, email, phone, address, locality, landmark, postal code, instructions, zone, route and stop order. Add an audit record rather than duplicating this editor. Keep routing changes synchronized with operations and preserve physical delivery history.

## Quantities

Expose future service editors on the customer page. Monthly prepaid product quantities can be moved between selected future dates while retaining the purchased product totals. Check capacity, service dates and any recorded fulfilment before saving. Legacy milk reductions use the existing next-calendar-day carry rule; full skips preserve service at plan end. Additional products or milk use a paid addition/manual order, with the farm confirming receipt before service becomes eligible. Preserve completed delivery evidence and closed closeouts.

## Payments

Provide an owner editor for farm-recorded payment method, receipt/reference and received date, with an audit reason. Retain the existing correction workflow to void an incorrect manual entry and record its replacement. Actual Razorpay transaction amounts continue to come from verified provider events; the owner can inspect them without fabricating a bank transaction. Show the link to the related customer/order in each correction.

## Verification and release

Test authorization, price revision capture, fractional rupee prices, old-order price preservation, capacity-safe quantity transfers and payment audit records against native PostgreSQL. Test the visible editors at mobile and desktop sizes, including in-place save and failed-edit preservation. Review the production-equivalent preview, verify the exact commit and additive migration, deploy, and inspect the live pages without modifying real customer purchases as a smoke test.

## Existing completed feature

Immediate customer cancellation and the discount-free cinematic return invitation are live. Coupon generation and redemption are disabled to protect dairy margins. Automatic WhatsApp sending remains dependent on an externally connected Business API sender and approved marketing template.
