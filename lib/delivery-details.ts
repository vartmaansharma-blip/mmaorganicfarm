import { waiveSharedDelivery } from "./delivery-pricing";
import { parseFarmProductSelections } from "./farm-products";
import { parseRoutines, quoteMonthlySchedule, type ProductRoutine } from "./monthly-schedule";
import { calculateOrderPricing, type BottleChoice } from "./order-pricing";
import { priceInPaise, type ProductPrices } from "./product-prices";
import { validShopDate, type ShopProductId } from "./shop-draft";
import { shopProduct } from "./shop-products";

export const CHECKOUT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Choices = { bottle?: string; purchase?: string; start?: string; milk?: string; extras?: string; routine?: string; schedule?: string };
export type OrderPricing = ReturnType<typeof calculateOrderPricing>;
export type BottleMode = Exclude<BottleChoice, "none">;

export function bottleMode(value: unknown): BottleMode {
  return value === "new" ? "new" : "return";
}

export function withBottleChoice<T extends OrderPricing>(pricing: T, mode: BottleMode, unitPricePaise: number): T {
  const bottleChargePaise = mode === "new" ? Math.round(pricing.milkLitres * unitPricePaise) : 0;
  return {
    ...pricing,
    bottleCharge: bottleChargePaise / 100,
    total: (priceInPaise(pricing.total) - priceInPaise(pricing.bottleCharge) + bottleChargePaise) / 100,
  };
}

type OrderLine = {
  product_key: ShopProductId;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price_paise: number;
  line_total_paise: number;
  frequency: "once";
  scheduled_days: number[];
  delivery_date: string;
};
export type DeliverySelection = {
  start: string;
  bottle: BottleChoice;
  pricing: OrderPricing;
  lines: OrderLine[];
};
export type ScheduledDeliverySelection = DeliverySelection & {
  pricing: ReturnType<typeof quoteMonthlySchedule>;
  rules: ProductRoutine[];
  days: ReturnType<typeof quoteMonthlySchedule>["days"];
};

function line(id: ShopProductId, quantity: number, total: number, start: string, prices: ProductPrices): OrderLine {
  const product = shopProduct(id);
  return {
    product_key: id, product_name: product.name, unit: product.unit, quantity,
    unit_price_paise: priceInPaise(prices[id]), line_total_paise: priceInPaise(total),
    frequency: "once", scheduled_days: [], delivery_date: start,
  };
}

export function oneTimeSelection(choices: Choices, prices: ProductPrices, minimum: string): DeliverySelection | null {
  const start = choices.start ?? "";
  const milk = choices.milk ?? "0";
  const extras = choices.extras ?? "";
  if (choices.purchase !== "once" || !validShopDate(start) || start < minimum || !/^[0-5]$/.test(milk)
    || choices.routine || choices.schedule) return null;
  const entries = extras ? extras.split(/[;,]/) : [];
  if (entries.some((entry) => !/^(paneer|ghee):once:[1-5]$/.test(entry))
    || new Set(entries.map((entry) => entry.split(":")[0])).size !== entries.length) return null;
  const products = parseFarmProductSelections(extras, prices);
  const milkLitres = Number(milk);
  if (!milkLitres && !products.length) return null;
  const bottle = milkLitres ? bottleMode(choices.bottle) : "none";
  const pricing = calculateOrderPricing({ bottleChoice: bottle, milkLitres, products, prices });
  const lines = [
    ...(milkLitres ? [line("milk", milkLitres, pricing.milkTotal, start, prices)] : []),
    ...products.map((product) => line(product.id, product.quantity, pricing.productTotals[product.id], start, prices)),
  ];
  return { start: start, bottle, pricing, lines };
}

export function scheduledSelection(choices: Choices, prices: ProductPrices, minimum: string, firstPlanStart: string | null): ScheduledDeliverySelection | null {
  const start = choices.start ?? "";
  if (choices.purchase !== "plan" || !validShopDate(start) || start < minimum || choices.extras || choices.schedule) return null;
  const rules = parseRoutines(start, choices.routine ?? "");
  if (!rules) return null;
  const bottle = rules.some((rule) => rule.id === "milk") ? bottleMode(choices.bottle) : "none";
  const pricing = quoteMonthlySchedule({ start: start, rules, bottleChoice: bottle, firstPlanStart: firstPlanStart ?? start, prices });
  const lines = rules.map(({ id }) => line(id, pricing.quantities[id], pricing.productTotals[id],
    pricing.days.find((day) => day.items.some((item) => item.id === id))!.date, prices));
  return { start: start, bottle, pricing, lines, rules, days: pricing.days };
}

export function combinedSelection(choices: Choices, nextPlan: string, prices: ProductPrices, minimum: string, firstPlanStart: string | null) {
  if (!nextPlan || nextPlan.length > 1200) return null;
  const params = new URLSearchParams(nextPlan);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length || keys.some((key) => !["purchase", "start", "routine", "milk"].includes(key))) return null;
  const once = oneTimeSelection(choices, prices, minimum);
  const scheduled = scheduledSelection({ ...Object.fromEntries(params), bottle: choices.bottle }, prices, minimum, firstPlanStart);
  if (!once || !scheduled) return null;
  const quote = waiveSharedDelivery(once.pricing, scheduled.pricing, once.start);
  return {
    once: { ...once, pricing: quote.once },
    scheduled: { ...scheduled, pricing: quote.scheduled },
    sharedDate: quote.sharedDate,
    totalPaise: priceInPaise(quote.once.total) + priceInPaise(quote.scheduled.total),
  };
}

export function deliveryOrderValues(pricing: OrderPricing, bottle: BottleChoice, start: string, address: string, phone: string) {
  return {
    address_snapshot: address, phone_snapshot: phone, start_date: start,
    bottle_choice: bottle, milk_litres: pricing.milkLitres,
    subtotal_paise: priceInPaise(pricing.total - pricing.bottleCharge - pricing.deliveryCharge - pricing.handlingCharge - pricing.platformCharge),
    bottle_charge_paise: priceInPaise(pricing.bottleCharge),
    handling_fee_paise: priceInPaise(pricing.handlingCharge),
    platform_fee_paise: priceInPaise(pricing.platformCharge),
    total_paise: priceInPaise(pricing.total),
  };
}
