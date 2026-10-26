import { DEFAULT_PRODUCT_PRICES, priceInPaise, type ProductPrices } from "./product-prices";
import {
  quoteMonthlySchedule,
  routinePrice,
  validateRoutines,
} from "./monthly-schedule";
import type { BottleChoice } from "./order-pricing";
import type { StoredCheckoutItem } from "./checkout-quote";

export type MonthlyStoredPlan = {
  start_date: string;
  period_end_exclusive: string;
  schedule_rules: unknown;
};
export type MonthlyStoredDate = {
  product_key: string;
  delivery_date: string;
  quantity: number;
};

// Never trust a browser invoice or a plan's JSON alone: compare both with its fulfilment rows.
export function quoteStoredMonthlyCheckout(
  items: StoredCheckoutItem[],
  bottleChoice: BottleChoice,
  plan: MonthlyStoredPlan,
  dates: MonthlyStoredDate[],
  firstPlanStart: string,
  prices: ProductPrices = DEFAULT_PRODUCT_PRICES,
) {
  const rules = validateRoutines(plan.start_date, plan.schedule_rules);
  if (!rules) throw Error("Invalid monthly routines.");
  const hasMilk = rules.some((r) => r.id === "milk");
  if (
    hasMilk
      ? !["new", "return"].includes(bottleChoice)
      : bottleChoice !== "none"
  )
    throw Error("Invalid bottle option.");
  const quote = quoteMonthlySchedule({
    prices,
    start: plan.start_date,
    rules,
    bottleChoice,
    firstPlanStart,
  });
  if (plan.period_end_exclusive !== quote.endExclusive)
    throw Error("Monthly period changed.");
  const expected = quote.days.flatMap((day) =>
    day.items.map((item) => ({
      product_key: item.id,
      delivery_date: day.date,
      quantity: item.quantity,
    })),
  );
  const key = (x: MonthlyStoredDate) =>
    `${x.delivery_date}:${x.product_key}:${x.quantity}`;
  if (
    dates.length !== expected.length ||
    [...dates].map(key).sort().join(";") !== expected.map(key).sort().join(";")
  )
    throw Error("Monthly delivery dates changed.");
  if (
    items.length !== rules.length ||
    new Set(items.map((i) => i.product_key)).size !== items.length
  )
    throw Error("Invalid monthly invoice.");
  for (const rule of rules) {
    const item = items.find((i) => i.product_key === rule.id);
    if (
      !item ||
      item.quantity !== quote.quantities[rule.id] ||
      item.unit_price_paise !== priceInPaise(routinePrice(rule.id, prices)) ||
      item.line_total_paise !== priceInPaise(quote.productTotals[rule.id]) ||
      item.frequency !== "once" ||
      item.scheduled_days.length
    )
      throw Error("Monthly invoice changed.");
  }
  return quote;
}
