import type { Metadata } from "next";
import Link from "next/link";
import {
  formatCalendarDate,
  nextDeliveryDateInIndia,
  todayInIndia,
  weekdayFromYmd,
} from "@/lib/delivery-calendar";
import {
  canManageLocations,
  requireFarmManager,
} from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createCustomerProfile,
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
  is_test: boolean;
  purchased_deliveries: number;
  scheduled_delivery_items: DeliveryItem[];
  start_date: string;
  status: string;
  updated_at: string;
  user_id: string;
  weekly_delivery_items: DeliveryItem[];
};

type OrderRow = {
  bottle_choice: "new" | "none" | "return";
  created_at: string;
  delivery_plan_id: string | null;
  id: string;
  is_test: boolean;
  milk_litres: number | string;
  paid_total_paise: number | null;
  purchase_mode: "adjustment" | "once" | "plan";
  start_date: string;
  status: string;
  total_paise: number;
  user_id: string;
};

type CapacityDay = {
  active_plan_quantity: number | string;
  available_quantity: number | string;
  capacity_limit: number | string;
  checkout_holds_quantity: number | string;
  delivery_date: string;
  paid_once_quantity: number | string;
};

function normalizedLocation(value: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function litreLabel(quantity: number | string) {
  const value = Number(quantity);
  return `${Number.isInteger(value) ? value : value.toFixed(1)} L`;
}

function capacityValues(day: CapacityDay | undefined) {
  const limit = Number(day?.capacity_limit ?? 0);
  const confirmed = Number(day?.active_plan_quantity ?? 0) +
    Number(day?.paid_once_quantity ?? 0);
  const held = Number(day?.checkout_holds_quantity ?? 0);
  const percentage = limit > 0 ? Math.round((confirmed / limit) * 100) : 0;

  return {
    confirmed,
    held,
    limit,
    percentage,
    remaining: Number(day?.available_quantity ?? 0),
  };
}

function weeklyMilkByDay(plan: PlanRow | undefined) {
  return new Map(
    (plan?.weekly_delivery_items ?? [])
      .filter((item) => item.product_key === "milk")
      .map((item) => [Number(item.day_of_week), Number(item.quantity)]),
  );
}

type LocationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LocationsPage({ searchParams }: LocationsPageProps) {
  const { role, supabase } = await requireFarmManager("/farm/locations");
  const admin = createAdminClient();
  const parameters = await searchParams;
  const today = todayInIndia();
  const [
    areasResult,
    routesResult,
    profilesResult,
    plansResult,
    ordersResult,
    capacityResult,
  ] =
    await Promise.all([
      supabase
        .from("delivery_areas")
        .select("id, name, active, sort_order")
        .order("sort_order")
        .order("name"),
      supabase
        .from("delivery_routes")
        .select("id, area_id, name, code")
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      supabase
        .from("customer_profiles")
        .select(
          "user_id, full_name, email, phone, address_line, locality, landmark, postal_code, delivery_area_id, delivery_route_id, route_stop_order, delivery_instructions",
        )
        .order("full_name"),
      admin
        .from("delivery_plans")
        .select(
          "id, user_id, status, is_test, start_date, bottle_choice, purchased_deliveries, delivered_deliveries, created_at, updated_at, weekly_delivery_items(day_of_week, product_key, quantity, unit), scheduled_delivery_items(delivery_date, product_key, quantity, unit)",
        )
        .eq("is_test", false)
        .in("status", ["active", "paused"])
        .order("updated_at", { ascending: false }),
      admin
        .from("orders")
        .select(
          "id, user_id, delivery_plan_id, purchase_mode, status, is_test, milk_litres, bottle_choice, total_paise, paid_total_paise, start_date, created_at",
        )
        .eq("is_test", false)
        .eq("status", "paid")
        .order("created_at", { ascending: false }),
      admin.rpc("product_capacity_snapshot", {
        p_days: 8,
        p_product_key: "milk",
        p_start_date: today,
      }),
    ]);

  const databaseError = [
    areasResult.error,
    routesResult.error,
    profilesResult.error,
    plansResult.error,
    ordersResult.error,
  ].find(Boolean);
  if (databaseError) throw databaseError;

  const areas = areasResult.data ?? [];
  const routes = routesResult.data ?? [];
  const profiles = profilesResult.data ?? [];
  const plans = (plansResult.data ?? []) as PlanRow[];
  const orders = (ordersResult.data ?? []) as OrderRow[];
  const capacityDays = capacityResult.error
    ? []
    : ((capacityResult.data ?? []) as CapacityDay[]);
  const areaById = new Map(areas.map((area) => [area.id, area.name]));
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const latestPlanByUser = new Map<string, PlanRow>();
  const latestPaidOrderByUser = new Map<string, OrderRow>();
  const paidOrderCountByUser = new Map<string, number>();
  const planPriority = new Map([
    ["active", 4],
    ["paused", 3],
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
    paidOrderCountByUser.set(order.user_id, (paidOrderCountByUser.get(order.user_id) ?? 0) + 1);
    if (!latestPaidOrderByUser.has(order.user_id)) latestPaidOrderByUser.set(order.user_id, order);
  });

  const canManage = canManageLocations(role);
  const activePlanCount = plans.filter((plan) => plan.status === "active").length;
  const missingAddressCount = profiles.filter((profile) => !profile.address_line).length;
  const activeCustomerIds = new Set(plans.filter((plan) => plan.status === "active").map((plan) => plan.user_id));
  const unroutedCount = profiles.filter((profile) => activeCustomerIds.has(profile.user_id) && !profile.delivery_route_id).length;
  const todayCapacity = capacityValues(capacityDays[0]);
  const tomorrowCapacity = capacityValues(capacityDays[1]);
  const capacityRiskCount = capacityDays.slice(0, 7).filter((day) => {
    const values = capacityValues(day);
    return values.limit > 0 && ((values.confirmed + values.held) / values.limit) >= 0.95;
  }).length;
  const searchQuery = String(
    Array.isArray(parameters.q) ? parameters.q[0] ?? "" : parameters.q ?? "",
  ).trim();
  const filter = String(
    Array.isArray(parameters.filter)
      ? parameters.filter[0] ?? "all"
      : parameters.filter ?? "all",
  );
  const normalizedSearch = normalizedLocation(searchQuery);
  const filteredProfiles = profiles.filter((profile) => {
    const plan = latestPlanByUser.get(profile.user_id);
    const matchesSearch = !normalizedSearch || normalizedLocation([
      profile.full_name,
      profile.phone,
      profile.email,
      profile.address_line,
      profile.locality,
    ].filter(Boolean).join(" ")).includes(normalizedSearch);
    const matchesFilter = filter === "active"
      ? plan?.status === "active" && !plan.is_test
      : filter === "missing"
        ? !profile.phone || !profile.address_line
        : filter === "unrouted"
          ? activeCustomerIds.has(profile.user_id) && !profile.delivery_route_id
          : true;
    return matchesSearch && matchesFilter;
  });
  const nextDeliveryDate = nextDeliveryDateInIndia();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Customer operations</p>
          <h1>Customers</h1>
          <p>Keep profiles, orders, schedules, and delivery readiness under control.</p>
        </div>
        <div className={styles.headerActions}>
          {canManage ? <a className={styles.primaryAction} href="#add-customer">Add customer</a> : null}
          {canManage ? <a href="#import-customers">Import file</a> : null}
          {canManage ? <a href="/farm/exports/customers">Export</a> : null}
          <Link href="/farm/routes">Routes</Link>
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

      <section className={styles.summary} aria-label="Customer overview">
        <article className={styles.meterCard}>
          <div><strong>{todayCapacity.percentage}%</strong><span>Today&apos;s milk capacity</span></div>
          <meter high={95} low={80} min={0} max={100} optimum={0} value={Math.min(todayCapacity.percentage, 100)}>{todayCapacity.percentage}%</meter>
          <small>
            {capacityDays.length
              ? `${litreLabel(todayCapacity.confirmed)} confirmed of ${litreLabel(todayCapacity.limit)} · ${litreLabel(todayCapacity.remaining)} available`
              : "Capacity data needs setup"}
          </small>
          {todayCapacity.held > 0 ? <em>{litreLabel(todayCapacity.held)} temporarily reserved online</em> : null}
        </article>
        <article className={styles.meterCard}>
          <div><strong>{tomorrowCapacity.percentage}%</strong><span>Tomorrow&apos;s milk capacity</span></div>
          <meter high={95} low={80} min={0} max={100} optimum={0} value={Math.min(tomorrowCapacity.percentage, 100)}>{tomorrowCapacity.percentage}%</meter>
          <small>
            {capacityDays.length
              ? `${litreLabel(tomorrowCapacity.confirmed)} confirmed of ${litreLabel(tomorrowCapacity.limit)} · ${litreLabel(tomorrowCapacity.remaining)} available`
              : "Capacity data needs setup"}
          </small>
          {tomorrowCapacity.held > 0 ? <em>{litreLabel(tomorrowCapacity.held)} temporarily reserved online</em> : null}
        </article>
        <article className={styles.statCard}><strong>{unroutedCount}</strong><span>Customers needing a route</span><small>Active paid schedules only</small></article>
        <article className={styles.statCard}><strong>{profiles.length}</strong><span>Customers</span><small>{activePlanCount} active plans</small></article>
      </section>

      <section className={styles.attention} aria-labelledby="attention-title">
        <div className={styles.attentionHeading}>
          <div>
            <p className={styles.eyebrow}>Operator queue</p>
            <h2 id="attention-title">What needs attention</h2>
          </div>
          <Link href="/farm/capacity?product=milk">Open capacity control</Link>
        </div>
        <div className={styles.attentionList}>
          <Link href="/farm/routes"><strong>{unroutedCount}</strong><span>Customers needing a route</span><small>Review only exceptions the automatic rules could not match.</small></Link>
          <Link href="/farm/locations?filter=missing"><strong>{missingAddressCount}</strong><span>Profiles missing an address</span><small>Complete these before routing a delivery.</small></Link>
          <Link href="/farm/capacity?product=milk"><strong>{capacityRiskCount}</strong><span>Capacity-risk days</span><small>At least 95% committed or held in the next seven days.</small></Link>
        </div>
      </section>

      {canManage ? (
        <section className={styles.actionGrid} aria-label="Customer actions">
          <details className={styles.actionPanel} id="add-customer">
            <summary><span>Add customer</span><small>Create a profile manually</small></summary>
            <form action={createCustomerProfile} className={styles.customerForm}>
              <div className={styles.detailFields}>
                <label><span>Customer name</span><input maxLength={120} name="fullName" required /></label>
                <label><span>Phone</span><input inputMode="numeric" maxLength={10} name="phone" placeholder="98765 43210" type="tel" /></label>
                <label><span>Email (optional)</span><input name="email" placeholder="customer@example.com" type="email" /></label>
                <label className={styles.addressField}><span>Delivery address</span><textarea maxLength={500} name="address" required rows={2} /></label>
                <label><span>Locality</span><input maxLength={120} name="locality" placeholder="Bistupur" /></label>
                <label><span>Landmark</span><input maxLength={180} name="landmark" /></label>
                <label><span>Postal code</span><input inputMode="numeric" maxLength={6} name="postalCode" /></label>
                <label><span>Area</span><select name="areaId"><option value="">Assign automatically</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
              </div>
              <button type="submit">Save customer</button>
            </form>
          </details>

          <details className={styles.actionPanel} id="import-customers">
            <summary><span>Import customers</span><small>Excel or CSV · up to 200 rows</small></summary>
            <div className={styles.importBody}>
              <p>Use name, phone or email, address, locality, landmark, postal code, and area columns.</p>
              <form action={importCustomerProfiles} className={styles.importForm}>
                <label htmlFor="customer-file">Excel or CSV file</label>
                <input accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" id="customer-file" name="customerFile" required type="file" />
                <button type="submit">Import customers</button>
              </form>
              {parameters.importError ? (
                <p className={styles.importError} role="alert">{String(parameters.importError)}</p>
              ) : parameters.created !== undefined || parameters.updated !== undefined ? (
                <p className={styles.importSuccess} role="status">
                  Added {String(parameters.created ?? 0)} · Updated {String(parameters.updated ?? 0)} · Skipped {String(parameters.skipped ?? 0)}
                </p>
              ) : null}
            </div>
          </details>

        </section>
      ) : null}

      <section className={styles.customerSection} aria-labelledby="customers-title">
        <div className={styles.directoryHeading}>
          <div className={styles.sectionHeading}>
            <p>Customer directory</p>
            <h2 id="customers-title">Profiles and paid orders</h2>
          </div>
          <span>{filteredProfiles.length} shown</span>
        </div>

        <form className={styles.directoryToolbar} method="get">
          <label><span className={styles.visuallyHidden}>Search customers</span><input defaultValue={searchQuery} name="q" placeholder="Search name, phone, address…" type="search" /></label>
          <label><span className={styles.visuallyHidden}>Filter customers</span><select defaultValue={filter} name="filter"><option value="all">All customers</option><option value="active">Active plans</option><option value="unrouted">Needs route</option><option value="missing">Missing details</option></select></label>
          <button type="submit">Apply</button>
          {searchQuery || filter !== "all" ? <Link href="/farm/locations">Clear</Link> : null}
        </form>

        {filteredProfiles.length ? (
          <div className={styles.customerList}>
            {filteredProfiles.map((profile) => {
              const plan = latestPlanByUser.get(profile.user_id);
              const order = latestPaidOrderByUser.get(profile.user_id);
              const paidOrderCount = paidOrderCountByUser.get(profile.user_id) ?? 0;
              const weeklyMilk = weeklyMilkByDay(plan);
              const addressForSuggestion = normalizedLocation(
                [profile.address_line, profile.locality].filter(Boolean).join(" "),
              );
              const suggestedArea = !profile.delivery_area_id
                ? areas.find((area) => addressForSuggestion.includes(normalizedLocation(area.name)))
                : null;
              const nextMilkQuantity = plan
                ? weeklyMilk.get(weekdayFromYmd(nextDeliveryDate)) ?? 0
                : order?.purchase_mode === "once" && order.start_date === nextDeliveryDate
                  ? Number(order.milk_litres)
                  : 0;
              const route = profile.delivery_route_id
                ? routeById.get(profile.delivery_route_id)
                : undefined;

              return (
                <details className={styles.customer} key={profile.user_id}>
                  <summary className={styles.customerSummary}>
                    <span className={styles.initial} aria-hidden="true">
                      {(profile.full_name ?? "C").charAt(0).toUpperCase()}
                    </span>
                    <Link className={styles.customerIdentity} href={`/farm/customers/${profile.user_id}`}>
                      <strong>{profile.full_name ?? "Customer"}</strong>
                      <span>{profile.phone ?? "No phone saved"} · Open profile</span>
                    </Link>
                    <span className={styles.customerQuickFact}>
                      <small>Location</small>
                      <strong>{profile.locality || areaById.get(profile.delivery_area_id ?? "") || "Not assigned"}</strong>
                    </span>
                    <span className={styles.customerQuickFact}>
                      <small>Paid orders</small>
                      <strong>{paidOrderCount}</strong>
                    </span>
                    <span className={styles.customerStatus}>
                      <small>Next delivery</small>
                      <strong>{nextMilkQuantity > 0 ? `${litreLabel(nextMilkQuantity)} · ${formatCalendarDate(nextDeliveryDate)}` : "Not scheduled tomorrow"}</strong>
                      <b data-state={plan?.status ?? "none"}>{plan?.status === "active" ? route ? "Active · routed" : "Active · needs route" : paidOrderCount ? "Paid customer" : "New customer"}</b>
                    </span>
                    <span className={styles.chevron} aria-hidden="true" />
                  </summary>

                  <div className={styles.customerBody}>
                    <Link className={styles.workspaceLink} href={`/farm/customers/${profile.user_id}`}>
                      <span><strong>Open customer workspace</strong><small>Orders, payments, deliveries, profile and route</small></span>
                      <b aria-hidden="true">→</b>
                    </Link>
                    <div className={styles.profileContact}>
                      <span><small>Phone</small><strong>{profile.phone ?? "No phone saved"}</strong></span>
                      <span><small>Email</small><strong>{profile.email ?? "No email saved"}</strong></span>
                      <span><small>Route</small><strong>{route?.name ?? "Not assigned"}{profile.route_stop_order ? ` · Position ${profile.route_stop_order}` : ""}</strong></span>
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

                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>No customers match this view.</div>
        )}
      </section>
    </main>
  );
}
