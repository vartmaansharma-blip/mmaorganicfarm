"use client";

import { useState } from "react";

type AreaOption = {
  id: string;
  name: string;
};

type RouteOption = {
  areaId: string;
  code: string | null;
  id: string;
  name: string;
};

export function CustomerRoutingFields({
  areas,
  initialAreaId,
  initialRouteId,
  initialStopOrder,
  routes,
}: {
  areas: AreaOption[];
  initialAreaId: string;
  initialRouteId: string;
  initialStopOrder: number | null;
  routes: RouteOption[];
}) {
  const [areaId, setAreaId] = useState(initialAreaId);
  const [routeId, setRouteId] = useState(initialRouteId);
  const availableRoutes = areaId
    ? routes.filter((route) => route.areaId === areaId)
    : [];

  return (
    <>
      <label>
        <span>Delivery area</span>
        <select
          name="areaId"
          onChange={(event) => {
            const nextAreaId = event.target.value;
            setAreaId(nextAreaId);
            setRouteId((currentRouteId) => {
              const currentRoute = routes.find((route) => route.id === currentRouteId);
              return currentRoute?.areaId === nextAreaId ? currentRouteId : "";
            });
          }}
          value={areaId}
        >
          <option value="">Automatic from the address</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>{area.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Delivery route</span>
        <select
          disabled={!areaId}
          name="routeId"
          onChange={(event) => setRouteId(event.target.value)}
          value={routeId}
        >
          <option value="">
            {areaId ? "Assign automatically in this area" : "Choose an area or use automatic routing"}
          </option>
          {availableRoutes.map((route) => (
            <option key={route.id} value={route.id}>
              {route.name}{route.code ? ` · ${route.code}` : ""}
            </option>
          ))}
        </select>
        <small>Changing the area clears a route that no longer belongs there.</small>
      </label>
      <label>
        <span>Stop position</span>
        <input
          defaultValue={initialStopOrder ?? ""}
          disabled={!routeId}
          inputMode="numeric"
          max="999"
          min="1"
          name="routeStopOrder"
          type="number"
        />
        <small>{routeId ? "Used to order the driver's route." : "Assigned automatically with the route."}</small>
      </label>
    </>
  );
}
