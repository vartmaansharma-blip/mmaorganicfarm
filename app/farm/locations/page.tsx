import type { Metadata } from "next";
import Link from "next/link";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import {
  canManageLocations,
  requireFarmStaff,
} from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assignCustomerLocation,
  createArea,
  deleteCustomerProfile,
  importCustomerProfiles,
} from "./actions";
import styles from "./locations.module.css";

export const metadata: Metadata = {
  title: "Farm customers",
  robots: { index: false, follow: false },
};

type DeliveryItem = {
  day_of_week?: number;
  delivery_date?: string;
  product_key: string;
  quantity: number | string;
  unit: string;
};

type PlanRow = {
  bottle_choice: "new" | "none" | "return";
  created_at: string;
  delivered_deliveries: number;
  id: string;
  purchased_deliveries: number;
  scheduled_delivery_items: DeliveryItem[];
  start_date: string;
  status: string;
  updated_at: string;
  user_id: string;
  weekly_delivery_items: DeliveryItem[];
};

type OrderItem = {
  delivery_date: string | null;
  frequency: "once" | "weekly";
  product_key: string;
  product_name: string;
  quantity: number | string;
  scheduled_days: number[] | null;
  unit: string;
};

type OrderRow = {
  bottle_choice: "new" | "none" | "return";
  created_at: string;
  delivery_plan_id: string | null;
  id: string;
  milk_litres: number | string;
  order_items: OrderItem[];
  paid_total_paise: number | null;
  purchase_mode: "adjustment" | "once" | "plan";
  start_date: string;
  status: string;
  total_paise: number;
  user_id: string;
};

type PaymentRow = {
  amount_paise: number;
  created_at: string;
  order_id: string;
  paid_at: string | null;
  status: string;
};

