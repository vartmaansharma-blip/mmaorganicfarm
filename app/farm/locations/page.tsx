import type { Metadata } from "next";
import Link from "next/link";
import {
  canManageLocations,
  requireFarmStaff,
} from "@/lib/farm-dashboard";
import {
  assignCustomerLocation,
  createArea,
  createRoute,
} from "./actions";
import styles from "./locations.module.css";

export const metadata: Metadata = {
  title: "Delivery locations",
  robots: { index: false, follow: false },
};

export default async function LocationsPage() {
  const { role, supabase } = await requireFarmStaff("/farm/locations");
  const [areasResult, routesResult, profilesResult] = await Promise.all([
    supabase
      .from("delivery_areas")
      .select("id, name, active, sort_order")
      .order("sort_order")
      .order("name"),
    supabase
      .from("delivery_routes")
      .select("id, area_id, name, code, active, sort_order")
      .order("sort_order")
      .order("name"),
    supabase
      .from("customer_profiles")
      .select(
        "user_id, full_name, phone, address_line, postal_code, delivery_area_id, delivery_route_id, route_stop_order",
      )
      .order("full_name"),
  ]);

  const databaseError = [
    areasResult.error,
    routesResult.error,
    profilesResult.error,
  ].find(Boolean);
  if (databaseError) throw databaseError;

  const areas = areasResult.data ?? [];
  const routes = routesResult.data ?? [];
  const profiles = profilesResult.data ?? [];
  const areaById = new Map(areas.map((area) => [area.id, area.name]));
  const routeById = new Map(routes.map((route) => [route.id, route.name]));
  const canManage = canManageLocations(role);
  const unassignedCount = profiles.filter(
    (profile) => !profile.delivery_area_id || !profile.delivery_route_id,
  ).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Route setup</p>
          <h1>Delivery locations</h1>
          <p>
            Create areas as the farm expands, then place each customer on a route.
          </p>
        </div>
        <Link href="/farm">Back to overview</Link>
      </header>

      <section className={styles.summary} aria-label="Location summary">
        <div><strong>{areas.length}</strong><span>Areas</span></div>
        <div><strong>{routes.length}</strong><span>Routes</span></div>
        <div><strong>{profiles.length}</strong><span>Customers</span></div>
        <div><strong>{unassignedCount}</strong><span>Unassigned</span></div>
      </section>

      {canManage ? (
        <section className={styles.setup} aria-labelledby="setup-title">
          <div className={styles.sectionHeading}>
            <p>Setup</p>
            <h2 id="setup-title">Add an area or route</h2>
          </div>
          <form action={createArea}>
            <label htmlFor="area-name">New delivery area</label>
            <div className={styles.inlineFields}>
              <input id="area-name" name="name" placeholder="Bistupur" required />
              <button type="submit">Add area</button>
            </div>
          </form>
          <form action={createRoute}>
            <label htmlFor="route-name">New route</label>
            <select id="route-area" name="areaId" required defaultValue="">
              <option disabled value="">Choose area</option>
              {areas.map((area) => (
                <option value={area.id} key={area.id}>{area.name}</option>
              ))}
            </select>
            <div className={styles.inlineFields}>
              <input id="route-name" name="name" placeholder="Morning route" required />
              <input aria-label="Route code" name="code" placeholder="BIS-01" />
              <button type="submit" disabled={!areas.length}>Add route</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className={styles.customerSection} aria-labelledby="customers-title">
        <div className={styles.sectionHeading}>
          <p>Assignment queue</p>
          <h2 id="customers-title">Customer routes</h2>
        </div>

        {profiles.length ? (
          <div className={styles.customerList}>
            {profiles.map((profile) => (
              <article className={styles.customer} key={profile.user_id}>
                <div className={styles.customerIdentity}>
                  <span className={styles.initial} aria-hidden="true">
                    {(profile.full_name ?? "C").charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <strong>{profile.full_name ?? "Customer"}</strong>
                    <span>{profile.phone ?? "No phone saved"}</span>
                    <small>
                      {[profile.address_line, profile.postal_code]
                        .filter(Boolean)
                        .join(", ") || "No address saved"}
                    </small>
                  </div>
                </div>

                <div className={styles.currentAssignment}>
                  <span>{profile.delivery_area_id ? areaById.get(profile.delivery_area_id) : "Unassigned area"}</span>
                  <span>{profile.delivery_route_id ? routeById.get(profile.delivery_route_id) : "No route"}</span>
                </div>

                {canManage ? (
                  <form action={assignCustomerLocation} className={styles.assignmentForm}>
                    <input name="userId" type="hidden" value={profile.user_id} />
                    <select name="areaId" defaultValue={profile.delivery_area_id ?? ""}>
                      <option value="">Unassigned area</option>
                      {areas.map((area) => (
                        <option value={area.id} key={area.id}>{area.name}</option>
                      ))}
                    </select>
                    <select name="routeId" defaultValue={profile.delivery_route_id ?? ""}>
                      <option value="">No route</option>
                      {areas.map((area) => (
                        <optgroup label={area.name} key={area.id}>
                          {routes
                            .filter((route) => route.area_id === area.id)
                            .map((route) => (
                              <option value={route.id} key={route.id}>
                                {route.name}{route.code ? ` · ${route.code}` : ""}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    <input
                      aria-label="Stop order"
                      defaultValue={profile.route_stop_order ?? ""}
                      min="1"
                      name="stopOrder"
                      placeholder="Stop"
                      type="number"
                    />
                    <button type="submit">Save</button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No signed-in customers yet.</div>
        )}
      </section>
    </main>
  );
}
