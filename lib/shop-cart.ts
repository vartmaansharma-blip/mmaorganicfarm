import {
  FARM_PRODUCTS,
  serializeFarmProductSelections,
  type FarmProductSelection,
} from "./farm-products";
import { firstMonthEnds as firstMonthEndForShift } from "./delivery-pricing";
import { calculateOrderPricing } from "./order-pricing";
import { addCalendarDays } from "./delivery-calendar";
import {
  quoteMonthlySchedule,
  recommendedDates,
  serializeRoutines,
  validateRoutines,
  type ProductRoutine,
} from "./monthly-schedule";
import {
  validShopDate,
  type ShopDraft,
  type ShopExtra,
  type ShopMode,
  type ShopProductId,
  type ShopState,
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
  if (mode === "once" && !cartCount(cart)) next.start = draft.start;
  if (id === "milk") {
    next.milk = structuredClone(draft);
    if (mode === "once") next.start = draft.start;
    if (mode === "once")
      for (const key of ["paneer", "ghee"] as const)
        if (draft.extras[key].enabled)
          next[key] = {
            ...structuredClone(draft.extras[key]),
            frequency: "once",
            days: [],
          };
  } else
    next[id] = {
      enabled: true,
      quantity: draft.quantity,
      frequency: "once",
      days: [],
      repeat: draft.repeat,
      dates: draft.dates,
      firstDate: draft.start,
      week: draft.repeat === "days" ? [...draft.schedule] : undefined,
    };
  return next;
}
export function cartSelections(cart: ShopCart): FarmProductSelection[] {
  return FARM_PRODUCTS.flatMap((p) =>
    cart[p.id] ? [{ ...p, ...cart[p.id]! }] : [],
  );
}
export function cartRoutines(cart: ShopCart): ProductRoutine[] {
  const result: ProductRoutine[] = [];
  for (const id of ["milk", "paneer", "ghee"] as const) {
    const x = cart[id];
    if (!x) continue;
    const repeat =
        x.repeat ??
        (id === "milk"
          ? "days"
          : (cart[id] as ShopExtra).frequency === "weekly"
            ? "days"
            : "once"),
      dates =
        repeat === "custom"
          ? (x.dates ?? recommendedDates(id, cart.start))
          : undefined,
      firstDate =
        repeat === "custom"
          ? (dates?.slice().sort()[0] ?? cart.start)
          : id === "milk"
            ? cart.milk!.start
            : ((cart[id] as ShopExtra).firstDate ?? cart.start);
    result.push({
      id,
      quantity: x.quantity,
      repeat,
      firstDate,
      ...(dates ? { dates } : {}),
      ...(repeat === "days"
        ? {
            week:
              id === "milk"
                ? cart.milk!.schedule
                : ((cart[id] as ShopExtra).week ??
                  Array.from({ length: 7 }, (_, i) =>
                    (cart[id] as ShopExtra).days.includes(i + 1)
                      ? x.quantity
                      : 0,
                  )),
          }
        : {}),
    });
  }
  return result;
}
export function cartQuote(
  cart: ShopCart,
  mode: ShopMode,
  firstPlanStart?: string | null,
) {
  if (mode === "plan") {
    const rules = validateRoutines(cart.start, cartRoutines(cart));
    if (rules)
      return quoteMonthlySchedule({
        start: cart.start,
        rules,
        firstPlanStart: firstPlanStart ?? cart.start,
      });
    return calculateOrderPricing({
      bottleChoice: "none",
      milkLitres: 0,
      products: [],
    });
  }
  return calculateOrderPricing({
    bottleChoice: cart.milk ? "return" : "none",
    milkLitres: cart.milk?.quantity ?? 0,
    products: cartSelections(cart).map((p) => ({
      ...p,
      frequency: "once",
      days: [],
    })),
  });
}
export function cartReady(cart: ShopCart, mode: ShopMode, minimum: string) {
  return (
    cartCount(cart) > 0 &&
    validShopDate(cart.start) &&
    cart.start >= minimum &&
    (mode === "once" ||
      Boolean(validateRoutines(cart.start, cartRoutines(cart))))
  );
}
export function shiftCartPeriod(cart: ShopCart, mode: ShopMode, start: string) {
  const next = structuredClone(cart);
  next.start = start;
  if (mode === "plan" && validShopDate(start)) {
    const base = validShopDate(cart.start)
      ? cart.start
      : cartRoutines(cart)
          .map((r) => r.firstDate)
          .filter(validShopDate)
          .sort()[0];
    if (base) {
      const offset = Math.round(
        (new Date(`${start}T12:00:00Z`).valueOf() -
          new Date(`${base}T12:00:00Z`).valueOf()) /
          86400000,
      );
      if (next.milk) {
        next.milk.start = addCalendarDays(next.milk.start, offset);
        if (next.milk.dates)
          next.milk.dates = next.milk.dates.map((date) =>
            addCalendarDays(date, offset),
          );
      }
      for (const id of ["paneer", "ghee"] as const)
        if (next[id]) {
          next[id]!.firstDate = addCalendarDays(
            next[id]!.firstDate ?? base,
            offset,
          );
          if (next[id]!.dates)
            next[id]!.dates = next[id]!.dates!.map((date) =>
              addCalendarDays(date, offset),
            );
        }
    }
  }
  return next;
}
export function cartOrderHref(cart: ShopCart, mode: ShopMode) {
  const params = new URLSearchParams({
    purchase: mode,
    milk: String(cart.milk?.quantity ?? 0),
    start: cart.start,
  });
  if (mode === "plan")
    params.set("routine", serializeRoutines(cartRoutines(cart), cart.start));
  else if (cartSelections(cart).length)
    params.set(
      "extras",
      serializeFarmProductSelections(
        cartSelections(cart).map((p) => ({
          ...p,
          frequency: "once",
          days: [],
        })),
      ),
    );
  return `/order?${params}`;
}
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
  routine?: string,
) {
  if (
    start !== cart.start ||
    items.length !== cartCount(cart) ||
    new Set(items.map((x) => x.product_key)).size !== items.length
  )
    return false;
  const quote = cartQuote(cart, mode);
  if (mode === "plan") {
    if (
      !("quantities" in quote) ||
      !routine ||
      routine !== serializeRoutines(cartRoutines(cart), cart.start)
    )
      return false;
    return items.every(
      (item) =>
        ["milk", "paneer", "ghee"].includes(item.product_key) &&
        item.quantity === quote.quantities[item.product_key as ShopProductId] &&
        item.frequency === "once",
    );
  }
  return items.every((item) =>
    item.product_key === "milk"
      ? Boolean(cart.milk && item.quantity === quote.milkLitres)
      : cartSelections(cart).some(
          (p) =>
            p.id === item.product_key &&
            p.quantity === item.quantity &&
            item.frequency === "once",
        ),
  );
}

