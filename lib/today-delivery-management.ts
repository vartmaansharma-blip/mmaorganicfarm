export const changeProducts = ["milk", "paneer", "ghee"] as const;
export type ChangeProduct = (typeof changeProducts)[number];
export type TodayRequest = {
  id: string;
  delivery_id: string;
  delivery_date: string;
  kind: "quantity" | "issue";
  product_key: ChangeProduct | null;
  previous_quantity: number | null;
  requested_quantity: number | null;
  note: string;
  status: "requested" | "applied" | "declined" | "follow_up" | "resolved";
  decision_note: string | null;
  moved_to: string | null;
};
export type DriverTodayChange = Pick<TodayRequest, "id" | "delivery_id" | "product_key" | "previous_quantity" | "requested_quantity">;
export type TodayManagement = {
  deliveries: {
    id: string;
    type: "Scheduled" | "One-time";
    editable: boolean;
    items: { product_key: string; quantity: number; unit: string }[];
  }[];
  requests: TodayRequest[];
};

export const todayRequestFields = "id,delivery_id,delivery_date,kind,product_key,previous_quantity,requested_quantity,note,status,decision_note,moved_to";
export const requestStatus: Record<TodayRequest["status"], string> = {
  requested: "Awaiting farm review",
  applied: "Change confirmed",
  declined: "Declined",
  follow_up: "Farm follow-up",
  resolved: "Follow-up closed",
};
export function todayRequestsUnavailable(error: { code?: string; message?: string }) {
  return ["PGRST205", "42P01"].includes(error.code ?? "") && /today_delivery_requests/.test(error.message ?? "");
}
