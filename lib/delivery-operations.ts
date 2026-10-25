export const DELIVERY_REASONS = [
  ["customer_unavailable", "Customer unavailable"],
  ["gate_locked", "Gate locked"],
  ["customer_requested_skip", "Customer requested skip"],
  ["address_issue", "Address issue"],
  ["customer_refused_delivery", "Customer refused delivery"],
  ["vehicle_issue", "Vehicle issue"],
  ["weather_disruption", "Weather disruption"],
  ["product_shortage", "Product shortage"],
  ["quality_concern", "Quality concern"],
  ["delivery_delay", "Delivery delay"],
  ["other", "Other"],
] as const;
export type DeliveryOutcome =
  | "delivered"
  | "partial"
  | "attempt_failed"
  | "skipped"
  | "reschedule_requested";
export type OperationState = { ok: boolean; message?: string; error?: string };
export type OutcomeItem = {
  delivery_id: string;
  product_key: string;
  quantity: number;
  fulfilled_quantity: number | null;
  unit: string;
};
export type ExceptionRow = {
  delivery_date: string;
  visit_key: string;
  user_id: string;
  customer: string;
  event_id: string | null;
  outcome: DeliveryOutcome | null;
  reason_code: string | null;
  note: string | null;
  resolution: string;
  follow_up_date: string | null;
  route: string | null;
  driver: string | null;
  bottles_due: number;
  items: OutcomeItem[];
};
export type Reconciliation = {
  date: string;
  scheduled_visits: number;
  released_visits: number;
  delivered_visits: number;
  failed_attempts: number;
  partial_visits: number;
  approved_skips: number;
  approved_reschedules: number;
  cancelled_visits: number;
  open_exceptions: number;
  follow_ups: number;
  bottle_returns_expected: number;
  bottle_returns_recorded: number;
  bottle_count_scope: string;
  products: {
    product_key: string;
    unit: string;
    scheduled: number;
    delivered: number;
    cancelled: number;
    outstanding: number;
  }[];
  blockers: { code: string; entity: string; message: string }[];
  last_review: {
    id: string;
    version: number;
    action: "closed" | "correction_required";
    created_at: string;
    snapshot: Omit<Reconciliation, "last_review">;
  } | null;
  generated_at: string;
};
export type CustomerDeliveryOutcome = {
  delivery_date: string;
  visit_key: string;
  outcome: string;
  resolution: string | null;
  follow_up_date: string | null;
  items: {
    product_key: string;
    quantity: number;
    fulfilled_quantity: number | null;
    unit: string;
  }[];
};
export function validOperationalDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}
export function outcomeLabel(value: string | null) {
  return (
    (
      {
        delivered: "Delivered",
        partial: "Partially delivered",
        attempt_failed: "Attempt failed",
        skipped: "Approved skip",
        reschedule_requested: "Reschedule requested",
        cancelled: "Cancelled",
        scheduled: "Scheduled",
      } as Record<string, string>
    )[value ?? ""] ?? "Outcome not recorded"
  );
}
export function reasonLabel(value: string | null) {
  return (
    DELIVERY_REASONS.find(([code]) => code === value)?.[1] ??
    "Reason not recorded"
  );
}
export function entitlementAdapter(
  model: string | null,
  purchased: number | null,
  fulfilled: number | null,
) {
  if (model === "one_time")
    return {
      supported: true,
      remaining: null,
      message: "Product obligation; no subscription credit",
    };
  if (model !== "legacy_delivery_count")
    return {
      supported: false,
      remaining: null,
      message:
        "Calendar-period accounting is not activated. Manager review required.",
    };
  if (
    purchased === null ||
    fulfilled === null ||
    !Number.isInteger(purchased) ||
    !Number.isInteger(fulfilled) ||
    fulfilled < 0 ||
    purchased < fulfilled
  )
    return {
      supported: false,
      remaining: null,
      message: "Invalid entitlement accounting; review required.",
    };
  return {
    supported: true,
    remaining: purchased - fulfilled,
    message:
      "Successful milk entitlements only; attempts do not consume credit",
  };
}
export function quantitiesBalance(row: {
  scheduled: number | null;
  delivered: number | null;
  cancelled: number | null;
  outstanding: number | null;
}) {
  return (
    Object.values(row).every(
      (v) => v !== null && Number.isFinite(v) && v >= 0,
    ) &&
    Math.abs(
      row.scheduled! - row.delivered! - row.cancelled! - row.outstanding!,
    ) < 0.005
  );
}
