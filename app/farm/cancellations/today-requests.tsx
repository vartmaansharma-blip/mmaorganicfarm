import Link from "next/link";
import { formatCalendarDate, productName, todayInIndia } from "@/lib/delivery-calendar";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { requestStatus, todayRequestFields, todayRequestsUnavailable, type TodayRequest } from "@/lib/today-delivery-management";
import { TodayRequestReview } from "./today-request-review";
import styles from "../operations-list.module.css";

export async function TodayRequests({ history }: { history: boolean }) {
  const { supabase } = await requireFarmManager("/farm/cancellations");
  const today = todayInIndia();
  const query = supabase.from("today_delivery_requests").select(`${todayRequestFields},user_id`);
  const { data, error } = await query.in("status", history ? ["applied", "declined", "resolved"] : ["requested", "follow_up"])
    .order("delivery_date", { ascending: false }).order("created_at", { ascending: !history }).limit(100);
  if (error) {
    if (todayRequestsUnavailable(error)) return null;
    throw error;
  }
  const requests = (data ?? []) as (TodayRequest & { user_id: string })[];
  const ids = [...new Set(requests.map(row => row.user_id))];
  const sourceIds = [...new Set(requests.map(row => row.delivery_id))];
  const [profiles, sources] = await Promise.all([
    ids.length ? supabase.from("customer_profiles").select("user_id,full_name").in("user_id", ids) : { data: [], error: null },
    sourceIds.length ? supabase.from("daily_deliveries").select("id,status,plan_id").in("id", sourceIds) : { data: [], error: null },
  ]);
  if (profiles.error || sources.error) throw new Error("Could not load delivery request context");
  const names = new Map((profiles.data ?? []).map(row => [row.user_id, row.full_name]));
  const sourceById = new Map((sources.data ?? []).map(row => [row.id, row]));
  return <section className={styles.list} aria-label="Same-day delivery requests">
    <h2>Today’s delivery requests</h2>
    {requests.length ? requests.map(request => {
      const source = sourceById.get(request.delivery_id);
      const canApply = request.delivery_date === today && source?.status === "planned" && Boolean(source.plan_id)
        && request.requested_quantity !== null && request.previous_quantity !== null
        && request.requested_quantity > 0 && request.requested_quantity < request.previous_quantity;
      return <article key={request.id}>
        <div className={styles.rowHeading}>
          <div><strong>{names.get(request.user_id) ?? "Customer"}</strong><span>{formatCalendarDate(request.delivery_date)} · {source?.plan_id ? "Scheduled" : source ? "One-time" : "Delivery record changed"}</span></div>
          <b>{requestStatus[request.status]}</b>
        </div>
        <p>{request.product_key ? `${productName(request.product_key)} · ${request.previous_quantity} → ${request.requested_quantity}` : request.note}</p>
        {request.decision_note ? <p className={styles.resolution}>{request.decision_note}</p> : null}
        {["requested", "follow_up"].includes(request.status) ? <TodayRequestReview key={request.status} id={request.id} canApply={canApply} followingUp={request.status === "follow_up"} /> : null}
        <Link prefetch={false} href={`/farm/customers/${request.user_id}`}>Open customer →</Link>
      </article>;
    }) : <div className={styles.empty}>{history ? "No reviewed same-day requests." : "No same-day requests awaiting review."}</div>}
  </section>;
}
