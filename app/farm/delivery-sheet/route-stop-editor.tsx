"use client";
import { FarmForm } from "../farm-form";

import { useActionState } from "react";
import { moveDeliveryVisit, type RouteMoveActionState } from "./actions";
import styles from "./sheet.module.css";

const initialState: RouteMoveActionState | null = null;

type RouteOption = {
  areaName: string;
  id: string;
  name: string;
};

export function RouteStopEditor({
  currentPosition,
  currentRouteId,
  deliveryDate,
  routes,
  visitKey,
}: {
  currentPosition: number;
  currentRouteId: string | null;
  deliveryDate: string;
  routes: RouteOption[];
  visitKey: string;
}) {
  const [state, formAction, pending] = useActionState(moveDeliveryVisit, initialState);


  return (
    <details className={styles.routeStopEditor}>
      <summary>Move or reorder this stop</summary>
      <FarmForm action={formAction} managed feedback={state} className={styles.routeStopForm}>
        <input name="deliveryDate" type="hidden" value={deliveryDate} />
        <input name="visitKey" type="hidden" value={visitKey} />
        <label>
          Route
          <select defaultValue={currentRouteId ?? ""} name="routeId" required>
            <option value="" disabled>Choose route</option>
            {routes.map((route) => <option key={route.id} value={route.id}>{route.areaName} · {route.name}</option>)}
          </select>
        </label>
        <label>
          Stop position
          <input defaultValue={currentPosition} max={999} min={1} name="position" required type="number" />
        </label>
        <label className={styles.applyDefault}>
          <input name="applyToCustomer" type="checkbox" value="yes" />
          <span>Use this route and position for the customer&apos;s future unreleased deliveries</span>
        </label>
        <p>The current dispatch must be unreleased. A route at capacity cannot accept another stop.</p>
        <button disabled={pending} type="submit">{pending ? "Updating route…" : "Update route"}</button>
        {state ? <span aria-live="polite" className={state.ok ? styles.routeMoveSuccess : styles.routeMoveError}>{state.message ?? state.error}</span> : null}
      </FarmForm>
    </details>
  );
}
