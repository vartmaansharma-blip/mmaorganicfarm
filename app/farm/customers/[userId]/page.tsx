import { PrepaidQuantityForm, type EditablePlanDay } from "../prepaid-quantity-form";
import { addCalendarDays } from "@/lib/delivery-calendar";
import { FarmForm } from "../../farm-form";
import { CustomerDeliveryHistory } from "@/app/farm/customer-delivery-history";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import {
  formatCalendarDate,
  nextDeliveryDateInIndia,
  todayInIndia,
  weekdayFromYmd,
} from "@/lib/delivery-calendar";
import { canManageLocations, requireFarmManager } from "@/lib/farm-dashboard";
import { MILK_PLAN_DAYS } from "@/lib/milk-plan";
import { firstScheduledPlanStart } from "@/lib/first-scheduled-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { CustomerRoutingFields } from "../../customer-routing-fields";
import { FormSubmitButton } from "../../form-submit-button";
import {
  assignCustomerLocation,
  deleteCustomerProfile,
  setOrderMode,
} from "../../locations/actions";
import { ManualOrderForm } from "../../locations/manual-order-form";
import styles from "./customer.module.css";

export const metadata: Metadata = {
  title: "Customer profile | Farm operations",
  robots: { index: false, follow: false },
};

type CustomerPageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
};

type OrderItem = {
  frequency: string;
  product_key: string;
  product_name: string;
  quantity: number | string;
  unit: string;
};

type OrderRow = {
  bottle_choice: "new" | "none" | "return";
  created_at: string;
  delivery_plan_id: string | null;
  id: string;
  is_test: boolean;
  order_items: OrderItem[];
  paid_total_paise: number | null;
  purchase_mode: "adjustment" | "once" | "plan";
  start_date: string;
  status: string;
  total_paise: number;
};

type PaymentRow = {
  amount_paise: number;
  created_at: string;
  id: string;
  is_test: boolean;
  order_id: string;
  paid_at: string | null;
  provider: string;
  provider_payment_id: string | null;
  checkout_batch_id: string | null;
  status: string;
};

type PlanItem = {
  day_of_week: number;
  product_key: string;
  quantity: number | string;
};

type PlanRow = {
  delivery_pauses: Array<{start_date:string;end_date:string}>;
  delivery_exceptions: Array<{delivery_date:string;product_key:string;action:string;quantity:number|null}>;
  delivered_deliveries: number;
  id: string;
  is_test: boolean;
  purchased_deliveries: number;
  billing_model: string;
  period_end_exclusive: string | null;
  scheduled_delivery_items: Array<{
    delivery_date: string;
    product_key: string;
    quantity: number;
    unit: string;
  }>;
  start_date: string;
  status: string;
  updated_at: string;
  weekly_delivery_items: PlanItem[];
};

type DeliveryItem = {
  product_key: string;
  quantity: number | string;
  unit: string;
};

type DeliveryRow = {
  completed_at: string | null;
  daily_delivery_items: DeliveryItem[];
  delivery_date: string;
  id: string;
  route_stop_order: number | null;
  status: string;
  visit_key: string;
};

