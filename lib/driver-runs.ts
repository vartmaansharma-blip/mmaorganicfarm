export const runStatus: Record<string, string> = {
  loading: "Loading",
  awaiting_ack: "Driver check",
  acknowledged: "Ready for release",
  released: "Ready to leave",
  in_progress: "On the road",
  returned: "Needs closeout",
  closed: "Closed",
  cancelled: "Cancelled",
};
export const runHint: Record<string, string> = {
  loading: "Record what is physically going into the vehicle.",
  awaiting_ack: "The driver checks each quantity before accepting custody.",
  acknowledged: "Load checked. The manager can now release this run.",
  released: "Everything is ready. Record the odometer before leaving.",
  in_progress: "Follow the route and record an outcome at each doorstep.",
  returned: "Reconcile the returned stock with the manager.",
  closed: "Journey and stock reviewed. Thank you for today’s deliveries.",
  cancelled:
    "This run was cancelled. Delivery obligations remain on the dispatch board.",
};
export type Quantities = Record<string, number>;
export type RunStop = {
  id: string;
  visit_key: string;
  customer_name: string;
  address_snapshot: string | null;
  phone_snapshot: string | null;
  destination_latitude: number | null;
  destination_longitude: number | null;
  destination_confirmed_at: string | null;
  items: { product_key: string; quantity: number; unit: string }[];
};
export type DriverRun = {
  id: string;
  delivery_date: string;
  route_id: string;
  driver_id: string;
  vehicle_id: string;
  route_name: string;
  driver_name: string;
  vehicle_name: string;
  registration: string;
  status: string;
  version: number;
  planned: Quantities;
  load: Quantities;
  delivered: Quantities;
  stop_count: number;
  recorded_stops: number;
  manifest: RunStop[];
  started_at: string | null;
  returned_at: string | null;
  released_at: string | null;
  acknowledged_at: string | null;
  opening_odometer: number | null;
  closing_odometer: number | null;
  return_note: string | null;
  closeout: { returns: Quantities; losses: Quantities; note: string } | null;
};
export type RunWorkspace = {
  date: string;
  role: "driver" | "manager" | "admin";
  actor: string;
  drivers: {
    id: string;
    name: string;
    active: boolean;
    phone: string | null;
    notes: string | null;
    default_vehicle_id: string | null;
    available: boolean | null;
  }[];
  vehicles: {
    id: string;
    name: string;
    registration: string;
    ownership: string;
    active: boolean;
    milk_capacity: number;
    paneer_capacity: number;
    ghee_capacity: number;
    stop_capacity: number;
  }[];
  routes: { id: string; name: string; stops: number }[];
  runs: DriverRun[];
};
export function quantityLabel(product: string, quantity: number) {
  return `${quantity} ${product === "milk" ? "L" : "× 500 g"}`;
}
export function journeyDistance(run: DriverRun) {
  return run.opening_odometer !== null && run.closing_odometer !== null
    ? Math.round(
        (Number(run.closing_odometer) - Number(run.opening_odometer)) * 10,
      ) / 10
    : null;
}
export function journeyMinutes(run: DriverRun) {
  return run.started_at && run.returned_at
    ? Math.max(
        0,
        Math.round(
          (Date.parse(run.returned_at) - Date.parse(run.started_at)) / 60000,
        ),
      )
    : null;
}
export function runSchemaUnavailable(error: {
  code?: string;
  message?: string;
}) {
  return (
    ["PGRST202", "42883"].includes(error.code ?? "") &&
    /get_driver_run_workspace/.test(error.message ?? "")
  );
}
