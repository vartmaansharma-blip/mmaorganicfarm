type DiscountFields = { discount_code?: string | null; discount_paise?: number | null };

export function storedReferralDiscount(order: DiscountFields, monthly: boolean) {
  const amount = order.discount_paise ?? 0;
  if (!order.discount_code && amount === 0) return 0;
  if (monthly && order.discount_code === "REFERRAL_MONTH" && Number.isSafeInteger(amount) && amount > 0) return amount;
  throw new Error("This discount is unavailable.");
}
