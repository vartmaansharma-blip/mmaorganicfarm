import { addCalendarDays, weekdayFromYmd } from "./delivery-calendar";
import type { ShopProductId } from "./shop-draft";

export const scheduleProducts = ["milk", "paneer", "ghee"] as const;
export const scheduleWeekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type WeeklyPattern = Record<ShopProductId, number[]>;
export type PatternVersion = { effective_from: string; quantities: WeeklyPattern };
export type DateException = { delivery_date: string; product_key: ShopProductId; quantity: number };
export type ProductQuantities = Record<ShopProductId, number>;
export type DeliverySnapshot = {
  date: string;
  quantities: ProductQuantities;
  state: "paid" | "preparing" | "out" | "completed" | "resolved" | "covered";
};

export function emptyWeeklyPattern(): WeeklyPattern {
  return { milk: Array<number>(7).fill(0), paneer: Array<number>(7).fill(0), ghee: Array<number>(7).fill(0) };
}

export function activeWeeklyPattern(versions: readonly PatternVersion[], date: string) {
  return versions.reduce<PatternVersion | undefined>((latest, entry) =>
    entry.effective_from <= date && (!latest || entry.effective_from >= latest.effective_from) ? entry : latest,
  undefined)?.quantities ?? emptyWeeklyPattern();
}

export function weeklyQuantityOnDate(week: readonly number[] | undefined, date: string) {
  return week?.[weekdayFromYmd(date) - 1] ?? 0;
}

export function calendarMonthDays(month: string) {
  const first = `${month}-01`;
  const end = addCalendarDays(`${month}-28`, 4).slice(0, 7) + "-01";
  const result: string[] = [];
  for (let date = first; date < end; date = addCalendarDays(date, 1)) result.push(date);
  return result;
}

export function resolveMasterDelivery(
  date: string,
  versions: readonly PatternVersion[],
  exceptions: readonly DateException[],
  snapshot?: DeliverySnapshot,
) {
  const pattern = activeWeeklyPattern(versions, date);
  const quantities = {
    milk: weeklyQuantityOnDate(pattern.milk, date),
    paneer: weeklyQuantityOnDate(pattern.paneer, date),
    ghee: weeklyQuantityOnDate(pattern.ghee, date),
  };
  const overrides: Partial<ProductQuantities> = {};
  for (const exception of exceptions) {
    if (exception.delivery_date !== date) continue;
    overrides[exception.product_key] = exception.quantity;
    quantities[exception.product_key] = exception.quantity;
  }
  return {
    date,
    quantities: snapshot?.quantities ?? quantities,
    state: snapshot?.state ?? ("projected" as const),
    overrides,
  };
}
