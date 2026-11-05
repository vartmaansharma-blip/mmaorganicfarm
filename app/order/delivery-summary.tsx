import { SharedCalendar } from "@/app/shop/shared-calendar";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import { formatCalendarDate } from "@/lib/delivery-calendar";
import type { DeliverySelection, ScheduledDeliverySelection } from "@/lib/delivery-details";
import { MILK_PLAN_DAYS } from "@/lib/milk-plan";
import type { ProductRoutine } from "@/lib/monthly-schedule";
import { priceInPaise } from "@/lib/product-prices";
import styles from "./order.module.css";

const amount = (rupees: number) => formatCheckoutAmount(priceInPaise(rupees));
const frequency: Record<Exclude<ProductRoutine["repeat"], "days" | "custom">, string> = {
  once: "Once", daily: "Every day", weekly: "Weekly", fortnightly: "Every two weeks", monthly: "Monthly",
};

function routineDetail(rule: ProductRoutine, start: string) {
  if (rule.repeat === "days") return MILK_PLAN_DAYS.flatMap((day, index) =>
    rule.week?.[index] ? [`${day.short} ${rule.week[index]} ${rule.id === "milk" ? "L" : "×"}`] : [],
  ).join(" · ");
  if (rule.repeat === "custom") {
    const dates = rule.dates ?? [];
    return `${dates.slice(0, 2).map(formatCalendarDate).join(" · ")}${dates.length > 2 ? ` + ${dates.length - 2} more` : ""}`;
  }
  if (rule.repeat === "weekly" || rule.repeat === "fortnightly") {
    const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "UTC" })
      .format(new Date(`${start}T12:00:00Z`));
    return `${frequency[rule.repeat]} · ${weekday}`;
  }
  return frequency[rule.repeat];
}

function SelectionCard({ selection }: { selection: DeliverySelection | ScheduledDeliverySelection }) {
  const plan = "rules" in selection ? selection : null;
  const { pricing } = selection;
  const productSubtotal = selection.lines.reduce((sum, line) => sum + line.line_total_paise, 0);
  const fees = [
    ["Delivery", pricing.deliveryCharge],
    ["Handling", pricing.handlingCharge],
    ["Platform", pricing.platformCharge],
  ] as const;
  const headingId = plan ? "scheduled-deliveries" : "one-time-delivery";
  return <section className={styles.selectionCard} aria-labelledby={headingId}>
    <header>
      <div><h3 id={headingId}>{plan ? "Scheduled deliveries" : "One-time delivery"}</h3>
        <p>{plan ? `Starts ${formatCalendarDate(plan.start)} · ${plan.days.length} delivery ${plan.days.length === 1 ? "date" : "dates"}`
          : formatCalendarDate(selection.start)}</p>
      </div>
    </header>
    <ul className={styles.selectionItems}>
      {selection.lines.map((line) => {
        const rule = plan?.rules.find(({ id }) => id === line.product_key);
        const isMilk = line.product_key === "milk";
        return <li key={line.product_key}>
          <div>
            <strong>{line.product_name}</strong>
            <span>{line.quantity} {isMilk ? "L" : `× ${line.unit}`}{plan ? " in total" : ""} · {formatCheckoutAmount(line.unit_price_paise)} / {isMilk ? "L" : line.unit}</span>
            {rule && <span>{routineDetail(rule, line.delivery_date)}{rule.repeat !== "custom" && (
              <> · {rule.repeat === "once" ? "" : "First "}{formatCalendarDate(line.delivery_date)}</>
            )}</span>}
          </div>
          <b>{formatCheckoutAmount(line.line_total_paise)}</b>
        </li>;
      })}
    </ul>
    {plan && <details className={styles.calendarPreview}>
      <summary>See delivery calendar</summary>
      <SharedCalendar start={plan.start} rules={plan.rules} />
    </details>}
    <dl className={styles.selectionFees}>
      <div><dt>Products subtotal</dt><dd>{formatCheckoutAmount(productSubtotal)}</dd></div>
      {fees.map(([label, charge]) => <div key={label}><dt>{label}</dt><dd>{amount(charge)}</dd></div>)}
      {selection.bottle !== "none" && <div><dt>Return bottles</dt><dd>{amount(pricing.bottleCharge)}</dd></div>}
      <div className={styles.selectionTotal}><dt>{plan ? "Scheduled total" : "One-time total"}</dt><dd>{amount(pricing.total)}</dd></div>
    </dl>
  </section>;
}

export function DeliverySummary({ once, scheduled }: {
  once?: DeliverySelection | null;
  scheduled?: ScheduledDeliverySelection | null;
}) {
  const combined = Boolean(once && scheduled);
  return <section className={styles.completeOrder} aria-labelledby="complete-order-title">
    <h2 id="complete-order-title">Your complete order</h2>
    {once && <SelectionCard selection={once} />}
    {scheduled && <SelectionCard selection={scheduled} />}
    {combined && <div className={styles.combinedTotal}>
      <div><strong>Combined total</strong><span>One payment at review</span></div>
      <b data-checkout-total>{formatCheckoutAmount(priceInPaise(once!.pricing.total) + priceInPaise(scheduled!.pricing.total))}</b>
    </div>}
    {(once?.bottle === "return" || scheduled?.bottle === "return") &&
      <p className={styles.bottleNote}>The total assumes you’ll return the bottles. You can choose to keep them at payment and see the updated total.</p>}
    {scheduled && scheduled.days.length > 1 && <p className={styles.bottleNote}>
      Delivery dates span {formatCalendarDate(scheduled.days[0].date)} to {formatCalendarDate(scheduled.days.at(-1)!.date)}.
    </p>}
  </section>;
}
