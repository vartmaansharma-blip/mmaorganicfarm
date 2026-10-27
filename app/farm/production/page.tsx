import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { todayInIndia } from "@/lib/delivery-calendar";
import { validOperationalDate } from "@/lib/delivery-operations";
import type { MilkIntakeWorkspace } from "@/lib/milk-intake";
import { resultPage } from "../workspace-parts";
import { IntakeBoard } from "./intake-board";
import styles from "./production.module.css";
export const metadata = {
  title: "Milk intake · M’ma",
  robots: { index: false, follow: false },
};
export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; page?: string }>;
}) {
  const { supabase } = await requireFarmManager("/farm/production");
  const params = await searchParams,
    date = validOperationalDate(params.date) ?? todayInIndia(),
    page = resultPage(params.page);
  const { data, error } = await supabase.rpc("get_milk_intake_workspace", {
    p_date: date,
    p_page: page,
  });
  if (error) {
    if (!["PGRST202", "42883"].includes(error.code)) throw error;
    return (
      <main className={styles.page}>
        <header className={styles.hero}>
          <p>From the farm, carefully recorded</p>
          <h1>Every litre starts here.</h1>
          <span>
            Milk intake is awaiting activation. Existing capacity and delivery
            work remains available.
          </span>
        </header>
        <section className={styles.panel}>
          <h2>The intake ledger is being connected</h2>
          <p>
            Physical receipts appear here once the reviewed data foundation is
            ready.
          </p>
          <Link href="/farm/capacity">Open production capacity ↗</Link>
        </section>
      </main>
    );
  }
  return (
    <IntakeBoard
      key={`${date}:${page}`}
      initial={data as MilkIntakeWorkspace}
      today={todayInIndia()}
    />
  );
}
