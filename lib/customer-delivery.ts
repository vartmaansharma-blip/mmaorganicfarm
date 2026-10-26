// Customer-facing interpretation only. Schedules are never delivery confirmations.
export type DeliveryItem = { product_key: string; quantity: number; unit: string; fulfilled_quantity?: number | null };
export type CustomerPlan = {
  id: string; status: string; start_date: string; billing_model: string | null;
  period_end_exclusive: string | null; purchased_deliveries: number; delivered_deliveries: number;
  weekly_delivery_items: (DeliveryItem & { day_of_week: number })[];
  scheduled_delivery_items: (DeliveryItem & { delivery_date: string })[];
  delivery_exceptions: { delivery_date: string; product_key: string; action: string; quantity: number | null; unit: string | null }[];
  delivery_pauses: { start_date: string; end_date: string }[];
};
export type CustomerOrder = { id: string; status: string; purchase_mode: string; start_date: string; order_items: DeliveryItem[] };
export type DeliveryRecord = {
  id: string; plan_id: string | null; order_id: string | null; delivery_date: string; visit_key: string;
  status: string; updated_at: string; delivered_confirmed_at: string | null; delivery_confirmed: boolean;
  replacement_of_delivery_id: string | null; fulfilment_root_id: string | null; daily_delivery_items: DeliveryItem[];
};
export type DeliveryHistory = { delivery_date: string; visit_key: string; outcome: string; resolution: string | null; follow_up_date: string | null };
export type DeliveryState = "scheduled" | "preparing" | "out" | "delivered" | "attention" | "paused" | "skipped" | "cancelled" | "none" | "setup";
export type DeliveryVisit = { key: string; state: DeliveryState; items: DeliveryItem[]; followUp: string | null; followUpApproved: boolean };
export type DeliverySnapshot = {
  date: string; checkedAt: string; updatedAt: string | null; completedAt: string | null;
  state: DeliveryState; visits: DeliveryVisit[];
  upcoming: { date: string; items: DeliveryItem[] }[];
  confirmedPlans: number; awaitingConfirmation: boolean;
};

