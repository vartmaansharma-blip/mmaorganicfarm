export const notificationFilters = [
  { key: "all", label: "All" },
  { key: "attention", label: "Action Needed" },
  { key: "deliveries", label: "Deliveries" },
  { key: "payments", label: "Payments" },
] as const;
export type NotificationFilter = typeof notificationFilters[number]["key"];

export const deliveryNoticeKinds = [
  "delivery_ready", "out_for_delivery", "delivery_completed", "delivery_failed", "delivery_cancelled", "cancellation_update",
];
export const paymentNoticeKinds = ["payment_confirmed"];
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CustomerNotification = {
  id: string;
  kind: string;
  title: string;
  message: string;
  order_id: string | null;
  delivery_id: string | null;
  created_at: string;
  read_at: string | null;
};

export function notificationCategory(kind: string) {
  if (paymentNoticeKinds.includes(kind)) return "Payment";
  if (kind === "cancellation_update") return "Plan";
  return deliveryNoticeKinds.includes(kind) ? "Delivery" : "Account";
}

export function customerNotificationDestination(item: CustomerNotification) {
  if (item.kind === "cancellation_update") return { href: "/account?section=plans", label: "View plans" };
  if (paymentNoticeKinds.includes(item.kind) && item.order_id && uuidPattern.test(item.order_id)) {
    return { href: `/account?section=orders&order=${item.order_id}#selected-order`, label: "View order" };
  }
  if (deliveryNoticeKinds.includes(item.kind) && item.delivery_id && uuidPattern.test(item.delivery_id)) {
    return { href: `/account?section=schedule&delivery=${item.delivery_id}#selected-delivery`, label: "View delivery" };
  }
  if (deliveryNoticeKinds.includes(item.kind)) return { href: "/account?section=schedule", label: "View schedule" };
  return null;
}

const indiaTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
});
export function customerNotificationTime(value: string) {
  return indiaTime.format(new Date(value));
}
