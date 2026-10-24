import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const root = path.resolve(import.meta.dirname, ".."),
  cache = new Map();
function load(file) {
  const full = path.resolve(root, file);
  if (cache.has(full)) return cache.get(full).exports;
  const loadedModule = { exports: {} };
  cache.set(full, loadedModule);
  const source = ts.transpileModule(fs.readFileSync(full, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const require = (specifier) => {
    const target = specifier.startsWith("@/")
      ? path.join(root, specifier.slice(2))
      : path.resolve(path.dirname(full), specifier);
    return load(
      path.relative(root, target.endsWith(".ts") ? target : target + ".ts"),
    );
  };
  vm.runInThisContext(`(function(exports,require,module){${source}\n})`, {
    filename: full,
  })(loadedModule.exports, require, loadedModule);
  return loadedModule.exports;
}
const { deliveryChargeForSubtotal, firstMonthEnds } = load(
  "lib/delivery-pricing.ts",
);
const { calculateOrderPricing, calculatePlanPricing } = load(
  "lib/order-pricing.ts",
);
const { quoteStoredCheckout } = load("lib/checkout-quote.ts");
const {
  createShopState,
  restoreShopState,
  orderReturnPath,
  milkDeliveryDates,
} = load("lib/shop-draft.ts");
const paneer = {
  id: "paneer",
  name: "Fresh paneer",
  price: 200,
  unit: "500 g",
  quantity: 1,
  frequency: "weekly",
  days: [2],
};
test("one calendar month clamps month-end dates and expires on the anniversary", () => {
  assert.equal(firstMonthEnds("2026-01-31"), "2026-02-28");
  assert.equal(firstMonthEnds("2028-01-31"), "2028-02-29");
  assert.equal(firstMonthEnds("2026-12-31"), "2027-01-31");
  assert.equal(
    deliveryChargeForSubtotal(62, "plan", "2026-11-24", "2026-10-25"),
    0,
  );
  assert.equal(
    deliveryChargeForSubtotal(62, "plan", "2026-11-25", "2026-10-25"),
    2,
  );
});
test("free-delivery threshold uses products above 199, excludes bottles, and charges once per basket", () => {
  assert.equal(deliveryChargeForSubtotal(199, "once"), 5);
  assert.equal(deliveryChargeForSubtotal(200, "once"), 0);
  assert.equal(deliveryChargeForSubtotal(0, "once"), 0);
  const q = calculateOrderPricing({
    bottleChoice: "new",
    milkLitres: 3,
    products: [],
  });
  assert.equal(q.milkTotal, 186);
  assert.equal(q.bottleCharge, 30);
  assert.equal(q.deliveryCharge, 5);
  assert.equal(q.total, 221);
  assert.equal(
    calculateOrderPricing({
      bottleChoice: "return",
      milkLitres: 1,
      products: [{ ...paneer, frequency: "once", days: [] }],
    }).deliveryCharge,
    0,
  );
});
test("scheduled threshold applies separately to every delivery, including matching add-ons", () => {
  const q = calculatePlanPricing({
    bottleChoice: "return",
    products: [paneer],
    schedule: [1, 1, 1, 1, 1, 1, 1],
    startDate: "2026-10-26",
    firstPlanStart: "2025-01-01",
  });
  assert.equal(q.productTotals.paneer, 1000);
  assert.equal(q.deliveryCharge, 50);
  assert.equal(q.total, 2910);
  assert.equal(
    calculatePlanPricing({
      bottleChoice: "return",
      products: [],
      schedule: [4, 4, 4, 4, 4, 4, 4],
      startDate: "2026-10-26",
      firstPlanStart: "2025-01-01",
    }).deliveryCharge,
    0,
  );
});
test("a plan crossing the first-month boundary only charges later eligible deliveries", () => {
  const q = calculatePlanPricing({
    bottleChoice: "return",
    products: [],
    schedule: [1, 1, 1, 1, 1, 0, 0],
    startDate: "2026-10-25",
    firstPlanStart: "2026-10-25",
  });
  assert.equal(q.milkLitres, 30);
  assert.equal(q.deliveryCharge, 16);
  assert.equal(q.total, 1876);
  assert.equal(
    milkDeliveryDates([1, 1, 1, 1, 1, 0, 0], "2026-10-25").at(-1).date,
    "2026-12-04",
  );
});
test("invalid dates and empty schedules cannot make plan pricing loop", () => {
  for (const startDate of ["bad", "2026-02-30", ""]) {
    assert.equal(
      calculatePlanPricing({
        bottleChoice: "return",
        products: [],
        schedule: [1, 1, 1, 1, 1, 1, 1],
        startDate,
      }).total,
      0,
    );
  }
  assert.deepEqual(milkDeliveryDates([0, 0, 0, 0, 0, 0, 0], "2026-10-25"), []);
});
const items = [
  {
    product_key: "milk",
    quantity: 30,
    unit_price_paise: 6200,
    line_total_paise: 186000,
    frequency: "weekly",
    scheduled_days: [1, 2, 3, 4, 5, 6, 7],
  },
  {
    product_key: "paneer",
    quantity: 1,
    unit_price_paise: 20000,
    line_total_paise: 100000,
    frequency: "weekly",
    scheduled_days: [2],
  },
];
const plan = {
  schedule: [1, 1, 1, 1, 1, 1, 1],
  startDate: "2026-10-26",
  firstPlanStart: "2025-01-01",
};
test("payment repricing counts all add-on occurrences and exactly matches the plan quote", () => {
  assert.equal(quoteStoredCheckout(items, "return", "plan", plan).total, 2910);
  assert.throws(() => quoteStoredCheckout(items, "return", "plan"), /missing/);
  assert.throws(
    () =>
      quoteStoredCheckout(
        items.map((x) => ({ ...x, line_total_paise: 1 })),
        "return",
        "plan",
        plan,
      ),
    /changed/,
  );
  assert.throws(
    () => quoteStoredCheckout([...items, items[0]], "return", "plan", plan),
    /Invalid/,
  );
});
test("one-time payment repricing charges delivery, while paid-plan milk adjustments charge only added milk", () => {
  const line = {
    product_key: "milk",
    quantity: 1,
    unit_price_paise: 6200,
    line_total_paise: 6200,
    frequency: "once",
    scheduled_days: [],
  };
  assert.equal(quoteStoredCheckout([line], "return", "once").total, 67);
  assert.equal(quoteStoredCheckout([line], "return", "adjustment").total, 62);
});
test("draft validation ignores malformed stored quantities, stale dates and unrecognised product fields", () => {
  const state = createShopState("2026-10-25");
  state.mode = "once";
  state.drafts.plan.milk.quantity = 3;
  state.drafts.once.milk.quantity = 2;
  const restored = restoreShopState(state, "2026-10-25");
  assert.equal(restored.mode, "once");
  assert.equal(restored.drafts.plan.milk.quantity, 3);
  assert.equal(restored.drafts.once.milk.quantity, 2);
  state.drafts.plan.milk.quantity = 999;
  state.drafts.once.milk.start = "2025-01-01";
  const clean = restoreShopState(state, "2026-10-25");
  assert.equal(clean.drafts.plan.milk.quantity, 1);
  assert.equal(clean.drafts.once.milk.start, "2026-10-25");
});
test("authentication return path preserves order choices without contact fields or external redirects", () => {
  const result = orderReturnPath({
    purchase: "plan",
    schedule: "1,1,1,1,1,0,0",
    start: "2026-10-25",
    extras: "paneer:once:1",
    phone: "private",
    address: "private",
    next: "https://example.org",
  });
  assert.ok(result.startsWith("/order?"));
  assert.equal(
    new URL(result, "https://mmaorganicfarm.vercel.app").searchParams.get(
      "extras",
    ),
    "paneer:once:1",
  );
  assert.doesNotMatch(result, /private|example.org|phone|address/);
});
const {
  emptyShopCart,
  addCartProduct,
  cartCount,
  cartQuote,
  cartReady,
  cartOrderHref,
} = load("lib/shop-cart.ts");
test("cart combines one-time products into a single delivery and never counts unadded drafts", () => {
  const state = createShopState("2026-10-25");
  assert.equal(cartCount(state.carts.once), 0);
  const milk = addCartProduct(
    state.carts.once,
    "milk",
    state.drafts.once.milk,
    "once",
  );
  assert.equal(cartQuote(milk, "once").total, 67);
  const combined = addCartProduct(
    milk,
    "paneer",
    state.drafts.once.paneer,
    "once",
  );
  assert.equal(cartCount(combined), 2);
  assert.equal(cartQuote(combined, "once").total, 262);
  assert.equal(cartQuote(combined, "once").deliveryCharge, 0);
  assert.equal(
    cartCount(state.carts.once),
    0,
    "adding copies the product, leaving unrelated mode state unchanged",
  );
  const url = new URL(
    cartOrderHref(combined, "once"),
    "https://mmaorganicfarm.vercel.app",
  );
  assert.equal(url.searchParams.get("milk"), "1");
  assert.equal(url.searchParams.get("extras"), "paneer:once:1");
});
test("scheduled add-ons require an explicit milk plan and saved carts are validated", () => {
  const state = createShopState("2026-10-25");
  const extras = addCartProduct(
    state.carts.plan,
    "ghee",
    state.drafts.plan.ghee,
    "plan",
  );
  assert.equal(cartReady(extras, "plan", "2026-10-25"), false);
  assert.equal(extras.milk, null);
  const planCart = addCartProduct(
    extras,
    "milk",
    state.drafts.plan.milk,
    "plan",
  );
  assert.equal(cartReady(planCart, "plan", "2026-10-25"), true);
  assert.equal(cartQuote(planCart, "plan", "2025-01-01").deliveryCharge, 58);
  state.carts.plan = planCart;
  const saved = restoreShopState(
    JSON.parse(JSON.stringify(state)),
    "2026-10-25",
  );
  assert.equal(cartCount(saved.carts.plan), 2);
  assert.equal(cartCount(saved.carts.once), 0);
  assert.equal(
    cartReady({ ...planCart, start: "invalid" }, "plan", "2026-10-25"),
    false,
  );
  assert.equal(cartCount(emptyShopCart("2026-10-25")), 0);
});
const { cartMatchesOrder } = load("lib/shop-cart.ts");
test("payment-to-cart binding matches the actual products, date and quantities, rejecting unrelated or duplicate items", () => {
  const state = createShopState("2026-10-25");
  const milk = addCartProduct(
    state.carts.once,
    "milk",
    state.drafts.once.milk,
    "once",
  );
  const cart = addCartProduct(milk, "paneer", state.drafts.once.paneer, "once");
  const items = [
    { product_key: "milk", quantity: 1, frequency: "once", scheduled_days: [] },
    {
      product_key: "paneer",
      quantity: 1,
      frequency: "once",
      scheduled_days: [],
    },
  ];
  assert.equal(cartMatchesOrder(cart, "once", "2026-10-25", items), true);
  assert.equal(cartMatchesOrder(cart, "once", "2026-10-26", items), false);
  assert.equal(
    cartMatchesOrder(
      cart,
      "once",
      "2026-10-25",
      items.map((i) => ({ ...i, quantity: 2 })),
    ),
    false,
  );
  assert.equal(
    cartMatchesOrder(cart, "once", "2026-10-25", [items[0], items[0]]),
    false,
  );
});
test("a scheduled cart beginning on an unselected weekday quotes add-ons on its actual first milk delivery", () => {
  const state = createShopState("2026-10-25");
  state.drafts.plan.milk.schedule = [1, 1, 1, 1, 1, 0, 0];
  state.drafts.plan.milk.extras.paneer.enabled = true;
  const cart = addCartProduct(
    state.carts.plan,
    "milk",
    state.drafts.plan.milk,
    "plan",
  );
  assert.equal(cartQuote(cart, "plan", "2025-01-01").deliveryCharge, 58);
  assert.equal(
    new URL(
      cartOrderHref(cart, "plan"),
      "https://example.com",
    ).searchParams.get("start"),
    "2026-10-26",
  );
});
