export type DeliveryArea = {
  active?: boolean | null;
  id: string;
  name: string;
};

export function normalizeDeliveryText(value: string | null | undefined) {
  return ` ${String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

export function inferDeliveryArea(
  address: string | null | undefined,
  areas: DeliveryArea[],
) {
  const normalizedAddress = normalizeDeliveryText(address);
  if (normalizedAddress.trim().length === 0) return null;

  return (
    [...areas]
      .filter((area) => area.active !== false)
      .sort((a, b) => b.name.length - a.name.length)
      .find((area) =>
        normalizedAddress.includes(normalizeDeliveryText(area.name)),
      ) ?? null
  );
}

export function resolveDeliveryArea(
  areaId: string | null | undefined,
  address: string | null | undefined,
  areas: DeliveryArea[],
) {
  return areas.find((area) => area.id === areaId) ?? inferDeliveryArea(address, areas);
}
