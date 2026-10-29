import assert from "node:assert/strict";
import test from "node:test";
import { createShopState, restoreShopState } from "../lib/shop-draft";
import { addCartProduct, cartCount, removePurchasedItems, selectedShopCart } from "../lib/shop-cart";

test("checkout selection leaves unselected products in the cart", () => {
  const state = createShopState("2026-11-01");
  let cart = addCartProduct(state.carts.once, "milk", state.drafts.once.milk, "once");
  cart = addCartProduct(cart, "paneer", state.drafts.once.paneer, "once");
  cart.selected.paneer = false;

  const selected = selectedShopCart(cart);
  assert.equal(cartCount(cart), 2);
  assert.equal(cartCount(selected), 1);
  assert.ok(selected.milk);
  assert.equal(selected.paneer, null);
  assert.ok(cart.paneer);
  const { cart: afterPayment, changed } = removePurchasedItems(cart, {
    milk: JSON.stringify(cart.milk),
  });
  assert.equal(changed, true);
  assert.equal(afterPayment.milk, null);
  assert.ok(afterPayment.paneer);
  assert.equal(afterPayment.selected.paneer, false);
  assert.ok(cart.milk);
});

test("an edited selected item remains in the cart after payment", () => {
  const state = createShopState("2026-11-01");
  const cart = addCartProduct(state.carts.once, "ghee", state.drafts.once.ghee, "once");
  const before = JSON.stringify(cart.ghee);
  cart.ghee!.quantity = 2;
  const result = removePurchasedItems(cart, { ghee: before });
  assert.equal(result.changed, false);
  assert.equal(result.cart.ghee?.quantity, 2);
});

test("restoring an older cart selects its existing products", () => {
  const state = createShopState("2026-11-01");
  state.carts.once = addCartProduct(state.carts.once, "ghee", state.drafts.once.ghee, "once");
  const old = JSON.parse(JSON.stringify(state));
  delete old.carts.once.selected;

  const restored = restoreShopState(old, "2026-11-01");
  assert.equal(restored.carts.once.selected.ghee, true);
  assert.equal(restored.carts.once.selected.milk, false);
});
