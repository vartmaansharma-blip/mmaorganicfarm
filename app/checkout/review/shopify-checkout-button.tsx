"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./review.module.css";

export function ShopifyCheckoutButton({
  amount,
  orderId,
  ready,
}: {
  amount: string;
  orderId: string;
  ready: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function continueToShopify() {
    if (!accepted || busy || !ready) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/commerce/shopify/checkout", {
        body: JSON.stringify({ orderId, termsAccepted: true }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
      };
      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || "Shopify checkout could not start.");
      }
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      setBusy(false);
      setMessage(
        error instanceof Error ? error.message : "Checkout could not start.",
      );
    }
  }

  return (
    <div className={styles.checkout}>
      <label>
        <input
          type="checkbox"
          checked={accepted}
          disabled={!ready || busy}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        <span>
          I agree to the <Link href="/terms">Terms</Link> and{" "}
          <Link href="/cancellation-refunds">cancellation policy</Link>.
        </span>
      </label>
      <button
        type="button"
        disabled={!accepted || busy || !ready}
        onClick={continueToShopify}
      >
        {busy ? "Opening Shopify checkout…" : `Continue to pay ${amount}`}
      </button>
      {!ready ? (
        <p className={styles.setup}>
          The Shopify store connection is prepared but not configured in this
          preview.
        </p>
      ) : null}
      {message ? <p className={styles.message}>{message}</p> : null}
    </div>
  );
}
