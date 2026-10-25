import { addCalendarDays } from "./delivery-calendar";
import { firstMonthEnds, deliveryChargeForSubtotal } from "./delivery-pricing";
import {
  MILK_PRICE_PER_LITRE,
  NEW_BOTTLE_CHARGE,
  type BottleChoice,
} from "./order-pricing";
import { FARM_PRODUCTS } from "./farm-products";
import { validShopDate, type ShopProductId } from "./shop-draft";
export type RepeatPattern =
  | "daily"
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "days"
  | "once"
  | "custom";
export type ProductRoutine = {
  id: ShopProductId;
  quantity: number;
  repeat: RepeatPattern;
  firstDate: string;
  week?: number[];
  dates?: string[];
};
export type PlannedDay = {
  date: string;
  items: Array<{ id: ShopProductId; quantity: number }>;
};
const ids = ["milk", "paneer", "ghee"] as const;
export function routinePrice(id: ShopProductId) {
  return id === "milk"
    ? MILK_PRICE_PER_LITRE
    : FARM_PRODUCTS.find((p) => p.id === id)!.price;
}
export function defaultRepeat(id: ShopProductId): RepeatPattern {
  return id === "milk" ? "daily" : id === "paneer" ? "weekly" : "monthly";
}
export function monthSchedule(
  start: string,
  rules: ProductRoutine[],
): PlannedDay[] {
  const end = firstMonthEnds(start);
  if (!end) return [];
  const result: PlannedDay[] = [];
  for (
    let date = new Date(`${start}T12:00:00Z`);
    date.toISOString().slice(0, 10) < end;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const ymd = date.toISOString().slice(0, 10),
      items: PlannedDay["items"] = [];
    for (const rule of rules) {
      if (!validShopDate(rule.firstDate) || ymd < rule.firstDate) continue;
      const anchor = new Date(`${rule.firstDate}T12:00:00Z`),
        diff = Math.round((date.valueOf() - anchor.valueOf()) / 86400000),
        weekday = (date.getUTCDay() + 6) % 7;
      let quantity = rule.quantity;
      const monthLast = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate();
      const matches =
        (rule.repeat === "custom" && Boolean(rule.dates?.includes(ymd))) ||
        rule.repeat === "daily" ||
        (rule.repeat === "once" && diff === 0) ||
        (rule.repeat === "weekly" && diff % 7 === 0) ||
        (rule.repeat === "fortnightly" && diff % 14 === 0) ||
        (rule.repeat === "monthly" &&
          date.getUTCDate() === Math.min(anchor.getUTCDate(), monthLast)) ||
        (rule.repeat === "days" && (rule.week?.[weekday] ?? 0) > 0);
      if (rule.repeat === "days") quantity = rule.week?.[weekday] ?? 0;
      if (matches && quantity > 0) items.push({ id: rule.id, quantity });
    }
    if (items.length) result.push({ date: ymd, items });
  }
  return result;
}
export function validateRoutines(
  start: string,
  value: unknown,
): ProductRoutine[] | null {
  const end = firstMonthEnds(start);
  if (!end || !Array.isArray(value) || value.length < 1 || value.length > 3)
    return null;
  const rules: ProductRoutine[] = [];
  for (const x of value) {
    if (
      !x ||
      typeof x !== "object" ||
      !ids.includes(x.id) ||
      rules.some((r) => r.id === x.id) ||
      !Number.isInteger(x.quantity) ||
      x.quantity < 1 ||
      x.quantity > 5 ||
      ![
        "daily",
        "weekly",
        "fortnightly",
        "monthly",
        "days",
        "once",
        "custom",
      ].includes(x.repeat) ||
      !validShopDate(x.firstDate) ||
      x.firstDate < start ||
      x.firstDate >= end
    )
      return null;
    if (
      x.repeat === "days" &&
      (!Array.isArray(x.week) ||
        x.week.length !== 7 ||
        !x.week.every(
          (q: unknown) =>
            Number.isInteger(q) && Number(q) >= 0 && Number(q) <= 5,
        ) ||
        !x.week.some((q: number) => q > 0))
    )
      return null;
    if (
      x.repeat === "custom" &&
      (!Array.isArray(x.dates) ||
        x.dates.length < 1 ||
        x.dates.length > 31 ||
        new Set(x.dates).size !== x.dates.length ||
        !x.dates.every(
          (date: unknown) => validShopDate(date) && date >= start && date < end,
        ) ||
        [...x.dates].sort()[0] !== x.firstDate)
    )
      return null;
    rules.push({
      id: x.id,
      quantity: x.quantity,
      repeat: x.repeat,
      firstDate: x.firstDate,
      ...(x.repeat === "days" ? { week: [...x.week] } : {}),
      ...(x.repeat === "custom" ? { dates: [...x.dates].sort() } : {}),
    });
  }
  if (rules.some((rule) => !monthSchedule(start, [rule]).length)) return null;
  return ids.flatMap((id) => rules.filter((r) => r.id === id));
}
export function recommendedDates(id: ShopProductId, start: string) {
  const end = firstMonthEnds(start);
  if (!end) return [];
  const dates: string[] = [];
  for (let date = start; date < end; date = addCalendarDays(date, 1)) {
    if (
      id === "milk" ||
      (id === "ghee" && date === start) ||
      (id === "paneer" && new Date(`${date}T12:00:00Z`).getUTCDay() === 6)
    )
      dates.push(date);
  }
  return dates;
}
export function serializeRoutines(rules: ProductRoutine[], start?: string) {
  const base = start ?? rules.map((r) => r.firstDate).sort()[0];
  return ids
    .flatMap((id) => rules.filter((r) => r.id === id))
    .map((r) =>
      [
        r.id,
        r.quantity,
        r.repeat,
        r.firstDate,
        ...(r.repeat === "days"
          ? [r.week?.join(".")]
          : r.repeat === "custom"
            ? [
                r.dates
                  ?.map(
                    (date) =>
                      Math.round(
                        (new Date(`${date}T12:00:00Z`).valueOf() -
                          new Date(`${base}T12:00:00Z`).valueOf()) /
                          86400000,
                      ) + 1,
                  )
                  .join("."),
              ]
            : []),
      ].join(":"),
    )
    .join(";");
}
export function parseRoutines(start: string, serialized: string) {
  if (
    typeof serialized !== "string" ||
    serialized.length > 400 ||
    !validShopDate(start)
  )
    return null;
  const rules = [];
  for (const encoded of serialized.split(";")) {
    const parts = encoded.split(":"),
      [id, q, repeat, firstDate, extra] = parts;
    if (
      parts.length !== (repeat === "days" || repeat === "custom" ? 5 : 4) ||
      !/^\d+$/.test(q)
    )
      return null;
    if (
      repeat === "custom" &&
      (!extra ||
        !extra.split(".").every((x) => /^(?:[1-9]|[12][0-9]|3[01])$/.test(x)))
    )
      return null;
    rules.push({
      id,
      quantity: Number(q),
      repeat,
      firstDate,
      ...(repeat === "days"
        ? { week: extra?.split(".").map(Number) }
        : repeat === "custom"
          ? {
              dates: extra
                .split(".")
                .map((n) => addCalendarDays(start, Number(n) - 1)),
            }
          : {}),
    });
  }
  return validateRoutines(start, rules);
}
export function quoteMonthlySchedule({
  start,
  rules,
  bottleChoice = "return",
  firstPlanStart = start,
}: {
  start: string;
  rules: ProductRoutine[];
  bottleChoice?: BottleChoice;
  firstPlanStart?: string;
}) {
  const valid = validateRoutines(start, rules);
  if (!valid) throw new Error("Choose a valid monthly routine.");
  const days = monthSchedule(start, valid);
  const quantities: Record<ShopProductId, number> = {
      milk: 0,
      paneer: 0,
      ghee: 0,
    },
    productTotals: Record<ShopProductId, number> = {
      milk: 0,
      paneer: 0,
      ghee: 0,
    };
  let deliveryCharge = 0;
  for (const day of days) {
    let subtotal = 0;
    for (const item of day.items) {
      quantities[item.id] += item.quantity;
      productTotals[item.id] += item.quantity * routinePrice(item.id);
      subtotal += item.quantity * routinePrice(item.id);
    }
    deliveryCharge += deliveryChargeForSubtotal(
      subtotal,
      "plan",
      day.date,
      firstPlanStart,
    );
  }
  const milkLitres = quantities.milk,
    bottleCharge = bottleChoice === "new" ? milkLitres * NEW_BOTTLE_CHARGE : 0,
    productsSubtotal = Object.values(productTotals).reduce((a, b) => a + b, 0);
  return {
    days,
    quantities,
    productTotals,
    milkLitres,
    milkTotal: productTotals.milk,
    oneTimeAddOnsTotal: 0,
    recurringAddOnsTotal: productTotals.paneer + productTotals.ghee,
    bottleCharge,
    deliveryCharge,
    productsSubtotal,
    total: productsSubtotal + bottleCharge + deliveryCharge,
    endExclusive: firstMonthEnds(start),
  };
}
