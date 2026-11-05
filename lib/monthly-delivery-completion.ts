type Item = { product_key: string; quantity: number | string; unit: string };
type ScheduledItem = Item & { delivery_date: string };
type RecordItem = Item & { fulfilled_quantity: number | string | null };
type Delivery = { delivery_date: string; status: string; delivery_confirmed: boolean; daily_delivery_items: RecordItem[] };

// A date is complete only when confirmed quantities cover every scheduled item.
// Missing or incomplete operational data must not become a delivery claim.
export function completedMonthlyDates(items: ScheduledItem[], records: Delivery[]): string[] {
  const dates = [...new Set(items.map(item => item.delivery_date))];
  return dates.filter(date => {
    const expected = new Map<string, number>();
    for (const item of items.filter(item => item.delivery_date === date)) {
      const key = `${item.product_key}:${item.unit}`;
      expected.set(key, (expected.get(key) ?? 0) + Number(item.quantity));
    }
    const actual = new Map<string, number>();
    const relevant = records.filter(record => record.delivery_date === date && record.status !== "cancelled");
    // Multiple visits or replacement chains need reconciliation before a date-level claim.
    if (relevant.length !== 1 || relevant.some(record => record.status !== "delivered" || !record.delivery_confirmed)) return false;
    for (const record of relevant) for (const item of record.daily_delivery_items ?? []) {
      const key = `${item.product_key}:${item.unit}`;
      const quantity = Number(item.fulfilled_quantity ?? 0);
      if (Number.isFinite(quantity) && quantity > 0) actual.set(key, (actual.get(key) ?? 0) + quantity);
    }
    return expected.size > 0 && [...expected].every(([key, quantity]) => Number.isFinite(quantity) && quantity > 0 && (actual.get(key) ?? 0) >= quantity);
  });
}
