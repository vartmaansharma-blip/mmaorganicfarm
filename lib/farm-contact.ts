export const FARM_PHONE = "+917546998822";
export const FARM_PHONE_DISPLAY = "+91 75469 98822";
export const FARM_PHONE_LINK = `tel:${FARM_PHONE}`;

export function farmWhatsApp(message?: string) {
  return `https://wa.me/${FARM_PHONE.slice(1)}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export function customerDeliveryWhatsApp(phone: string | null, message: string) {
  const digits = phone?.replace(/[\s()+-]/g, "") ?? "";
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local) || `+91${local}` === FARM_PHONE) return null;
  return `https://wa.me/91${local}?text=${encodeURIComponent(message)}`;
}
