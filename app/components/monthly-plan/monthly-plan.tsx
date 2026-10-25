import Link from "next/link";
import { formatCalendarDate, productName } from "@/lib/delivery-calendar";
import styles from "./monthly-plan.module.css";

type DatedItem = {
  delivery_date: string;
  product_key: string;
  quantity: number;
  unit: string;
};
export function MonthlyPlan({
  id,
  start,
  end,
  status,
  items,
  deliveredDates = [],
  preview = false,
}: {
  id: string;
  start: string;
  end: string;
  status: string;
  items: DatedItem[];
  deliveredDates?: string[];
  preview?: boolean;
}) {
  const dates = [...new Set(items.map((item) => item.delivery_date))].sort();
  const delivered = new Set(deliveredDates);
  return (
    <section className={styles.plan} aria-label="Your monthly delivery plan">
      <div className={styles.heading}>
        <h2>Your monthly plan.</h2>
        <span>{status.replaceAll("_", " ")}</span>
      </div>
      <p>
        {formatCalendarDate(start)} to {formatCalendarDate(end)} (end date
        excluded). One prepaid period; no automatic renewal.
      </p>
      <p>
        {preview
          ? "Draft dates — confirmed after payment."
          : `${dates.filter((date) => delivered.has(date)).length} of ${dates.length} delivery dates completed.`}
      </p>
      <details open={preview}>
        <summary>
          {preview ? "Review exact delivery dates" : "See all delivery dates"}
        </summary>
        <ul>
          {dates.map((date) => (
            <li key={date}>
              <div>
                <time dateTime={date}>{formatCalendarDate(date)}</time>
                <small>
                  {delivered.has(date)
                    ? "Delivered"
                    : preview
                      ? "Planned"
                      : "Scheduled"}
                </small>
              </div>
              <p>
                {items
                  .filter((item) => item.delivery_date === date)
                  .map(
                    (item) =>
                      `${productName(item.product_key)} · ${Number(item.quantity)} ${item.unit}`,
                  )
                  .join(" / ")}
              </p>
            </li>
          ))}
        </ul>
      </details>
      {!preview ? (
        <>
          <Link href={`/calendar?plan=${id}`}>Open delivery calendar →</Link>
          <p>
            Need to change a paid delivery?{" "}
            <a href="https://wa.me/919818804419">Contact the farm</a> before
            preparation. Paid quantities are preserved; no cash refunds.
          </p>
        </>
      ) : null}
    </section>
  );
}
