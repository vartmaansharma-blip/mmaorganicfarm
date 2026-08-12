import type { Metadata } from "next";
import Link from "next/link";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import { resolveCancellationRequest } from "./actions";
import styles from "../operations-list.module.css";

export const metadata: Metadata = { title: "Cancellation requests", robots: { index: false, follow: false } };

export default async function CancellationRequestsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { supabase } = await requireFarmStaff("/farm/cancellations");
  const params = await searchParams;
  const { data, error } = await supabase.from("cancellation_requests").select("id,user_id,order_id,plan_id,reason,status,resolution_note,created_at").order("created_at", { ascending: false });
  if (error) throw error;

  return <main className={styles.page}>
    <header><div><p>Customer care</p><h1>Cancellation requests</h1><span>Review requests before preparation or dispatch.</span></div><Link href="/farm">Back to overview</Link></header>
    {params.message ? <p className={styles.notice}>{params.message}</p> : null}
    {params.error ? <p className={`${styles.notice} ${styles.error}`}>{params.error}</p> : null}
    <section className={styles.list}>
      {(data ?? []).length ? data?.map((request) => <article key={request.id}>
        <div className={styles.rowHeading}><div><strong>Request {request.id.slice(0, 8).toUpperCase()}</strong><span>{request.order_id ? `Order ${request.order_id.slice(0, 8).toUpperCase()}` : "Delivery plan"}</span></div><b>{request.status}</b></div>
        <p>{request.reason}</p>
        <small>{new Date(request.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small>
        {request.status === "requested" ? <form action={resolveCancellationRequest}>
          <input name="requestId" type="hidden" value={request.id} />
          <label>Farm note<textarea name="note" rows={2} /></label>
          <div><button name="status" value="approved">Approve</button><button name="status" value="declined">Decline</button></div>
        </form> : request.resolution_note ? <p className={styles.resolution}>{request.resolution_note}</p> : null}
      </article>) : <div className={styles.empty}>No cancellation requests.</div>}
    </section>
  </main>;
}
