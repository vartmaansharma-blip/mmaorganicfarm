"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import { updateBottleMode } from "./actions";
import { RazorpayCheckoutButton } from "./razorpay-checkout-button";
import styles from "./review.module.css";

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
  const keepBottle = bottleMode === "new";
  return (
    <>
      <div className={styles.paymentHeader}>
        <div className={styles.paymentHeading}>
          <p>Payment</p>
          <h2 id="bill-heading">Bill details</h2>
          <span>See what you’re buying and what each charge covers.</span>
        </div>
        {bottleMode && (
          <form action={setMode} className={styles.bottleMode}>
            <input type="hidden" name="order" value={payment.orderId} />
            {payment.batchId && <input type="hidden" name="batch" value={payment.batchId} />}
            <input type="hidden" name="total" value={payment.amountPaise} />
            <button
              type="submit"
              name="mode"
              value={keepBottle ? "return" : "new"}
              role="switch"
              aria-label="Keep bottle"
              aria-checked={keepBottle}
              disabled={bottleLocked || pending}
            >
              <span data-active={!keepBottle}>Return bottle</span>
              <span className={styles.bottleTrack} aria-hidden="true" />
              <span data-active={keepBottle}>Keep bottle</span>
            </button>
          </form>
        )}
      </div>
      {error && <p className={styles.setup} role="alert">{error}</p>}
      {pending && <p className={styles.note} role="status">Updating bill…</p>}
      {children}
      <p className={styles.note}>Razorpay opens after you accept the order terms.</p>
      <RazorpayCheckoutButton key={payment.amountPaise} {...payment} updatingBill={pending} />
    </>
  );
}
