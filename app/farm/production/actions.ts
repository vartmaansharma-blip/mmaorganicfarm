"use server";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { validOperationalDate } from "@/lib/delivery-operations";
import type { MilkIntakeWorkspace, IntakeHistory } from "@/lib/milk-intake";
export type IntakeResult = {
  ok: boolean;
  message: string;
  workspace?: MilkIntakeWorkspace;
};
export async function saveMilkIntake(
  action: string,
  payload: Record<string, string>,
  requestKey: string,
  date: string,
  page: number,
): Promise<IntakeResult> {
  const { supabase } = await requireFarmManager("/farm/production");
  if (
    !validOperationalDate(date) ||
    !Number.isInteger(page) ||
    page < 0 ||
    page > 10000 ||
    !/^[0-9a-f-]{36}$/i.test(requestKey)
  )
    return {
      ok: false,
      message: "Refresh and review the selected intake day.",
    };
  const { error } = await supabase.rpc("milk_intake_command", {
    p_action: action,
    p_payload: payload,
    p_request_key: requestKey,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === "23505"
          ? "This source and receipt reference are already recorded for the day. Review the existing receipt before adding another."
          : ["22007", "22008", "22P02", "22003", "23514"].includes(error.code)
            ? "Check the receipt time, measured quantities and handling details."
            : error.message,
    };
  const { data, error: readError } = await supabase.rpc(
    "get_milk_intake_workspace",
    { p_date: date, p_page: page },
  );
  return {
    ok: true,
    message: readError
      ? "The intake was saved. Refresh to see its latest records."
      : action === "void"
        ? "Receipt voided. Its evidence remains in history and its quantities are excluded from the day."
        : action === "correct"
          ? "Intake corrected. The previous version remains in history."
          : "Milk intake recorded. The day’s receipt totals are up to date.",
    ...(readError ? {} : { workspace: data as MilkIntakeWorkspace }),
  };
}
export async function loadIntakeHistory(
  id: string,
  before: number | null = null,
): Promise<{ data?: IntakeHistory[]; error?: string }> {
  const { supabase } = await requireFarmManager("/farm/production");
  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    (before !== null && (!Number.isInteger(before) || before < 1))
  )
    return { error: "Choose a valid receipt." };
  const { data, error } = await supabase.rpc("get_milk_intake_history", {
    p_id: id,
    p_before: before,
  });
  return error
    ? { error: "Receipt history couldn’t be loaded. Try again." }
    : { data: data as IntakeHistory[] };
}
