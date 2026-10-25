export type OverviewDelivery = {
  id: string;
  visit_key: string;
  delivery_route_id: string | null;
  assigned_driver_id: string | null;
  status: string;
  delivery_confirmed: boolean;
  daily_delivery_items: {
    product_key: string;
    quantity: number | string;
    unit: string;
    fulfilled_quantity?: number | string | null;
  }[];
};
export type OverviewOutcome = {
  visit_key: string;
  outcome: string;
  resolution: string;
};

// A visit may contain several order/plan rows. Never count those as separate doorsteps.
export function summarizeVisits(
  rows: OverviewDelivery[],
  outcomes: OverviewOutcome[],
) {
  const recorded = new Map(outcomes.map((row) => [row.visit_key, row]));
  const visits = new Map<string, OverviewDelivery[]>();
  for (const row of rows) {
    if (row.status === "cancelled") continue;
    visits.set(row.visit_key, [...(visits.get(row.visit_key) ?? []), row]);
  }
  const summary = {
    expected: visits.size,
    delivered: 0,
    partial: 0,
    unsuccessful: 0,
    pending: 0,
    milkPlanned: 0,
    milkDelivered: 0,
  };
  for (const [key, group] of visits) {
    const outcome = recorded.get(key)?.outcome;
    const delivered = outcome
      ? outcome === "delivered"
      : group.every(
          (row) => row.delivery_confirmed || row.status === "delivered",
        );
    if (delivered) summary.delivered++;
    else if (outcome === "partial") summary.partial++;
    else if (outcome || group.some((row) => row.status === "failed"))
      summary.unsuccessful++;
    else summary.pending++;
    for (const row of group)
      for (const item of row.daily_delivery_items ?? []) {
        if (
          item.product_key !== "milk" ||
          !["L", "litre", "litres", "1 litre", "1 L"].includes(item.unit)
        )
          continue;
        summary.milkPlanned += Number(item.quantity);
        summary.milkDelivered +=
          item.fulfilled_quantity != null
            ? Number(item.fulfilled_quantity)
            : row.delivery_confirmed || row.status === "delivered"
              ? Number(item.quantity)
              : 0;
      }
  }
  return summary;
}
