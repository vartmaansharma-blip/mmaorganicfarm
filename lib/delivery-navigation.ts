export type Destination = {
  address_snapshot: string | null;
  destination_latitude?: number | null;
  destination_longitude?: number | null;
  destination_confirmed_at?: string | null;
};

export function hasConfirmedDestination(stop: Destination): boolean {
  const lat = stop.destination_latitude;
  const lon = stop.destination_longitude;
  return Boolean(stop.destination_confirmed_at) &&
    typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    typeof lon === "number" && Number.isFinite(lon) && Math.abs(lon) <= 180;
}

export function deliveryNavigationUrl(stop: Destination): string | null {
  const destination = hasConfirmedDestination(stop)
    ? `${stop.destination_latitude},${stop.destination_longitude}`
    : stop.address_snapshot?.trim();
  if (!destination) return null;
  // Omit origin so Maps can request the driver's current phone location.
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}
