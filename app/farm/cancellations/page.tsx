import type { Metadata } from "next";
import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { resolveCancellationRequest } from "./actions";
import styles from "../operations-list.module.css";

export const metadata: Metadata = { title: "Cancellation requests", robots: { index: false, follow: false } };

export default async function CancellationRequestsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; view?: string }> }) {
  const { supabase } = await requireFarmManager("/farm/cancellations");
  const params = await searchParams;
  const showHistory = params.view === "history";
  let requestQuery = supabase.from("cancellation_requests").select("id,user_id,order_id,plan_id,reason,status,resolution_note,created_at").order("created_at", { ascending: false });
  if (!showHistory) requestQuery = requestQuery.eq("status", "requested");
  const { data, error } = await requestQuery;
  if (error) throw error;
  const userIds = [...new Set((data ?? []).map((request) => request.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase.from("customer_profiles").select("user_id,full_name,phone").in("user_id", userIds)
    : { data: [] };
  const customerById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

  return <main className={styles.page}>
    <header><div><p>Customer care</p><h1>{showHistory ? "Request history" : "Open requests"}</h1><span>{showHistory ? "Past decisions are kept for accountability." : "Review only customer requests that still need a decision."}</span></div><div><Link href={showHistory ? "/farm/cancellations" : "/farm/cancellations?view=history"}>{showHistory ? "Open requests" : "View history"}</Link></div></header>
    {params.message ? <p className={styles.notice}>{params.message}</p> : null}
    {params.error ? <p className={`${styles.notice} ${styles.error}`}>{params.error}</p> : null}
    <section className={styles.list}>
      {(data ?? []).length ? data?.map((request) => <article key={request.id}>
        <div className={styles.rowHeading}><div><strong>{customerById.get(request.user_id)?.full_name ?? "Customer"}</strong><span>{customerById.get(request.user_id)?.phone ?? (request.order_id ? `Order ${request.order_id.slice(0, 8).toUpperCase()}` : "Delivery plan")}</span></div><b>{request.status}</b></div>
        <p>{request.reason}</p>
        <small>{new Date(request.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small>
        {request.status === "requested" ? <form action={resolveCancellationRequest}>
          <input name="requestId" type="hidden" value={request.id} />
          <label>Farm note<textarea name="note" rows={2} /></label>
          <div><button name="status" value="approved">Approve</button><button name="status" value="declined">Decline</button></div>
        </form> : request.resolution_note ? <p className={styles.resolution}>{request.resolution_note}</p> : null}
        <Link href={`/farm/customers/${request.user_id}`}>Open customer</Link>
      </article>) : <div className={styles.empty}>{showHistory ? "No past requests." : "No open requests."}</div>}
    </section>
  </main>;
}
