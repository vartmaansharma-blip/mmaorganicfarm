import type { Metadata } from "next";
import Link from "next/link";
import {
  formatCalendarDate,
  productName,
  todayInIndia,
} from "@/lib/delivery-calendar";
import { resolveDeliveryArea } from "@/lib/delivery-area";
import { canManageLocations, requireFarmStaff } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assignRouteDriver,
  prepareDailyDispatch,
  recordDeliveryStop,
  releaseDailyDispatch,
  reopenDailyDispatch,
} from "./actions";
import { PrintSheetButton } from "./print-button";
import styles from "./sheet.module.css";

export const metadata: Metadata = {
  title: "Delivery routes",
  robots: { index: false, follow: false },
};

type DeliveryItem = {
  product_key: string;
  quantity: number;
  unit: string;
};

type DeliveryRow = {
  address_snapshot: string | null;
  assigned_driver_id: string | null;
  bottle_choice: "new" | "none" | "return";
  bottle_return_required: boolean;
  bottle_returned: boolean;
  customer_name: string;
  daily_delivery_items: DeliveryItem[];
  delivery_area_id: string | null;
  delivery_confirmed: boolean;
  delivery_route_id: string | null;
  driver_note: string | null;
  id: string;
  order_id: string | null;
  plan_id: string | null;
  phone_snapshot: string | null;
  route_stop_order: number | null;
  status: string;
  user_id: string;
  visit_key: string;
};

type DeliveryVisit = DeliveryRow & {
  bottlesExpected: number;
  bottlesReturned: number;
  deliveryIds: string[];
  oneTimeOrderLines: number;
  planLines: number;
};

type RouteRow = {
  area_id: string;
  id: string;
  name: string;
  stop_capacity: number;
};

type DailyAssignmentRow = {
  driver_id: string;
  route_id: string;
  source: "default" | "override";
};

type DispatchRow = {
  released_at: string | null;
  status: "draft" | "released";
};

type StaffRow = {
  role: "admin" | "driver" | "manager";
  user_id: string;
};

type RouteGroup = {
  assignmentSource: "default" | "override";
  assignedDriverId: string | null;
  name: string;
  routeId: string | null;
  stopCapacity: number;
  stops: DeliveryVisit[];
};

function validDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function quantityLabel(item: DeliveryItem) {
  const quantity = Number(item.quantity);
  return /^1\s/.test(item.unit)
    ? `${quantity} × ${item.unit}`
    : `${quantity} ${item.unit}${quantity === 1 ? "" : "s"}`;
}

