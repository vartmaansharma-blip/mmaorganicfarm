"use client";
import { useEffect } from "react";
import { cartMatchesOrder, removePurchasedItems, selectedShopCart } from "@/lib/shop-cart";
import { type ShopMode } from "@/lib/shop-draft";
import { useShop } from "./shop-state";
const key = (orderId: string) => `mma-cart-checkout-v2:${orderId}`;
export function CartCheckoutSync({
  orderId,
  mode,
  paid = false,
  start,
  items,
  routine,
}: {
  orderId: string;
  mode: string;
  paid?: boolean;
  start?: string;
  routine?: string;
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
    const cart = state.carts[mode as ShopMode];
    const selected = selectedShopCart(cart);
    try {
      if (paid) {
        const saved = JSON.parse(localStorage.getItem(key(orderId)) ?? "null");
        if (saved?.orderId === orderId && saved?.mode === mode) {
          localStorage.removeItem(key(orderId));
          const { cart: next, changed } = removePurchasedItems(cart, saved.items);
          if (changed)
            update({
              ...state,
              carts: { ...state.carts, [mode]: next },
            });
        }
        return;
      }
      if (start && items && cartMatchesOrder(selected, mode, start, items, routine))
        localStorage.setItem(
          key(orderId),
          JSON.stringify({
            orderId,
            mode,
            items: Object.fromEntries(
              (["milk", "paneer", "ghee"] as const)
                .filter((id) => selected[id])
                .map((id) => [id, JSON.stringify(selected[id])]),
            ),
          }),
        );
    } catch {
      /* Storage is optional. A failed or unconfirmed payment never clears a basket. */
    }
  }, [orderId, mode, paid, start, items, routine, state, update, hydrated]);
  return null;
}
