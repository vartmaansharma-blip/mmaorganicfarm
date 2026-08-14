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
};

export function calculateOrderPricing({
  bottleChoice,
  milkLitres,
  products,
}: OrderPricingInput) {
  const safeMilkLitres = Math.max(0, milkLitres);
  const milkTotal = safeMilkLitres * MILK_PRICE_PER_LITRE;
  const recurringAddOnsTotal = products.reduce(
    (total, product) =>
      total +
      (product.frequency === "weekly"
        ? product.price * product.quantity * product.days.length
        : 0),
    0,
  );
  const oneTimeAddOnsTotal = products.reduce(
    (total, product) =>
      total +
      (product.frequency === "once"
        ? product.price * product.quantity
        : 0),
    0,
  );
  const bottleCharge =
    safeMilkLitres > 0 && bottleChoice === "new"
      ? safeMilkLitres * NEW_BOTTLE_CHARGE
      : 0;

  return {
    bottleCharge,
    milkLitres: safeMilkLitres,
    milkTotal,
    oneTimeAddOnsTotal,
    productTotals: Object.fromEntries(
      products.map((product) => [
        product.id,
        product.price *
          product.quantity *
          (product.frequency === "weekly" ? product.days.length : 1),
      ]),
    ),
    recurringAddOnsTotal,
    total:
      milkTotal +
      recurringAddOnsTotal +
      oneTimeAddOnsTotal +
      bottleCharge,
  };
}

export function calculatePlanPricing({
  bottleChoice,
  products,
  schedule,
  startDate,
}: {
  bottleChoice: BottleChoice;
  products: FarmProductSelection[];
  schedule: WeeklyMilkSchedule;
  startDate: string;
}) {
  const oneTimeTotals = Object.fromEntries(
    products
      .filter((product) => product.frequency === "once")
      .map((product) => [product.id, product.price * product.quantity]),
  );
  const productTotals: Record<string, number> = { ...oneTimeTotals };
  let milkLitres = 0;
  let completedDeliveries = 0;
  let cursor = new Date(`${startDate}T12:00:00+05:30`);

  if (!startDate || schedule.every((quantity) => quantity === 0)) {
    return calculateOrderPricing({
      bottleChoice: "none",
      milkLitres: 0,
      products: products.filter((product) => product.frequency === "once"),
    });
  }

  while (completedDeliveries < PLAN_DELIVERY_COUNT) {
    const dayOfWeek = ((cursor.getDay() + 6) % 7) + 1;
    const dayMilk = schedule[dayOfWeek - 1] ?? 0;

    if (dayMilk > 0) {
      milkLitres += dayMilk;
      completedDeliveries += 1;
    }

    products
      .filter(
        (product) =>
          product.frequency === "weekly" && product.days.includes(dayOfWeek),
      )
      .forEach((product) => {
        productTotals[product.id] =
          (productTotals[product.id] ?? 0) + product.price * product.quantity;
      });

    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  const milkTotal = milkLitres * MILK_PRICE_PER_LITRE;
  const bottleCharge =
    bottleChoice === "new" ? milkLitres * NEW_BOTTLE_CHARGE : 0;
  const oneTimeAddOnsTotal = Object.values(oneTimeTotals).reduce(
    (total, value) => total + value,
    0,
  );
  const recurringAddOnsTotal = Object.entries(productTotals)
    .filter(([id]) => !(id in oneTimeTotals))
    .reduce((total, [, value]) => total + value, 0);

  return {
    bottleCharge,
    milkLitres,
    milkTotal,
    oneTimeAddOnsTotal,
    productTotals,
    recurringAddOnsTotal,
    total:
      milkTotal + bottleCharge + oneTimeAddOnsTotal + recurringAddOnsTotal,
  };
}

export function calculatePaidMilkAdjustment(
  currentLitres: number,
  nextLitres: number,
) {
  const difference = nextLitres - currentLitres;

  return {
    additionalPayment:
      difference > 0 ? difference * MILK_PRICE_PER_LITRE : 0,
    carryForwardLitres: difference < 0 ? Math.abs(difference) : 0,
    refund: 0,
  };
}
