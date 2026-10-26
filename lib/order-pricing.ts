import { DEFAULT_PRODUCT_PRICES, money, type ProductPrices } from "./product-prices";
import { deliveryChargeForSubtotal } from "./delivery-pricing";
import type { FarmProductSelection } from "@/lib/farm-products";
import type { WeeklyMilkSchedule } from "@/lib/milk-plan";

export const MILK_PRICE_PER_LITRE = 62;
export const NEW_BOTTLE_CHARGE = 10;
export const PLAN_DELIVERY_COUNT = 30;

export type BottleChoice = "new" | "none" | "return";

type OrderPricingInput = {
  bottleChoice: BottleChoice;
  milkLitres: number;
  products: FarmProductSelection[];
  prices?: ProductPrices;
};

export function calculateOrderPricing({
  bottleChoice,
  milkLitres,
  products,
  prices = DEFAULT_PRODUCT_PRICES,
}: OrderPricingInput) {
  const safeMilkLitres = Math.max(0, milkLitres);
  const milkTotal = money(safeMilkLitres * prices.milk);
  const recurringAddOnsTotal = products.reduce(
    (total, product) =>
      total +
      (product.frequency === "weekly"
        ? prices[product.id] * product.quantity * product.days.length
        : 0),
    0,
  );
  const oneTimeAddOnsTotal = products.reduce(
    (total, product) =>
      total +
      (product.frequency === "once"
        ? prices[product.id] * product.quantity
        : 0),
    0,
  );
  const bottleCharge =
    safeMilkLitres > 0 && bottleChoice === "new"
      ? money(safeMilkLitres * prices.bottle)
      : 0;

  const productSubtotal=milkTotal+recurringAddOnsTotal+oneTimeAddOnsTotal;
  const deliveryCharge=deliveryChargeForSubtotal(productSubtotal,"once");
  return {
    deliveryCharge: money(deliveryCharge),
    bottleCharge: money(bottleCharge),
    milkLitres: safeMilkLitres,
    milkTotal: money(milkTotal),
    oneTimeAddOnsTotal: money(oneTimeAddOnsTotal),
    productTotals: Object.fromEntries(
      products.map((product) => [
        product.id,
        money(prices[product.id] *
          product.quantity *
          (product.frequency === "weekly" ? product.days.length : 1)),
      ]),
    ),
    recurringAddOnsTotal: money(recurringAddOnsTotal),
    total: money(milkTotal + recurringAddOnsTotal + oneTimeAddOnsTotal + bottleCharge + deliveryCharge),
  };
}

export function calculatePlanPricing({
  bottleChoice,
  products,
  schedule,
  startDate,
  firstPlanStart = startDate,
  prices = DEFAULT_PRODUCT_PRICES,
}: {
  bottleChoice: BottleChoice;
  products: FarmProductSelection[];
  schedule: WeeklyMilkSchedule;
  startDate: string;
  firstPlanStart?: string;
  prices?: ProductPrices;
}) {
  const oneTimeTotals = Object.fromEntries(
    products
      .filter((product) => product.frequency === "once")
      .map((product) => [product.id, prices[product.id] * product.quantity]),
  );
  const productTotals: Record<string, number> = { ...oneTimeTotals };
  let milkLitres = 0;
  let completedDeliveries = 0;
  let cursor = new Date(`${startDate}T12:00:00Z`);
  let deliveryCharge=0;
  let firstProductDelivery=true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(cursor.valueOf()) || cursor.toISOString().slice(0,10)!==startDate || schedule.length!==7 || !schedule.every(q=>Number.isInteger(q)&&q>=0&&q<=5) || schedule.every((quantity) => quantity === 0)) {
    return calculateOrderPricing({
      bottleChoice: "none",
      milkLitres: 0,
      prices,
      products: products.filter((product) => product.frequency === "once"),
    });
  }

  while (completedDeliveries < PLAN_DELIVERY_COUNT) {
    const dayOfWeek = ((cursor.getUTCDay() + 6) % 7) + 1;
    const dayMilk = schedule[dayOfWeek - 1] ?? 0;

    if (dayMilk > 0) {
      milkLitres += dayMilk;
      completedDeliveries += 1;
    }

    let dailySubtotal=money(dayMilk*prices.milk);
    if(firstProductDelivery){dailySubtotal+=Object.values(oneTimeTotals).reduce((sum,value)=>sum+value,0);}
    products
      .filter(
        (product) =>
          product.frequency === "weekly" && product.days.includes(dayOfWeek),
      )
      .forEach((product) => {
        dailySubtotal+=prices[product.id]*product.quantity;
        productTotals[product.id] =
          (productTotals[product.id] ?? 0) + prices[product.id] * product.quantity;
      });

    if(dailySubtotal>0){deliveryCharge+=deliveryChargeForSubtotal(dailySubtotal,"plan",cursor.toISOString().slice(0,10),firstPlanStart);firstProductDelivery=false;}
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  const milkTotal = money(milkLitres * prices.milk);
  const bottleCharge =
    bottleChoice === "new" ? money(milkLitres * prices.bottle) : 0;
  const oneTimeAddOnsTotal = Object.values(oneTimeTotals).reduce(
    (total, value) => total + value,
    0,
  );
  const recurringAddOnsTotal = Object.entries(productTotals)
    .filter(([id]) => !(id in oneTimeTotals))
    .reduce((total, [, value]) => total + value, 0);

  return {
    deliveryCharge: money(deliveryCharge),
    bottleCharge: money(bottleCharge),
    milkLitres,
    milkTotal: money(milkTotal),
    oneTimeAddOnsTotal: money(oneTimeAddOnsTotal),
    productTotals: Object.fromEntries(Object.entries(productTotals).map(([id, value]) => [id, money(value)])),
    recurringAddOnsTotal: money(recurringAddOnsTotal),
    total: money(milkTotal + bottleCharge + oneTimeAddOnsTotal + recurringAddOnsTotal + deliveryCharge),
  };
}

export function calculatePaidMilkAdjustment(
  currentLitres: number,
  nextLitres: number,
  prices: ProductPrices = DEFAULT_PRODUCT_PRICES,
) {
  const difference = nextLitres - currentLitres;

  return {
    additionalPayment:
      difference > 0 ? money(difference * prices.milk) : 0,
    carryForwardLitres: difference < 0 ? Math.abs(difference) : 0,
    refund: 0,
  };
}
