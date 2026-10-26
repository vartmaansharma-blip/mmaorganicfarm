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
    <section className={styles.coupon} aria-label="Your welcome-back offer">
      <div className={styles.couponHeading}>
        <span className={styles.offerBadge} aria-hidden="true">
          5%
        </span>
        <div>
          <h3>{code ? "Your 5% is applied" : "A little welcome back"}</h3>
          <p>Just for your first month back.</p>
        </div>
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
            <div className={styles.appliedRow}>
              <p className={styles.appliedCode}>{code}</p>
              <button
                type="submit"
                name="intent"
                value="remove"
                disabled={pending}
              >
                {pending ? "Updating…" : "Remove code"}
              </button>
            </div>
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
              <p className={styles.couponHint}>
                Your personal code takes 5% off products.{" "}
                <Link href="/welcome-back">View my code ↗</Link>
              </p>
            </>
          )}
        </form>
      )}
      {(state.error || state.message) && (
        <p
          role="status"
          aria-live="polite"
          className={state.error ? styles.couponError : styles.couponSuccess}
        >
          {state.error ?? state.message}
        </p>
      )}
    </section>
  );
}
