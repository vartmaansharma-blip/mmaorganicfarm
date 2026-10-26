export function welcomeBackDiscount(subtotalPaise: number) {
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise < 0)
    throw new Error("Invalid product subtotal.");
  return Math.round((subtotalPaise * 5) / 100);
}

// Canonical product/date pricing is checked first. A code never supplies a price.
export function discountedCheckoutAmount(
  grossPaise: number,
  productSubtotalPaise: number,
  monthly: boolean,
  order: {
    discount_code?: string | null;
    discount_paise?: number;
    subtotal_paise?: number;
  },
) {
  const discount = order.discount_paise ?? 0;
  if (!discount && !order.discount_code) return grossPaise;
  if (
    !monthly ||
    !/^MMA-[A-F0-9]{16}$/.test(order.discount_code ?? "") ||
    order.subtotal_paise !== productSubtotalPaise ||
    discount <= 0 ||
    discount !== welcomeBackDiscount(productSubtotalPaise)
  )
    throw new Error("Invalid welcome-back discount.");
  return grossPaise - discount;
}
