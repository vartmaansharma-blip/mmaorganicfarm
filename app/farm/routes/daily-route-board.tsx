import { readAllRows } from "@/lib/farm-data";
import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import {
  summarizeVisits,
  type OverviewDelivery,
  type OverviewOutcome,
} from "@/lib/farm-overview";
import styles from "../operations-workbench.module.css";
export async function DailyRouteBoard({
  date,
  area = "",
}: {
  date: string;
  area?: string;
}) {
  const { supabase } = await requireFarmManager("/farm/routes");
  async function readRows() {
    const rows: OverviewDelivery[] = [];
    for (let offset = 0; ; offset += 1000) {
      let query = supabase
        .from("daily_deliveries")
        .select(
          "id,visit_key,delivery_route_id,assigned_driver_id,status,delivery_confirmed,daily_delivery_items(product_key,quantity,unit,fulfilled_quantity)",
        )
        .eq("delivery_date", date)
        .eq("is_test", false)
        .order("id")
        .range(offset, offset + 999);
      if (area) query = query.eq("delivery_area_id", area);
      const result = await query;
      if (result.error) throw result.error;
      rows.push(...(result.data as OverviewDelivery[]));
      if (result.data.length < 1000) return rows;
    }
  }
  const [rows, routes, outcomes, dispatch] = await Promise.all([
    readRows(),
    supabase.from("delivery_routes").select("id,name").order("name"),
    readAllRows<OverviewOutcome>((start, end) =>
      supabase
        .from("delivery_visit_outcomes")
        .select("visit_key,outcome,resolution")
        .eq("delivery_date", date)
        .order("visit_key")
        .range(start, end),
    ),
    supabase
      .from("delivery_dispatches")
      .select("status")
      .eq("delivery_date", date)
      .maybeSingle(),
  ]);
  const error = [routes.error, dispatch.error].find(Boolean);
  if (error) throw error;
  const relevant = (routes.data ?? []).filter((route) =>
    rows.some((row) => row.delivery_route_id === route.id),
  );
  const unassigned = new Set(
    rows
      .filter(
        (row) =>
          row.status !== "cancelled" &&
          (!row.delivery_route_id || !row.assigned_driver_id),
      )
      .map((row) => row.visit_key),
  ).size;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Routes for {date}</h2>
          <p>
            {dispatch.data?.status === "released"
              ? "Released dispatch"
              : "Awaiting dispatch release"}{" "}
            · {unassigned} visits need assignment
          </p>
        </div>
        <div className={styles.links}>
          <Link href={`/farm/delivery-sheet?date=${date}`}>
            Review dispatch & manifest →
          </Link>
        </div>
      </div>
      {relevant.map((route) => {
        const group = rows.filter((row) => row.delivery_route_id === route.id);
        const s = summarizeVisits(group, outcomes);
        const loads = new Map<string, number>();
        for (const row of group)
          if (row.status !== "cancelled")
            for (const item of row.daily_delivery_items) {
              const key = `${item.product_key} · ${item.unit}`;
              loads.set(key, (loads.get(key) ?? 0) + Number(item.quantity));
            }
        return (
          <div className={styles.reportRow} key={route.id}>
            <strong>{route.name}</strong>
            <span>
              {s.delivered} of {s.expected} fully delivered · {s.partial}{" "}
              partial · {s.unsuccessful} exceptions · {s.pending} pending
            </span>
            <span>
              Planned load:{" "}
              {[...loads]
                .map(([label, quantity]) => `${quantity} ${label}`)
                .join(" · ") || "No active product lines"}
            </span>
            <Link href={`/farm/delivery-sheet?date=${date}&route=${route.id}`}>
              Open ordered stops & driver assignment →
            </Link>
          </div>
        );
      })}
      {!rows.length ? (
        <p className={styles.empty}>
          {dispatch.data
            ? "No delivery records for this prepared day."
            : "Prepare dispatch to review the actual day's routes."}
        </p>
      ) : null}
      <p className={styles.hint}>
        Address navigation is available at each stop. Embedded maps, GPS
        tracking, and estimated arrival times are unavailable until a verified
        provider and location feed are connected.
      </p>
    </section>
  );
}
