export type FarmNotification = {
  id: string;
  category: string;
  severity: "info" | "attention";
  title: string;
  message: string;
  href: string;
  created_at: string;
};
export type FarmNotificationWorkspace = {
  items: FarmNotification[];
  total: number;
};
export function notificationHref(value: string) {
  return /^\/farm(?:\/|\?|#|$)/.test(value) && !/[\\\u0000-\u001f]/.test(value)
    ? value
    : "/farm/activity";
}
export function notificationTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
