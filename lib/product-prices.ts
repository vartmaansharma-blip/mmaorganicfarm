export const PRODUCT_PRICE_KEYS = ["milk", "paneer", "ghee", "bottle"] as const;
export type ProductPriceKey = (typeof PRODUCT_PRICE_KEYS)[number];
export type ProductPrices = Record<ProductPriceKey, number>;
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
  return prices;
}
export function priceInPaise(value: number) {
  return Math.round(value * 100);
}
export function money(value: number) {
  return Math.round(value * 100) / 100;
}
