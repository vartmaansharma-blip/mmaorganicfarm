import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildDeliveryCalendar, productName } from "@/lib/delivery-calendar";
import { FARM_PRODUCTS, type FarmProductId } from "@/lib/farm-products";
import { formatPlanStartDate, MILK_PLAN_DAYS } from "@/lib/milk-plan";
import { createClient } from "@/lib/supabase/server";
import { markNotificationsRead, requestPlanCancellation, signOut } from "./actions";
import styles from "./account.module.css";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("customer_profiles")
    .select("full_name, email, avatar_url, phone, address_line, postal_code")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: deliveryPlan } = await supabase
    .from("delivery_plans")
    .select(
      "id, status, start_date, bottle_choice, purchased_deliveries, delivered_deliveries, weekly_delivery_items(day_of_week, product_key, quantity, unit), scheduled_delivery_items(delivery_date, product_key, quantity, unit), delivery_exceptions(delivery_date, product_key, action, quantity, unit), delivery_pauses(id, start_date, end_date)",
    )
    .eq("user_id", user.id)
    .in("status", ["pending_confirmation", "active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const [{ data: notifications }, { data: cancellationRequests }] = await Promise.all([
    supabase
      .from("customer_notifications")
      .select("id, title, message, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("cancellation_requests")
      .select("id, plan_id, status, reason, resolution_note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const name = profile?.full_name ?? user.user_metadata.full_name ?? "Customer";
  const email = profile?.email ?? user.email ?? "";
  const googleConnected = user.identities?.some(
    (identity) => identity.provider === "google",
  );
  const hasPhone = Boolean(profile?.phone?.trim());
  const hasAddress = Boolean(profile?.address_line?.trim());
  const hasDeliveryDetails = hasPhone || hasAddress;
  const milkByDay = new Map(
    (deliveryPlan?.weekly_delivery_items ?? [])
      .filter((item) => item.product_key === "milk")
      .map((item) => [item.day_of_week, Number(item.quantity)]),
  );
  const weeklyLitres = [...milkByDay.values()].reduce(
    (total, litres) => total + litres,
    0,
  );
  const productById = new Map(FARM_PRODUCTS.map((product) => [product.id, product]));
  const weeklyAddOnMap = new Map<
    FarmProductId,
    { days: number[]; quantity: number; unit: string }
  >();
  (deliveryPlan?.weekly_delivery_items ?? [])
    .filter((item) => item.product_key !== "milk")
    .forEach((item) => {
      const id = item.product_key as FarmProductId;
      const current = weeklyAddOnMap.get(id) ?? {
        days: [] as number[],
        quantity: Number(item.quantity),
        unit: item.unit,
      };
      current.days.push(item.day_of_week);
      weeklyAddOnMap.set(id, current);
    });
  const scheduledAddOns = [
    ...[...weeklyAddOnMap].map(([id, item]) => ({
      ...item,
      id,
      label: `Every ${item.days
        .sort((a, b) => a - b)
        .map((day) => MILK_PLAN_DAYS[day - 1]?.short)
        .filter(Boolean)
        .join(", ")}`,
    })),
    ...(deliveryPlan?.scheduled_delivery_items ?? []).map((item) => ({
      days: [],
      id: item.product_key as FarmProductId,
      label: `First delivery · ${formatPlanStartDate(item.delivery_date)}`,
      quantity: Number(item.quantity),
      unit: item.unit,
    })),
  ];
  const planStatus =
    deliveryPlan?.status === "active"
      ? "Active"
      : deliveryPlan?.status === "paused"
        ? "Paused"
        : "Awaiting confirmation";
  const purchasedDeliveries = Number(deliveryPlan?.purchased_deliveries ?? 30);
  const deliveredDeliveries = Number(deliveryPlan?.delivered_deliveries ?? 0);
  const remainingDeliveries = Math.max(
    0,
    purchasedDeliveries - deliveredDeliveries,
  );
  const upcomingDeliveries = deliveryPlan
    ? buildDeliveryCalendar({
        days: 7,
        exceptions: deliveryPlan.delivery_exceptions ?? [],
        pauses: deliveryPlan.delivery_pauses ?? [],
        scheduledItems: deliveryPlan.scheduled_delivery_items ?? [],
        startDate: deliveryPlan.start_date,
        weeklyItems: deliveryPlan.weekly_delivery_items ?? [],
      })
    : [];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <Image src="/mma-logo.png" alt="" width={66} height={56} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <Link className={styles.back} href="/#milk">
          Back to milk
        </Link>
      </header>

      <section className={styles.content}>
        {params.message ? <p className={styles.notice}>{params.message}</p> : null}
        {params.error ? <p className={`${styles.notice} ${styles.noticeError}`}>{params.error}</p> : null}
        <div className={styles.pageHeading}>
          <div>
            <p className={styles.eyebrow}>
              Welcome, {name.split(/\s+/)[0]}
            </p>
            <h1>Profile</h1>
            <p className={styles.intro}>
              Your details, delivery routine, and plan in one place.
            </p>
          </div>
          <Link className={styles.startOrder} href="/milk">
            Start an order
          </Link>
        </div>

        <section className={styles.accountSection} aria-labelledby="profile-heading">
          <div className={styles.sectionHeading}>
            <h2 id="profile-heading">Profile</h2>
            <p>Your sign-in identity and delivery contact information.</p>
          </div>

          <div className={styles.profile}>
            {profile?.avatar_url ? (
              <Image
                className={styles.avatar}
                src={profile.avatar_url}
                alt=""
                width={56}
                height={56}
                unoptimized
              />
            ) : (
              <span className={styles.avatarFallback} aria-hidden="true">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className={styles.identity}>
              <strong>{name}</strong>
              <span>{email}</span>
            </div>
            <span className={styles.status}>
              {googleConnected ? "Google connected" : "Email account"}
            </span>
          </div>

          {hasDeliveryDetails ? (
            <dl className={styles.details}>
              {hasPhone ? (
                <div>
                  <dt>Phone</dt>
                  <dd>{profile?.phone}</dd>
                </div>
              ) : null}
              {hasAddress ? (
                <div>
                  <dt>Delivery address</dt>
                  <dd>
                    {[profile?.address_line, profile?.postal_code]
                      .filter(Boolean)
                      .join(", ")}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <Link className={styles.editDetails} href="/order">
            {hasDeliveryDetails ? "Update delivery details" : "Add delivery details"}
          </Link>
        </section>

        {deliveryPlan ? (
          <section className={styles.planSection} aria-labelledby="plan-heading">
            <div className={styles.planHeading}>
              <div>
                <h2 id="plan-heading">Your weekly delivery plan</h2>
                <p>Milk and farm add-ons saved together in one routine.</p>
              </div>
              <span className={styles.planStatus}>{planStatus}</span>
            </div>

            <dl className={styles.planSummary}>
              <div>
                <dt>Starts</dt>
                <dd>{formatPlanStartDate(deliveryPlan.start_date)}</dd>
              </div>
              <div>
                <dt>Each week</dt>
                <dd>{weeklyLitres} L</dd>
              </div>
              <div>
                <dt>Remaining</dt>
                <dd>{remainingDeliveries} deliveries</dd>
              </div>
              <div>
                <dt>Glass bottle</dt>
                <dd>
                  {deliveryPlan.bottle_choice === "new"
                    ? "New bottle"
                    : deliveryPlan.bottle_choice === "return"
                      ? "Return on delivery"
                      : "Not needed"}
                </dd>
              </div>
            </dl>

            <section
              className={styles.upcomingSchedule}
              aria-labelledby="upcoming-deliveries-heading"
            >
              <div className={styles.upcomingHeading}>
                <div>
                  <h3 id="upcoming-deliveries-heading">Next 7 days</h3>
                  <p>One-day quantity changes and skips appear here.</p>
                </div>
                <Link href="/calendar">Change a date</Link>
              </div>
              <div className={styles.upcomingGrid}>
                {upcomingDeliveries.map((day) => {
                  const milk = day.items.find(
                    (item) => item.productKey === "milk",
                  );
                  const addOns = day.items.filter(
                    (item) => item.productKey !== "milk",
                  );
                  const milkSkipped = day.skippedProductKeys.includes("milk");

                  return (
                    <Link
                      href={`/calendar?date=${day.date}`}
                      key={day.date}
                    >
                      <time dateTime={day.date}>{day.dayLabel}</time>
                      <strong>
                        {day.paused
                          ? "Paused"
                          : milkSkipped
                            ? "Milk skipped"
                            : milk
                              ? `${milk.quantity} L milk`
                              : "No milk"}
                      </strong>
                      <small>
                        {addOns.length
                          ? addOns
                              .map((item) => productName(item.productKey))
                              .join(" · ")
                          : day.paused
                            ? "No delivery"
                            : "Open date"}
                      </small>
                    </Link>
                  );
                })}
              </div>
            </section>

            <div className={styles.planWeek} aria-label="Saved weekly milk schedule">
              {MILK_PLAN_DAYS.map((day, index) => {
                const litres = milkByDay.get(index + 1) ?? 0;
                return (
                  <div className={styles.planDay} key={day.label}>
                    <span>{day.short}</span>
                    <strong>{litres ? `${litres} L` : "Skip"}</strong>
                  </div>
                );
              })}
            </div>

            {scheduledAddOns.length ? (
              <div className={styles.addOnSchedule}>
                <strong>Scheduled add-ons</strong>
                <div>
                  {scheduledAddOns.map((item) => (
                    <article key={`${item.id}-${item.label}`}>
                      <span>{productById.get(item.id)?.name ?? item.id}</span>
                      <b>
                        {item.quantity} × {item.unit}
                      </b>
                      <small>{item.label}</small>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            <p className={styles.planNote}>
              Only a completed milk delivery uses one delivery. Skips and pauses
              leave your balance unchanged.
            </p>
            <div className={styles.planActions}>
              <Link className={styles.openCalendar} href="/calendar">
                Open delivery calendar
              </Link>
              <Link className={styles.editPlan} href="/milk?edit=plan">
                Edit normal week
              </Link>
            </div>
            <details className={styles.cancelRequest}>
              <summary>Request plan cancellation</summary>
              <p>The farm reviews the request against preparation and dispatch status. Paid milk is not automatically refunded.</p>
              <form action={requestPlanCancellation}>
                <input name="planId" type="hidden" value={deliveryPlan.id} />
                <label>
                  Reason
                  <textarea name="reason" required minLength={3} rows={3} />
                </label>
                <button type="submit">Send request</button>
              </form>
            </details>
          </section>
        ) : null}

        {(notifications?.length ?? 0) > 0 ? (
          <section className={styles.activitySection} aria-labelledby="activity-heading">
            <div className={styles.activityHeading}>
              <div><h2 id="activity-heading">Updates</h2><p>Payment and delivery activity from the farm.</p></div>
              {notifications?.some((item) => !item.read_at) ? (
                <form action={markNotificationsRead}><button type="submit">Mark all read</button></form>
              ) : null}
            </div>
            <div className={styles.activityList}>
              {notifications?.map((item) => (
                <article className={!item.read_at ? styles.unread : undefined} key={item.id}>
                  <div><strong>{item.title}</strong><span>{item.message}</span></div>
                  <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</time>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {(cancellationRequests?.length ?? 0) > 0 ? (
          <section className={styles.requestSection} aria-labelledby="request-heading">
            <h2 id="request-heading">Cancellation requests</h2>
            {cancellationRequests?.map((request) => (
              <article key={request.id}><div><strong>{request.status.replaceAll("_", " ")}</strong><span>{request.reason}</span></div>{request.resolution_note ? <p>{request.resolution_note}</p> : null}</article>
            ))}
          </section>
        ) : null}

        <div className={styles.accountFooter}>
          <span>Signed in as {email}</span>
          <form action={signOut}>
            <button className={styles.signOut} type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
