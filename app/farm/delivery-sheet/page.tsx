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
import { assignRouteDriver, recordDeliveryStop } from "./actions";
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
  phone_snapshot: string | null;
  route_stop_order: number | null;
  status: string;
};

type RouteRow = {
  area_id: string;
  id: string;
  name: string;
};

type StaffRow = {
  role: "admin" | "driver" | "manager";
  user_id: string;
};

type RouteGroup = {
  assignedDriverId: string | null;
  name: string;
  routeId: string | null;
  stops: DeliveryRow[];
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
      "id, status, customer_name, phone_snapshot, address_snapshot, bottle_choice, delivery_area_id, delivery_route_id, assigned_driver_id, route_stop_order, delivery_confirmed, bottle_return_required, bottle_returned, driver_note, daily_delivery_items(product_key, quantity, unit)",
    )
    .eq("delivery_date", deliveryDate)
    .eq("is_test", false);

  if (role === "driver") {
    deliveriesQuery = deliveriesQuery.eq("assigned_driver_id", user.id);
  }

  const [deliveriesResult, areasResult, routesResult, staffResult, assignmentsResult] =
    await Promise.all([
      deliveriesQuery,
      supabase
        .from("delivery_areas")
        .select("id, name, active, sort_order")
        .order("sort_order")
        .order("name"),
      supabase
        .from("delivery_routes")
        .select("id, area_id, name, active, sort_order")
        .order("sort_order")
        .order("name"),
      admin
        .from("farm_staff")
        .select("user_id, role")
        .eq("active", true),
      supabase
        .from("route_driver_assignments")
        .select("route_id, driver_id"),
    ]);

  const databaseError = [
    deliveriesResult.error,
    areasResult.error,
    routesResult.error,
    staffResult.error,
    assignmentsResult.error,
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
  const assignmentByRoute = new Map(
    (assignmentsResult.data ?? []).map((assignment) => [
      assignment.route_id,
      assignment.driver_id,
    ]),
  );
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

  deliveries.forEach((delivery) => {
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
    const areaRoutes = grouped.get(areaName) ?? new Map<string, RouteGroup>();
    const routeGroup: RouteGroup = areaRoutes.get(routeKey) ?? {
      assignedDriverId:
        delivery.assigned_driver_id ??
        (route ? assignmentByRoute.get(route.id) ?? null : null),
      name: route?.name ?? "Route not assigned",
      routeId: route?.id ?? null,
      stops: [],
    };
    routeGroup.stops.push(delivery);
    if (!routeGroup.assignedDriverId && delivery.assigned_driver_id) {
      routeGroup.assignedDriverId = delivery.assigned_driver_id;
    }
    areaRoutes.set(routeKey, routeGroup);
    grouped.set(areaName, areaRoutes);

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

  const delivered = deliveries.filter(
    (stop) => stop.delivery_confirmed || stop.status === "delivered",
  );
  const unfulfilled = deliveries.filter(
    (stop) => !stop.delivery_confirmed && !["delivered", "cancelled"].includes(stop.status),
  );
  const bottlesOutstanding = deliveries.filter(
    (stop) => stop.bottle_return_required && !stop.bottle_returned,
  );
  const unassigned = deliveries.filter((stop) => !stop.assigned_driver_id);

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

      <section className={styles.summary} aria-label="Delivery totals">
        <div><strong>{deliveries.length}</strong><span>Stops</span></div>
        <div><strong>{delivered.length}</strong><span>Delivered</span></div>
        <div><strong>{unfulfilled.length}</strong><span>Not fulfilled</span></div>
        <div><strong>{bottlesOutstanding.length}</strong><span>Bottles due</span></div>
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
                    <div>
                      <h3>{route.name}</h3>
                      <span>{driverLabel(route.assignedDriverId)}</span>
                    </div>
                    {managerView && route.routeId ? (
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
                        <button type="submit">Assign route</button>
                      </form>
                    ) : null}
                    {managerView && !route.routeId ? (
                      <small>Assign customer routes from Customers before sending a driver.</small>
                    ) : null}
                  </div>

                  <ol className={styles.stopList}>
                    {route.stops.map((stop, index) => (
                      <li className={styles.stopCard} key={stop.id}>
                        <div className={styles.stopTop}>
                          <span className={styles.stopNumber}>{stop.route_stop_order ?? index + 1}</span>
                          <span className={`${styles.status} ${stop.delivery_confirmed ? styles.statusDone : ""}`}>
                            {statusLabel(stop)}
                          </span>
                        </div>

                        <div className={styles.customer}>
                          <strong>{stop.customer_name}</strong>
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
                            <input name="deliveryId" type="hidden" value={stop.id} />
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
                              <label className={styles.checkLabel}>
                                <input
                                  defaultChecked={stop.bottle_returned}
                                  name="bottleReturned"
                                  type="checkbox"
                                  value="yes"
                                />
                                <span>Bottle returned</span>
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
                            <button type="submit">Save stop</button>
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
              ? "Ask the farm manager to assign your route."
              : "Generate the daily sheet from the dashboard first."}
          </p>
        </section>
      )}

      <section className={styles.endReport} aria-labelledby="end-report-title">
        <header>
          <div>
            <p>End-of-day control</p>
            <h2 id="end-report-title">What still needs attention</h2>
          </div>
          <span>{unfulfilled.length + bottlesOutstanding.length + unassigned.length} exceptions</span>
        </header>
        <div className={styles.reportMetrics}>
          <article><strong>{unfulfilled.length}</strong><span>Deliveries not fulfilled</span></article>
          <article><strong>{bottlesOutstanding.length}</strong><span>Bottles still with customers</span></article>
          {managerView ? <article><strong>{unassigned.length}</strong><span>Stops without a driver</span></article> : null}
        </div>
        {unfulfilled.length || bottlesOutstanding.length || (managerView && unassigned.length) ? (
          <div className={styles.exceptionList}>
            {unfulfilled.map((stop) => (
              <span key={`delivery-${stop.id}`}><strong>Delivery:</strong> {stop.customer_name} · {stop.address_snapshot ?? "address missing"}</span>
            ))}
            {bottlesOutstanding.map((stop) => (
              <span key={`bottle-${stop.id}`}><strong>Bottle:</strong> {stop.customer_name} · return not recorded</span>
            ))}
            {managerView ? unassigned.map((stop) => (
              <span key={`driver-${stop.id}`}><strong>Driver:</strong> {stop.customer_name} · route not assigned</span>
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
