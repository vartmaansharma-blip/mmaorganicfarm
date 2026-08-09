import { FARM_PRODUCTS, type FarmProductId } from "@/lib/farm-products";
import { MILK_PRICE_PER_LITRE, NEW_BOTTLE_CHARGE } from "@/lib/order-pricing";

export type CheckoutItem = { frequency: "once" | "weekly"; product_key: "milk" | FarmProductId; quantity: number; scheduled_days: number[]; unit_price_paise: number };
const PRODUCT_PRICE_PAISE = new Map(FARM_PRODUCTS.map((product) => [product.id, product.price * 100]));

export function calculateCheckoutAmount(items: CheckoutItem[], bottleChoice: "new" | "none" | "return") {
  const itemsTotal = items.reduce((total, item) => {
    const expected = item.product_key === "milk" ? MILK_PRICE_PER_LITRE * 100 : PRODUCT_PRICE_PAISE.get(item.product_key);
    if (!expected || item.unit_price_paise !== expected) throw new Error("Invalid product price.");
    const deliveries = item.frequency === "weekly" && item.product_key !== "milk" ? item.scheduled_days.length : 1;
    if (deliveries < 1 || item.quantity <= 0) throw new Error("Invalid quantity or schedule.");
    return total + Math.round(expected * item.quantity * deliveries);
  }, 0);
  const hasMilk = items.some((item) => item.product_key === "milk");
  const bottleCharge = hasMilk && bottleChoice === "new" ? NEW_BOTTLE_CHARGE * 100 : 0;
  return { bottleCharge, itemsTotal, total: itemsTotal + bottleCharge };
}
