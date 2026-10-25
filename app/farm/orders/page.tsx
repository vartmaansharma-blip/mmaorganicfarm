import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkspaceHeader, PageLinks, resultPage } from "../workspace-parts";
import styles from "../operations-workbench.module.css";
export const metadata = {
  title: "Orders",
  robots: { index: false, follow: false },
};
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
}) {
  await requireFarmManager("/farm/orders");
  const p = await searchParams;
  const page = resultPage(p.page);
  const statuses = ["paid", "pending_payment", "failed", "cancelled"];
  const status = statuses.includes(p.status ?? "") ? p.status! : "";
  const q = (p.q ?? "").trim().slice(0, 80);
  // Privileged lookup is manager-gated and selects service eligibility, never payment instruments.
  let query = createAdminClient()
    .from("orders")
    .select(
      "id,user_id,status,purchase_mode,start_date,delivery_plan_id,created_at,order_items(product_name,quantity,unit)",
    )
    .eq("is_test", false)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 50, page * 50 + 49);
  if (status) query = query.eq("status", status);
  if (/^[0-9a-f-]{36}$/i.test(q)) query = query.eq("id", q);
  const result = await query;
  if (result.error) throw result.error;
  const ids = [...new Set(result.data.map((row) => row.user_id))];
  const names = ids.length
    ? await createAdminClient()
        .from("customer_profiles")
        .select("user_id,full_name")
        .in("user_id", ids)
    : { data: [], error: null };
  if (names.error) throw names.error;
  const byId = new Map(
    names.data?.map((row) => [row.user_id, row.full_name ?? "Customer"]),
  );
  return (
    <main className={styles.page}>
      <WorkspaceHeader
        title="Orders"
        description="Purchases, payment eligibility, and the service they create. Open a customer to trace scheduled and completed deliveries."
      />
      <form className={styles.filters} method="get">
        <label>
          Order ID
          <input
            name="q"
            defaultValue={q}
            placeholder="Full order ID"
            pattern="[0-9a-fA-F-]{36}"
          />
        </label>
        <label>
          Order status
          <select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button>Apply filters</button>
      </form>
      <section className={styles.history} aria-label="Orders">
        {result.data.length ? (
          result.data.map((row) => (
            <article className={styles.panel} key={row.id}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>{byId.get(row.user_id) ?? "Customer"}</h2>
                  <p>
                    MMA-{row.id.slice(0, 8).toUpperCase()} ·{" "}
                    {row.purchase_mode === "plan"
                      ? "Prepaid plan"
                      : "One-time / adjustment"}
                  </p>
                </div>
                <span className={styles.badge}>{row.status}</span>
              </div>
              <div className={styles.items}>
                {row.order_items.map(
                  (
                    item: {
                      product_name: string;
                      quantity: number;
                      unit: string;
                    },
                    i: number,
                  ) => (
                    <span key={i}>
                      {item.product_name} · {item.quantity} {item.unit}
                    </span>
                  ),
                )}
              </div>
              <p className={styles.hint}>
                Service starts {row.start_date}. Order payment eligibility and
                physical fulfilment are separate.
              </p>
              <Link href={`/farm/customers/${row.user_id}`}>
                Open customer & delivery history →
              </Link>
            </article>
          ))
        ) : (
          <p className={styles.empty}>No orders match these filters.</p>
        )}
      </section>
      <PageLinks
        path="/farm/orders"
        page={page}
        hasMore={result.data.length === 50}
        query={new URLSearchParams({ status, q }).toString()}
      />
    </main>
  );
}
