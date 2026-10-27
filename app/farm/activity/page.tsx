import { FarmPageNotice } from "../farm-page-notice";
import { FarmForm } from "../farm-form";
import { todayInIndia, nextDeliveryDateInIndia } from "@/lib/delivery-calendar";
import { retryPreparation } from "./actions";
import { FormSubmitButton } from "../form-submit-button";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { WorkspaceHeader, PageLinks, resultPage } from "../workspace-parts";
import styles from "../operations-workbench.module.css";
export const metadata = {
  title: "Automation & activity",
  robots: { index: false, follow: false },
};
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; error?: string; message?: string }>;
}) {
  const { supabase } = await requireFarmManager("/farm/activity");
  const params = await searchParams;
  const page = resultPage(params.page);
  const runs = await supabase
    .from("delivery_automation_runs")
    .select(
      "id,service_date,status,attempts,started_at,completed_at,error_message,summary",
    )
    .order("started_at", { ascending: false })
    .limit(10);
  if (runs.error) throw runs.error;
  const attempts = await supabase
    .from("delivery_automation_attempts")
    .select("id,service_date,attempt_number,status,completed_at,error_message")
    .order("completed_at", { ascending: false })
    .limit(25);
  if (attempts.error) throw attempts.error;
  const enabled =
    process.env.FARM_AUTOMATION_ENABLED === "true" &&
    Boolean(process.env.CRON_SECRET);
  const result = await supabase
    .from("delivery_operation_events")
    .select("id,delivery_date,action,actor_role,reason,created_at")
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 50, page * 50 + 49);
  if (result.error) throw result.error;
  return (
    <main className={styles.page}>
      <WorkspaceHeader
        title="Automation & activity"
        description="Recorded operational changes and their actors. A completed preparation does not release a route."
      />
      <FarmPageNotice message={params.message} level="success" />
      <FarmPageNotice message={params.error} level="error" />
      <section className={styles.panel}>
        <h2>Nightly draft preparation</h2>
        <p>
          {enabled
            ? "Enabled in this environment. Deployment and recorded runs establish whether the schedule is operating."
            : "Disabled in this environment. Configuration and deployment approval are required before activation."}
        </p>
        <p className={styles.hint}>
          Scheduled target: 21:05 IST for the following service day. Provider
          timing can vary. Draft preparation never releases dispatch, changes
          completed work, charges customers, or sends messages.
        </p>
      </section>
      <section className={styles.panel}>
        <h2>Preparation runs</h2>
        {runs.data.length ? (
          runs.data.map((run) => (
            <article className={styles.reportRow} key={run.id}>
              <strong>
                {run.service_date} · {run.status}
              </strong>
              <span>
                System preparation · attempt {run.attempts} ·{" "}
                {new Date(run.started_at).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                IST
              </span>
              {run.summary?.visits !== undefined ? (
                <span>
                  {run.summary.visits} visits prepared ·{" "}
                  {run.summary.assignment_or_address_blockers}{" "}
                  assignment/address blockers
                </span>
              ) : null}
              {run.error_message ? (
                <p className={styles.error}>{run.error_message}</p>
              ) : null}
              {run.status === "failed" &&
              run.service_date >= todayInIndia() &&
              run.service_date <= nextDeliveryDateInIndia() ? (
                <FarmForm action={retryPreparation}>
                  <input type="hidden" name="date" value={run.service_date} />
                  <FormSubmitButton pendingLabel="Retrying preparation…">
                    Retry preparation
                  </FormSubmitButton>
                </FarmForm>
              ) : null}
            </article>
          ))
        ) : (
          <p>
            No automatic preparation runs recorded yet. This is not evidence of
            a running schedule.
          </p>
        )}
      </section>
      <section className={styles.panel}>
        <h2>Preparation attempt history</h2>
        {attempts.data.length ? (
          attempts.data.map((attempt) => (
            <div className={styles.reportRow} key={attempt.id}>
              <strong>
                {attempt.service_date} · attempt {attempt.attempt_number} ·{" "}
                {attempt.status}
              </strong>
              {attempt.error_message ? (
                <span>{attempt.error_message}</span>
              ) : null}
              <small>
                {new Date(attempt.completed_at).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                IST · immutable record
              </small>
            </div>
          ))
        ) : (
          <p>No completed preparation attempts recorded.</p>
        )}
      </section>
      <section className={styles.panel}>
        <h2>Operational activity</h2>
        {result.data.length ? (
          result.data.map((row) => (
            <div className={styles.reportRow} key={row.id}>
              <strong>
                {row.action.replaceAll("_", " ")} · {row.actor_role}
              </strong>
              <span>{row.reason ?? "Recorded operational action"}</span>
              <small>
                {new Date(row.created_at).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                IST · service day {row.delivery_date}
              </small>
            </div>
          ))
        ) : (
          <p>No operational events recorded.</p>
        )}
      </section>
      <PageLinks
        path="/farm/activity"
        page={page}
        hasMore={result.data.length === 50}
      />
    </main>
  );
}
