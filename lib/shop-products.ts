import { DEFAULT_PRODUCT_PRICES, type ProductPrices } from "./product-prices";
import { FARM_PRODUCTS } from "./farm-products";
import { MILK_PRICE_PER_LITRE } from "./order-pricing";
import type { ShopProductId } from "./shop-draft";
export const SHOP_PRODUCTS = [
  {
    id: "milk",
    name: "Farm milk",
    price: MILK_PRICE_PER_LITRE,
    unit: "litre",
    image: "/shop/milk.webp",
    description: "Farm milk, with a delivery routine that fits your home.",
    alt: "M’ma milk in a glass bottle on a warm stone counter",
  },
  ...FARM_PRODUCTS.map((p) => ({
    ...p,
    image: p.id === "ghee" ? "/shop/ghee-500g.webp" : "/shop/paneer.webp",
    description:
      p.id === "ghee"
        ? "Farm ghee in a 500 g jar. A golden finishing touch to your table."
        : "Fresh paneer in a 500 g pack. For the meals you make with love.",
    alt:
      p.id === "ghee"
        ? "M’ma ghee jar labelled 500 g on a warm stone counter"
        : "Fresh paneer on a steel plate on a warm stone counter",
  })),
] satisfies Array<{
  id: ShopProductId;
  name: string;
  price: number;
  unit: string;
  image: string;
  description: string;
  alt: string;
}>;
export function shopProduct(id: ShopProductId, prices: ProductPrices = DEFAULT_PRODUCT_PRICES) {
  return { ...SHOP_PRODUCTS.find((p) => p.id === id)!, price: prices[id] };
}