type CapacityDay = {
  available_quantity: number | string;
  delivery_date: string;
};

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00+05:30`));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function orderName(order: OrderRow) {
  if (order.purchase_mode === "plan") return "Scheduled plan";
  if (order.purchase_mode === "adjustment") return "Plan adjustment";
  return "One-time order";
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

export default async function CustomerPage({
  params,
  searchParams,
}: CustomerPageProps) {
  const { userId } = await params;
  const messages = await searchParams;
  const { role, supabase } = await requireFarmManager(
    `/farm/customers/${userId}`,
  );
  const admin = createAdminClient();
  const firstPlanStart = await firstScheduledPlanStart(admin, userId);
  const today = todayInIndia();
  const nextDeliveryDate = nextDeliveryDateInIndia();

  const [
    profileResult,
    areasResult,
    routesResult,
    ordersResult,
    paymentsResult,
    plansResult,
    deliveriesResult,
    capacityResult,
  ] = await Promise.all([
    supabase
      .from("customer_profiles")
      .select(
        "user_id, full_name, email, phone, address_line, locality, landmark, postal_code, delivery_area_id, delivery_route_id, route_stop_order, delivery_instructions, created_at, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("delivery_areas")
      .select("id, name, active, sort_order")
      .order("sort_order")
      .order("name"),
    supabase
      .from("delivery_routes")
      .select("id, area_id, name, code, active, sort_order")
      .eq("active", true)
      .order("sort_order")
      .order("name"),
    admin
      .from("orders")
      .select(
        "id, delivery_plan_id, purchase_mode, status, is_test, bottle_choice, total_paise, paid_total_paise, start_date, created_at, order_items(product_key, product_name, quantity, unit, frequency)",
      )
      .eq("user_id", userId)
      .eq("is_test", false)
      .eq("status", "paid")
      .order("created_at", { ascending: false }),
    role === "admin"
      ? admin
          .from("payments")
          .select(
            "id, order_id, status, is_test, amount_paise, provider, provider_payment_id, checkout_batch_id, paid_at, created_at",
          )
          .eq("user_id", userId)
          .eq("is_test", false)
          .eq("status", "captured")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("delivery_plans")
      .select(
        "id, status, is_test, start_date, billing_model, period_end_exclusive, scheduled_delivery_items(delivery_date,product_key,quantity,unit), delivery_exceptions(delivery_date,product_key,action,quantity), delivery_pauses(start_date,end_date), purchased_deliveries, delivered_deliveries, updated_at, weekly_delivery_items(day_of_week, product_key, quantity)",
      )
      .eq("user_id", userId)
      .eq("is_test", false)
      .in("status", ["active", "paused"])
      .order("updated_at", { ascending: false }),
    supabase
      .from("daily_deliveries")
      .select(
        "id, visit_key, delivery_date, status, completed_at, route_stop_order, daily_delivery_items(product_key, quantity, unit)",
      )
      .eq("user_id", userId)
      .eq("is_test", false)
      .order("delivery_date", { ascending: false })
      .limit(80),
    admin.rpc("product_capacity_snapshot", {
      p_days: 8,
      p_product_key: "milk",
      p_start_date: today,
    }),
  ]);

  const databaseError = [
    profileResult.error,
    areasResult.error,
    routesResult.error,
    ordersResult.error,
    paymentsResult.error,
    plansResult.error,
    deliveriesResult.error,
  ].find(Boolean);
  if (databaseError) throw databaseError;
  if (!profileResult.data) notFound();

  const profile = profileResult.data;
  const areas = areasResult.data ?? [];
  const routes = routesResult.data ?? [];
  const orders = (ordersResult.data ?? []) as OrderRow[];
  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const plans = (plansResult.data ?? []) as PlanRow[];
  const deliveries = (deliveriesResult.data ?? []) as DeliveryRow[];
  const deliveryVisits = [
    ...deliveries
      .reduce((grouped, delivery) => {
        const rows = grouped.get(delivery.visit_key) ?? [];
        grouped.set(delivery.visit_key, [...rows, delivery]);
        return grouped;
      }, new Map<string, DeliveryRow[]>())
      .values(),
  ].map((rows) => {
    const first = rows[0];
    const items = new Map<string, DeliveryItem>();
    rows.forEach((row) =>
      row.daily_delivery_items.forEach((item) => {
        const current = items.get(item.product_key);
        items.set(item.product_key, {
          ...item,
          quantity: Number(current?.quantity ?? 0) + Number(item.quantity),
        });
      }),
    );
    const actionable = rows.filter((row) => row.status !== "cancelled");
    const status =
      actionable.length && actionable.every((row) => row.status === "delivered")
        ? "delivered"
        : rows.every((row) => row.status === "cancelled")
          ? "cancelled"
          : actionable.some((row) => row.status === "failed")
            ? "failed"
            : actionable.some((row) => row.status === "out_for_delivery")
              ? "out_for_delivery"
              : first.status;
    return {
      ...first,
      completed_at:
        rows
          .map((row) => row.completed_at)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
      daily_delivery_items: [...items.values()],
      status,
    };
  });
  const capacityDays = capacityResult.error
    ? []
    : ((capacityResult.data ?? []) as CapacityDay[]);
  const livePayments = payments;
  const combinedIds = [...new Set(livePayments.flatMap((payment) => payment.checkout_batch_id ? [payment.checkout_batch_id] : []))];
  const { data: combinedData } = combinedIds.length
    ? await admin.from("checkout_batches").select("id,provider_payment_id").in("id", combinedIds)
    : { data: [] };
  const combinedReferences = new Map((combinedData ?? []).map((batch) => [batch.id, batch.provider_payment_id]));
  const liveChargeCount = new Set(livePayments.map((payment) => payment.checkout_batch_id ?? payment.id)).size;
  const paidOrders = orders;
  const activePlan =
    plans.find((plan) => plan.status === "active") ??
    plans.find((plan) => plan.status === "paused");
  const editableDays: EditablePlanDay[] = [];
  if(activePlan?.status === "active") {
    const end = activePlan.billing_model === "calendar_month" ? activePlan.period_end_exclusive! : addCalendarDays(nextDeliveryDate,31);
    for(let date = nextDeliveryDate > activePlan.start_date ? nextDeliveryDate : activePlan.start_date; date < end; date=addCalendarDays(date,1)) {
      if(activePlan.delivery_pauses.some(pause => date >= pause.start_date && date <= pause.end_date)) continue;
      const quantities = {date,milk:0,paneer:0,ghee:0};
      for(const product of ["milk","paneer","ghee"] as const) {
        const exception = activePlan.delivery_exceptions.find(e=>e.delivery_date===date && e.product_key===product);
        const scheduled = activePlan.scheduled_delivery_items.find(i=>i.delivery_date===date && i.product_key===product);
        const weekly = activePlan.weekly_delivery_items.find(i=>i.day_of_week===weekdayFromYmd(date) && i.product_key===product);
        quantities[product] = exception?.action === "skip" ? 0 : Number(exception?.quantity ?? scheduled?.quantity ?? (activePlan.billing_model === "calendar_month" ? 0 : weekly?.quantity) ?? 0);
      }
      editableDays.push(quantities);
    }
  }
  const {data: customerChanges} = await supabase.from("farm_change_log").select("id,record_type,action,reason,created_at").in("record_type",["customer","plan"]).in("record_id",[userId,...(activePlan ? [activePlan.id] : [])]).order("created_at",{ascending:false}).limit(20);
  const area = areas.find(
    (candidate) => candidate.id === profile.delivery_area_id,
  );
  const route = routes.find(
    (candidate) => candidate.id === profile.delivery_route_id,
  );
  const paymentTotals = new Map<string, number>();
  livePayments
    .filter((payment) => payment.status === "captured")
    .forEach((payment) => {
      paymentTotals.set(
        payment.order_id,
        (paymentTotals.get(payment.order_id) ?? 0) +
          Number(payment.amount_paise),
      );
    });
  const receivedForOrder = (order: OrderRow) =>
    Math.max(
      paymentTotals.get(order.id) ?? 0,
      Number(order.paid_total_paise ?? 0),
      order.status === "paid" ? Number(order.total_paise) : 0,
    );
  const lifetimePaid = paidOrders.reduce(
    (sum, order) => sum + receivedForOrder(order),
    0,
  );
  const completedDeliveries = deliveryVisits.filter(
    (delivery) => delivery.status === "delivered",
  ).length;
  const failedDeliveries = deliveryVisits.filter(
    (delivery) => delivery.status === "failed",
  ).length;
  const upcomingDeliveries = deliveryVisits
    .filter(
      (delivery) =>
        delivery.delivery_date >= today &&
        !["cancelled", "delivered", "failed"].includes(delivery.status),
    )
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
  const nextPlannedDay = editableDays.find(day => day.milk+day.paneer+day.ghee>0);
  const nextDelivery = upcomingDeliveries[0] && (!nextPlannedDay || upcomingDeliveries[0].delivery_date <= nextPlannedDay.date) ? upcomingDeliveries[0] : undefined;
  const nextPlanSummary = nextPlannedDay ? (["milk","paneer","ghee"] as const).filter(p=>nextPlannedDay[p]>0).map(p=>`${nextPlannedDay[p]} ${p === "milk" ? "L milk" : `${p} pack${nextPlannedDay[p]===1 ? "" : "s"}`}`).join(" · ") : "";
  const weeklyMilk = new Map<number, number>();
  plans.forEach((plan) =>
    plan.weekly_delivery_items
      .filter((item) => item.product_key === "milk")
      .forEach((item) =>
        weeklyMilk.set(
          Number(item.day_of_week),
          (weeklyMilk.get(Number(item.day_of_week)) ?? 0) +
            Number(item.quantity),
        ),
      ),
  );
  const monthlyDates = plans
    .filter((p) => p.billing_model === "calendar_month")
    .flatMap((p) => p.scheduled_delivery_items)
    .filter((i) => i.delivery_date >= nextDeliveryDate)
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
  const nextDeliveryLabel = nextDelivery ? formatCalendarDate(nextDelivery.delivery_date) : nextPlannedDay ? formatCalendarDate(nextPlannedDay.date) : "Not scheduled";
  const purchasedDeliveries = plans.reduce(
    (sum, plan) => sum + Number(plan.purchased_deliveries),
    0,
  );
  const deliveredDeliveries = plans.reduce(
    (sum, plan) => sum + Number(plan.delivered_deliveries),
    0,
  );
  const remainingDeliveries = Math.max(
    0,
    purchasedDeliveries - deliveredDeliveries,
  );
  const accountState =
    activePlan?.status === "active"
      ? "Active customer"
      : paidOrders.length
        ? "Paid customer"
        : "New customer";
  const upcomingVisits = deliveryVisits.filter(
    (visit) =>
      visit.delivery_date >= today &&
      ["planned", "ready", "out_for_delivery"].includes(visit.status),
  );
  const canManage = canManageLocations(role);
  const canDelete = role === "admin";
  const returnTo = `/farm/customers/${userId}`;

  return (
    <main className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link prefetch={false} href="/farm/locations">Customers</Link>
        <span>/</span>
        <span>{profile.full_name ?? "Customer"}</span>
      </nav>

      <header className={styles.hero}>
        <div className={styles.identity}>
          <span className={styles.avatar} aria-hidden="true">
            {(profile.full_name ?? "C").charAt(0).toUpperCase()}
          </span>
          <div>
            <span className={styles.eyebrow}>Customer account</span>
            <h1>{profile.full_name ?? "Customer"}</h1>
            <p>
              {profile.phone ?? profile.email ?? "Contact information required"}{" "}
              <b data-state={accountState}>{accountState}</b>
            </p>
          </div>
        </div>
        <div className={styles.heroActions}>
          {profile.phone ? (
            <a href={`tel:${profile.phone}`}>Call customer</a>
          ) : null}
          <a className={styles.primaryAction} href="#new-order">
            Record paid order
          </a>
        </div>
      </header>

      {messages.message ? (
        <p className={styles.notice}>{messages.message}</p>
      ) : null}
      {messages.error ? (
        <p className={`${styles.notice} ${styles.error}`} role="alert">
          {messages.error}
        </p>
      ) : null}

      <nav className={styles.tabs} aria-label="Customer sections">
        <a href="#overview">Overview</a>
        <a href="#orders">
          Paid orders <span>{paidOrders.length}</span>
        </a>
        {role === "admin" ? (
          <a href="#payments">
            Payments <span>{liveChargeCount}</span>
          </a>
        ) : null}
        <a href="#delivery-outcomes">Delivery outcomes</a>
        <a href="#deliveries">
          Upcoming visits <span>{upcomingVisits.length}</span>
        </a>
        <a href="#profile">Customer details</a>
      </nav>

      <section
        className={styles.metrics}
        id="overview"
        aria-label="Customer overview"
      >
        <article>
          <span>Paid orders</span>
          <strong>{paidOrders.length}</strong>
          <small>Completed live purchases only</small>
        </article>
        {role === "admin" ? (
          <article>
            <span>Lifetime paid</span>
            <strong>{formatCheckoutAmount(lifetimePaid)}</strong>
            <small>From paid live orders</small>
          </article>
        ) : null}
        <article>
          <span>Next delivery</span>
          <strong>{nextDeliveryLabel}</strong>
          <small>
            {nextDelivery
              ? titleCase(nextDelivery.status)
              : nextPlannedDay
                ? `${nextPlanSummary} planned`
                : "No quantity due"}
          </small>
        </article>
        <article>
          <span>Delivery route</span>
          <strong>{route?.name ?? "Needs route"}</strong>
          <small>
            {profile.route_stop_order
              ? `Stop ${profile.route_stop_order}`
              : (area?.name ?? "Assign from Routes")}
          </small>
        </article>
      </section>

      <section className={styles.splitGrid}>
        <article className={styles.card}>
          <div className={styles.cardHeading}>
            <div>
              <span>Current service</span>
              <h2>
                {activePlan
                  ? `${plans.length} paid ${plans.length === 1 ? "plan" : "plans"}`
                  : "No active plan"}
              </h2>
            </div>
            <b data-state={activePlan?.status ?? "none"}>
              {activePlan ? titleCase(activePlan.status) : "Not active"}
            </b>
          </div>
          {activePlan ? (
            <>
              {activePlan.billing_model === "calendar_month" ? (
                <div className={styles.planProgress}>
                  <strong>Prepaid calendar month</strong>
                  <small>
                    {formatCalendarDate(activePlan.start_date)} to{" "}
                    {formatCalendarDate(activePlan.period_end_exclusive!)} (end
                    excluded)
                  </small>
                  <p>
                    {monthlyDates
                      .slice(0, 4)
                      .map(
                        (i) =>
                          `${i.delivery_date}: ${i.product_key} ${i.quantity} ${i.unit}`,
                      )
                      .join(" · ") || "No remaining dated items"}
                  </p>
                </div>
              ) : (
                <>
                  <div className={styles.planProgress}>
                    <div>
                      <strong>{remainingDeliveries}</strong>
                      <span>deliveries remaining</span>
                    </div>
                    <meter
                      min={0}
                      max={purchasedDeliveries}
                      value={deliveredDeliveries}
                    >
                      {deliveredDeliveries}
                    </meter>
                    <small>
                      {deliveredDeliveries} completed of {purchasedDeliveries}{" "}
                      across all paid plans
                    </small>
                  </div>
                  <div className={styles.weekSchedule}>
                    {MILK_PLAN_DAYS.map((day, index) => (
                      <span key={day.short}>
                        <small>{day.short}</small>
                        <strong>
                          {weeklyMilk.get(index + 1)
                            ? `${weeklyMilk.get(index + 1)} L`
                            : "—"}
                        </strong>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <p className={styles.emptyText}>
              Record a new order to start service for this customer.
            </p>
          )}
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeading}>
            <div>
              <span>Fulfilment</span>
              <h2>Delivery performance</h2>
            </div>
          </div>
          <div className={styles.deliveryStats}>
            <div>
              <strong>{completedDeliveries}</strong>
              <span>Completed</span>
            </div>
            <div>
              <strong>{failedDeliveries}</strong>
              <span>Failed</span>
            </div>
            <div>
              <strong>{upcomingDeliveries.length}</strong>
              <span>Upcoming</span>
            </div>
          </div>
          <dl className={styles.serviceFacts}>
            <div>
              <dt>Area</dt>
              <dd>{area?.name ?? "Not assigned"}</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>{route?.name ?? "Not assigned"}</dd>
            </div>
            <div>
              <dt>Stop position</dt>
              <dd>{profile.route_stop_order ?? "Not assigned"}</dd>
            </div>
            <div>
              <dt>Instructions</dt>
              <dd>{profile.delivery_instructions || "None saved"}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className={styles.section} id="orders">
        <div className={styles.sectionHeading}>
          <div>
            <span>Commercial history</span>
            <h2>Paid orders</h2>
            <p>Only confirmed live purchases are counted as orders.</p>
          </div>
          <a href="#new-order">Record paid order</a>
        </div>
        {paidOrders.length ? (
          <details className={styles.disclosure} open>
            <summary>
              <span>
                <strong>Paid order history</strong>
                <small>
                  {paidOrders.length} order{paidOrders.length === 1 ? "" : "s"}{" "}
                  · newest first
                </small>
              </span>
              <b aria-hidden="true">⌄</b>
            </summary>
            <div className={styles.recordList}>
              {paidOrders.map((order) => {
                const received = receivedForOrder(order);
                return (
                  <article key={order.id}>
                    <div className={styles.recordTop}>
                      <div>
                        <strong>{orderName(order)}</strong>
                        <small>
                          MMA-{order.id.slice(0, 8).toUpperCase()} ·{" "}
                          {formatDate(order.created_at)}
                        </small>
                      </div>
                      <b data-state={order.status}>Paid</b>
                    </div>
                    <div className={styles.itemList}>
                      {order.order_items?.map((item, index) => (
                        <span key={`${order.id}-${item.product_key}-${index}`}>
                          <strong>
                            {productName(item.product_key, item.product_name)}
                          </strong>
                          <small>
                            {quantityLabel(item.quantity, item.unit)} ·{" "}
                            {item.frequency === "weekly"
                              ? "Scheduled"
                              : "One time"}
                          </small>
                        </span>
                      ))}
                    </div>
                    <dl className={styles.orderMoney}>
                      <div>
                        <dt>Total</dt>
                        <dd>{formatCheckoutAmount(order.total_paise)}</dd>
                      </div>
                      <div>
                        <dt>Received</dt>
                        <dd>{formatCheckoutAmount(received)}</dd>
                      </div>
                      <div>
                        <dt>Purchase</dt>
                        <dd>{titleCase(order.purchase_mode)}</dd>
                      </div>
                      <div>
                        <dt>Starts</dt>
                        <dd>{formatDate(order.start_date)}</dd>
                      </div>
                    </dl>
                    {canDelete ? (
                      <FarmForm action={setOrderMode} className={styles.inlineForm}>
                        <input name="orderId" type="hidden" value={order.id} />
                        <input name="userId" type="hidden" value={userId} />
                        <input name="returnTo" type="hidden" value={returnTo} />
                        <input name="mode" type="hidden" value="test" />
                        <button type="submit">Move to test records</button>
                      </FarmForm>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </details>
        ) : (
          <div className={styles.empty}>
            <strong>No paid orders yet</strong>
            <span>
              A purchase appears here only after payment is confirmed.
            </span>
          </div>
        )}
      </section>

      {role === "admin" ? (
        <section className={styles.section} id="payments">
          <div className={styles.sectionHeading}>
            <div>
              <span>Finance ledger</span>
              <h2>Payments</h2>
            </div>
            <Link prefetch={false} href={`/farm/payments?customer=${userId}`}>
              Open finance view
            </Link>
          </div>
          {livePayments.length ? (
            <details className={styles.disclosure}>
              <summary>
                <span>
                  <strong>View payment ledger</strong>
                  <small>
                    {liveChargeCount} live transaction
                    {liveChargeCount === 1 ? "" : "s"} · newest first
                  </small>
                </span>
                <b aria-hidden="true">⌄</b>
              </summary>
              <div
                className={styles.paymentTable}
                role="table"
                aria-label="Customer payments"
              >
                <div className={styles.tableHeader} role="row">
                  <span>Date</span>
                  <span>Order</span>
                  <span>Reference</span>
                  <span>Status</span>
                  <span>Amount</span>
                </div>
                {livePayments.map((payment) => (
                  <div className={styles.tableRow} role="row" key={payment.id}>
                    <span data-label="Date">
                      {formatDateTime(payment.paid_at ?? payment.created_at)}
                    </span>
                    <span data-label="Order">
                      MMA-{payment.order_id.slice(0, 8).toUpperCase()}
                    </span>
                    <span data-label="Reference">
                      {payment.provider_payment_id ??
                        (payment.checkout_batch_id ? combinedReferences.get(payment.checkout_batch_id) : null) ??
                        titleCase(payment.provider)}
                    </span>
                    <span data-label="Status">
                      <b data-state={payment.status}>
                        {titleCase(payment.status)}
                      </b>
                    </span>
                    <strong data-label="Amount">
                      {formatCheckoutAmount(payment.amount_paise)}
                    </strong>
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <div className={styles.empty}>
              No payment records for this customer.
            </div>
          )}
        </section>
      ) : null}

      <CustomerDeliveryHistory userId={userId} />

      <section className={styles.section} id="deliveries">
        <div className={styles.sectionHeading}>
          <div>
            <span>Service timeline</span>
            <h2>Upcoming deliveries</h2>
          </div>
          <Link prefetch={false} href="/farm/delivery-sheet">Open delivery sheet</Link>
        </div>
        {upcomingVisits.length ? (
          <details className={styles.disclosure}>
            <summary>
              <span>
                <strong>View upcoming delivery timeline</strong>
                <small>
                  {upcomingVisits.length} doorstep visits · newest first
                </small>
              </span>
              <b aria-hidden="true">⌄</b>
            </summary>
            <div className={styles.deliveryTimeline}>
              {upcomingVisits.map((delivery) => (
                <article key={delivery.visit_key}>
                  <span
                    className={styles.timelineMark}
                    data-state={delivery.status}
                  />
                  <div>
                    <strong>
                      {formatCalendarDate(delivery.delivery_date)}
                    </strong>
                    <small>
                      {delivery.daily_delivery_items
                        .map(
                          (item) =>
                            `${productName(item.product_key)} ${quantityLabel(item.quantity, item.unit)}`,
                        )
                        .join(" · ") || "No items recorded"}
                    </small>
                  </div>
                  <div>
                    <b data-state={delivery.status}>
                      {titleCase(delivery.status)}
                    </b>
                    <small>
                      {delivery.completed_at
                        ? formatDateTime(delivery.completed_at)
                        : delivery.route_stop_order
                          ? `Route stop ${delivery.route_stop_order}`
                          : "Awaiting route position"}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          </details>
        ) : (
          <div className={styles.empty}>
            No generated deliveries for this customer yet.
          </div>
        )}
      </section>

      {canManage ? (
        <section className={styles.section} id="profile">
          <div className={styles.sectionHeading}>
            <div>
              <span>Customer record</span>
              <h2>Contact and delivery details</h2>
              <p>
                Keep the information needed for billing, routing, and fulfilment
                in one place.
              </p>
            </div>
          </div>
          <div className={styles.profileBlock}>
            <div className={styles.profileSnapshot}>
              <span>
                <small>Contact</small>
                <strong>{profile.phone ?? "No phone"}</strong>
                <em>{profile.email ?? "No email"}</em>
              </span>
              <span>
                <small>Delivery address</small>
                <strong>{profile.address_line || "Address required"}</strong>
                <em>
                  {[profile.locality, profile.landmark, profile.postal_code]
                    .filter(Boolean)
                    .join(" · ") || "No address details"}
                </em>
              </span>
              <span>
                <small>Route position</small>
                <strong>{route?.name ?? "No route assigned"}</strong>
                <em>
                  {area?.name ?? "No area"}
                  {profile.route_stop_order
                    ? ` · Stop ${profile.route_stop_order}`
                    : ""}
                </em>
              </span>
              <span>
                <small>Instructions</small>
                <strong>
                  {profile.delivery_instructions || "No special instructions"}
                </strong>
              </span>
            </div>
            <details className={styles.profileEditor}>
              <summary>Edit customer</summary>
              <FarmForm
                action={assignCustomerLocation}
                className={styles.profileForm}
              >
                <input name="userId" type="hidden" value={userId} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <label>
                  <span>Customer name</span>
                  <input
                    defaultValue={profile.full_name ?? "Customer"}
                    maxLength={120}
                    name="fullName"
                    required
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <input
                    defaultValue={profile.phone?.replace(/^\+91/, "") ?? ""}
                    inputMode="numeric"
                    maxLength={10}
                    name="phone"
                    type="tel"
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    defaultValue={profile.email ?? ""}
                    name="email"
                    type="email"
                  />
                </label>
                <label className={styles.wideField}>
                  <span>Delivery address</span>
                  <textarea
                    defaultValue={profile.address_line ?? ""}
                    maxLength={500}
                    name="address"
                    rows={2}
                  />
                </label>
                <label>
                  <span>Locality</span>
                  <input
                    defaultValue={profile.locality ?? ""}
                    maxLength={120}
                    name="locality"
                  />
                </label>
                <label>
                  <span>Landmark</span>
                  <input
                    defaultValue={profile.landmark ?? ""}
                    maxLength={180}
                    name="landmark"
                  />
                </label>
                <label>
                  <span>Postal code</span>
                  <input
                    defaultValue={profile.postal_code ?? ""}
                    inputMode="numeric"
                    maxLength={6}
                    name="postalCode"
                  />
                </label>
                <CustomerRoutingFields
                  areas={areas.map((candidate) => ({
                    id: candidate.id,
                    name: candidate.name,
                  }))}
                  initialAreaId={profile.delivery_area_id ?? ""}
                  initialRouteId={profile.delivery_route_id ?? ""}
                  initialStopOrder={profile.route_stop_order}
                  routes={routes.map((routeOption) => ({
                    areaId: routeOption.area_id,
                    code: routeOption.code,
                    id: routeOption.id,
                    name: routeOption.name,
                  }))}
                />
                <label className={styles.wideField}>
                  <span>Delivery instructions</span>
                  <textarea
                    defaultValue={profile.delivery_instructions ?? ""}
                    maxLength={500}
                    name="deliveryInstructions"
                    placeholder="Gate, floor, preferred handover point…"
                    rows={2}
                  />
                </label>
                <div className={styles.formActions}>
                  <p>
                    Choose automatic routing or select a route inside the chosen
                    area.
                  </p>
                  <FormSubmitButton pendingLabel="Saving customer…">
                    Save changes
                  </FormSubmitButton>
                </div>
              </FarmForm>
              {canDelete ? (
                <details className={styles.dangerZone}>
                  <summary>More account actions</summary>
                  <FarmForm action={deleteCustomerProfile}>
                    <input name="userId" type="hidden" value={userId} />
                    <div>
                      <strong>Delete customer profile</strong>
                      <p>
                        Payment and historical order records remain retained.
                      </p>
                    </div>
                    <label>
                      <input
                        name="confirmDelete"
                        required
                        type="checkbox"
                        value="yes"
                      />{" "}
                      I understand this removes the active profile.
                    </label>
                    <button type="submit">Delete profile</button>
                  </FarmForm>
                </details>
              ) : null}
            </details>
          </div>
        </section>
      ) : null}

      {canManage && activePlan?.status === "active" ? <section className={styles.section} id="quantity-editor"><div className={styles.sectionHeading}><div><span>Delivery flexibility</span><h2>Edit prepaid quantities</h2><p>Keep purchased quantities intact while adapting future delivery dates.</p></div></div><PrepaidQuantityForm planId={activePlan.id} userId={userId} monthly={activePlan.billing_model === "calendar_month"} days={editableDays}/></section> : null}
      {customerChanges?.length ? <section className={styles.section}><details><summary>Customer and schedule edit history · {customerChanges.length}</summary>{customerChanges.map(change=><p key={change.id}><strong>{change.reason}</strong><br/><small>{formatDateTime(change.created_at)}</small></p>)}</details></section> : null}
      {canManage ? (
        <section className={styles.section} id="new-order">
          <div className={styles.sectionHeading}>
            <div>
              <span>Farm-assisted purchase</span>
              <h2>Record a paid customer order</h2>
              <p>
                Use this only after the farm has received payment from the
                customer.
              </p>
            </div>
          </div>
          <ManualOrderForm
            firstPlanStart={firstPlanStart}
            capacityDays={capacityDays}
            customerName={profile.full_name ?? "Customer"}
            minimumStartDate={nextDeliveryDate}
            profileReady={Boolean(profile.phone && profile.address_line)}
            returnTo={returnTo}
            userId={userId}
          />
        </section>
      ) : null}
    </main>
  );
}
