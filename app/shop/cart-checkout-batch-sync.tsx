"use client";
import { useEffect } from "react";
import { cartMatchesOrder, removePurchasedItems, selectedShopCart } from "@/lib/shop-cart";
import type { ShopMode, ShopProductId } from "@/lib/shop-draft";
import { useShop } from "./shop-state";

type CheckoutOrder = {
  id: string;
  mode: ShopMode;
  start?: string;
  routine?: string;
  items?: Array<{
    product_key: string;
    quantity: number;
    frequency: string;
    scheduled_days: number[];
  }>;
};

export function CartCheckoutBatchSync({ batchId, orders, paid = false }: {
  batchId: string;
  orders: [CheckoutOrder, CheckoutOrder];
  paid?: boolean;
}) {
  const { state, update, hydrated } = useShop();
  useEffect(() => {
    if (!hydrated) return;
    const key = `mma-cart-batch-v1:${batchId}`;
    try {
      if (paid) {
        const saved = JSON.parse(localStorage.getItem(key) ?? "null");
        if (saved?.batchId !== batchId ||
          saved?.orderIds?.join(",") !== orders.map((order) => order.id).join(",")) return;
        localStorage.removeItem(key);
        const carts = { ...state.carts };
        let changed = false;
        for (const mode of ["once", "plan"] as const) {
          const result = removePurchasedItems(carts[mode], saved.items?.[mode]);
          carts[mode] = result.cart;
          changed ||= result.changed;
        }
        if (changed) update({ ...state, carts });
        return;
      }
      if (!orders.every((order) => order.start && order.items &&
        cartMatchesOrder(selectedShopCart(state.carts[order.mode]), order.mode,
          order.start, order.items, order.routine))) return;
      const items = Object.fromEntries((["once", "plan"] as const).map((mode) => [
        mode,
        Object.fromEntries((["milk", "paneer", "ghee"] as ShopProductId[])
          .filter((id) => state.carts[mode].selected[id] && state.carts[mode][id])
          .map((id) => [id, JSON.stringify(state.carts[mode][id])])),
      ]));
      localStorage.setItem(key, JSON.stringify({
        batchId, orderIds: orders.map((order) => order.id), items,
      }));
    } catch {
      /* Storage is optional. Unconfirmed payments never clear a basket. */
    }
  }, [batchId, orders, paid, state, update, hydrated]);
  return null;
}
