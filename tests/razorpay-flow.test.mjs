import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("uses Razorpay as the customer checkout and preserves capacity", async () => {
  const [review, payment, order, verify, webhook] = await Promise.all([
    source("../app/checkout/review/page.tsx"),
    source("../app/checkout/review/checkout-payment.tsx"),
    source("../app/api/payments/razorpay/order/route.ts"),
    source("../app/api/payments/razorpay/verify/route.ts"),
    source("../app/api/payments/razorpay/webhook/route.ts"),
  ]);

  assert.match(review, /CheckoutPayment/);
  assert.match(payment, /RazorpayCheckoutButton/);
  assert.doesNotMatch(review, /ShopifyCheckoutButton|hasShopifyStorefrontConfig/);
  assert.match(order, /reserveOrderCapacity/);
  assert.match(order, /releaseOrderCapacity/);
  assert.match(verify, /verifyPaymentSignature/);
  assert.match(verify, /recordCapturedPayment/);
  assert.match(webhook, /verifyWebhookSignature/);
  assert.match(webhook, /payment\.captured/);
  assert.match(webhook, /order\.paid/);
});
