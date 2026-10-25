import { FarmForm } from "../farm-form";
import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { todayInIndia } from "@/lib/delivery-calendar";
import {
  validOperationalDate,
  type Reconciliation,
} from "@/lib/delivery-operations";
import { WorkspaceHeader } from "../workspace-parts";
import styles from "../operations-workbench.module.css";
export const metadata = {
  title: "Bottles",
  robots: { index: false, follow: false },
};
export default async function BottlesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { supabase } = await requireFarmManager("/farm/bottles");
  const date =
    validOperationalDate((await searchParams).date) ?? todayInIndia();
  const result = await supabase.rpc("get_delivery_reconciliation", {
    p_date: date,
  });
  if (result.error) throw result.error;
  const data = result.data as Reconciliation;
  return (
    <main className={styles.page}>
      <WorkspaceHeader
        title="Bottles"
        description="Documented visit returns, with a clear boundary between today's records and a verified physical stock count."
      />
      <FarmForm className={styles.filters}>
        <label>
          Service date
          <input name="date" type="date" defaultValue={date} />
        </label>
        <button>Apply</button>
      </FarmForm>
      <section className={styles.metrics}>
        <article>
          <strong>{data.bottle_returns_expected}</strong>
          <span>Documented return expectations</span>
        </article>
        <article>
          <strong>{data.bottle_returns_recorded}</strong>
          <span>Recorded returns</span>
        </article>
      </section>
      <section className={styles.panel}>
        <h2>Visit return records</h2>
        <p>{data.bottle_count_scope}</p>
        <p className={styles.hint}>
          These counts use existing per-delivery return records. They do not
          establish the number of physical bottles loaded, delivered, held by
          customers, damaged, or in farm stock.
        </p>
        <Link prefetch={false} href={`/farm/delivery-sheet?date=${date}`}>
          Record returns on the assigned visit →
        </Link>
      </section>
      <section className={styles.panel} data-attention="true">
        <h2>Physical stock balance is unverified</h2>
        <p>
          A dated opening count and quantity-based bottle movements are required
          before displaying a trustworthy farm or customer balance. No balance
          or write-off is inferred from missing history.
        </p>
        <Link prefetch={false} href={`/farm/reconciliation?date=${date}`}>
          Review documented discrepancies →
        </Link>
      </section>
    </main>
  );
}
