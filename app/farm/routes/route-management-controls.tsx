"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  assignRouteDriverInline,
  retireDeliveryRoute,
  type InlineActionState,
} from "./actions";
import styles from "./routes.module.css";

const initialState: InlineActionState | null = null;

type Driver = { id: string; name: string };
type Route = { id: string; name: string };

export function RouteDriverAssignment({
  driverId,
  drivers,
  routeId,
}: {
  driverId: string | null;
  drivers: Driver[];
  routeId: string;
}) {
  const [state, formAction, pending] = useActionState(assignRouteDriverInline, initialState);

  return (
    <form action={formAction} className={styles.driverForm}>
      <input name="routeId" type="hidden" value={routeId} />
      <select defaultValue={driverId ?? ""} name="driverId" required>
        <option value="" disabled>Choose driver</option>
        {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
      </select>
      <button disabled={pending} type="submit">{pending ? "Saving driver…" : "Save driver"}</button>
      {state ? <p aria-live="polite" className={state.ok ? styles.inlineSuccess : styles.inlineError}>{state.message ?? state.error}</p> : null}
    </form>
  );
}

export function RetireRouteControl({
  replacementRoutes,
  routeId,
  routeName,
}: {
  replacementRoutes: Route[];
  routeId: string;
  routeName: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(retireDeliveryRoute, initialState);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [router, state]);

  if (!replacementRoutes.length) return <p className={styles.driverMissing}>Create another active route before closing this one.</p>;

  return (
    <details className={styles.retireRoute}>
      <summary>Close route</summary>
      <form action={formAction} className={styles.retireForm}>
        <input name="routeId" type="hidden" value={routeId} />
        <p>Closing <strong>{routeName}</strong> moves customers and unreleased future visits; it never cancels paid orders.</p>
        <label>
          Replacement route
          <select name="replacementRouteId" required>
            <option value="">Choose active route</option>
            {replacementRoutes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}
          </select>
        </label>
        <label>
          Reason
          <input maxLength={300} minLength={3} name="reason" placeholder="e.g. Driver coverage changed" required />
        </label>
        <button disabled={pending} type="submit">{pending ? "Closing route…" : "Confirm route closure"}</button>
        {state ? <p aria-live="polite" className={state.ok ? styles.inlineSuccess : styles.inlineError}>{state.message ?? state.error}</p> : null}
      </form>
    </details>
  );
}
