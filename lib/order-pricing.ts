import type { FarmProductSelection } from "@/lib/farm-products";

export const MILK_PRICE_PER_LITRE = 62;
export const NEW_BOTTLE_CHARGE = 10;

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
    safeMilkLitres > 0 && bottleChoice === "new" ? NEW_BOTTLE_CHARGE : 0;

  return {
    bottleCharge,
    milkTotal,
    oneTimeAddOnsTotal,
    recurringAddOnsTotal,
    total:
      milkTotal +
      recurringAddOnsTotal +
      oneTimeAddOnsTotal +
      bottleCharge,
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
