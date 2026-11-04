"use server";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeRoadProposal } from "@/lib/gps-provider";
import { validateFix, type GpsRun, type GpsWorkspace } from "@/lib/gps-routing";

export type GpsResult = {
  ok: boolean;
  message: string;
  workspace?: GpsWorkspace;
  sessionId?: string;
};
export async function refreshGps(date: string): Promise<GpsResult> {
  const { supabase } = await requireFarmStaff("/farm/gps");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { ok: false, message: "Choose a service date." };
  const { data, error } = await supabase.rpc("get_gps_workspace", {
    p_date: date,
  });
  return error
    ? { ok: false, message: error.message }
    : { ok: true, message: "", workspace: data as GpsWorkspace };
}
export async function gpsAction(
  runId: string,
  date: string,
  action: string,
  payload: Record<string, unknown>,
  key: string,
): Promise<GpsResult> {
  const { supabase, user, role } = await requireFarmStaff("/farm/gps");
  if (
    ![runId, key].every((v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    ) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    JSON.stringify(payload).length > 3000
  )
    return { ok: false, message: "Refresh the workspace and try again." };
  try {
    if (action === "position") validateFix(payload);
    if (
      action === "propose" &&
      (process.env.GPS_ROAD_ROUTING_ENABLED !== "true" ||
        !process.env.GPS_GOOGLE_ROUTES_KEY)
    )
      return {
        ok: false,
        message:
          "Road routing is awaiting provider setup. The existing manual route is available.",
      };
    const { data, error } = await supabase.rpc("gps_run_command", {
      p_run: runId,
      p_action: action === "propose" ? "prepare" : action,
      p_payload: payload,
      p_request_key: key,
    });
    if (error) return { ok: false, message: error.message };
    if (action === "propose") {
      const run = data as GpsRun;
      // An interrupted successful request can recover without another paid provider call.
      if (run.proposal?.id !== key) {
        if (!run.config)
          throw Error("Ask the manager to configure this run first.");
        const origin =
          role === "driver"
            ? validateFix(run.position)
            : {
                latitude: run.config.hub_latitude,
                longitude: run.config.hub_longitude,
              };
        const result = await computeRoadProposal(
          {
            origin,
            hub: {
              latitude: run.config.hub_latitude,
              longitude: run.config.hub_longitude,
            },
            stops: run.stops.filter((s) => !s.recorded && !s.cancelled),
            optimise: run.config.sequencing !== "manual",
            travelMode: run.config.travel_mode,
          },
          process.env.GPS_GOOGLE_ROUTES_KEY!,
        );
        const { error: storeError } = await createAdminClient().rpc(
          "store_gps_route_proposal",
          {
            p_actor: user.id,
            p_run: runId,
            p_request_key: key,
            p_payload: {
              ...result,
              signature: run.signature,
              origin: {
                latitude: origin.latitude,
                longitude: origin.longitude,
              },
              travel_mode: run.config.travel_mode,
            },
          },
        );
        if (storeError) return { ok: false, message: storeError.message };
      }
    }
    const latest = await refreshGps(date);
    return latest.ok
      ? {
          ...latest,
          message:
            action === "position"
              ? "Position shared."
              : "Saved. Your run is up to date.",
          sessionId:
            action === "start_tracking"
              ? (data as { session_id: string }).session_id
              : undefined,
        }
      : { ok: true, message: "Saved. Refresh to see the latest run." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "We couldn’t confirm this action. Refresh before retrying.",
    };
  }
}