export function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function plusDays(date: string, offset: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
function schedule(plan: CustomerPlan, date: string) {
  if (date < plan.start_date || (plan.period_end_exclusive && date >= plan.period_end_exclusive)) return [];
  if (plan.status !== "active") return [];
  if (plan.billing_model !== "calendar_month" && Number(plan.purchased_deliveries) <= Number(plan.delivered_deliveries)) return [];
  if (plan.delivery_pauses.some(p => p.start_date <= date && date <= p.end_date)) return [];
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  const items = new Map<string, DeliveryItem>();
  const base = plan.billing_model === "calendar_month" ? [] : plan.weekly_delivery_items.filter(i => i.day_of_week === weekday);
  for (const item of [...base, ...plan.scheduled_delivery_items.filter(i => i.delivery_date === date)]) {
    // Matches the farm calendar: a dated item replaces the weekly item for that product.
    items.set(item.product_key, { product_key: item.product_key, quantity: Number(item.quantity), unit: item.unit });
  }
  for (const exception of plan.delivery_exceptions.filter(e => e.delivery_date === date)) {
    if (exception.action === "skip") items.delete(exception.product_key);
    else if (exception.quantity && exception.unit) items.set(exception.product_key, { product_key: exception.product_key, quantity: Number(exception.quantity), unit: exception.unit });
  }
  return [...items.values()];
}
function recordVisits(rows: DeliveryRecord[], history: DeliveryHistory[]): DeliveryVisit[] {
  // A replacement is the outstanding part of its original obligation, not a second purchase.
  const roots = new Map<string, DeliveryRecord[]>();
  for (const row of rows) {
    const key = row.fulfilment_root_id ?? row.replacement_of_delivery_id ?? row.id;
    roots.set(key, [...(roots.get(key) ?? []), row]);
  }
  const obligations = [...roots].map(([key, chain]) => {
    const first = chain.find(r => r.id === key) ?? chain.find(r => !chain.some(p => p.id === r.replacement_of_delivery_id)) ?? chain[0];
    const quantities = new Map<string, DeliveryItem>();
    for (const i of first.daily_delivery_items) quantities.set(`${i.product_key}:${i.unit}`, { ...i, quantity: Number(i.quantity), fulfilled_quantity: 0 });
    for (const row of chain.filter(r => r.status !== "cancelled")) for (const i of row.daily_delivery_items) {
      const itemKey = `${i.product_key}:${i.unit}`;
      const target = quantities.get(itemKey) ?? { ...i, quantity: Number(i.quantity), fulfilled_quantity: 0 };
      const actual = i.fulfilled_quantity ?? (row.status === "delivered" && row.delivery_confirmed ? i.quantity : 0);
      target.fulfilled_quantity = Math.min(target.quantity, Number(target.fulfilled_quantity ?? 0) + Number(actual));
      quantities.set(itemKey, target);
    }
    const items = [...quantities.values()];
    const activeLeaves = chain.filter(r => r.status !== "cancelled" && !chain.some(next => next.replacement_of_delivery_id === r.id && next.status !== "cancelled"));
    const delivered = items.length > 0 && items.every(i => Number(i.fulfilled_quantity) >= i.quantity) && activeLeaves.length > 0 && activeLeaves.every(r => r.status === "delivered" && r.delivery_confirmed);
    const outcomes = history.filter(h => chain.some(r => r.visit_key === h.visit_key && r.delivery_date === h.delivery_date));
    const approved = outcomes.find(h => h.follow_up_date && ["rescheduled", "retained", "carry_forward"].includes(h.resolution ?? ""));
    const skip = outcomes.some(h => h.outcome === "skipped" && ["retained", "rescheduled", "carry_forward"].includes(h.resolution ?? ""));
    let state: DeliveryState = "scheduled";
    if (delivered) state = "delivered";
    else if (skip && !activeLeaves.some(r => ["out_for_delivery", "ready", "planned"].includes(r.status))) state = "skipped";
    else if (activeLeaves.some(r => r.status === "failed") || items.some(i => Number(i.fulfilled_quantity) > 0)) state = "attention";
    else if (chain.every(r => r.status === "cancelled")) state = "cancelled";
    else if (activeLeaves.some(r => r.status === "out_for_delivery")) state = "out";
    else if (activeLeaves.some(r => r.status === "ready")) state = "preparing";
    // A delivered flag without confirmation/actual quantities cannot complete an obligation.
    else if (activeLeaves.some(r => r.status === "delivered")) state = "attention";
    return { key, visitKey: activeLeaves[0]?.visit_key ?? first.visit_key, state, items, followUp: approved?.follow_up_date ?? null, followUpApproved: Boolean(approved) };
  });
  const visits = new Map<string, typeof obligations>();
  for (const obligation of obligations) visits.set(obligation.visitKey, [...(visits.get(obligation.visitKey) ?? []), obligation]);
  return [...visits].map(([key, parts]) => ({ key, state: stateOf(parts), items: parts.flatMap(p => p.items), followUp: parts.find(p => p.followUpApproved)?.followUp ?? null, followUpApproved: parts.some(p => p.followUpApproved) }));
}
function stateOf(visits: DeliveryVisit[]): DeliveryState {
  if (!visits.length) return "none";
  if (visits.every(v => v.state === "delivered")) return "delivered";
  if (visits.some(v => v.state === "attention")) return "attention";
  if (visits.some(v => v.state === "delivered")) return "attention";
  if (visits.some(v => v.state === "out")) return "out";
  if (visits.some(v => v.state === "preparing")) return "preparing";
  if (visits.some(v => v.state === "scheduled")) return "scheduled";
  return visits.every(v => v.state === "skipped") ? "skipped" : "cancelled";
}
export function buildCustomerDeliverySnapshot({ plans, orders, records, history = [], now = new Date() }: {
  plans: CustomerPlan[]; orders: CustomerOrder[]; records: DeliveryRecord[]; history?: DeliveryHistory[]; now?: Date;
}): DeliverySnapshot {
  const date = indiaDate(now);
  function visitsFor(day: string) {
    const rows = records.filter(r => r.delivery_date === day);
    const visits = recordVisits(rows, history);
    for (const plan of plans) {
      // A replacement from an older day must not hide today's normal scheduled visit.
      if (rows.some(r => r.plan_id === plan.id && !r.replacement_of_delivery_id)) continue;
      const items = schedule(plan, day);
      if (items.length) visits.push({ key: `plan:${plan.id}`, state: "scheduled", items, followUp: null, followUpApproved: false });
    }
    for (const order of orders) if (order.status === "paid" && order.purchase_mode === "once" && order.start_date === day && !rows.some(r => r.order_id === order.id && !r.replacement_of_delivery_id)) {
      visits.push({ key: `order:${order.id}`, state: "scheduled", items: order.order_items.map(i => ({ ...i, quantity: Number(i.quantity) })), followUp: null, followUpApproved: false });
    }
    return visits;
  }
  const visits = visitsFor(date);
  let state = stateOf(visits);
  const awaitingConfirmation = plans.some(p => p.status === "pending_confirmation") || orders.some(o => o.start_date >= date && ["draft", "pending_payment", "payment_failed"].includes(o.status));
  if (!visits.length) {
    if (plans.some(p => p.start_date <= date && (!p.period_end_exclusive || date < p.period_end_exclusive) && (p.status === "paused" || p.delivery_pauses.some(x => x.start_date <= date && date <= x.end_date)))) state = "paused";
    else if (plans.some(p => p.status === "active" && p.delivery_exceptions.some(e => e.delivery_date === date && e.action === "skip"))) state = "skipped";
    else if (awaitingConfirmation) state = "setup";
  }
  const upcoming: DeliverySnapshot["upcoming"] = [];
  // Only project prepaid legacy milk up to its remaining delivery count.
  const projected = new Map<string, number>();
  for (let offset = 1; offset <= 60 && upcoming.length < 3; offset++) {
    const day = plusDays(date, offset);
    const future = visitsFor(day).filter(v => {
      if (["cancelled", "skipped", "delivered"].includes(v.state)) return false;
      const plan = plans.find(p => v.key === `plan:${p.id}`);
      if (!plan || plan.billing_model === "calendar_month" || !v.items.some(i => i.product_key === "milk")) return true;
      const used = (projected.get(plan.id) ?? 0) + 1;
      projected.set(plan.id, used);
      const todayMilk = visits.some(t => t.key === `plan:${plan.id}` && t.items.some(i => i.product_key === "milk")) || records.some(r => r.delivery_date === date && r.plan_id === plan.id && !r.replacement_of_delivery_id && ["planned", "ready", "out_for_delivery"].includes(r.status) && r.daily_delivery_items.some(i => i.product_key === "milk")) ? 1 : 0;
      return used + todayMilk <= Number(plan.purchased_deliveries) - Number(plan.delivered_deliveries);
    });
    if (future.length) upcoming.push({ date: day, items: future.flatMap(v => v.items) });
  }
  const todayRows = records.filter(r => r.delivery_date === date);
  const updates = todayRows.map(r => r.updated_at).filter(Boolean).sort();
  const completions = todayRows.filter(r => r.status === "delivered" && r.delivery_confirmed).map(r => r.delivered_confirmed_at).filter((x): x is string => Boolean(x)).sort();
  return { date, state, visits, upcoming, checkedAt: now.toISOString(), updatedAt: updates.at(-1) ?? null,
    completedAt: state === "delivered" ? completions.at(-1) ?? null : null,
    confirmedPlans: plans.filter(p => ["active", "paused"].includes(p.status)).length, awaitingConfirmation };
}
