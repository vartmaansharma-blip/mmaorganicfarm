import test from "node:test";
import assert from "node:assert/strict";
import {
  welcomeBackDiscount,
  discountedCheckoutAmount,
} from "../lib/checkout-discount.ts";
test("welcome-back offer discounts product paise, rounds once, and preserves fees", () => {
  assert.equal(welcomeBackDiscount(300000), 15000);
  assert.equal(welcomeBackDiscount(19999), 1000);
  const order = {
    subtotal_paise: 300000,
    discount_paise: 15000,
    discount_code: "MMA-ABCDEF1234567890",
  };
  assert.equal(discountedCheckoutAmount(301100, 300000, true, order), 286100);
  assert.equal(discountedCheckoutAmount(301100, 300000, true, {}), 301100);
  for (const changed of [
    { discount_paise: 15001 },
    { discount_code: "WELCOME5" },
    { subtotal_paise: 1 },
  ])
    assert.throws(
      () =>
        discountedCheckoutAmount(301100, 300000, true, {
          ...order,
          ...changed,
        }),
      /Invalid/,
    );
  assert.throws(
    () => discountedCheckoutAmount(301100, 300000, false, order),
    /Invalid/,
  );
});
