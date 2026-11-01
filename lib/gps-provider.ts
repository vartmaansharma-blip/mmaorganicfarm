import {
  validPoint,
  validatePermutation,
  type GpsPoint,
  type GpsStop,
} from "./gps-routing";
import { hasConfirmedDestination } from "./delivery-navigation";

type RouteInput = {
  origin: GpsPoint;
  hub: GpsPoint;
  stops: GpsStop[];
  optimise: boolean;
  travelMode: "DRIVE" | "TWO_WHEELER";
};
type RouteResult = {
  ordered_keys: string[];
  duration_seconds: number;
  distance_metres: number;
  baseline_seconds: number;
  baseline_metres: number;
};
type Transport = typeof fetch;
const waypoint = (p: GpsPoint) => ({ location: { latLng: p } });
function parseRoute(value: unknown, count: number, optimise: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(
      "No complete road route is available. Keep the approved stop order.",
    );
  const data = value as {
    fallbackInfo?: unknown;
    routes?: {
      duration?: string;
      distanceMeters?: number;
      optimizedIntermediateWaypointIndex?: number[];
      legs?: unknown[];
    }[];
  };
  const route = data.routes?.[0];
  const seconds = Number(route?.duration?.replace(/s$/, ""));
  if (
    data.fallbackInfo ||
    !route ||
    !/^\d+(\.\d+)?s$/.test(route.duration ?? "") ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds > 172800 ||
    !Number.isFinite(route.distanceMeters) ||
    route.distanceMeters! < 0 ||
    route.distanceMeters! > 5_000_000 ||
    route.legs?.length !== count + 1
  )
    throw Error(
      "No complete road route is available. Keep the approved stop order.",
    );
  return {
    seconds,
    metres: route.distanceMeters!,
    indices: optimise
      ? validatePermutation(route.optimizedIntermediateWaypointIndex, count)
      : Array.from({ length: count }, (_, i) => i),
  };
}
/** Real Google road routes only. No straight-line substitute and no default public test endpoint. */
export async function computeRoadProposal(
  input: RouteInput,
  apiKey: string,
  transport: Transport = fetch,
): Promise<RouteResult> {
  if (!apiKey)
    throw Error(
      "Road routing is awaiting provider setup. Your manual route is still available.",
    );
  if (
    !validPoint(input.origin) ||
    !validPoint(input.hub) ||
    !input.stops.length ||
    input.stops.length > 25 ||
    new Set(input.stops.map((s) => s.visit_key)).size !== input.stops.length ||
    input.stops.some((s) => !hasConfirmedDestination(s))
  )
    throw Error(
      "Road planning needs 1–25 distinct pending stops with confirmed entrance pins. Split larger runs or use the manual route.",
    );
  const body = {
    origin: waypoint(input.origin),
    destination: waypoint(input.hub),
    intermediates: input.stops.map((s) =>
      waypoint({
        latitude: s.destination_latitude!,
        longitude: s.destination_longitude!,
      }),
    ),
    travelMode: input.travelMode,
    routingPreference: "TRAFFIC_UNAWARE",
    languageCode: "en",
    units: "METRIC",
  };
  async function calculate(optimise: boolean) {
    let response: Response;
    try {
      response = await transport(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "routes.duration,routes.distanceMeters,routes.optimizedIntermediateWaypointIndex,routes.legs.duration,fallbackInfo",
          },
          body: JSON.stringify({ ...body, optimizeWaypointOrder: optimise }),
          signal: AbortSignal.timeout(15000),
          cache: "no-store",
        },
      );
    } catch {
      throw Error(
        "The routing service could not be reached. Your current route is unchanged.",
      );
    }
    if (!response.ok)
      throw Error(
        "The routing service could not calculate this run. Check provider access and vehicle coverage.",
      );
    return parseRoute(await response.json(), input.stops.length, optimise);
  }
  const baseline = await calculate(false);
  const proposed =
    input.optimise && input.stops.length > 1 ? await calculate(true) : baseline;
  // Optimisation is a proposal, not proof of improvement. Never adopt a worse estimated journey.
  const selected = proposed.seconds <= baseline.seconds ? proposed : baseline;
  return {
    ordered_keys: selected.indices.map((i) => input.stops[i].visit_key),
    duration_seconds: selected.seconds,
    distance_metres: selected.metres,
    baseline_seconds: baseline.seconds,
    baseline_metres: baseline.metres,
  };
}
