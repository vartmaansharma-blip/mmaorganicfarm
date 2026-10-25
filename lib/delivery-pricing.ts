// Prices are rupees. The threshold excludes glass bottles and other non-product charges.
export const FREE_DELIVERY_ABOVE = 199;
export const ONE_TIME_DELIVERY_CHARGE = 5;
export const SCHEDULED_DELIVERY_CHARGE = 2;
export function firstMonthEnds(firstPlanStart: string) {
  const date = new Date(`${firstPlanStart}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(firstPlanStart) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== firstPlanStart
  )
    return "";
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}
export function deliveryChargeForSubtotal(
  subtotal: number,
  mode: "once" | "plan",
  date?: string,
  firstPlanStart?: string,
) {
  if (subtotal <= 0 || subtotal > FREE_DELIVERY_ABOVE) return 0;
  if (mode === "plan" && date && firstPlanStart) {
    const end = firstMonthEnds(firstPlanStart);
    if (end && date >= firstPlanStart && date < end) return 0;
  }
  return mode === "plan" ? SCHEDULED_DELIVERY_CHARGE : ONE_TIME_DELIVERY_CHARGE;
}
