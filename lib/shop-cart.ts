import {
  FARM_PRODUCTS,
  serializeFarmProductSelections,
  type FarmProductSelection,
} from "./farm-products";
import { calculateOrderPricing, calculatePlanPricing } from "./order-pricing";
import { serializeWeeklyMilkSchedule } from "./milk-plan";
import {
  milkDeliveryDates,
  validShopDate,
  type ShopDraft,
  type ShopExtra,
  type ShopMode,
  type ShopProductId,
} from "./shop-draft";
export type ShopCart = {
  start: string;
  milk: ShopDraft | null;
  paneer: ShopExtra | null;
  ghee: ShopExtra | null;
};
export function emptyShopCart(start: string): ShopCart {
  return { start, milk: null, paneer: null, ghee: null };
}
export function cartCount(cart: ShopCart) {
  return (
    Number(Boolean(cart.milk)) +
    Number(Boolean(cart.paneer)) +
    Number(Boolean(cart.ghee))
  );
}
export function addCartProduct(
  cart: ShopCart,
  id: ShopProductId,
  draft: ShopDraft,
  mode: ShopMode,
) {
  const next = structuredClone(cart);
  if (!cartCount(cart)) next.start = draft.start;
  if (id === "milk") {
    next.milk = structuredClone(draft);
    next.start = draft.start;
    for (const key of ["paneer", "ghee"] as const)
      if (draft.extras[key].enabled)
        next[key] = {
          ...structuredClone(draft.extras[key]),
          frequency: mode === "plan" ? draft.extras[key].frequency : "once",
          days: mode === "plan" ? draft.extras[key].days : [],
        };
  } else
    next[id] = {
      enabled: true,
      quantity: draft.quantity,
      frequency: "once",
      days: [],
    };
  // Recurring add-ons follow the selected milk days; a removed day must be chosen again.
  if (mode === "plan" && next.milk)
    for (const key of ["paneer", "ghee"] as const) {
      const x = next[key];
      if (x?.frequency === "weekly")
        x.days = x.days.filter((day) => next.milk!.schedule[day - 1] > 0);
    }
  return next;
}
export function cartSelections(cart: ShopCart): FarmProductSelection[] {
  return FARM_PRODUCTS.flatMap((p) =>
    cart[p.id] ? [{ ...p, ...cart[p.id]! }] : [],
  );
}
export function cartQuote(
  cart: ShopCart,
  mode: ShopMode,
  firstPlanStart?: string | null,
) {
  const products = cartSelections(cart);
  return mode === "plan" && cart.milk
    ? calculatePlanPricing({
        bottleChoice: "return",
        products,
        schedule: cart.milk.schedule,
        startDate:
          milkDeliveryDates(cart.milk.schedule, cart.start)[0]?.date ??
          cart.start,
        firstPlanStart:
          firstPlanStart ??
          milkDeliveryDates(cart.milk.schedule, cart.start)[0]?.date ??
          cart.start,
      })
    : calculateOrderPricing({
        bottleChoice: cart.milk ? "return" : "none",
        milkLitres: cart.milk?.quantity ?? 0,
        products,
      });
}
export function cartReady(cart: ShopCart, mode: ShopMode, minimum: string) {
  return (
    cartCount(cart) > 0 &&
    validShopDate(cart.start) &&
    cart.start >= minimum &&
    (mode === "once" ||
      Boolean(
        cart.milk &&
          milkDeliveryDates(cart.milk.schedule, cart.start).length === 30,
      )) &&
    !cartSelections(cart).some(
      (x) => x.frequency === "weekly" && !x.days.length,
    )
  );
}
export function cartOrderHref(cart: ShopCart, mode: ShopMode) {
  const milk = cart.milk;
  const start =
    mode === "plan" && milk
      ? (milkDeliveryDates(milk.schedule, cart.start)[0]?.date ?? cart.start)
      : cart.start;
  const params = new URLSearchParams({
    purchase: mode,
    milk: String(
      milk
        ? mode === "plan"
          ? milk.schedule.reduce((a, b) => a + b, 0)
          : milk.quantity
        : 0,
    ),
    start,
  });
  if (milk && mode === "plan")
    params.set("schedule", serializeWeeklyMilkSchedule(milk.schedule));
  const products = cartSelections(cart);
  if (products.length)
    params.set("extras", serializeFarmProductSelections(products));
  return `/order?${params}`;
}
// Compare public basket choices with the owned order before binding payment to a cart.
export function cartMatchesOrder(
  cart: ShopCart,
  mode: ShopMode,
  start: string,
  items: Array<{
    product_key: string;
    quantity: number;
    frequency: string;
    scheduled_days: number[];
  }>,
) {
  const quote = cartQuote(cart, mode);
  const date =
    mode === "plan" && cart.milk
      ? milkDeliveryDates(cart.milk.schedule, cart.start)[0]?.date
      : cart.start;
  if (
    date !== start ||
    items.length !== cartCount(cart) ||
    new Set(items.map((item) => item.product_key)).size !== items.length
  )
    return false;
  return items.every((item) =>
    item.product_key === "milk"
      ? Boolean(cart.milk && Number(item.quantity) === quote.milkLitres)
      : cartSelections(cart).some(
          (p) =>
            p.id === item.product_key &&
            p.quantity === Number(item.quantity) &&
            p.frequency === item.frequency &&
            [...p.days].sort().join(",") ===
              [...(item.scheduled_days ?? [])].sort().join(","),
        ),
  );
}
