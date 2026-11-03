import { validateRoutines, type ProductRoutine } from "./monthly-schedule";

export function manualMonthlyRoutines(
  start: string,
  milkWeek: number[],
  extras: readonly { id: "paneer" | "ghee"; quantity: number; repeat: string; firstDate: string }[],
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
    if (repeat !== "once" && repeat !== "weekly" && repeat !== "fortnightly") return null;
    rules.push({ ...extra, repeat, firstDate: extra.firstDate || start });
  }
  return validateRoutines(start, rules);
}
