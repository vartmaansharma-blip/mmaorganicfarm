import { validateRoutines, type ProductRoutine } from "./monthly-schedule";

export function manualMonthlyRoutines(
  start: string,
  milkWeek: number[],
  extras: readonly { id: "paneer" | "ghee"; quantity: number; repeat: string; firstDate: string; dates?: string[]; weekdays?: number[] }[],
) {
  if (
    milkWeek.length !== 7 ||
    milkWeek.some((quantity) => !Number.isInteger(quantity) || quantity < 0 || quantity > 5)
  ) return null;

  const rules: ProductRoutine[] = [];
  if (milkWeek.some((quantity) => quantity > 0)) {
    rules.push({ id: "milk", quantity: 1, repeat: "days", firstDate: start, week: milkWeek });
  }
  for (const extra of extras) {
    if (extra.quantity === 0) continue;
    const { repeat } = extra;
    const { id, quantity } = extra;
    const firstDate = extra.firstDate || start;
    if (repeat === "custom") {
      const dates = [...(extra.dates ?? [])].sort();
      if (!dates.length) return null;
      rules.push({ id, quantity, repeat, firstDate: dates[0], dates });
    } else if (repeat === "days") {
      const weekdays = extra.weekdays ?? [];
      if (new Set(weekdays).size !== weekdays.length ||
        weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) return null;
      const week = Array.from({ length: 7 }, (_, index) =>
        weekdays.includes(index + 1) ? quantity : 0,
      );
      rules.push({ id, quantity, repeat, firstDate, week });
    } else {
      if (repeat !== "once" && repeat !== "weekly" && repeat !== "fortnightly") return null;
      rules.push({ id, quantity, repeat, firstDate });
    }
  }
  return validateRoutines(start, rules);
}
