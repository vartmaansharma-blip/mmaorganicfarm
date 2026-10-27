import { FarmPageNotice } from "../farm-page-notice";
import Link from "next/link";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { FARM_PRODUCTS } from "@/lib/farm-products";
import { readProductCatalogue } from "@/lib/product-prices-server";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import { FarmForm } from "../farm-form";
import { FormSubmitButton } from "../form-submit-button";
import { updateProductPrices } from "./actions";
import { WorkspaceHeader } from "../workspace-parts";
import styles from "../operations-workbench.module.css";
export const metadata = {
  title: "Farm settings",
  robots: { index: false, follow: false },
};
export default async function SettingsPage({searchParams}: {searchParams: Promise<{error?: string; message?: string}>}) {
  const { role, supabase } = await requireFarmManager("/farm/settings");
  const catalogue = await readProductCatalogue();
  const messages = await searchParams;
  const {data: changes} = await supabase.from("farm_change_log").select("id,reason,before_state,after_state,created_at").eq("record_type","catalogue").order("created_at",{ascending:false}).limit(12);
  const products = [{id:"milk",name:"Fresh milk",unit:"1 litre"}, ...FARM_PRODUCTS, {id:"bottle",name:"New glass bottle",unit:"per litre"}] as const;
  return (
    <main className={styles.page}>
      <WorkspaceHeader
        title="Settings"
        description="The farm's existing configuration, with staff access separated from daily operations."
      />
      <section className={styles.panel}>
        <h2>Operations</h2>
        <div className={styles.links}>
          <Link prefetch={false} href="/farm/routes">Service zones & route defaults</Link>
          <Link prefetch={false} href="/farm/capacity">Product capacity & date overrides</Link>
          {role === "admin" ? (
            <Link prefetch={false} href="/farm/staff">Staff & access</Link>
          ) : null}
        </div>
      </section>
      <section className={styles.panel}>
        <h2>Products & pricing</h2>
        <p className={styles.hint}>New orders use these prices. Existing orders keep their agreed prices.</p>
        <FarmPageNotice message={messages.error} level="error" />
        <FarmPageNotice message={messages.message} level="success" />
        {role === "admin" ? <FarmForm action={updateProductPrices} className={styles.actionForm}>
          <input type="hidden" name="revision" value={catalogue.revision} />
          <fieldset><legend>Product prices · INR</legend><div className={styles.priceGrid}>
            {products.map(product => <label key={product.id}>{product.name} · {product.unit}<span className={styles.priceInput}><span aria-hidden="true">₹</span><input key={`${catalogue.revision}:${product.id}`} aria-label={`${product.name} price in rupees`} name={product.id} type="number" min="0.01" max="100000" step="0.01" required defaultValue={catalogue.prices[product.id]} /></span></label>)}
          </div><label>Reason for change<textarea name="reason" minLength={3} maxLength={300} required rows={2} placeholder="For example: updated farm production cost" /></label>
          <FormSubmitButton pendingLabel="Saving prices…">Save product prices</FormSubmitButton></fieldset>
        </FarmForm> : products.map(product => <div key={product.id} className={styles.reportRow}><strong>{product.name} · {product.unit}</strong><span>{formatCheckoutAmount(Math.round(catalogue.prices[product.id]*100))}</span></div>)}
        {changes?.length ? <details className={styles.history}><summary>Price history · {changes.length}</summary>{changes.map(change => <article className={styles.reportRow} key={change.id}><strong>{change.reason}</strong><small>{new Date(change.created_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}</small><span>{products.map(product => `${product.name}: ${formatCheckoutAmount(change.before_state[product.id])} → ${formatCheckoutAmount(change.after_state[product.id])}`).join(" · ")}</span></article>)}</details> : null}
      </section>
      <section className={styles.panel}>
        <h2>Service policy</h2>
        <p>
          Full skips preserve prepaid service at plan end. Reduced prepaid milk
          is delivered the next calendar day. Only additional milk is charged;
          no automatic refunds.
        </p>
        <p className={styles.hint}>
          Customers cancel their own plans immediately, without approval. Delivery changes and other requests go to the Inbox for review.
        </p>
      </section>
    </main>
  );
}
