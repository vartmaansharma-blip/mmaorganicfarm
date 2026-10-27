export function razorpayMode(keyId = process.env.RAZORPAY_KEY_ID) {
  if (/^rzp_test_[A-Za-z0-9]+$/.test(keyId ?? "")) return "test";
  if (/^rzp_live_[A-Za-z0-9]+$/.test(keyId ?? "")) return "live";
  return null;
}

export function paymentModeError(isTest: boolean, keyId = process.env.RAZORPAY_KEY_ID,
  environment = process.env.VERCEL_ENV): string | null {
  const mode = razorpayMode(keyId);
  if (!mode) return "Online payment is not configured correctly. Please contact the farm.";
  if (environment === "preview" && mode === "live")
    return "Live payments are disabled in previews. Use test payment credentials.";
  if (isTest !== (mode === "test"))
    return "This order does not match the payment mode. Test payments require an order marked as test by the farm. Please contact the farm before continuing.";
  return null;
}

// Gate NEW live checkouts only. Payment verification and webhooks must remain
// available to settle existing provider orders if the checkout switch is off.
export function liveCheckoutError(
  keyId = process.env.RAZORPAY_KEY_ID,
  enabled = process.env.RAZORPAY_LIVE_CHECKOUT_ENABLED,
): string | null {
  if (razorpayMode(keyId) === "live" && enabled !== "true")
    return "Live checkout is not enabled yet. Please contact the farm.";
  return null;
}
