import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  addCalendarDays,
  buildDeliveryCalendar,
  estimateCompletionDate,
  formatCalendarDate,
  productName,
  todayInIndia,
} from "@/lib/delivery-calendar";
import { formatPlanStartDate, normalizePlanStartDate } from "@/lib/milk-plan";
import { createClient } from "@/lib/supabase/server";
import {
  removePause,
  saveDateChange,
  saveDeliveryDayChange,
  savePause,
} from "./actions";
import styles from "./calendar.module.css";

export const metadata: Metadata = {
  title: "Your delivery calendar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type CalendarPageProps = {
  searchParams: Promise<{
    date?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in?next=%2Fcalendar");

  const { data: plan } = await supabase
    .from("delivery_plans")
    .select(
      "id, status, start_date, purchased_deliveries, delivered_deliveries, weekly_delivery_items(day_of_week, product_key, quantity, unit), scheduled_delivery_items(delivery_date, product_key, quantity, unit), delivery_exceptions(delivery_date, product_key, action, quantity, unit), delivery_pauses(id, start_date, end_date)",
    )
    .eq("user_id", user.id)
    .in("status", ["pending_confirmation", "active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) redirect("/milk");

  const calendar = buildDeliveryCalendar({
    days: 120,
    exceptions: plan.delivery_exceptions ?? [],
    pauses: plan.delivery_pauses ?? [],
    scheduledItems: plan.scheduled_delivery_items ?? [],
    startDate: plan.start_date,
    weeklyItems: plan.weekly_delivery_items ?? [],
  });
  const upcomingDays = calendar.slice(0, 21);
  const requestedDate = normalizePlanStartDate(params.date ?? "");
  const selectedDay =
    calendar.find((day) => day.date === requestedDate) ?? upcomingDays[0];
  const selectedMilk = selectedDay.items.find(
    (item) => item.productKey === "milk",
  );
  const selectedAddOnKeys = [
    ...selectedDay.items
      .filter((item) => item.productKey !== "milk")
      .map((item) => item.productKey),
    ...selectedDay.skippedProductKeys.filter((key) => key !== "milk"),
  ].filter((key, index, all) => all.indexOf(key) === index);
  const delivered = Number(plan.delivered_deliveries ?? 0);
  const purchased = Number(plan.purchased_deliveries ?? 30);
  const remaining = Math.max(0, purchased - delivered);
  const estimatedCompletion = estimateCompletionDate(calendar, remaining);
  const completionLabel = /^\d{4}-\d{2}-\d{2}$/.test(estimatedCompletion)
    ? formatPlanStartDate(estimatedCompletion)
    : estimatedCompletion;
  const activePauses = (plan.delivery_pauses ?? []).filter(
    (pause) => pause.end_date >= todayInIndia(),
  );
  const statusLabel =
    plan.status === "active"
      ? "Active"
      : plan.status === "paused"
        ? "Paused"
        : "Awaiting confirmation";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <Image src="/mma-logo.png" alt="" width={66} height={56} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <Link className={styles.back} href="/account">
          Profile
        </Link>
      </header>

      <section className={styles.content}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Your delivery routine</p>
            <h1>Delivery calendar</h1>
            <p>
              Skip one day, change its milk quantity, or pause two or more days.
            </p>
          </div>
          <span className={styles.status}>{statusLabel}</span>
        </div>

        <dl className={styles.balance}>
          <div>
            <dt>Purchased</dt>
            <dd>{purchased}</dd>
          </div>
          <div>
            <dt>Delivered</dt>
            <dd>{delivered}</dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd>{remaining}</dd>
          </div>
          <div>
            <dt>Estimated completion</dt>
            <dd>{completionLabel}</dd>
          </div>
        </dl>

        {params.message ? (
          <p className={styles.success} role="status">
            {params.message}
          </p>
        ) : null}
        {params.error ? (
          <p className={styles.error} role="alert">
            {params.error}
          </p>
        ) : null}

        <section className={styles.timeline} aria-labelledby="upcoming-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionNumber}>01</p>
              <h2 id="upcoming-heading">Upcoming deliveries</h2>
            </div>
            <Link href="/milk?edit=plan">Edit normal week</Link>
          </div>

          <div className={styles.dayGrid}>
            {upcomingDays.map((day) => {
              const isSelected = day.date === selectedDay.date;
              const skipped =
                day.items.length === 0 && day.skippedProductKeys.length > 0;
              return (
                <Link
                  aria-current={isSelected ? "date" : undefined}
                  className={isSelected ? styles.daySelected : styles.dayCard}
                  href={`/calendar?date=${day.date}`}
                  key={day.date}
                >
                  <time dateTime={day.date}>{day.dayLabel}</time>
                  {day.paused ? (
                    <strong>Paused</strong>
                  ) : skipped ? (
                    <strong>Skipped</strong>
                  ) : day.items.length ? (
                    <span>
                      {day.items.map((item) => (
                        <small key={item.productKey}>
                          {item.productKey === "milk"
                            ? `${item.quantity} L milk`
                            : productName(item.productKey)}
                        </small>
                      ))}
                    </span>
                  ) : (
                    <strong>No delivery</strong>
                  )}
                </Link>
              );
            })}
          </div>
        </section>

        <section className={styles.editor} aria-labelledby="date-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionNumber}>02</p>
              <h2 id="date-heading">{formatCalendarDate(selectedDay.date)}</h2>
            </div>
            <span>{selectedDay.paused ? "Inside a pause" : "Edit this date only"}</span>
          </div>

          {selectedDay.paused ? (
            <p className={styles.pausedNote}>
              This date is covered by a multi-day pause. Remove that pause below
              before editing this date.
            </p>
          ) : (
            <>
              <form className={styles.dayActions} action={saveDeliveryDayChange}>
                <input name="plan_id" type="hidden" value={plan.id} />
                <input name="date" type="hidden" value={selectedDay.date} />
                <button name="day_action" type="submit" value="skip">
                  Skip this delivery day
                </button>
                <button name="day_action" type="submit" value="normal">
                  Restore normal delivery
                </button>
              </form>

              <div className={styles.itemEditor}>
                <div>
                  <strong>Fresh milk</strong>
                  <span>
                    {selectedDay.skippedProductKeys.includes("milk")
                      ? "Skipped for this date"
                      : selectedMilk
                        ? `${selectedMilk.quantity} L scheduled`
                        : "No milk in the normal routine"}
                  </span>
                </div>
                <form action={saveDateChange}>
                  <input name="plan_id" type="hidden" value={plan.id} />
                  <input name="date" type="hidden" value={selectedDay.date} />
                  <input name="product_key" type="hidden" value="milk" />
                  <label>
                    <span>Milk for this date</span>
                    <select
                      defaultValue={String(selectedMilk?.quantity ?? 1)}
                      name="quantity"
                    >
                      {[1, 2, 3, 4, 5].map((quantity) => (
                        <option key={quantity} value={quantity}>
                          {quantity} L
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <button name="change_action" type="submit" value="override">
                      Save quantity
                    </button>
                    <button name="change_action" type="submit" value="skip">
                      Skip milk only
                    </button>
                    <button name="change_action" type="submit" value="normal">
                      Use normal amount
                    </button>
                  </div>
                </form>
              </div>

              {selectedAddOnKeys.length ? (
                <div className={styles.addOns}>
                  <h3>Add-ons on this date</h3>
                  {selectedAddOnKeys.map((productKey) => {
                    const skipped =
                      selectedDay.skippedProductKeys.includes(productKey);
                    return (
                      <div className={styles.addOnRow} key={productKey}>
                        <span>
                          <strong>{productName(productKey)}</strong>
                          <small>{skipped ? "Skipped" : "Scheduled"}</small>
                        </span>
                        <form action={saveDateChange}>
                          <input name="plan_id" type="hidden" value={plan.id} />
                          <input name="date" type="hidden" value={selectedDay.date} />
                          <input name="product_key" type="hidden" value={productKey} />
                          <button
                            name="change_action"
                            type="submit"
                            value={skipped ? "normal" : "skip"}
                          >
                            {skipped ? "Keep add-on" : "Skip add-on"}
                          </button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className={styles.pauseSection} aria-labelledby="pause-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionNumber}>03</p>
              <h2 id="pause-heading">Pause multiple days</h2>
            </div>
            <span>Minimum 2 consecutive days</span>
          </div>

          <form className={styles.pauseForm} action={savePause}>
            <input name="plan_id" type="hidden" value={plan.id} />
            <input name="selected_date" type="hidden" value={selectedDay.date} />
            <label>
              <span>From</span>
              <input
                defaultValue={selectedDay.date}
                min={todayInIndia()}
                name="start_date"
                type="date"
              />
            </label>
            <label>
              <span>Until</span>
              <input
                defaultValue={addCalendarDays(selectedDay.date, 1)}
                min={addCalendarDays(todayInIndia(), 1)}
                name="end_date"
                type="date"
              />
            </label>
            <button type="submit">Pause deliveries</button>
          </form>

          {activePauses.length ? (
            <div className={styles.pauseList}>
              {activePauses.map((pause) => (
                <div key={pause.id}>
                  <span>
                    <strong>{formatPlanStartDate(pause.start_date)}</strong>
                    <small>through {formatPlanStartDate(pause.end_date)}</small>
                  </span>
                  <form action={removePause}>
                    <input name="plan_id" type="hidden" value={plan.id} />
                    <input name="pause_id" type="hidden" value={pause.id} />
                    <input name="selected_date" type="hidden" value={selectedDay.date} />
                    <button type="submit">Remove pause</button>
                  </form>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
