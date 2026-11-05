import type { ComponentProps, ReactNode } from "react";
import { RazorpayCheckoutButton } from "./razorpay-checkout-button";
import styles from "./review.module.css";

export function CheckoutPayment({
  bottleMode,
  children,
  ...payment
}: ComponentProps<typeof RazorpayCheckoutButton> & {
  bottleMode?: "return" | "new";
  children: ReactNode;
}) {
  return (
    <>
      <div className={styles.paymentHeader}>
        <div className={styles.paymentHeading}>
          <p>Payment</p>
          <h2 id="bill-heading">Bill details</h2>
          <span>See what you’re buying and what each charge covers.</span>
        </div>
        {bottleMode && <p className={styles.bottleSelection}>{bottleMode === "new" ? "Keep bottles" : "Return bottles"}</p>}
      </div>
      {children}
      <p className={styles.note}>Razorpay opens after you accept the order terms.</p>
      <RazorpayCheckoutButton key={payment.amountPaise} {...payment} />
    </>
  );
}
