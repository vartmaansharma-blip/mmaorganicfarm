import { authorizedAutomation } from "@/lib/automation-auth";
import { createAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (
    !authorizedAutomation(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.FARM_AUTOMATION_ENABLED !== "true")
    return Response.json({ status: "disabled" }, { status: 503 });
  try {
    const { data, error } = await createAdminClient().rpc(
      "run_nightly_dispatch_preparation",
    );
    if (error) throw error;
    if (data?.status === "failed") {
      console.error("Nightly dispatch preparation failed", {
        runId: data.run_id,
      });
      return Response.json(
        { status: "failed", runId: data.run_id },
        { status: 500 },
      );
    }
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(
      "Nightly dispatch preparation unavailable",
      error instanceof Error ? error.message : "Database request failed",
    );
    return Response.json(
      { error: "Preparation unavailable. Review automation activity." },
      { status: 500 },
    );
  }
}