function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function phoneUrl(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

function statusLabel(stop: DeliveryRow) {
  if (stop.delivery_confirmed || stop.status === "delivered") return "Delivered";
  if (stop.status === "failed") return "Not delivered";
  if (stop.status === "cancelled") return "Cancelled";
  if (stop.status === "out_for_delivery") return "On route";
  return "Pending";
}

function routeLoadLabel(stops: DeliveryRow[]) {
  const routeTotals = new Map<string, number>();
  stops.forEach((stop) => {
    (stop.daily_delivery_items ?? []).forEach((item) => {
      routeTotals.set(
        item.product_key,
        (routeTotals.get(item.product_key) ?? 0) + Number(item.quantity),
      );
    });
  });
  return [...routeTotals]
    .map(([productKey, quantity]) => `${productName(productKey)} ${quantity}`)
    .join(" · ");
}

function combineCustomerVisits(stops: DeliveryRow[]): DeliveryVisit[] {
  const grouped = new Map<string, DeliveryRow[]>();
  stops.forEach((stop) => {
    grouped.set(stop.visit_key, [...(grouped.get(stop.visit_key) ?? []), stop]);
  });

  return [...grouped.values()].map((rows) => {
    const first = rows[0];
    const items = new Map<string, DeliveryItem>();
    rows.forEach((row) => row.daily_delivery_items.forEach((item) => {
      const current = items.get(item.product_key);
      items.set(item.product_key, {
        ...item,
        quantity: Number(current?.quantity ?? 0) + Number(item.quantity),
      });
    }));
    const actionableRows = rows.filter((row) => row.status !== "cancelled");
    const delivered = actionableRows.length > 0 && actionableRows.every(
      (row) => row.delivery_confirmed || row.status === "delivered",
    );
    const cancelled = rows.every((row) => row.status === "cancelled");
    const failed = actionableRows.some((row) => row.status === "failed");
    const onRoute = rows.some((row) => row.status === "out_for_delivery");
    const bottlesExpected = actionableRows.filter((row) => row.bottle_return_required).length;
    const bottlesReturned = rows.filter(
      (row) => row.status !== "cancelled" && row.bottle_return_required && row.bottle_returned,
    ).length;
    return {
      ...first,
      bottle_return_required: bottlesExpected > 0,
      bottle_returned: bottlesExpected === bottlesReturned,
      bottlesExpected,
      bottlesReturned,
      daily_delivery_items: [...items.values()],
      delivery_confirmed: delivered,
      deliveryIds: rows.map((row) => row.id),
      driver_note: [...new Set(rows.map((row) => row.driver_note).filter(Boolean))].join(" · ") || null,
      oneTimeOrderLines: rows.filter((row) => row.order_id).length,
      planLines: rows.filter((row) => row.plan_id).length,
      status: delivered ? "delivered" : cancelled ? "cancelled" : failed ? "failed" : onRoute ? "out_for_delivery" : first.status,
    };
  });
}

export default async function DeliverySheetPage({
  searchParams,
}: {
  searchParams: Promise<{
    area?: string;
    date?: string;
    error?: string;
    message?: string;
  }>;
}) {
  const { role, supabase, user } = await requireFarmStaff("/farm/delivery-sheet");
  const params = await searchParams;
  const admin = createAdminClient();
  const deliveryDate = validDate(params.date) ?? todayInIndia();
  const selectedArea = params.area ?? "";
  const managerView = canManageLocations(role);

  let deliveriesQuery = supabase
    .from("daily_deliveries")
    .select(
      "id, user_id, plan_id, order_id, visit_key, status, customer_name, phone_snapshot, address_snapshot, bottle_choice, delivery_area_id, delivery_route_id, assigned_driver_id, route_stop_order, delivery_confirmed, bottle_return_required, bottle_returned, driver_note, daily_delivery_items(product_key, quantity, unit)",
    )
    .eq("delivery_date", deliveryDate)
    .eq("is_test", false);

  if (role === "driver") {
    deliveriesQuery = deliveriesQuery.eq("assigned_driver_id", user.id);
  }

  const [deliveriesResult, areasResult, routesResult, staffResult, assignmentsResult, dailyAssignmentsResult, dispatchResult] =
    await Promise.all([
      deliveriesQuery,
      supabase
        .from("delivery_areas")
        .select("id, name, active, sort_order")
        .order("sort_order")
        .order("name"),
      supabase
        .from("delivery_routes")
        .select("id, area_id, name, active, sort_order, stop_capacity")
        .order("sort_order")
        .order("name"),
      admin
        .from("farm_staff")
        .select("user_id, role")
        .eq("active", true)
        .eq("role", "driver"),
      supabase
        .from("route_driver_assignments")
        .select("route_id, driver_id"),
      supabase
        .from("daily_route_assignments")
        .select("route_id, driver_id, source")
        .eq("delivery_date", deliveryDate),
      supabase
        .from("delivery_dispatches")
        .select("status, released_at")
        .eq("delivery_date", deliveryDate)
        .maybeSingle(),
    ]);

  const databaseError = [
    deliveriesResult.error,
    areasResult.error,
    routesResult.error,
    staffResult.error,
    assignmentsResult.error,
    dailyAssignmentsResult.error,
    dispatchResult.error,
  ].find(Boolean);
  if (databaseError) throw databaseError;

  const staff = (staffResult.data ?? []) as StaffRow[];
  const staffIds = staff.map((person) => person.user_id);
  const profilesResult = staffIds.length
    ? await supabase
        .from("customer_profiles")
        .select("user_id, full_name")
        .in("user_id", staffIds)
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;

  const staffNames = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.user_id,
      profile.full_name || "Farm staff",
    ]),
  );
  const driverLabel = (driverId: string | null) => {
    if (!driverId) return "Not assigned";
    const person = staff.find((candidate) => candidate.user_id === driverId);
    const name = staffNames.get(driverId) ?? "Farm staff";
    return person ? `${name} · ${person.role}` : name;
  };

  const deliveryAreas = areasResult.data ?? [];
  const routes = (routesResult.data ?? []) as RouteRow[];
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const defaultAssignmentByRoute = new Map(
    (assignmentsResult.data ?? []).map((assignment) => [
      assignment.route_id,
      assignment.driver_id,
    ]),
  );
  const dailyAssignmentByRoute = new Map(
    ((dailyAssignmentsResult.data ?? []) as DailyAssignmentRow[]).map((assignment) => [
      assignment.route_id,
      assignment,
    ]),
  );
  const dispatch = (dispatchResult.data ?? null) as DispatchRow | null;
  const allDeliveries = (deliveriesResult.data ?? []) as DeliveryRow[];
  const deliveries = allDeliveries.filter(
    (delivery) =>
      !selectedArea ||
      resolveDeliveryArea(
        delivery.delivery_area_id,
        delivery.address_snapshot,
        deliveryAreas,
      )?.id === selectedArea,
  );

  const grouped = new Map<string, Map<string, RouteGroup>>();
  const totals = new Map<string, number>();
  const visits = combineCustomerVisits(deliveries);

  visits.forEach((delivery) => {
    const areaName =
      resolveDeliveryArea(
        delivery.delivery_area_id,
        delivery.address_snapshot,
        deliveryAreas,
      )?.name ?? "Address needs checking";
    const route = delivery.delivery_route_id
      ? routeById.get(delivery.delivery_route_id)
      : null;
    const routeKey = route?.id ?? "unassigned";
    const dailyAssignment = route ? dailyAssignmentByRoute.get(route.id) : null;
    const areaRoutes = grouped.get(areaName) ?? new Map<string, RouteGroup>();
    const routeGroup: RouteGroup = areaRoutes.get(routeKey) ?? {
      assignmentSource: dailyAssignment?.source ?? "default",
      assignedDriverId:
        dailyAssignment?.driver_id ??
        delivery.assigned_driver_id ??
        (route ? defaultAssignmentByRoute.get(route.id) ?? null : null),
      name: route?.name ?? "Route not assigned",
      routeId: route?.id ?? null,
      stopCapacity: route?.stop_capacity ?? 1,
      stops: [],
    };
    routeGroup.stops.push(delivery);
    if (!routeGroup.assignedDriverId && delivery.assigned_driver_id) {
      routeGroup.assignedDriverId = delivery.assigned_driver_id;
    }
    areaRoutes.set(routeKey, routeGroup);
    grouped.set(areaName, areaRoutes);

  });

  deliveries.forEach((delivery) => {
    (delivery.daily_delivery_items ?? []).forEach((item) => {
      totals.set(
        item.product_key,
        (totals.get(item.product_key) ?? 0) + Number(item.quantity),
      );
    });
  });

  const areas = [...grouped.entries()]
    .map(([name, routeMap]) => ({
      name,
      routes: [...routeMap.values()]
        .map((route) => ({
          ...route,
          stops: route.stops.sort((a, b) => {
            const savedOrder =
              (a.route_stop_order ?? Number.MAX_SAFE_INTEGER) -
              (b.route_stop_order ?? Number.MAX_SAFE_INTEGER);
            if (savedOrder !== 0) return savedOrder;
            return (a.address_snapshot ?? "").localeCompare(
              b.address_snapshot ?? "",
              "en-IN",
              { sensitivity: "base" },
            );
          }),
        }))
        .sort((a, b) => {
          if (!a.routeId) return 1;
          if (!b.routeId) return -1;
          return a.name.localeCompare(b.name);
        }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const delivered = visits.filter(
    (stop) => stop.delivery_confirmed || stop.status === "delivered",
  );
  const unfulfilled = visits.filter(
    (stop) => !stop.delivery_confirmed && !["delivered", "cancelled"].includes(stop.status),
  );
  const bottlesOutstanding = visits.filter((visit) => visit.bottlesReturned < visit.bottlesExpected);
  const bottlesOutstandingCount = bottlesOutstanding.reduce(
    (sum, visit) => sum + visit.bottlesExpected - visit.bottlesReturned,
    0,
  );
  const unassigned = visits.filter((visit) => {
    if (visit.assigned_driver_id) return false;
    if (!visit.delivery_route_id) return true;
    return !dailyAssignmentByRoute.get(visit.delivery_route_id)?.driver_id &&
      !defaultAssignmentByRoute.get(visit.delivery_route_id);
  });
  const plannedStops = deliveries.filter((stop) => stop.plan_id).length;
  const oneTimeStops = deliveries.filter((stop) => stop.order_id).length;
  const unrouted = visits.filter((visit) => !visit.delivery_route_id).length;
  const missingAddresses = visits.filter((visit) => !visit.address_snapshot?.trim()).length;
  const routeGroups = areas.flatMap((area) => area.routes);
  const routesWithoutDrivers = routeGroups.filter(
    (route) => route.routeId && !route.assignedDriverId,
  ).length;
  const overloadedRoutes = routeGroups.filter(
    (route) => route.routeId && route.stops.length > route.stopCapacity,
  ).length;
  const releaseBlockers = unrouted + missingAddresses + routesWithoutDrivers + overloadedRoutes;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>M&apos;ma Organic Farm</p>
          <h1>{role === "driver" ? "My delivery route" : "Delivery routes"}</h1>
          <span>{formatCalendarDate(deliveryDate)}</span>
        </div>
        <div className={styles.actions}>
          <PrintSheetButton />
          <Link href="/farm">Back to dashboard</Link>
        </div>
      </header>

      {params.message ? <p className={styles.notice}>{params.message}</p> : null}
      {params.error ? (
        <p className={`${styles.notice} ${styles.error}`}>{params.error}</p>
      ) : null}

      <form action="/farm/delivery-sheet" className={styles.filters} method="get">
        <label>
          <span>Delivery date</span>
          <input defaultValue={deliveryDate} name="date" type="date" />
        </label>
        {managerView ? (
          <label>
            <span>Area</span>
            <select defaultValue={selectedArea} name="area">
              <option value="">All areas</option>
              {deliveryAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="submit">Apply</button>
      </form>

      {managerView ? (
        <section className={styles.dispatchControl} data-state={dispatch?.status ?? "unprepared"}>
          <div>
            <p>Morning dispatch</p>
            <h2>
              {dispatch?.status === "released"
                ? "Released to drivers"
                : dispatch?.status === "draft"
                  ? "Draft ready for review"
                  : "Not prepared"}
            </h2>
            <span>
              {dispatch?.status === "released"
                ? "Drivers can now see only the stops assigned to them."
                : releaseBlockers
                  ? `${releaseBlockers} blocking ${releaseBlockers === 1 ? "issue" : "issues"} must be resolved before release.`
                  : overloadedRoutes
                    ? `${overloadedRoutes} ${overloadedRoutes === 1 ? "route exceeds" : "routes exceed"} the planned visit limit.`
                  : "Planned and paid one-time deliveries are combined and ready to check."}
            </span>
          </div>
          <div className={styles.dispatchActions}>
            {dispatch?.status !== "released" ? (
              <form action={prepareDailyDispatch}>
                <input name="deliveryDate" type="hidden" value={deliveryDate} />
                <input name="area" type="hidden" value={selectedArea} />
                <button type="submit">{dispatch ? "Refresh dispatch" : "Prepare dispatch"}</button>
              </form>
            ) : null}
            {dispatch?.status === "draft" ? (
              <form action={releaseDailyDispatch}>
                <input name="deliveryDate" type="hidden" value={deliveryDate} />
                <input name="area" type="hidden" value={selectedArea} />
                <button disabled={releaseBlockers > 0 || visits.length === 0} type="submit">Release routes</button>
              </form>
            ) : null}
            {dispatch?.status === "released" ? (
              <form action={reopenDailyDispatch}>
                <input name="deliveryDate" type="hidden" value={deliveryDate} />
                <input name="area" type="hidden" value={selectedArea} />
                <button className={styles.secondaryButton} type="submit">Reopen dispatch</button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className={styles.summary} aria-label="Delivery totals">
        <div><strong>{visits.length}</strong><span>Doorstep visits</span></div>
        <div><strong>{plannedStops}</strong><span>Plan lines</span></div>
        <div><strong>{oneTimeStops}</strong><span>One-time orders</span></div>
        <div><strong>{delivered.length}</strong><span>Delivered</span></div>
        <div><strong>{unfulfilled.length}</strong><span>Not fulfilled</span></div>
        <div><strong>{bottlesOutstandingCount}</strong><span>Bottles due</span></div>
        {[...totals.entries()].map(([key, quantity]) => (
          <div key={key}>
            <strong>{quantity}</strong>
            <span>{productName(key)}</span>
          </div>
        ))}
      </section>

      {areas.length ? (
        <div className={styles.areaList}>
          {areas.map((area) => (
            <section className={styles.area} key={area.name}>
              <header>
                <h2>{area.name}</h2>
                <span>{area.routes.reduce((sum, route) => sum + route.stops.length, 0)} stops</span>
              </header>
              {area.routes.map((route) => (
                <section className={styles.route} key={route.routeId ?? "unassigned"}>
                  <div className={styles.routeHeader}>
                    <div className={styles.routeIdentity}>
                      <h3>{route.name}</h3>
                      <span>
                        {driverLabel(route.assignedDriverId)}
                        {route.assignedDriverId
                          ? ` · ${route.assignmentSource === "override" ? "today's replacement" : "route default"}`
                          : ""}
                      </span>
                      {route.routeId ? (
                        <div className={styles.routeLoad} data-overloaded={route.stops.length > route.stopCapacity}>
                          <meter
                            max={route.stopCapacity}
                            min={0}
                            value={Math.min(route.stops.length, route.stopCapacity)}
                          >
                            {route.stops.length} of {route.stopCapacity} stops
                          </meter>
                          <small>
                            {route.stops.length}/{route.stopCapacity} stops
                            {routeLoadLabel(route.stops) ? ` · ${routeLoadLabel(route.stops)}` : ""}
                          </small>
                        </div>
                      ) : null}
                    </div>
                    {managerView && route.routeId && dispatch ? (
                      <form action={assignRouteDriver} className={styles.assignForm}>
                        <input name="routeId" type="hidden" value={route.routeId} />
                        <input name="deliveryDate" type="hidden" value={deliveryDate} />
                        <input name="area" type="hidden" value={selectedArea} />
                        <label>
                          <span className={styles.srOnly}>Assign driver</span>
                          <select defaultValue={route.assignedDriverId ?? ""} name="driverId" required>
                            <option value="" disabled>Choose driver</option>
                            {staff.map((person) => (
                              <option key={person.user_id} value={person.user_id}>
                                {staffNames.get(person.user_id) ?? "Farm staff"} · {person.role}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.defaultDriver}>
                          <input name="makeDefault" type="checkbox" value="yes" />
                          <span>Make this the permanent route driver</span>
                        </label>
                        <button type="submit">Save today&apos;s driver</button>
                      </form>
                    ) : null}
                    {managerView && route.routeId && !dispatch ? (
                      <small>Prepare the dispatch before assigning today&apos;s driver.</small>
                    ) : null}
                    {managerView && !route.routeId ? (
                      <small>Assign customer routes from Customers before sending a driver.</small>
                    ) : null}
                  </div>

                  <ol className={styles.stopList}>
                    {route.stops.map((stop, index) => (
                      <li className={styles.stopCard} key={stop.visit_key}>
                        <div className={styles.stopTop}>
                          <span className={styles.stopNumber}>{stop.route_stop_order ?? index + 1}</span>
                          <span className={`${styles.status} ${stop.delivery_confirmed ? styles.statusDone : ""}`}>
                            {statusLabel(stop)}
                          </span>
                        </div>

                        <div className={styles.customer}>
                          <strong>{stop.customer_name}</strong>
                          {stop.planLines + stop.oneTimeOrderLines > 1 ? (
                            <span>
                              {stop.planLines ? `${stop.planLines} plan ${stop.planLines === 1 ? "line" : "lines"}` : ""}
                              {stop.planLines && stop.oneTimeOrderLines ? " · " : ""}
                              {stop.oneTimeOrderLines ? `${stop.oneTimeOrderLines} one-time ${stop.oneTimeOrderLines === 1 ? "order" : "orders"}` : ""}
                            </span>
                          ) : null}
                          {stop.phone_snapshot ? (
                            <a href={phoneUrl(stop.phone_snapshot)}>Call {stop.phone_snapshot}</a>
                          ) : (
                            <span>No phone saved</span>
                          )}
                          {stop.address_snapshot ? (
                            <a
                              className={styles.mapLink}
                              href={mapsUrl(stop.address_snapshot)}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {stop.address_snapshot}
                              <small>Open in Maps ↗</small>
                            </a>
                          ) : (
                            <strong className={styles.missing}>ADDRESS MISSING</strong>
                          )}
                        </div>

                        <div className={styles.items}>
                          {(stop.daily_delivery_items ?? []).map((item) => (
                            <span key={item.product_key}>
                              {productName(item.product_key)} · {quantityLabel(item)}
                            </span>
                          ))}
                          {stop.bottle_return_required ? (
                            <span>Bottle · collect return</span>
                          ) : stop.bottle_choice === "new" ? (
                            <span>Bottle · leave new bottle</span>
                          ) : null}
                        </div>

                        {stop.status !== "cancelled" ? (
                          <form action={recordDeliveryStop} className={styles.doorstepForm}>
                            {stop.deliveryIds.map((deliveryId) => <input key={deliveryId} name="deliveryId" type="hidden" value={deliveryId} />)}
                            <input name="deliveryDate" type="hidden" value={deliveryDate} />
                            <input name="area" type="hidden" value={selectedArea} />
                            <p>At the doorstep</p>
                            <label className={styles.checkLabel}>
                              <input
                                defaultChecked={stop.delivery_confirmed || stop.status === "delivered"}
                                name="deliveryConfirmed"
                                type="checkbox"
                                value="yes"
                              />
                              <span>Delivery completed</span>
                            </label>
                            {stop.bottle_return_required ? (
                              <label className={styles.noteField}>
                                <span>Bottles returned ({stop.bottlesExpected} due)</span>
                                <input
                                  defaultValue={stop.bottlesReturned}
                                  max={stop.bottlesExpected}
                                  min={0}
                                  name="bottlesReturned"
                                  required
                                  type="number"
                                />
                              </label>
                            ) : (
                              <p className={styles.notRequired}>No bottle return due</p>
                            )}
                            <label className={styles.noteField}>
                              <span>Note if not completed</span>
                              <input
                                defaultValue={stop.driver_note ?? ""}
                                maxLength={250}
                                name="driverNote"
                                placeholder="Customer unavailable, address issue…"
                                type="text"
                              />
                            </label>
                            <button type="submit">Save visit</button>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <section className={styles.empty}>
          <strong>No assigned deliveries for this date.</strong>
          <p>
            {role === "driver"
              ? "The farm manager has not released a route to you for this date."
              : "Prepare the dispatch to combine planned and paid one-time deliveries."}
          </p>
        </section>
      )}

      <section className={styles.endReport} aria-labelledby="end-report-title">
        <header>
          <div>
            <p>End-of-day control</p>
            <h2 id="end-report-title">What still needs attention</h2>
          </div>
          <span>{unfulfilled.length + bottlesOutstandingCount + unassigned.length + overloadedRoutes} exceptions</span>
        </header>
        <div className={styles.reportMetrics}>
          <article><strong>{unfulfilled.length}</strong><span>Deliveries not fulfilled</span></article>
          <article><strong>{bottlesOutstandingCount}</strong><span>Bottles still with customers</span></article>
          {managerView ? <article><strong>{unassigned.length}</strong><span>Stops without a driver</span></article> : null}
          {managerView ? <article><strong>{overloadedRoutes}</strong><span>Routes over stop limit</span></article> : null}
        </div>
        {unfulfilled.length || bottlesOutstanding.length || (managerView && (unassigned.length || overloadedRoutes)) ? (
          <div className={styles.exceptionList}>
            {unfulfilled.map((stop) => (
              <span key={`delivery-${stop.id}`}><strong>Delivery:</strong> {stop.customer_name} · {stop.address_snapshot ?? "address missing"}</span>
            ))}
            {bottlesOutstanding.map((stop) => (
              <span key={`bottle-${stop.visit_key}`}><strong>Bottle:</strong> {stop.customer_name} · {stop.bottlesExpected - stop.bottlesReturned} return {stop.bottlesExpected - stop.bottlesReturned === 1 ? "is" : "are"} not recorded</span>
            ))}
            {managerView ? unassigned.map((stop) => (
              <span key={`driver-${stop.id}`}><strong>Driver:</strong> {stop.customer_name} · route not assigned</span>
            )) : null}
            {managerView ? routeGroups.filter((route) => route.routeId && route.stops.length > route.stopCapacity).map((route) => (
              <span key={`capacity-${route.routeId}`}><strong>Capacity:</strong> {route.name} · {route.stops.length} stops for a {route.stopCapacity}-stop limit</span>
            )) : null}
          </div>
        ) : (
          <p className={styles.allClear}>All deliveries and bottle returns are complete.</p>
        )}
      </section>

      <footer className={styles.footer}>
        Customer information is provided only for completing farm deliveries.
      </footer>
    </main>
  );
}
