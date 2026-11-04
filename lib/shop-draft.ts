import type { RepeatPattern } from "./monthly-schedule";
import type { ShopCart } from "./shop-cart";
export type ShopMode = "once" | "plan";
export type ShopProductId = "milk" | "paneer" | "ghee";
export type ShopExtra = {
  repeat?: RepeatPattern;
  dates?: string[];
  firstDate?: string;
  week?: number[];
  enabled: boolean;
  quantity: number;
  frequency: "once" | "weekly";
  days: number[];
};
export type ShopDraft = {
  repeat?: RepeatPattern;
  dates?: string[];
  quantity: number;
  start: string;
  schedule: [number, number, number, number, number, number, number];
  extras: Record<"paneer" | "ghee", ShopExtra>;
};
export type ShopState = {
  mode: ShopMode;
  carts: Record<ShopMode, ShopCart>;
  drafts: Record<ShopMode, Record<ShopProductId, ShopDraft>>;
};
export const SHOP_STORAGE_KEY = "mma-shop-draft-v1";
export function isShopProduct(value: string): value is ShopProductId {
  return ["milk", "paneer", "ghee"].includes(value);
}
export function validShopDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function createShopDraft(start: string): ShopDraft {
  return {
    quantity: 1,
    repeat: "custom",
    start,
    schedule: [1, 1, 1, 1, 1, 1, 1],
    extras: {
      paneer: { enabled: false, quantity: 1, frequency: "once", days: [] },
      ghee: { enabled: false, quantity: 1, frequency: "once", days: [] },
    },
  };
}
export function createShopState(start: string): ShopState {
  return {
    mode: "plan",
    carts: {
      once: { start, milk: null, paneer: null, ghee: null, selected: { milk: false, paneer: false, ghee: false } },
      plan: { start, milk: null, paneer: null, ghee: null, selected: { milk: false, paneer: false, ghee: false } },
    },
    drafts: {
      once: {
        milk: createShopDraft(start),
        paneer: createShopDraft(start),
        ghee: createShopDraft(start),
      },
      plan: {
        milk: createShopDraft(start),
        paneer: createShopDraft(start),
        ghee: createShopDraft(start),
      },
    },
  };
}
export function restoreShopState(
  value: unknown,
  minimumDate: string,
): ShopState {
  const result = createShopState(minimumDate);
  if (!value || typeof value !== "object") return result;
  const input = value as Partial<ShopState>;
  result.mode = input.mode === "once" ? "once" : "plan";
  for (const mode of ["once", "plan"] as const)
    for (const id of ["milk", "paneer", "ghee"] as const) {
      const raw = input.drafts?.[mode]?.[id];
      if (!raw) continue;
      const d = result.drafts[mode][id];
      if (
        [
          "daily",
          "weekly",
          "fortnightly",
          "monthly",
          "days",
          "once",
          "custom",
        ].includes(raw.repeat ?? "")
      )
        d.repeat = raw.repeat;
      if (!raw.repeat && Array.isArray(raw.schedule))
        d.repeat = id === "milk" ? "days" : "once";
      if (Array.isArray(raw.dates))
        d.dates = [
          ...new Set(
            raw.dates.filter(
              (date) => validShopDate(date) && date >= minimumDate,
            ),
          ),
        ].slice(0, 31);
      if (
        Number.isInteger(raw.quantity) &&
        raw.quantity >= 1 &&
        raw.quantity <= 5
      )
        d.quantity = raw.quantity;
      if (validShopDate(raw.start) && raw.start >= minimumDate)
        d.start = raw.start;
      if (
        Array.isArray(raw.schedule) &&
        raw.schedule.length === 7 &&
        raw.schedule.every((q) => Number.isInteger(q) && q >= 0 && q <= 5)
      )
        d.schedule = [...raw.schedule];
      for (const extra of ["paneer", "ghee"] as const) {
        const x = raw.extras?.[extra];
        if (!x) continue;
        d.extras[extra] = {
          enabled: x.enabled === true,
          dates: Array.isArray(x.dates)
            ? [
                ...new Set(
                  x.dates.filter(
                    (date) => validShopDate(date) && date >= minimumDate,
                  ),
                ),
              ].slice(0, 31)
            : undefined,
          repeat: [
            "daily",
            "weekly",
            "fortnightly",
            "monthly",
            "days",
            "once",
            "custom",
          ].includes(x.repeat ?? "")
            ? x.repeat
            : undefined,
          firstDate:
            validShopDate(x.firstDate) && x.firstDate >= minimumDate
              ? x.firstDate
              : minimumDate,
          week:
            Array.isArray(x.week) &&
            x.week.length === 7 &&
            x.week.every((q) => Number.isInteger(q) && q >= 0 && q <= 5)
              ? [...x.week]
              : undefined,
          quantity:
            Number.isInteger(x.quantity) && x.quantity >= 1 && x.quantity <= 5
              ? x.quantity
              : 1,
          frequency: x.frequency === "weekly" ? "weekly" : "once",
          days: Array.isArray(x.days)
            ? [
                ...new Set(
                  x.days.filter(
                    (day) => Number.isInteger(day) && day >= 1 && day <= 7,
                  ),
                ),
              ]
            : [],
        };
      }
    }
  for (const mode of ["once", "plan"] as const) {
    const raw = input.carts?.[mode];
    if (!raw || typeof raw !== "object") continue;
    const cart = result.carts[mode];
    if (validShopDate(raw.start) && raw.start >= minimumDate)
      cart.start = raw.start;
    if (raw.milk) {
      const validated = restoreShopState(
        { drafts: { [mode]: { milk: raw.milk } } },
        minimumDate,
      ).drafts[mode].milk;
      cart.milk = validated;
    }
    for (const id of ["paneer", "ghee"] as const) {
      const x = raw[id];
      if (
        x &&
        Number.isInteger(x.quantity) &&
        x.quantity >= 1 &&
        x.quantity <= 5
      )
        cart[id] = {
          enabled: true,
          dates: Array.isArray(x.dates)
            ? [
                ...new Set(
                  x.dates.filter(
                    (date) => validShopDate(date) && date >= cart.start,
                  ),
                ),
              ].slice(0, 31)
            : undefined,
          repeat: [
            "daily",
            "weekly",
            "fortnightly",
            "monthly",
            "days",
            "once",
            "custom",
          ].includes(x.repeat ?? "")
            ? x.repeat
            : undefined,
          firstDate:
            validShopDate(x.firstDate) && x.firstDate >= cart.start
              ? x.firstDate
              : cart.start,
          week:
            Array.isArray(x.week) &&
            x.week.length === 7 &&
            x.week.every((q) => Number.isInteger(q) && q >= 0 && q <= 5)
              ? [...x.week]
              : undefined,
          quantity: x.quantity,
          frequency:
            mode === "plan" && x.frequency === "weekly" ? "weekly" : "once",
          days:
            mode === "plan" && Array.isArray(x.days)
              ? [
                  ...new Set(
                    x.days.filter(
                      (day) => Number.isInteger(day) && day >= 1 && day <= 7,
                    ),
                  ),
                ]
              : [],
        };
    }
    for (const id of ["milk", "paneer", "ghee"] as const)
      cart.selected[id] = Boolean(cart[id]) && raw.selected?.[id] !== false;
  }
  return result;
}
export function milkDeliveryDates(
  schedule: number[],
  start: string,
  count = 30,
) {
  if (!validShopDate(start) || !schedule.some((q) => q > 0)) return [];
  const result: Array<{
      date: string;
      quantity: number;
    }> = [],
    cursor = new Date(`${start}T12:00:00Z`);
  for (let i = 0; i < 400 && result.length < count; i++) {
    const quantity = schedule[(cursor.getUTCDay() + 6) % 7] ?? 0;
    if (quantity > 0)
      result.push({ date: cursor.toISOString().slice(0, 10), quantity });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
// Only recognised public product choices enter an authentication return URL. No contact data is carried here.
export function orderReturnPath(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const key of [
    "purchase",
    "bottle",
    "milk",
    "extras",
    "schedule",
    "start",
    "routine",
    "nextPlan",
    "combineWith",
  ] as const) {
    const value = params[key];
    if (typeof value === "string" && value.length <= (key === "nextPlan" ? 1200 : 400)) query.set(key, value);
  }
  return `/order${query.size ? `?${query}` : ""}`;
}
