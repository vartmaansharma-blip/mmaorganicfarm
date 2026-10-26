"use server";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import type { RunWorkspace } from "@/lib/driver-runs";
export type RunActionResult = {
  ok: boolean;
  message: string;
  workspace?: RunWorkspace;
};
export async function saveRunOperation(
  action: string,
  payload: Record<string, unknown>,
  requestKey: string,
  date: string,
): Promise<RunActionResult> {
  const { supabase } = await requireFarmStaff("/farm/runs");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[0-9a-f-]{36}$/i.test(requestKey))
    return { ok: false, message: "Refresh and try again." };
  const { error } = await supabase.rpc("driver_operations_command", {
    p_action: action,
    p_payload: payload,
    p_request_key: requestKey,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "23505"
          ? "That route, driver, vehicle or registration is already in use. Refresh to review the current assignments."
          : error.message,
    };
  const { data, error: readError } = await supabase.rpc(
    "get_driver_run_workspace",
    { p_date: date },
  );
  if (readError)
    return { ok: true, message: "Saved. Refresh to see the latest run." };
  return {
    ok: true,
    message: "Saved. The workday is up to date.",
    workspace: data as RunWorkspace,
  };
}
