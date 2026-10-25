import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { productName } from "@/lib/delivery-calendar";
import { WorkspaceHeader, PageLinks, resultPage } from "../workspace-parts";
import styles from "../operations-workbench.module.css";
export const metadata = {
  title: "Subscriptions",
  robots: { index: false, follow: false },
};
export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  await requireFarmManager("/farm/subscriptions");
  const p = await searchParams;
  const page = resultPage(p.page);
  const statuses = [
    "active",
    "paused",
    "pending_confirmation",
    "completed",
    "cancelled",
  ];
  const status = statuses.includes(p.status ?? "") ? p.status! : "active";
  const result = await createAdminClient()
    .from("delivery_plans")
    .select(
      "id,user_id,status,start_date,purchased_deliveries,delivered_deliveries,entitlement_model,weekly_delivery_items(day_of_week,product_key,quantity)",
    )
    .eq("is_test", false)
    .eq("status", status)
    .order("start_date", { ascending: false })
    .order("id")
    .range(page * 50, page * 50 + 49);
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
        title="Subscriptions"
        description="Paid service, recurring schedules, and remaining entitlements. Plan changes preserve the customer's original purchased terms."
      />
      <form className={styles.filters}>
        <label>
          Plan status
          <select name="status" defaultValue={status}>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button>Apply filters</button>
      </form>
      <section aria-label="Subscription plans">
        {result.data.length ? (
          result.data.map((row) => {
            const remaining = Math.max(
              0,
              Number(row.purchased_deliveries) -
                Number(row.delivered_deliveries),
            );
            return (
              <article className={styles.panel} key={row.id}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>{byId.get(row.user_id) ?? "Customer"}</h2>
                    <p>
                      Plan {row.id.slice(0, 8)} · starts {row.start_date}
                    </p>
                  </div>
                  <span className={styles.badge}>{row.status}</span>
                </div>
                {row.entitlement_model === "legacy_delivery_count" ? (
                  <p>
                    <strong>{remaining} service entitlements remaining</strong>{" "}
                    · {row.delivered_deliveries} of {row.purchased_deliveries}{" "}
                    fulfilled
                    {remaining <= 3 && row.status === "active"
                      ? " · Renewal due"
                      : ""}
                  </p>
                ) : (
                  <p className={styles.error}>
                    Calendar-period service needs its own verified entitlement
                    adapter. Financial changes are unavailable here.
                  </p>
                )}
                <div className={styles.items}>
                  {row.weekly_delivery_items.map(
                    (
                      item: {
                        day_of_week: number;
                        product_key: string;
                        quantity: number;
                      },
                      i: number,
                    ) => (
                      <span key={i}>
                        {
                          ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
                            item.day_of_week
                          ]
                        }{" "}
                        · {productName(item.product_key)} {item.quantity}
                      </span>
                    ),
                  )}
                </div>
                <p className={styles.hint}>
                  Skips and partial deliveries do not erase prepaid service.
                  Remaining entitlement is not an expiry date.
                </p>
                <Link href={`/farm/customers/${row.user_id}`}>
                  Review plan and upcoming service →
                </Link>
              </article>
            );
          })
        ) : (
          <p className={styles.empty}>No plans match this status.</p>
        )}
      </section>
      <PageLinks
        path="/farm/subscriptions"
        page={page}
        hasMore={result.data.length === 50}
        query={new URLSearchParams({ status }).toString()}
      />
    </main>
  );
}