export function shiftShopPlan(state: ShopState, start: string): ShopState {
  if (!validShopDate(start)) return state;
  const previous = state.carts.plan.start,
    end = firstMonthEndForShift(start)!;
  const offset = Math.round(
    (new Date(`${start}T12:00:00Z`).valueOf() -
      new Date(`${previous}T12:00:00Z`).valueOf()) /
      86400000,
  );
  const shift = (date: string) => {
    const shifted = addCalendarDays(date, offset);
    return shifted < start
      ? start
      : shifted >= end
        ? addCalendarDays(end, -1)
        : shifted;
  };
  const draft = (d: ShopDraft): ShopDraft => ({
    ...d,
    start: shift(d.start),
    ...(d.dates ? { dates: [...new Set(d.dates.map(shift))] } : {}),
  });
  const cart = shiftCartPeriod(state.carts.plan, "plan", start);
  if (cart.milk) cart.milk = draft(state.carts.plan.milk!);
  for (const id of ["paneer", "ghee"] as const)
    if (cart[id]) {
      cart[id]!.firstDate = shift(state.carts.plan[id]!.firstDate ?? previous);
      if (state.carts.plan[id]!.dates)
        cart[id]!.dates = [...new Set(state.carts.plan[id]!.dates!.map(shift))];
    }
  return {
    ...state,
    carts: { ...state.carts, plan: cart },
    drafts: {
      ...state.drafts,
      plan: {
        milk: draft(state.drafts.plan.milk),
        paneer: draft(state.drafts.plan.paneer),
        ghee: draft(state.drafts.plan.ghee),
      },
    },
  };
}
