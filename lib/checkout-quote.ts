import { DEFAULT_PRODUCT_PRICES, priceInPaise, type ProductPrices } from "./product-prices";
import { FARM_PRODUCTS, type FarmProductSelection } from "./farm-products";
import {
  calculateOrderPricing,
  calculatePlanPricing,
  type BottleChoice,
} from "./order-pricing";
import type { WeeklyMilkSchedule } from "./milk-plan";
export type StoredCheckoutItem = {
  product_key: string;
  quantity: number;
  unit_price_paise: number;
  line_total_paise: number;
  frequency: string;
  scheduled_days: number[];
};
export function quoteStoredCheckout(
  items: StoredCheckoutItem[],
  bottleChoice: BottleChoice,
  mode: string,
  plan?: {
    schedule: WeeklyMilkSchedule;
    startDate: string;
    firstPlanStart: string;
  },
  prices: ProductPrices = DEFAULT_PRODUCT_PRICES,
) {
  if (
    !items.length ||
    new Set(items.map((x) => x.product_key)).size !== items.length
  )
    throw Error("Invalid order items.");
  const products: FarmProductSelection[] = [];
  let milk = 0;
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1)
      throw Error("Invalid product quantity.");
    if (item.product_key === "milk") {
      if (item.unit_price_paise !== priceInPaise(prices.milk))
        throw Error("Invalid milk price.");
      milk = item.quantity;
      continue;
    }
    const p = FARM_PRODUCTS.find((p) => p.id === item.product_key);
    if (
      !p ||
      item.quantity > 5 ||
      item.unit_price_paise !== priceInPaise(prices[p.id]) ||
      !["once", "weekly"].includes(item.frequency)
    )
      throw Error("Invalid farm product.");
    if (
      !Array.isArray(item.scheduled_days) ||
      item.scheduled_days.some((n) => !Number.isInteger(n) || n < 1 || n > 7) ||
      new Set(item.scheduled_days).size !== item.scheduled_days.length
    )
      throw Error("Invalid product days.");
    products.push({
      ...p,
      price: prices[p.id],
      quantity: item.quantity,
      frequency: item.frequency === "weekly" ? "weekly" : "once",
      days: item.scheduled_days,
    });
  }
  if (mode === "plan" && (!plan || !plan.schedule.some((q) => q > 0)))
    throw Error("Plan schedule missing.");
  if (mode !== "plan" && products.some((p) => p.frequency !== "once"))
    throw Error("Unexpected recurring item.");
  const pricing =
    mode === "plan" && plan
      ? calculatePlanPricing({
          bottleChoice,
          prices,
          products,
          schedule: plan.schedule,
          startDate: plan.startDate,
          firstPlanStart: plan.firstPlanStart,
        })
      : calculateOrderPricing({ bottleChoice, prices, products, milkLitres: milk });
  if (mode === "adjustment") {
    pricing.total -= pricing.deliveryCharge;
    pricing.deliveryCharge = 0;
  }
  if (mode === "plan" && pricing.milkLitres !== milk)
    throw Error("Plan milk quantity changed.");
  for (const item of items) {
    const amount =
      item.product_key === "milk"
        ? pricing.milkTotal
        : pricing.productTotals[item.product_key];
    if (item.line_total_paise !== priceInPaise(amount))
      throw Error("Product total changed.");
  }
  return pricing;
}
