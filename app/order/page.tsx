import { randomUUID } from "node:crypto";
import { CHECKOUT_ID, bottleMode, combinedSelection, oneTimeSelection, scheduledSelection } from "@/lib/delivery-details";
import { nextDeliveryDateInIndia } from "@/lib/delivery-calendar";
import { CheckoutCartLink } from "@/app/shop/shop-state";
import { DeliveryBottleFields, DeliveryBottlePicker, DeliveryBottleProvider, LegacyBottleTotal } from "./bottle-choice";
import { priceInPaise } from "@/lib/product-prices";
import { DeliverySummary } from "./delivery-summary";
import { readProductCatalogue } from "@/lib/product-prices-server";
import { parseRoutines, quoteMonthlySchedule } from "@/lib/monthly-schedule";
import { SharedCalendar } from "@/app/shop/shared-calendar";
import { orderReturnPath } from "@/lib/shop-draft";
import { firstScheduledPlanStart } from "@/lib/first-scheduled-plan";
import { PageNavigationControls } from "@/app/components/page-navigation-controls";
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
  calculatePlanPricing,
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
    routine?: string;
    nextPlan?: string;
    combineWith?: string;
    checkout?: string;
  }>;
};

export default async function OrderPage({ searchParams }: OrderPageProps) {
  const params = await searchParams;
  if (Object.values(params).some((value) => typeof value !== "string")
    || (params.nextPlan !== undefined && (!params.nextPlan || params.nextPlan.length > 1200))
    || (params.checkout && !params.nextPlan)) redirect("/shop");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(orderReturnPath(params))}&message=Sign+in+to+continue+your+order.`,
    );
  }

  const { data: profile } = await supabase
    .from("customer_profiles")
    .select("full_name, phone, address_line")
    .eq("user_id", user.id)
    .maybeSingle();

  const name = profile?.full_name ?? user.user_metadata.full_name ?? user.user_metadata.name;
  const fullName = typeof name === "string" && name.trim() ? name.trim() : "";
  const firstName = fullName.split(/\s+/)[0] || "there";
  const { prices, revision } = await readProductCatalogue();
  const selectedProducts = parseFarmProductSelections(params.extras ?? "", prices);
  const weeklySchedule = parseWeeklyMilkSchedule(params.schedule ?? "");
  const planSchedule = params.purchase === "plan" ? weeklySchedule : null;
  const purchase = params.purchase === "plan" ? "plan" : "once";
  const monthlyRules =
    purchase === "plan" && params.routine
      ? parseRoutines(params.start ?? "", params.routine)
      : null;
  const parsedMilk = Number(params.milk ?? "0");
  const milkLitres = Number.isFinite(parsedMilk) ? Math.max(0, parsedMilk) : 0;
  const bottleChoice: BottleChoice = (
    monthlyRules ? !monthlyRules.some((r) => r.id === "milk") : milkLitres === 0
  )
    ? "none"
    : "return";
  const firstPlanStart =
    params.purchase === "plan" || params.nextPlan
      ? await firstScheduledPlanStart(supabase, user.id)
      : null;
  const minimum = nextDeliveryDateInIndia();
  const basket = params.nextPlan && !params.combineWith
    ? combinedSelection({ ...params, bottle: "return" }, params.nextPlan, prices, minimum, firstPlanStart)
    : null;
  if (basket && !CHECKOUT_ID.test(params.checkout ?? "")) {
    const url = new URL(orderReturnPath({ ...params, checkout: randomUUID() }), "https://mma.invalid");
    if (params.error) url.searchParams.set("error", params.error);
    redirect(`${url.pathname}${url.search}`);
  }
  const once = basket?.once ?? (!params.nextPlan && params.start ? oneTimeSelection({ ...params, bottle: "return" }, prices, minimum) : null);
  const scheduled = basket?.scheduled ?? (!params.nextPlan ? scheduledSelection({ ...params, bottle: "return" }, prices, minimum, firstPlanStart) : null);
  const modern = Boolean(params.nextPlan || params.routine || (params.purchase === "once" && params.start));
  const invalid = modern && !once && !scheduled;
  const pricing = monthlyRules
    ? quoteMonthlySchedule({ prices,
        start: params.start ?? "",
        rules: monthlyRules,
        bottleChoice,
        firstPlanStart: firstPlanStart ?? params.start,
      })
    : purchase === "plan" && planSchedule
      ? calculatePlanPricing({ prices,
          bottleChoice,
          products: selectedProducts,
          schedule: planSchedule,
          startDate: params.start ?? "",
          firstPlanStart: firstPlanStart ?? params.start ?? "",
        })
      : calculateOrderPricing({ prices,
          bottleChoice,
          milkLitres,
          products: selectedProducts,
        });
  const hasOrder =
    Boolean(monthlyRules) || milkLitres > 0 || selectedProducts.length > 0;

  const bottleLitres = basket
    ? basket.once.pricing.milkLitres + basket.scheduled.pricing.milkLitres
    : (once ?? scheduled)?.pricing.milkLitres ?? pricing.milkLitres;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link
          className={`${styles.brand} customer-header-brand`}
          aria-label="M'ma Organic Farm"
          href="/"
        >
          <Image src="/mma-logo.png" alt="" width={66} height={56} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <div className="customer-header-actions">
          <Link className={styles.back} href="/shop">
            Back to products
          </Link>
          <PageNavigationControls />
        </div>
      </header>

      <DeliveryBottleProvider key={params.bottle ?? "return"} initialMode={bottleMode(params.bottle)} unitPricePaise={priceInPaise(prices.bottle)}>
      <section className={`${styles.layout} ${basket ? styles.unifiedLayout : ""}`}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Step 2 of 4</p>
          <h1>Where should we bring your order, {firstName}?</h1>
          <p>
            Add a contact number and delivery address. You can review every
            detail before payment.
          </p>
          <div className={styles.steps} aria-label="Order progress">
            <span className={styles.complete}>Account</span>
            <span className={styles.active} aria-current="step">Delivery details</span>
            <span>Review &amp; pay</span>
            <span>Confirmed</span>
          </div>
          {invalid ? (
            <div className={styles.orderSummary}>
              <p role="alert">Some selected items or delivery dates need review before you can continue.</p>
              <CheckoutCartLink>Review your saved cart →</CheckoutCartLink>
            </div>
          ) : once || scheduled ? <DeliverySummary once={once} scheduled={scheduled} sharedDate={basket?.sharedDate} /> : hasOrder ? (
            <div className={styles.orderSummary}>
              <strong>Your farm order</strong>
              {bottleLitres > 0 && <DeliveryBottlePicker />}
              {monthlyRules ? (
                <SharedCalendar start={params.start!} rules={monthlyRules} />
              ) : null}
              {planSchedule ? (
                <div className={styles.planReview}>
                  <div>
                    <span>Starts</span>
                    <b>{formatPlanStartDate(params.start ?? "")}</b>
                  </div>
                  <div
                    className={styles.weekReview}
                    aria-label="Weekly milk schedule"
                  >
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
                    <dt>{monthlyRules ? "Paneer & ghee" : "Scheduled add-ons"}</dt>
                    <dd>₹{pricing.recurringAddOnsTotal}</dd>
                  </div>
                ) : null}
                {pricing.oneTimeAddOnsTotal > 0 ? (
                  <div>
                    <dt>First-delivery add-ons</dt>
                    <dd>₹{pricing.oneTimeAddOnsTotal}</dd>
                  </div>
                ) : null}
          {pricing.handlingCharge > 0 && <div><dt>Handling</dt><dd>₹{pricing.handlingCharge}</dd></div>}
          {pricing.platformCharge > 0 && <div><dt>Platform fee</dt><dd>₹{pricing.platformCharge}</dd></div>}
                <div>
                  <dt>Delivery</dt>
                  <dd>
                    {pricing.deliveryCharge
                      ? `₹${pricing.deliveryCharge}`
                      : "Free"}
                  </dd>
                </div>
                <div className={styles.priceTotal}>
                  <dt>
                    {monthlyRules
                      ? "Monthly plan total"
                      : purchase === "plan"
                        ? "30-delivery plan total"
                        : "Order total"}
                  </dt>
                  <dd><LegacyBottleTotal milkLitres={bottleLitres} totalPaise={priceInPaise(pricing.total)} /></dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>

        {!invalid && <form className={styles.form} action={saveDeliveryDetails}>
          <input name="extras" type="hidden" value={params.extras ?? ""} />
          <input name="milk" type="hidden" value={params.milk ?? "0"} />
          <input name="purchase" type="hidden" value={purchase} />
          <input name="schedule" type="hidden" value={params.schedule ?? ""} />
          <input name="routine" type="hidden" value={params.routine ?? ""} />
          <input name="start" type="hidden" value={params.start ?? ""} />
          {basket && <>
            <input name="nextPlan" type="hidden" value={params.nextPlan} />
            <input name="checkout" type="hidden" value={params.checkout} />
            <input name="catalogueRevision" type="hidden" value={revision} />
          </>}
          <DeliveryBottleFields milkLitres={bottleLitres} totalPaise={basket?.totalPaise} />
          {params.combineWith ? <input name="combineWith" type="hidden" value={params.combineWith} /> : null}
          {params.error ? (
            <p className={styles.error} role="alert">
              {params.error} <CheckoutCartLink>Review cart →</CheckoutCartLink>
            </p>
          ) : null}

          <h2 className={styles.formTitle}>Delivery address</h2>
          {fullName && <p className={styles.recipient}><span>Delivering to</span> <strong>{fullName}</strong></p>}
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
              className={styles.addressField}
              aria-describedby="address-help"
              autoComplete="street-address"
              defaultValue={profile?.address_line ?? ""}
              name="address"
              placeholder="House or flat, street, area and landmark"
              minLength={8}
              maxLength={500}
              required
              rows={4}
            />
            <span className={styles.fieldHelp} id="address-help">
              Add a landmark only when it helps the delivery team find you.
            </span>
          </label>

          <button className={styles.submitButton} type="submit">
            Save delivery details &amp; review order <span aria-hidden="true">→</span>
          </button>
          <p className={styles.note}>
            These details are saved securely to your account. No order is placed
            and no payment is taken on this page.
          </p>
        </form>}
      </section>
      </DeliveryBottleProvider>
    </main>
  );
}
