import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseFarmProductSelections } from "@/lib/farm-products";
import {
  formatPlanStartDate,
  MILK_PLAN_DAYS,
  parseWeeklyMilkSchedule,
} from "@/lib/milk-plan";
import {
  calculateOrderPricing,
  type BottleChoice,
} from "@/lib/order-pricing";
import { saveDeliveryDetails } from "./actions";
import styles from "./order.module.css";

export const metadata: Metadata = {
  title: "Start your farm order",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type OrderPageProps = {
  searchParams: Promise<{
    bottle?: "new" | "none" | "return";
    error?: string;
    extras?: string;
    milk?: string;
    purchase?: "once" | "plan";
    schedule?: string;
    start?: string;
  }>;
};

export default async function OrderPage({ searchParams }: OrderPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=%2Forder&message=Sign+in+to+continue+your+order.");
  }

  const { data: profile } = await supabase
    .from("customer_profiles")
    .select("full_name, phone, address_line")
    .eq("user_id", user.id)
    .maybeSingle();

  const firstName = (
    profile?.full_name ??
    user.user_metadata.full_name ??
    user.user_metadata.name ??
    "there"
  ).split(/\s+/)[0];
  const selectedProducts = parseFarmProductSelections(params.extras ?? "");
  const weeklySchedule = parseWeeklyMilkSchedule(params.schedule ?? "");
  const planSchedule = params.purchase === "plan" ? weeklySchedule : null;
  const purchase = params.purchase === "plan" ? "plan" : "once";
  const parsedMilk = Number(params.milk ?? "0");
  const milkLitres = Number.isFinite(parsedMilk) ? Math.max(0, parsedMilk) : 0;
  const bottleChoice: BottleChoice =
    milkLitres === 0 ? "none" : "return";
  const pricing = calculateOrderPricing({
    bottleChoice,
    milkLitres:
      purchase === "plan" && planSchedule
        ? planSchedule.reduce((total, litres) => total + litres, 0)
        : milkLitres,
    products: selectedProducts,
  });
  const hasOrder = milkLitres > 0 || selectedProducts.length > 0;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <Image src="/mma-logo.png" alt="" width={66} height={56} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <Link className={styles.back} href="/milk">
          Back to products
        </Link>
      </header>

      <section className={styles.layout}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Step 2 of 4</p>
          <h1>Where should we bring your order, {firstName}?</h1>
          <p>
            Add a contact number and delivery address. You can review every detail before payment.
          </p>
          <div className={styles.steps} aria-label="Order progress">
            <span className={styles.complete}>Account</span>
            <span className={styles.active}>Delivery details</span>
            <span>Review &amp; pay</span><span>Confirmed</span>
          </div>
          {hasOrder ? (
            <div className={styles.orderSummary}>
              <strong>Your farm order</strong>
              {planSchedule ? (
                <div className={styles.planReview}>
                  <div>
                    <span>Starts</span>
                    <b>{formatPlanStartDate(params.start ?? "")}</b>
                  </div>
                  <div className={styles.weekReview} aria-label="Weekly milk schedule">
                    {MILK_PLAN_DAYS.map((day, index) => (
                      <span key={day.label}>
                        <small>{day.short}</small>
                        <b>{planSchedule[index]} L</b>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedProducts.length ? (
                <div className={styles.productReview}>
                  <span>Added to this farm order</span>
                  <ul>
                    {selectedProducts.map((product) => (
                      <li key={product.id}>
                        <span>
                          {product.name} · {product.quantity} × {product.unit}
                        </span>
                        <b>
                          ₹{product.price * product.quantity} ·{" "}
                          {product.frequency === "weekly"
                            ? `Every ${product.days
                                .map((day) => MILK_PLAN_DAYS[day - 1]?.short)
                                .filter(Boolean)
                                .join(", ")}`
                            : "First delivery"}
                        </b>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <dl className={styles.priceReview}>
                <div>
                  <dt>Milk</dt>
                  <dd>₹{pricing.milkTotal}</dd>
                </div>
                {pricing.recurringAddOnsTotal > 0 ? (
                  <div>
                    <dt>Scheduled add-ons</dt>
                    <dd>₹{pricing.recurringAddOnsTotal}</dd>
                  </div>
                ) : null}
                {pricing.oneTimeAddOnsTotal > 0 ? (
                  <div>
                    <dt>First-delivery add-ons</dt>
                    <dd>₹{pricing.oneTimeAddOnsTotal}</dd>
                  </div>
                ) : null}
                <div className={styles.priceTotal}>
                  <dt>{purchase === "plan" ? "First 7-day estimate" : "Order total"}</dt>
                  <dd>₹{pricing.total}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>

        <form className={styles.form} action={saveDeliveryDetails}>
          <input name="extras" type="hidden" value={params.extras ?? ""} />
          <input name="milk" type="hidden" value={params.milk ?? "1"} />
          <input name="purchase" type="hidden" value={purchase} />
          <input name="schedule" type="hidden" value={params.schedule ?? ""} />
          <input name="start" type="hidden" value={params.start ?? ""} />
          {params.error ? (
            <p className={styles.error} role="alert">
              {params.error}
            </p>
          ) : null}

          <label>
            <span className={styles.fieldLabel}>Phone number</span>
            <div className={styles.phoneField}>
              <span aria-hidden="true">+91</span>
              <input
                aria-describedby="phone-help"
                autoComplete="tel"
                defaultValue={profile?.phone?.replace(/^\+91/, "") ?? ""}
                inputMode="numeric"
                maxLength={10}
                name="phone"
                pattern="[0-9]{10}"
                placeholder="98765 43210"
                required
                type="tel"
              />
            </div>
            <span className={styles.fieldHelp} id="phone-help">
              Used only for delivery updates.
            </span>
          </label>

          <label>
            <span className={styles.fieldLabel}>Delivery address</span>
            <textarea
              aria-describedby="address-help"
              autoComplete="street-address"
              defaultValue={profile?.address_line ?? ""}
              name="address"
              placeholder="House or flat, street, area and landmark"
              required
              rows={4}
            />
            <span className={styles.fieldHelp} id="address-help">
              Add a landmark only when it helps the delivery team find you.
            </span>
          </label>

          {milkLitres > 0 ? (
            <fieldset className={styles.bottleChoice}>
              <legend>Bottle for this delivery</legend>
              <p>The current online milk price uses the return-bottle option.</p>
              <div>
                <label>
                  <input
                    defaultChecked
                    name="bottle"
                    type="radio"
                    value="return"
                  />
                  <span>
                    <strong>I will return a bottle</strong>
                    <small>Milk remains ₹62 per litre.</small>
                  </span>
                </label>
              </div>
              <p>New bottle ordering will be added later.</p>
            </fieldset>
          ) : (
            <input name="bottle" type="hidden" value="none" />
          )}

          <button type="submit">
            Save &amp; review order <span>→</span>
          </button>
          <p className={styles.note}>
            These details are saved securely to your account. No order is placed
            and no payment is taken on this page.
          </p>
        </form>
      </section>
    </main>
  );
}
