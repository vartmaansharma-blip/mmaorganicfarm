import { MILK_PRICE_PER_LITRE, PLAN_DELIVERY_COUNT } from "./order-pricing";

export const BRAND_NAME = "M'ma Organic Farm";
export const PRIMARY_CTA_LABEL = "Start my milk plan";
export const CONTACT_PHONE = "+919818804419";
export const DISPLAY_PHONE = "+91 98188 04419";
export const MILK_PLAN_EXAMPLE = {
  litresPerDelivery: 1,
  deliveries: PLAN_DELIVERY_COUNT,
  pricePerLitre: MILK_PRICE_PER_LITRE,
  milkTotal: MILK_PRICE_PER_LITRE * PLAN_DELIVERY_COUNT,
};
export const LANDING_COPY = {
  en: { tagline: "Fresh milk, delivered to your Jamshedpur home." },
  hi: { tagline: "जमशेदपुर में, आपके घर तक ताज़ा दूध।" },
} as const;
export function whatsappLink(message: string) {
  return `https://wa.me/${CONTACT_PHONE.replace("+", "")}?text=${encodeURIComponent(message)}`;
}
export const WHATSAPP_LINK = whatsappLink("Hello M'ma Organic Farm, I have a question about the milk plan and delivery in Jamshedpur.");
export const DELIVERY_CHECK_LINK = whatsappLink("Hello M'ma Organic Farm, can you confirm milk delivery availability and the delivery time for my area in Jamshedpur?");
export const TRIAL_ENQUIRY_LINK = whatsappLink("Hello M'ma Organic Farm, is a 3-day milk trial available for my area? Please confirm the price and details.");

export const LANDING_FAQS = [
  { question: "How much is the milk plan?", answer: `Milk is ₹${MILK_PRICE_PER_LITRE} per litre. For example, 1 litre on each of ${PLAN_DELIVERY_COUNT} deliveries is ₹${MILK_PRICE_PER_LITRE * PLAN_DELIVERY_COUNT} for milk. Your final amount depends on the quantities, bottle option and any add-ons selected. Review the total before payment.` },
  { question: "Is it cow or buffalo milk? Is it A2?", answer: "Please ask the farm to confirm the milk source and any A2 information before ordering.", contact: true },
  { question: "Is the milk raw or pasteurized?", answer: "Confirm the current processing and handling information directly with the farm before choosing your milk.", contact: true },
  { question: "Where and when do you deliver?", answer: "Delivery serves eligible homes in Jamshedpur. Ask the farm to confirm your area and delivery time; the available schedule is shown during ordering.", contact: true },
  { question: "How do glass bottle returns and charges work?", answer: "The current online milk price uses the return-bottle option. Confirm the bottle return arrangement and any applicable charge with the farm. The final order total is shown before payment.", contact: true },
  { question: "Can I skip a delivery?", answer: "A paid milk delivery skipped through your calendar moves to the end of your plan. Add-ons follow the schedule shown when selected. Check the delivery calendar and cancellation policy before changing your order.", href: "/cancellation-refunds", label: "Read the cancellation policy" },
  { question: "How do I pay?", answer: "Review your order before continuing to the online payment step. Available payment methods are shown in checkout; this page does not take payment." },
  { question: "Can I cancel or get a refund?", answer: "Cancellation requests depend on the order status and whether preparation or dispatch has begun. Reducing paid milk does not create a cash refund. Read the full policy, including how delivery or product issues are handled.", href: "/cancellation-refunds", label: "Read the cancellation policy" },
] as const;

/** Publish only owner-approved, consented reviews; an empty list renders no section. */
export type FarmReview = { name: string; quote: string; consentToPublish: true };
export const FARM_REVIEWS: FarmReview[] = [];
/** Additional verified farm media can be added here without inventing assets. */
export const FARM_PHOTOS = [
  { src: "/farm/cowshed.webp", width: 1040, height: 780, alt: "Cows resting inside M'ma Organic Farm's cowshed", caption: "At the farm" },
  { src: "/farm/milking-station.webp", width: 1032, height: 774, alt: "Visitors looking into the milking station at M'ma Organic Farm", caption: "The milking station" },
];
export const FARM_VIDEO: { src: string; poster: string; caption: string; captions: string } | null = null;
