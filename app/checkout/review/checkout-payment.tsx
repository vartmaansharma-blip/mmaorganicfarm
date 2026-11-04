"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import { updateBottleMode } from "./actions";
import { RazorpayCheckoutButton } from "./razorpay-checkout-button";
import styles from "./review.module.css";

const bottleModes = [
  { value: "return", label: "Return bottle" },
  { value: "new", label: "Do not return bottle" },
] as const;

export function CheckoutPayment({
  bottleMode,
  bottleLocked,
  children,
  ...payment
}: ComponentProps<typeof RazorpayCheckoutButton> & {
  bottleMode?: "return" | "new";
  bottleLocked: boolean;
  children: ReactNode;
}) {
  const [error, setMode, pending] = useActionState(updateBottleMode, null);
  return (
    <>
      {bottleMode && (
        <form action={setMode} className={styles.bottleMode}>
          <input type="hidden" name="order" value={payment.orderId} />
          <input type="hidden" name="total" value={payment.amountPaise} />
          <fieldset disabled={bottleLocked || pending}>
            <legend>Bottle mode</legend>
            <div>
              {bottleModes.map(({ value, label }) => (
                <button key={value} type="submit" name="mode" value={value} aria-pressed={bottleMode === value}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          {error && <p className={styles.setup} role="alert">{error}</p>}
          {pending && <p className={styles.note} role="status">Updating bill…</p>}
        </form>
      )}
      {children}
      <p className={styles.note}>Razorpay opens after you accept the order terms.</p>
      <RazorpayCheckoutButton key={payment.amountPaise} {...payment} updatingBill={pending} />
    </>
  );
}
