import "server-only";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import snapshotJson from "./snapshot.json";
import { todayInIndia } from "../delivery-calendar";

type Role = "admin" | "manager" | "driver";
type Row = Record<string, unknown>;
type Snapshot = {
  synthetic: boolean;
  date: string;
  ids: Record<Role, string>;
  tables: Record<string, Row[]>;
  rpc: Record<Role, Record<string, unknown>>;
  capacities: Record<string, Row[]>;
  customerOutcomes: Record<string, unknown>;
};
const snapshot = snapshotJson as unknown as Snapshot;
export async function dashboardReviewRole(): Promise<Role> {
  const value = (await cookies()).get("mma-dashboard-review-role")?.value;
  return value === "driver" || value === "manager" ? value : "admin";
}
export async function dashboardReviewContext() {
  const role = await dashboardReviewRole();
  const user: User = {
    id: snapshot.ids[role],
    aud: "review",
    role: "authenticated",
    email: `sample-${role}@example.invalid`,
    app_metadata: {},
    user_metadata: { full_name: `Sample ${role}` },
    created_at: `${snapshot.date}T00:00:00Z`,
  };
  return { role, user, supabase: createDashboardReviewClient(role) };
}
function shiftDates(value: unknown, days: number): unknown {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
    const date = new Date(value.length === 10 ? value + "T00:00:00Z" : value);
    if (!Number.isFinite(+date)) return value;
    date.setUTCDate(date.getUTCDate() + days);
    return value.length === 10
      ? date.toISOString().slice(0, 10)
      : date.toISOString();
  }
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, days));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, shiftDates(v, days)]),
    );
  return value;
}
function matches(value: unknown, condition: string): boolean {
  if (condition.startsWith("not.")) return !matches(value, condition.slice(4));
  const split = condition.indexOf("."),
    op = condition.slice(0, split),
    target = condition.slice(split + 1);
  const text = String(value);
  if (op === "eq") return text === target;
  if (op === "neq") return text !== target;
  if (op === "is") return target === "null" ? value == null : text === target;
  if (op === "in")
    return target
      .slice(1, -1)
      .split(",")
      .map((v) => v.replace(/^"|"$/g, ""))
      .includes(text);
  if (op === "ilike" || op === "like")
    return text
      .toLowerCase()
      .includes(target.replaceAll("%", "").toLowerCase());
  if (op === "gte") return text >= target;
  if (op === "lte") return text <= target;
  if (op === "gt") return text > target;
  if (op === "lt") return text < target;
  return false;
}
function related(row: Row, table: string, tables: Record<string, Row[]>) {
  const nested: Record<string, unknown> = { ...row };
  const children =
    table === "daily_deliveries"
      ? ["daily_delivery_items"]
      : table === "delivery_plans"
        ? [
            "weekly_delivery_items",
            "scheduled_delivery_items",
            "delivery_pauses",
            "delivery_exceptions",
          ]
        : table === "orders"
          ? ["order_items"]
          : [];
  for (const name of children)
    nested[name] = (tables[name] ?? []).filter(
      (child) =>
        child[
          table === "daily_deliveries"
            ? "delivery_id"
            : table === "orders"
              ? "order_id"
              : "plan_id"
        ] === row.id,
    );
  return nested;
}
export function createDashboardReviewClient(role: Role = "admin") {
  const days = Math.round(
    (Date.parse(todayInIndia()) - Date.parse(snapshot.date)) / 86400000,
  );
  const data = shiftDates(snapshot, days) as Snapshot;
  const reviewFetch: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input
          : input.url,
    );
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const headers = new Headers(init?.headers);
    const respond = (
      body: unknown,
      status = 200,
      extra: Record<string, string> = {},
    ) =>
      new Response(method === "HEAD" ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...extra },
      });
    const blocked = () =>
      respond(
        {
          code: "REVIEW_ONLY",
          message: "Dashboard review uses sample data. Changes are paused.",
        },
        403,
      );
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const name = url.pathname.split("/").at(-1)!;
      const args = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      if (name === "product_capacity_snapshot")
        return respond(
          (data.capacities[String(args.p_product_key)] ?? [])
            .filter(
              (row) =>
                !args.p_start_date ||
                String(row.delivery_date) >= String(args.p_start_date),
            )
            .slice(0, Number(args.p_days ?? 7)),
        );
      if (name === "get_customer_delivery_outcomes")
        return respond(data.customerOutcomes[String(args.p_user_id)] ?? []);
      if (name === "get_milk_intake_history")
        return respond(
          (data.tables.milk_intake_events ?? [])
            .filter((row) => row.intake_id === args.p_id)
            .sort((a, b) => Number(b.version) - Number(a.version))
            .map((row) => ({ ...row, actor: "Sample manager" })),
        );
      if (!Object.hasOwn(data.rpc[role], name)) return blocked();
      let result = data.rpc[role][name];
      if (name === "get_farm_notifications") {
        const original = result as { items: Row[]; total: number };
        result = {
          ...original,
          items: original.items.filter(
            (row) =>
              !args.p_before ||
              BigInt(String(row.id)) < BigInt(String(args.p_before)),
          ),
        };
      }
      return respond(result);
    }
    if (
      !["GET", "HEAD"].includes(method) ||
      !url.pathname.startsWith("/rest/v1/")
    )
      return blocked();
    const table = url.pathname.split("/").at(-1)!;
    if (!Object.hasOwn(data.tables, table))
      return respond(
        {
          code: "REVIEW_UNAVAILABLE",
          message: "This sample view is unavailable.",
        },
        404,
      );
    let rows = data.tables[table].map((row) =>
      related(row, table, data.tables),
    );
    for (const [field, condition] of url.searchParams) {
      if (["select", "limit", "offset", "order"].includes(field)) continue;
      if (field === "or") {
        rows = rows.filter((row) =>
          condition
            .replace(/^\(|\)$/g, "")
            .split(/,(?![^()]*\))/)
            .some((part) => {
              const dot = part.indexOf(".");
              return matches(row[part.slice(0, dot)], part.slice(dot + 1));
            }),
        );
      } else rows = rows.filter((row) => matches(row[field], condition));
    }
    for (const order of (url.searchParams.get("order") ?? "")
      .split(",")
      .reverse()
      .filter(Boolean)) {
      const [field, direction] = order.split(".");
      rows.sort(
        (a, b) =>
          String(a[field] ?? "").localeCompare(
            String(b[field] ?? ""),
            undefined,
            { numeric: true },
          ) * (direction === "desc" ? -1 : 1),
      );
    }
    const count = rows.length,
      offset = Number(url.searchParams.get("offset") ?? 0),
      limit = Number(url.searchParams.get("limit") ?? 1000);
    rows = rows.slice(offset, offset + limit);
    return respond(
      headers.get("accept")?.includes("vnd.pgrst.object")
        ? (rows[0] ?? null)
        : rows,
      200,
      {
        "content-range": `${offset}-${Math.max(offset, offset + rows.length - 1)}/${count}`,
      },
    );
  };
  // Every request is intercepted; this host is deliberately non-routable.
  return createClient(
    "https://dashboard-review.invalid",
    "synthetic-review-key",
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: reviewFetch },
    },
  );
}
