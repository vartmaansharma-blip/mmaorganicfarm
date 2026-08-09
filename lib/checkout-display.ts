import { MILK_PLAN_DAYS } from "@/lib/milk-plan";
export function formatCheckoutAmount(paise: number) { return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(paise / 100); }
export function formatOrderItemSchedule(item: { delivery_date: string | null; frequency: string; product_key: string; scheduled_days: number[] }) {
  if (item.frequency !== "weekly") return item.delivery_date ? "With the first delivery" : "One-time delivery";
  const days = item.scheduled_days.map((day) => MILK_PLAN_DAYS[day - 1]?.short).filter(Boolean).join(", ");
  return item.product_key === "milk" ? `Weekly schedule · ${days}` : `Every ${days}`;
}
