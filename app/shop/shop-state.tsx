"use client";
import { useProductPricing } from "../components/product-pricing";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createShopState,
  restoreShopState,
  SHOP_STORAGE_KEY,
  type ShopState,
} from "@/lib/shop-draft";
import styles from "./shop.module.css";
import { nextDeliveryDateInIndia } from "@/lib/delivery-calendar";
function createStore(minimum: string) {
  const server = createShopState(minimum);
  let snapshot = server;
  let restored = false;
  const listeners = new Set<() => void>();
  function update(next: ShopState) {
    snapshot = next;
    try {
      sessionStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    listeners.forEach((fn) => fn());
  }
  return {
    get: () => snapshot,
    isRestored: () => restored,
    server: () => server,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    update,
    restore: () => {
      const todayMinimum = nextDeliveryDateInIndia();
      let next = createShopState(todayMinimum);
      try {
        const saved = sessionStorage.getItem(SHOP_STORAGE_KEY);
        if (saved) next = restoreShopState(JSON.parse(saved), todayMinimum);
      } catch {}
      snapshot = next;
      restored = true;
      listeners.forEach((fn) => fn());
    },
  };
}
const PricingContext = createContext<string | null>(null);
const CartContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);
export function ShopPricingProvider({
  children,
  firstPlanStart,
}: {
  children: ReactNode;
  firstPlanStart: string | null;
}) {
  return (
    <PricingContext.Provider value={firstPlanStart}>
      {children}
    </PricingContext.Provider>
  );
}
const Context = createContext<ReturnType<typeof createStore> | null>(null);
export function ShopProvider({
  children,
  minimumDate,
}: {
  children: ReactNode;
  minimumDate: string;
}) {
  const [store] = useState(() => createStore(minimumDate));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    store.restore();
  }, [store]);
  return (
    <Context.Provider value={store}>
      <CartContext.Provider value={{ open, setOpen }}>
        {children}
      </CartContext.Provider>
    </Context.Provider>
  );
}
export function useShop() {
  const { prices, revision: catalogueRevision } = useProductPricing();
  const store = useContext(Context);
  if (!store) throw Error("Shop provider missing");
  const state = useSyncExternalStore(store.subscribe, store.get, store.server);
  const firstPlanStart = useContext(PricingContext);
  const cart = useContext(CartContext)!;
  return {
    state,
    prices,
    catalogueRevision,
    update: store.update,
    firstPlanStart,
    hydrated: store.isRestored(),
    cartOpen: cart.open,
    setCartOpen: cart.setOpen,
  };
}
export function OrderMode() {
  const { state, update } = useShop();
  return (
    <div className={styles.modeRow}>
      <label className={styles.mode}>
        <span data-active={state.mode === "once"}>One-time</span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Scheduled orders"
          checked={state.mode === "plan"}
          onChange={(e) =>
            update({ ...state, mode: e.target.checked ? "plan" : "once" })
          }
        />
        <span data-active={state.mode === "plan"}>Scheduled</span>
      </label>
      <p>
        {state.mode === "plan"
          ? "Build your delivery routine."
          : "One order. One delivery."}
      </p>
    </div>
  );
}