function normalizedLocation(value: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00+05:30`));
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function productName(productKey: string, fallback?: string) {
  if (fallback) return fallback;
  if (productKey === "milk") return "Fresh milk";
  if (productKey === "paneer") return "Fresh paneer";
  if (productKey === "ghee") return "Farm ghee";
  return titleCase(productKey);
}

function quantityLabel(quantity: number | string, unit: string) {
  const value = Number(quantity);
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}

function planLabel(order: OrderRow | undefined) {
  if (!order) return "No order yet";
  if (order.purchase_mode === "plan") return "Scheduled delivery plan";
  if (order.purchase_mode === "adjustment") return "Milk quantity change";
  return "One-time order";
}

type LocationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LocationsPage({ searchParams }: LocationsPageProps) {
  const { role, supabase } = await requireFarmStaff("/farm/locations");
  const admin = createAdminClient();
  const parameters = await searchParams;
  const [areasResult, profilesResult, plansResult, ordersResult, paymentsResult] =
    await Promise.all([
      supabase
        .from("delivery_areas")
        .select("id, name, active, sort_order")
        .order("sort_order")
        .order("name"),
      supabase
        .from("customer_profiles")
        .select(
          "user_id, full_name, email, phone, address_line, locality, landmark, postal_code, delivery_area_id, delivery_route_id, route_stop_order",
        )
        .order("full_name"),
      admin
        .from("delivery_plans")
        .select(
          "id, user_id, status, start_date, bottle_choice, purchased_deliveries, delivered_deliveries, created_at, updated_at, weekly_delivery_items(day_of_week, product_key, quantity, unit), scheduled_delivery_items(delivery_date, product_key, quantity, unit)",
        )
        .order("updated_at", { ascending: false }),
      admin
        .from("orders")
        .select(
          "id, user_id, delivery_plan_id, purchase_mode, status, milk_litres, bottle_choice, total_paise, paid_total_paise, start_date, created_at, order_items(product_key, product_name, quantity, unit, frequency, scheduled_days, delivery_date)",
        )
        .order("created_at", { ascending: false }),
      admin
        .from("payments")
        .select("order_id, status, amount_paise, paid_at, created_at")
        .order("created_at", { ascending: false }),
    ]);

  const databaseError = [
    areasResult.error,
    profilesResult.error,
    plansResult.error,
    ordersResult.error,
    paymentsResult.error,
  ].find(Boolean);
  if (databaseError) throw databaseError;

  const areas = areasResult.data ?? [];
  const profiles = profilesResult.data ?? [];
  const plans = (plansResult.data ?? []) as PlanRow[];
  const orders = (ordersResult.data ?? []) as OrderRow[];
  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const areaById = new Map(areas.map((area) => [area.id, area.name]));
  const latestPlanByUser = new Map<string, PlanRow>();
  const latestOrderByUser = new Map<string, OrderRow>();
  const ordersByUser = new Map<string, OrderRow[]>();
  const latestPaymentByOrder = new Map<string, PaymentRow>();
  const planPriority = new Map([
    ["active", 4],
    ["paused", 3],
    ["pending_confirmation", 2],
    ["cancelled", 1],
  ]);
  const orderPriority = new Map([
    ["paid", 4],
    ["pending_payment", 3],
    ["draft", 2],
    ["cancelled", 1],
  ]);
  plans.forEach((plan) => {
    const current = latestPlanByUser.get(plan.user_id);
    if (
      !current ||
      (planPriority.get(plan.status) ?? 0) > (planPriority.get(current.status) ?? 0)
    ) {
      latestPlanByUser.set(plan.user_id, plan);
    }
  });
  orders.forEach((order) => {
    ordersByUser.set(order.user_id, [
      ...(ordersByUser.get(order.user_id) ?? []),
      order,
    ]);
    const current = latestOrderByUser.get(order.user_id);
    if (
      !current ||
      (orderPriority.get(order.status) ?? 0) > (orderPriority.get(current.status) ?? 0)
    ) {
      latestOrderByUser.set(order.user_id, order);
    }
  });
  payments.forEach((payment) => {
    if (!latestPaymentByOrder.has(payment.order_id)) {
      latestPaymentByOrder.set(payment.order_id, payment);
    }
  });

  const canManage = canManageLocations(role);
  const canDelete = role === "admin";
  const activePlanCount = plans.filter((plan) => plan.status === "active").length;
  const paidOrderCount = orders.filter((order) => order.status === "paid").length;
  const missingAddressCount = profiles.filter((profile) => !profile.address_line).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Farm records</p>
          <h1>Customers</h1>
          <p>Profiles, delivery addresses, purchased products, plans, and payments in one place.</p>
        </div>
        <div className={styles.headerActions}>
          {canManage ? <a href="/farm/exports/customers">Export customers</a> : null}
          <Link href="/farm">Back to deliveries</Link>
        </div>
      </header>

      {parameters.message ? (
        <p className={styles.notice}>{String(parameters.message)}</p>
      ) : null}
      {parameters.error ? (
        <p className={`${styles.notice} ${styles.error}`} role="alert">
          {String(parameters.error)}
        </p>
      ) : null}

      <section className={styles.summary} aria-label="Customer summary">
        <div><strong>{profiles.length}</strong><span>Customers</span></div>
        <div><strong>{activePlanCount}</strong><span>Active plans</span></div>
        <div><strong>{paidOrderCount}</strong><span>Paid orders</span></div>
        <div><strong>{missingAddressCount}</strong><span>Missing addresses</span></div>
      </section>

      {canManage ? (
        <details className={styles.tools}>
          <summary>Customer file and delivery areas</summary>
          <div className={styles.toolsBody}>
            <section className={styles.importPanel} aria-labelledby="import-title">
              <div className={styles.sectionHeading}>
                <p>Customer file</p>
                <h2 id="import-title">Update profiles from CSV</h2>
              </div>
              <div className={styles.importCopy}>
                <p>
                  Export the list, update existing customer details, and upload it again.
                  New login accounts are never created automatically.
                </p>
                <a href="/farm/exports/customers">Download current customer file</a>
              </div>
              <form action={importCustomerProfiles} className={styles.importForm}>
                <label htmlFor="customer-file">Customer CSV</label>
                <input accept=".csv,text/csv" id="customer-file" name="customerFile" required type="file" />
                <button type="submit">Import customer file</button>
              </form>
              {parameters.importError ? (
                <p className={styles.importError} role="alert">{String(parameters.importError)}</p>
              ) : parameters.imported !== undefined ? (
                <p className={styles.importSuccess} role="status">
                  Updated {String(parameters.imported)} customer
                  {String(parameters.imported) === "1" ? "" : "s"}. Skipped {String(parameters.skipped ?? 0)}.
                </p>
              ) : null}
            </section>

            <section className={styles.setup} aria-labelledby="setup-title">
              <div className={styles.sectionHeading}>
                <p>Delivery grouping</p>
                <h2 id="setup-title">Delivery areas</h2>
              </div>
              <form action={createArea}>
                <label htmlFor="area-name">New delivery area</label>
                <div className={styles.inlineFields}>
                  <input id="area-name" name="name" placeholder="Bistupur" required />
                  <button type="submit">Add area</button>
                </div>
              </form>
            </section>
          </div>
        </details>
      ) : null}

      <section className={styles.customerSection} aria-labelledby="customers-title">
        <div className={styles.sectionHeading}>
          <p>Customer directory</p>
          <h2 id="customers-title">Profiles and orders</h2>
        </div>

        {profiles.length ? (
          <div className={styles.customerList}>
            {profiles.map((profile) => {
              const plan = latestPlanByUser.get(profile.user_id);
              const order = latestOrderByUser.get(profile.user_id);
              const customerOrders = ordersByUser.get(profile.user_id) ?? [];
              const payment = order ? latestPaymentByOrder.get(order.id) : undefined;
              const remainingDeliveries = plan
                ? Math.max(0, Number(plan.purchased_deliveries) - Number(plan.delivered_deliveries))
                : null;
              const orderAmount = order
                ? order.paid_total_paise ?? payment?.amount_paise ?? order.total_paise
                : null;
              const addressForSuggestion = normalizedLocation(
                [profile.address_line, profile.locality].filter(Boolean).join(" "),
              );
              const suggestedArea = !profile.delivery_area_id
                ? areas.find((area) => addressForSuggestion.includes(normalizedLocation(area.name)))
                : null;

              return (
                <article className={styles.customer} key={profile.user_id}>
                  <div className={styles.customerIdentity}>
                    <span className={styles.initial} aria-hidden="true">
                      {(profile.full_name ?? "C").charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <strong>{profile.full_name ?? "Customer"}</strong>
                      <span>{profile.phone ?? "No phone saved"}</span>
                      <span>{profile.email ?? "No email saved"}</span>
                    </div>
                  </div>

                  <div className={styles.addressSummary}>
                    <span>Delivery location</span>
                    <strong>{profile.address_line || "Address not added"}</strong>
                    <small>
                      {[profile.locality, profile.landmark, profile.postal_code].filter(Boolean).join(" · ") ||
                        "Open Edit customer to add the location."
                      }
                    </small>
                    <div className={styles.currentAssignment}>
                      {profile.delivery_area_id ? <span>{areaById.get(profile.delivery_area_id)}</span> : null}
                      {suggestedArea ? <span className={styles.suggestion}>Suggested area: {suggestedArea.name}</span> : null}
                    </div>
                  </div>

                  <section className={styles.planSummary} aria-label={`${profile.full_name ?? "Customer"} order details`}>
                    <div className={styles.planHeading}>
                      <div>
                        <span>Current order</span>
                        <h3>{planLabel(order)}</h3>
                      </div>
                      <span className={`${styles.status} ${order?.status === "paid" ? styles.statusPaid : ""}`}>
                        {order ? titleCase(order.status) : "No order"}
                      </span>
                    </div>

                    {order?.order_items?.length ? (
                      <div className={styles.productList}>
                        {order.order_items.map((item, index) => (
                          <div key={`${order.id}-${item.product_key}-${index}`}>
                            <strong>{productName(item.product_key, item.product_name)}</strong>
                            <span>
                              {quantityLabel(item.quantity, item.unit)} · {item.frequency === "weekly" ? "Scheduled" : "One time"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.noPlan}>No products have been ordered yet.</p>
                    )}

                    {order ? (
                      <dl className={styles.orderFacts}>
                        <div><dt>Order</dt><dd>MMA-{order.id.slice(0, 8).toUpperCase()}</dd></div>
                        <div><dt>Delivery starts</dt><dd>{formatDate(order.start_date)}</dd></div>
                        <div><dt>Amount</dt><dd>{orderAmount === null ? "Not available" : formatCheckoutAmount(orderAmount)}</dd></div>
                        <div><dt>Payment</dt><dd>{order.status === "paid" ? `Paid${payment?.paid_at ? ` · ${formatDate(payment.paid_at)}` : ""}` : titleCase(payment?.status ?? order.status)}</dd></div>
                        {plan ? (
                          <>
                            <div><dt>Plan</dt><dd>{titleCase(plan.status)}</dd></div>
                            <div><dt>Deliveries</dt><dd>{remainingDeliveries} remaining of {plan.purchased_deliveries}</dd></div>
                          </>
                        ) : null}
                        <div><dt>Bottle</dt><dd>{order.bottle_choice === "new" ? "New glass bottle" : order.bottle_choice === "return" ? "Returnable bottle" : "Not required"}</dd></div>
                      </dl>
                    ) : null}
                  </section>

                  {customerOrders.length ? (
                    <details className={styles.orderHistory}>
                      <summary>
                        Order history <span>{customerOrders.length}</span>
                      </summary>
                      <div>
                        {customerOrders.map((historicOrder) => (
                          <article key={historicOrder.id}>
                            <span>
                              <strong>{planLabel(historicOrder)}</strong>
                              <small>
                                {formatDate(historicOrder.created_at)} · MMA-
                                {historicOrder.id.slice(0, 8).toUpperCase()}
                              </small>
                            </span>
                            <span>
                              <b>
                                {formatCheckoutAmount(
                                  historicOrder.paid_total_paise ??
                                    historicOrder.total_paise,
                                )}
                              </b>
                              <small>{titleCase(historicOrder.status)}</small>
                            </span>
                          </article>
                        ))}
                      </div>
                    </details>
                  ) : null}

                  {canManage ? (
                    <details className={styles.editDetails}>
                      <summary>Edit customer</summary>
                      <form action={assignCustomerLocation} className={styles.assignmentForm}>
                        <input name="userId" type="hidden" value={profile.user_id} />
                        <div className={styles.detailFields}>
                          <label><span>Customer name</span><input defaultValue={profile.full_name ?? "Customer"} maxLength={120} name="fullName" required /></label>
                          <label><span>Phone</span><input defaultValue={profile.phone?.replace(/^\+91/, "") ?? ""} inputMode="numeric" maxLength={10} name="phone" placeholder="98765 43210" type="tel" /></label>
                          <label className={styles.addressField}><span>Delivery address</span><textarea defaultValue={profile.address_line ?? ""} maxLength={500} name="address" placeholder="House, street, area and landmark" rows={2} /></label>
                          <label><span>Locality</span><input defaultValue={profile.locality ?? ""} maxLength={120} name="locality" placeholder="Bistupur" /></label>
                          <label><span>Landmark</span><input defaultValue={profile.landmark ?? ""} maxLength={180} name="landmark" placeholder="Near the main road" /></label>
                          <label><span>Postal code</span><input defaultValue={profile.postal_code ?? ""} inputMode="numeric" maxLength={6} name="postalCode" placeholder="831001" /></label>
                        </div>
                        <div className={styles.routeFields}>
                          <label>
                            <span>Area (optional)</span>
                            <select name="areaId" defaultValue={profile.delivery_area_id ?? suggestedArea?.id ?? ""}>
                              <option value="">No area assigned</option>
                              {areas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}
                            </select>
                          </label>
                          <button type="submit">Save customer</button>
                        </div>
                      </form>
                      {canDelete ? (
                        <form action={deleteCustomerProfile} className={styles.dangerZone}>
                          <input name="userId" type="hidden" value={profile.user_id} />
                          <div>
                            <strong>Delete customer profile</strong>
                            <p>
                              Removes the farm profile and delivery details. Payment records remain saved.
                            </p>
                          </div>
                          <label>
                            <input name="confirmDelete" required type="checkbox" value="yes" />
                            <span>I understand this profile will be removed.</span>
                          </label>
                          <button type="submit">Delete profile</button>
                        </form>
                      ) : null}
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>No signed-in customers yet.</div>
        )}
      </section>
    </main>
  );
}
