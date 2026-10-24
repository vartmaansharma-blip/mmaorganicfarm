"use client";
import { useEffect } from "react";
import { cartMatchesOrder, emptyShopCart } from "@/lib/shop-cart";
import { type ShopMode } from "@/lib/shop-draft";
import { useShop } from "./shop-state";
const key = "mma-cart-checkout-v1";
export function CartCheckoutSync({
  orderId,
  mode,
  paid = false,
  start,
  items,
}: {
  orderId: string;
  mode: string;
  paid?: boolean;
  start?: string;
  items?: Array<{
    product_key: string;
    quantity: number;
    frequency: string;
    scheduled_days: number[];
  }>;
}) {
  const { state, update, hydrated } = useShop();
  useEffect(() => {
    if (!hydrated) return;
    if (mode !== "once" && mode !== "plan") return;
    const cart = state.carts[mode as ShopMode],
      snapshot = JSON.stringify(cart);
    try {
      if (paid) {
        const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
        if (saved?.orderId === orderId && saved?.mode === mode) {
          sessionStorage.removeItem(key);
          if (saved.snapshot === snapshot)
            update({
              ...state,
              carts: { ...state.carts, [mode]: emptyShopCart(cart.start) },
            });
        }
        return;
      }
      if (start && items && cartMatchesOrder(cart, mode, start, items))
        sessionStorage.setItem(
          key,
          JSON.stringify({ orderId, mode, snapshot }),
        );
    } catch {
      /* Storage is optional. A failed or unconfirmed payment never clears a basket. */
    }
  }, [orderId, mode, paid, start, items, state, update, hydrated]);
  return null;
}
