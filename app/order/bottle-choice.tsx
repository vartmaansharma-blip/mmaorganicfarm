"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import { type BottleMode } from "@/lib/delivery-details";
import styles from "./order.module.css";

const BottleContext = createContext<{
  mode: BottleMode;
  setMode: (mode: BottleMode) => void;
  unitPricePaise: number;
} | null>(null);

export function DeliveryBottleProvider({ initialMode, unitPricePaise, children }: {
  initialMode: BottleMode;
  unitPricePaise: number;
  children: ReactNode;
}) {
  const [mode, setMode] = useState(initialMode);
  return <BottleContext.Provider value={{ mode, setMode, unitPricePaise }}>{children}</BottleContext.Provider>;
}

export function useDeliveryBottleChoice() {
  return useContext(BottleContext)!;
}

export function DeliveryBottlePicker() {
  const { mode, setMode, unitPricePaise } = useDeliveryBottleChoice();
  const keep = mode === "new";
  function toggle() {
    const next = keep ? "return" : "new";
    setMode(next);
    const url = new URL(window.location.href);
    url.searchParams.set("bottle", next);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  return <div className={styles.bottlePicker}>
    <button type="button" role="switch" aria-label="Keep bottle" aria-checked={keep}
      onClick={toggle}>
      <span data-active={!keep}>Return bottle</span>
      <span className={styles.bottleTrack} aria-hidden="true" />
      <span data-active={keep}>Keep bottle</span>
    </button>
    <p>Keep the glass bottles for {formatCheckoutAmount(unitPricePaise)} per litre of milk.</p>
  </div>;
}

export function DeliveryBottleFields({ milkLitres, totalPaise }: { milkLitres: number; totalPaise?: number }) {
  const { mode, unitPricePaise } = useDeliveryBottleChoice();
  const added = mode === "new" ? Math.round(unitPricePaise * milkLitres) : 0;
  return <>
    <input name="bottle" type="hidden" value={milkLitres > 0 ? mode : "none"} />
    {totalPaise !== undefined && <input name="quotedTotal" type="hidden" value={totalPaise + added} />}
  </>;
}

export function LegacyBottleTotal({ milkLitres, totalPaise }: { milkLitres: number; totalPaise: number }) {
  const { mode, unitPricePaise } = useDeliveryBottleChoice();
  return <>{formatCheckoutAmount(totalPaise + (mode === "new" ? Math.round(unitPricePaise * milkLitres) : 0))}</>;
}
