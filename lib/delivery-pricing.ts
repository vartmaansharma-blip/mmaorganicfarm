import { DEFAULT_ORDER_FEES, type ProductPrices } from "./product-prices";

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
  prices?: ProductPrices,
) {
  const currencySubtotal = Math.round(subtotal * 100) / 100;
  if (currencySubtotal <= 0 || currencySubtotal > FREE_DELIVERY_ABOVE) return 0;
  if (mode === "plan" && firstMonthFeesWaived(date, firstPlanStart)) return 0;
  return mode === "plan"
    ? (prices?.delivery_scheduled ?? DEFAULT_ORDER_FEES.delivery_scheduled)
    : (prices?.delivery_once ?? DEFAULT_ORDER_FEES.delivery_once);
}

function firstMonthFeesWaived(date?: string, firstPlanStart?: string) {
  if (!date || !firstPlanStart) return false;
  const end = firstMonthEnds(firstPlanStart);
  return Boolean(end && date >= firstPlanStart && date < end);
}

export function flatOrderFees(
  productSubtotal: number,
  prices: ProductPrices,
  startDate?: string,
  firstPlanStart?: string,
) {
  const waived = productSubtotal <= 0 || firstMonthFeesWaived(startDate, firstPlanStart);
  return {
    handlingCharge: waived ? 0 : prices.handling ?? DEFAULT_ORDER_FEES.handling,
    platformCharge: waived ? 0 : prices.platform ?? DEFAULT_ORDER_FEES.platform,
  };
}
