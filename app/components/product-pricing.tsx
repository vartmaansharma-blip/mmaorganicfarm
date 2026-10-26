"use client";
import { createContext, useContext, type ReactNode } from "react";
import {
  DEFAULT_PRODUCT_PRICES,
  type ProductCatalogue,
} from "@/lib/product-prices";
const Context = createContext<ProductCatalogue>({
  revision: "legacy",
  prices: DEFAULT_PRODUCT_PRICES,
});
export function ProductPricingProvider({
  catalogue,
  children,
}: {
  catalogue: ProductCatalogue;
  children: ReactNode;
}) {
  return <Context.Provider value={catalogue}>{children}</Context.Provider>;
}
export function useProductPricing() {
  return useContext(Context);
}
