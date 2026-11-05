export const PRODUCT_PRICE_KEYS = ["milk", "paneer", "ghee", "bottle"] as const;
export type ProductPriceKey = (typeof PRODUCT_PRICE_KEYS)[number];
export const ORDER_FEE_LABELS = {
  delivery_once: "One-time delivery fee",
  delivery_scheduled: "Scheduled delivery fee per visit",
  delivery_free_at: "Free delivery from",
  handling: "Handling per order",
  platform: "Platform per order",
} as const;
export type OrderFeeKey = keyof typeof ORDER_FEE_LABELS;
export const ORDER_FEE_KEYS = Object.keys(ORDER_FEE_LABELS) as OrderFeeKey[];
export type ProductPrices = Record<ProductPriceKey, number> & Partial<Record<OrderFeeKey, number>>;
export const DEFAULT_ORDER_FEES: Record<OrderFeeKey, number> = {
  delivery_once: 5, delivery_scheduled: 2, delivery_free_at: 199.01, handling: 0, platform: 0,
};
export const DEFAULT_PRODUCT_PRICES: ProductPrices = {
  milk: 62,
  paneer: 200,
  ghee: 375,
  bottle: 10,
};
export type ProductCatalogue = { revision: string; prices: ProductPrices };

export function productPricesFromPaise(value: unknown): ProductPrices {
  if (!value || typeof value !== "object")
    throw Error("Product prices are unavailable.");
  const prices = {} as ProductPrices;
  for (const key of PRODUCT_PRICE_KEYS) {
    const amount = (value as Record<string, unknown>)[key];
    if (
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > 10000000
    )
      throw Error("Product prices are unavailable.");
    prices[key] = amount / 100;
  }
  for (const key of ORDER_FEE_KEYS) {
    const amount = (value as Record<string, unknown>)[key];
    if (amount === undefined) continue;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0 || amount > 10000000)
      throw Error("Order fees are unavailable.");
    prices[key] = amount / 100;
  }
  return prices;
}
export function priceInPaise(value: number) {
  return Math.round(value * 100);
}
export function money(value: number) {
  return Math.round(value * 100) / 100;
}
