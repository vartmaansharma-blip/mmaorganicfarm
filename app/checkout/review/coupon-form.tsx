"use client";

import Link from "next/link";
import { useActionState } from "react";
import { applyCheckoutCode, type CouponState } from "./coupon-actions";
import styles from "./review.module.css";

export function CouponForm({
  orderId,
  code,
  locked,
}: {
  orderId: string;
  code: string | null;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(
    applyCheckoutCode,
    {} as CouponState,
  );
  return (
    <div className={styles.coupon}>
      <div>
        <h3>Have a welcome-back code?</h3>
        <p>
          5% off your first month&apos;s products. One personal offer per
          returning customer.
        </p>
      </div>
      {locked ? (
        <p>
          {code
            ? `Applied: ${code}. Your payment total is fixed.`
            : "Payment has started. Codes can be applied before starting payment."}
        </p>
      ) : (
        <form action={action}>
          <input type="hidden" name="order_id" value={orderId} />
          {code ? (
            <>
              <p className={styles.appliedCode}>{code}</p>
              <button
                type="submit"
                name="intent"
                value="remove"
                disabled={pending}
              >
                {pending ? "Updating…" : "Remove code"}
              </button>
            </>
          ) : (
            <>
              <label htmlFor="checkout-code">Personal code</label>
              <div className={styles.couponEntry}>
                <input
                  id="checkout-code"
                  name="code"
                  placeholder="MMA-…"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={20}
                  disabled={pending}
                  required
                />
                <button type="submit" disabled={pending}>
                  {pending ? "Applying…" : "Apply code"}
                </button>
              </div>
              <Link href="/welcome-back">Find my personal code</Link>
            </>
          )}
        </form>
      )}
      <p
        role="status"
        aria-live="polite"
        className={state.error ? styles.couponError : styles.couponSuccess}
      >
        {state.error ?? state.message}
      </p>
    </div>
  );
}
