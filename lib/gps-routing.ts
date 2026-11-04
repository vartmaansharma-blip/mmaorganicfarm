import { deliveryNavigationUrl, type Destination } from "./delivery-navigation";

export type GpsPoint = { latitude: number; longitude: number };
export type GpsFix = GpsPoint & { accuracy: number; captured_at: string };
export type GpsStop = Destination & {
  visit_key: string;
  id: string;
  customer_name: string;
  recorded: boolean;
  cancelled: boolean;
  items: { product_key: string; quantity: number; unit: string }[];
};
export type GpsConfig = {
  version: number;
  reuse_policy: boolean;
  start_mode: "farm_pickup" | "already_loaded";
  travel_mode: "DRIVE" | "TWO_WHEELER";
  sequencing: "manual" | "road" | "review";
  hub_latitude: number;
  hub_longitude: number;
  hub_label: string;
  pickup_confirmed_at: string | null;
  active_visit: string | null;
};
export type GpsProposal = {
  id: string;
  run_version: number;
  config_version: number;
  signature: string;
  ordered_keys: string[];
  duration_seconds: number;
  distance_metres: number;
  baseline_seconds: number;
  baseline_metres: number;
  origin: GpsPoint;
  created_at: string;
  expires_at: string;
  approved_at: string | null;
  accepted_at: string | null;
  travel_mode: "DRIVE" | "TWO_WHEELER";
};
export type GpsRun = {
  id: string;
  route_id: string;
  route_name: string;
  driver_name: string;
  driver_id: string;
  delivery_date: string;
  status: string;
  version: number;
  signature: string;
  stops: GpsStop[];
  pending_keys: string[];
  config: GpsConfig | null;
  position: (GpsFix & { received_at: string; tracking: boolean }) | null;
  proposal: GpsProposal | null;
  accepted: GpsProposal | null;
};
export type GpsWorkspace = {
  server_time: string;
  date: string;
  role: "admin" | "manager" | "driver";
  runs: GpsRun[];
};

export function validPoint(value: unknown): value is GpsPoint {
  const p = value as GpsPoint | null;
  return (
    !!p &&
    typeof p.latitude === "number" &&
    Number.isFinite(p.latitude) &&
    Math.abs(p.latitude) <= 90 &&
    typeof p.longitude === "number" &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.longitude) <= 180
  );
}
export function validateFix(value: unknown, now = Date.now()): GpsFix {
  const fix = value as GpsFix;
  if (
    !validPoint(fix) ||
    !Number.isFinite(fix.accuracy) ||
    fix.accuracy < 0 ||
    fix.accuracy > 100
  )
    throw Error(
      "A location accurate to 100 metres or better is needed. Try again outdoors.",
    );
  const time = Date.parse(fix.captured_at);
  if (!Number.isFinite(time) || now - time > 120_000 || time - now > 15_000)
    throw Error("That location is out of date. Capture a fresh position.");
  return fix;
}
export function locationState(position: GpsRun["position"], now = Date.now()) {
  if (!position?.tracking) return "Not sharing";
  const age = now - Date.parse(position.captured_at);
  if (!Number.isFinite(age) || age > 90_000) return "Location out of date";
  return "Recent location";
}
export function validatePermutation(indices: unknown, size: number): number[] {
  if (
    !Array.isArray(indices) ||
    indices.length !== size ||
    new Set(indices).size !== size ||
    indices.some((i) => !Number.isInteger(i) || i < 0 || i >= size)
  )
    throw Error(
      "The routing service returned an incomplete stop sequence. Keep the approved order.",
    );
  return indices;
}
export function orderedPendingStops(run: GpsRun): GpsStop[] {
  const pending = run.stops.filter((s) => !s.recorded && !s.cancelled);
  const accepted = run.accepted;
  if (
    !accepted ||
    accepted.run_version !== run.version ||
    accepted.config_version !== run.config?.version
  )
    return pending;
  const byKey = new Map(pending.map((s) => [s.visit_key, s]));
  if (pending.some((s) => !accepted.ordered_keys.includes(s.visit_key)))
    return pending;
  return accepted.ordered_keys.flatMap((key) =>
    byKey.has(key) ? [byKey.get(key)!] : [],
  );
}
export function mapsPointUrl(point: GpsPoint) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`;
}

export function gpsNavigationUrl(
  stop: Destination,
  mode: "DRIVE" | "TWO_WHEELER",
) {
  const base = deliveryNavigationUrl(stop);
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set(
    "travelmode",
    mode === "TWO_WHEELER" ? "two-wheeler" : "driving",
  );
  url.searchParams.set("dir_action", "navigate");
  return url.toString();
}

/** Stable IST rendering across server ICU and mobile browser locale implementations. */
export function gpsTime(value: string, includeSeconds = false) {
  const time = new Date(Date.parse(value) + 330 * 60_000);
  if (!Number.isFinite(time.getTime())) return "Unavailable";
  const parts = [time.getUTCHours(), time.getUTCMinutes()];
  if (includeSeconds) parts.push(time.getUTCSeconds());
  return parts.map((v) => String(v).padStart(2, "0")).join(":");
}
