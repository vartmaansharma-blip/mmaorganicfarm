import type { Metadata } from "next";
import Link from "next/link";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import { todayInIndia } from "@/lib/delivery-calendar";
import { runSchemaUnavailable, type RunWorkspace } from "@/lib/driver-runs";
import { RunBoard } from "./run-board";
import styles from "./runs.module.css";
export const metadata: Metadata = {
  title: "Delivery runs · M’ma",
  robots: { index: false, follow: false },
};
export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { role, supabase } = await requireFarmStaff("/farm/runs");
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "")
    ? params.date!
    : todayInIndia();
  const { data, error } = await supabase.rpc("get_driver_run_workspace", {
    p_date: date,
  });
  if (error) {
    if (!runSchemaUnavailable(error)) throw error;
    return (
      <main className={styles.page}>
        <section className={styles.welcome}>
          <p>Every delivery, thoughtfully prepared</p>
          <h1>
            A good day starts
            <br />
            with a ready run.
          </h1>
          <span>
            Driver runs are awaiting setup. Your existing delivery route is
            available below.
          </span>
        </section>
        <section className={styles.empty}>
          <span className={styles.seal} aria-hidden="true">
            ↗
          </span>
          <h2>Your route is ready to open</h2>
          <p>Continue with the current dispatch and delivery workflow.</p>
          <Link
            prefetch={false}
            className={styles.primary}
            href={`/farm/${role === "driver" ? "delivery-sheet" : "routes"}?date=${date}`}
          >
            {role === "driver" ? "Open my route" : "Open dispatch board"}{" "}
            <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>
    );
  }
  return <RunBoard initial={data as RunWorkspace} />;
}
