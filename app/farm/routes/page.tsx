import type { Metadata } from "next";
import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { FormSubmitButton } from "../form-submit-button";
import { createArea, updateArea } from "../locations/actions";
import {
  assignRouteDriver,
  createDeliveryRoute,
  runAutomaticRouting,
  updateDeliveryRoute,
} from "./actions";
import styles from "./routes.module.css";
import actionStyles from "./route-actions.module.css";

export const metadata: Metadata = { title: "Farm routes", robots: { index: false, follow: false } };

type RouteRow = {
  active: boolean;
  area_id: string;
  code: string | null;
  id: string;
  match_terms: string[];
  name: string;
  postal_codes: string[];
  stop_capacity: number;
};

export default async function RoutesPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { supabase } = await requireFarmManager("/farm/routes");
  const admin = createAdminClient();
  const params = await searchParams;
  const [areasResult, routesResult, assignmentsResult, staffResult, profilesResult, plansResult] = await Promise.all([
    supabase.from("delivery_areas").select("id,name,active,sort_order").order("active", { ascending: false }).order("sort_order").order("name"),
    supabase.from("delivery_routes").select("id,area_id,name,code,active,match_terms,postal_codes,stop_capacity").eq("active", true).order("sort_order").order("name"),
    supabase.from("route_driver_assignments").select("route_id,driver_id"),
    admin.from("farm_staff").select("user_id,role").eq("active", true).eq("role", "driver"),
    supabase.from("customer_profiles").select("user_id,delivery_area_id,delivery_route_id"),
    supabase.from("delivery_plans").select("user_id").eq("status", "active").eq("is_test", false),
  ]);
  const databaseError = [areasResult.error, routesResult.error, assignmentsResult.error, staffResult.error, profilesResult.error, plansResult.error].find(Boolean);
  if (databaseError) throw databaseError;

  const areas = areasResult.data ?? [];
  const activeAreas = areas.filter((area) => area.active);
  const routes = (routesResult.data ?? []) as RouteRow[];
  const assignments = new Map((assignmentsResult.data ?? []).map((item) => [item.route_id, item.driver_id]));
  const drivers = staffResult.data ?? [];
  const driverIds = drivers.map((driver) => driver.user_id);
  const driverProfiles = driverIds.length
    ? await supabase.from("customer_profiles").select("user_id,full_name").in("user_id", driverIds)
    : { data: [], error: null };
  if (driverProfiles.error) throw driverProfiles.error;
  const driverNames = new Map((driverProfiles.data ?? []).map((profile) => [profile.user_id, profile.full_name ?? "Driver"]));
  const profiles = profilesResult.data ?? [];
  const activeCustomerIds = new Set((plansResult.data ?? []).map((plan) => plan.user_id));
  const unrouted = profiles.filter((profile) => activeCustomerIds.has(profile.user_id) && !profile.delivery_route_id).length;
  const assignedRoutes = routes.filter((route) => assignments.has(route.id)).length;

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p>Route control</p><h1>Delivery routing</h1><span>Paid schedules are assigned automatically from postal codes, locality terms, or the customer&apos;s service area.</span></div>
      <Link href="/farm/delivery-sheet">Open delivery routes</Link>
    </header>

    {params.message ? <p className={styles.notice}>{params.message}</p> : null}
    {params.error ? <p className={`${styles.notice} ${styles.error}`}>{params.error}</p> : null}

    <section className={styles.metrics} aria-label="Routing readiness">
      <article><strong>{activeAreas.length}</strong><span>Active service areas</span></article>
      <article><strong>{routes.length}</strong><span>Active routes</span></article>
      <article><strong>{assignedRoutes}/{routes.length}</strong><span>Routes with drivers</span></article>
      <article data-attention={unrouted > 0}><strong>{unrouted}</strong><span>Paid customers needing a route</span></article>
    </section>

    <section className={styles.automation}>
      <div><p>Automatic rule</p><h2>Route a customer when payment activates the schedule</h2><span>Existing valid assignments stay unchanged. Unmatched customers remain in the exception queue for a manager.</span></div>
      <form action={runAutomaticRouting}><FormSubmitButton pendingLabel="Routing customers…">Run routing now</FormSubmitButton></form>
    </section>

    <section className={styles.setup} aria-labelledby="farm-setup-title">
      <div><p>One-time farm setup</p><h2 id="farm-setup-title">What the farm must maintain</h2></div>
      <ol><li><strong>Create one or more routes inside each area.</strong><span>If an area has only one route, it becomes the automatic fallback.</span></li><li><strong>Add locality terms or postal codes when an area has multiple routes.</strong><span>Use the words found in customer addresses.</span></li><li><strong>Assign one active driver to each route.</strong><span>New delivery sheets inherit that driver automatically.</span></li></ol>
    </section>

    <section className={styles.routeSection}>
      <div className={styles.sectionHeading}><div><p>Routing rules</p><h2>Areas and routes</h2></div><span>{routes.length} configured</span></div>
      <div className={styles.areaList}>
        {areas.map((area) => {
          const areaRoutes = routes.filter((route) => route.area_id === area.id);
          const areaRouteIds = new Set(areaRoutes.map((route) => route.id));
          const areaCustomers = profiles.filter((profile) => profile.delivery_area_id === area.id || (profile.delivery_route_id && areaRouteIds.has(profile.delivery_route_id))).length;
          return <article className={styles.area} data-inactive={!area.active} key={area.id}>
            <header className={styles.areaHeader}>
              <div className={styles.areaIdentity}>
                <span className={styles.status} data-active={area.active}>{area.active ? "Active" : "Inactive"}</span>
                <h3>{area.name}</h3>
                <p>{areaRoutes.length} active route{areaRoutes.length === 1 ? "" : "s"} · {areaCustomers} customer{areaCustomers === 1 ? "" : "s"}</p>
              </div>
              <details className={styles.areaEditor}>
                <summary aria-label={`Edit ${area.name}`}>Edit area</summary>
                <form action={updateArea} className={styles.areaForm}>
                  <input name="areaId" type="hidden" value={area.id} />
                  <label>Area name<input defaultValue={area.name} name="name" required /></label>
                  <label>Display order<input defaultValue={area.sort_order} max={999} min={0} name="sortOrder" required type="number" /></label>
                  <label className={styles.toggle}><input defaultChecked={area.active} name="active" type="checkbox" /> Available for routing</label>
                  <p>Deactivation is blocked until its active routes and customers have been moved.</p>
                  <FormSubmitButton pendingLabel="Saving area…">Save area</FormSubmitButton>
                </form>
              </details>
            </header>
            <div className={styles.routes}>
              {areaRoutes.map((route) => <details key={route.id}>
                <summary><span><strong>{route.name}</strong><small>{route.code || "No code"} · {assignments.has(route.id) ? driverNames.get(assignments.get(route.id)!) ?? "Driver assigned" : "Driver required"}{areaRoutes.length > 1 && !(route.match_terms?.length || route.postal_codes?.length) ? " · Add routing rules" : ""}</small></span><b>{(route.match_terms?.length ?? 0) + (route.postal_codes?.length ?? 0)} rules</b></summary>
                <form action={updateDeliveryRoute} className={styles.routeForm}>
                  <input name="routeId" type="hidden" value={route.id} />
                  <label>Route name<input defaultValue={route.name} name="name" required /></label>
                  <label>Code<input defaultValue={route.code ?? ""} name="code" /></label>
                  <label>Service area<select defaultValue={route.area_id} name="areaId" required>{areas.map((areaOption) => <option disabled={!areaOption.active} key={areaOption.id} value={areaOption.id}>{areaOption.name}{areaOption.active ? "" : " (inactive)"}</option>)}</select></label>
                  <label>Daily stop limit<input defaultValue={route.stop_capacity} max={200} min={1} name="stopCapacity" required type="number" /></label>
                  <label className={styles.wide}>Locality or address terms<textarea defaultValue={(route.match_terms ?? []).join(", ")} name="matchTerms" placeholder="Birsanagar Zone 1, Telco Colony" rows={2} /></label>
                  <label className={styles.wide}>Postal codes<input defaultValue={(route.postal_codes ?? []).join(", ")} name="postalCodes" placeholder="831004, 831019" /></label>
                  <FormSubmitButton pendingLabel="Saving route…">Save routing rules</FormSubmitButton>
                </form>
                {drivers.length ? <form action={assignRouteDriver} className={styles.driverForm}><input name="routeId" type="hidden" value={route.id} /><select defaultValue={assignments.get(route.id) ?? ""} name="driverId" required><option value="" disabled>Choose driver</option>{drivers.map((driver) => <option key={driver.user_id} value={driver.user_id}>{driverNames.get(driver.user_id) ?? "Driver"}</option>)}</select><FormSubmitButton pendingLabel="Assigning…">Assign driver</FormSubmitButton></form> : <p className={styles.driverMissing}>Add an active staff member with the driver role before assigning this route.</p>}
              </details>)}
            </div>
          </article>;
        })}
      </div>
    </section>

    <div className={actionStyles.actions}>
    <details className={styles.createRoute}><summary>Add service area</summary><form action={createArea} className={styles.routeForm}>
      <label className={styles.wide}>Area name<input name="name" placeholder="Bistupur" required /></label>
      <FormSubmitButton pendingLabel="Creating area…">Create area</FormSubmitButton>
    </form></details>
    <details className={styles.createRoute}><summary>Add delivery route</summary><form action={createDeliveryRoute} className={styles.routeForm}>
      <label>Service area<select name="areaId" required><option value="">Choose area</option>{activeAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
      <label>Route name<input name="name" placeholder="Birsanagar morning route" required /></label>
      <label>Code<input name="code" placeholder="BIR-1" /></label>
      <label>Daily stop limit<input defaultValue={25} max={200} min={1} name="stopCapacity" required type="number" /></label>
      <label className={styles.wide}>Locality or address terms<textarea name="matchTerms" placeholder="Comma-separated terms" rows={2} /></label>
      <label className={styles.wide}>Postal codes<input name="postalCodes" placeholder="831004, 831019" /></label>
      <FormSubmitButton pendingLabel="Creating route…">Create route</FormSubmitButton>
    </form></details>
    </div>
  </main>;
}
