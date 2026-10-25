"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./review.module.css";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}
function loadRazorpay() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
export function RazorpayCheckoutButton({ amount, orderId, ready, unavailableReason, isTest = false }: {
  amount: string; orderId: string; ready: boolean; unavailableReason?: string; isTest?: boolean;
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  async function pay() {
    if (!accepted || busy || !ready) return;
    setBusy(true);
    setMessage("");
    try {
      if (!await loadRazorpay()) throw new Error("Secure checkout could not load.");
      const response = await fetch("/api/payments/razorpay/order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, termsAccepted: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Payment could not start.");
      let submitted = false;
      const checkout = new window.Razorpay({
        key: data.keyId, amount: data.amount, currency: "INR", name: "M'ma Organic Farm",
        description: isTest ? "Test farm order" : "Farm order", order_id: data.providerOrderId,
        prefill: data.prefill, theme: { color: "#f4c84a" },
        modal: { ondismiss: () => {
          if (submitted) return;
          setBusy(false);
          setMessage("Payment was not completed. Your order is saved.");
        } },
        handler: async (result: Record<string, string>) => {
          submitted = true;
          setConfirming(true);
          setMessage("Confirming your payment…");
          try {
            const verified = await fetch("/api/payments/razorpay/verify", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId, paymentId: result.razorpay_payment_id,
                providerOrderId: result.razorpay_order_id, signature: result.razorpay_signature }),
            });
            const confirmation = await verified.json();
            if (!verified.ok) throw new Error(confirmation.error);
            router.push(`/checkout/success?order=${orderId}`);
          } catch {
            // The provider may already have charged: keep Pay disabled until status is resolved.
            setMessage("Payment confirmation is pending. Do not pay again. Check your profile or contact the farm.");
          }
        },
      });
      checkout.open();
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Payment could not start.");
    }
  }
  return <div className={styles.checkout}>
    {isTest && <p role="status">Test payment only. No delivery will be activated.</p>}
    <label><input type="checkbox" checked={accepted} disabled={!ready || busy}
      onChange={(event) => setAccepted(event.target.checked)} />
      <span>I agree to the <Link href="/terms">Terms</Link> and <Link href="/cancellation-refunds">cancellation policy</Link>.</span>
    </label>
    <button className={styles.payButton} aria-busy={busy} type="button" disabled={!accepted || busy || !ready} onClick={pay}>
      {confirming ? "Checking payment status…" : busy ? "Opening secure payment…" : isTest ? `Test payment ${amount}` : `Pay ${amount}`}
    </button>
    {!ready && <p className={styles.setup}>{unavailableReason ?? "Online payment is not enabled yet."}</p>}
    {message && <p className={styles.message} role="status">{message} {confirming && <Link href="/account">View profile</Link>}</p>}
  </div>;
}
