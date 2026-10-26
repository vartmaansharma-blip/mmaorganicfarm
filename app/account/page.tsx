import { MonthlyPlan } from "@/app/components/monthly-plan/monthly-plan";
import { PageNavigationControls } from "@/app/components/page-navigation-controls";
import { AccountNavigation, accountSections, type AccountSection } from "./account-navigation";
import { AccountDate, TodayDelivery } from "./today-delivery";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { loadCustomerDelivery } from "@/lib/customer-delivery-data";
import { CustomerDeliveryHistory } from "@/app/farm/customer-delivery-history";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCheckoutAmount } from "@/lib/checkout-display";
import { buildDeliveryCalendar, productName, todayInIndia } from "@/lib/delivery-calendar";
import { FARM_PRODUCTS, type FarmProductId } from "@/lib/farm-products";
import { formatPlanStartDate, MILK_PLAN_DAYS } from "@/lib/milk-plan";
import { createClient } from "@/lib/supabase/server";
import {
  markNotificationsRead,
  signOut,
} from "./actions";
import styles from "./account.module.css";
import { PlanCancellationForm } from "./plan-cancellation-form";

export const metadata: Metadata = {
  title: "My M’ma",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; section?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const section: AccountSection = accountSections.includes(params.section as AccountSection) ? params.section as AccountSection : "today";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const todayResult = section === "today" ? loadCustomerDelivery(supabase, user.id).catch(() => null) : Promise.resolve(null);
  const { data: profile, error: profileError } = await supabase
    .from("customer_profiles")
    .select("full_name, email, avatar_url, phone, address_line, postal_code")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: deliveryPlans, error: plansError } = await supabase
    .from("delivery_plans")
    .select(
      "id, status, start_date, bottle_choice, billing_model, period_end_exclusive, purchased_deliveries, delivered_deliveries, weekly_delivery_items(day_of_week, product_key, quantity, unit), scheduled_delivery_items(delivery_date, product_key, quantity, unit), delivery_exceptions(delivery_date, product_key, action, quantity, unit), delivery_pauses(id, start_date, end_date)",
    )
    .eq("user_id", user.id)
    .in("status", ["pending_confirmation", "active", "paused"])
    .order("created_at", { ascending: false });
  const [
    { data: notifications, error: notificationsError },
    { data: cancellationRequests, error: requestsError },
    { data: orders, error: ordersError },
  ] = await Promise.all([
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
    supabase
      .from("orders")
      .select(
        "id, status, purchase_mode, total_paise, paid_total_paise, start_date, created_at, order_items(id, product_name, quantity, unit)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const selectedPlan = deliveryPlans?.find(plan => plan.id === params.plan) ?? deliveryPlans?.[0];
  const todaySnapshot = await todayResult;
  const { data: monthlyCompleted } =
    section === "deliveries" && selectedPlan?.billing_model === "calendar_month"
      ? await supabase
          .from("daily_deliveries")
          .select("delivery_date")
          .eq("plan_id", selectedPlan.id)
          .eq("user_id", user.id)
          .eq("status", "delivered")
          .eq("delivery_confirmed", true)
          .eq("is_test", false)
      : { data: null };
  const name = profile?.full_name ?? user.user_metadata.full_name ?? "Customer";
  const email = profile?.email ?? user.email ?? "";
  const googleConnected = user.identities?.some(
    (identity) => identity.provider === "google",
  );
  const hasPhone = Boolean(profile?.phone?.trim());
  const hasAddress = Boolean(profile?.address_line?.trim());
  const hasDeliveryDetails = hasPhone || hasAddress;
  const deliveryPlan = selectedPlan ?? null;
  const totalPlanBalance = (deliveryPlans ?? []).reduce(
    (total, plan) =>
      total +
      Math.max(
        0,
        Number(plan.purchased_deliveries) - Number(plan.delivered_deliveries),
      ),
    0,
  );
  const milkByDay = new Map(
    (deliveryPlan?.weekly_delivery_items ?? [])
      .filter((item) => item.product_key === "milk")
      .map((item) => [item.day_of_week, Number(item.quantity)]),
  );
  const weeklyLitres = [...milkByDay.values()].reduce(
    (total, litres) => total + litres,
    0,
  );
  const productById = new Map(
    FARM_PRODUCTS.map((product) => [product.id, product]),
  );
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
        <Link
          className={`${styles.brand} customer-header-brand`}
          aria-label="M'ma Organic Farm"
          href="/"
        >
          <Image src="/mma-logo.png" alt="" width={66} height={56} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <div className="customer-header-actions">
          <Link className={styles.back} href="/milk">
            Back to shop
          </Link>
          <PageNavigationControls />
        </div>
      </header>

      <div className={styles.accountLayout}>
      <AccountNavigation section={section} />
      <section className={styles.content}>
        {params.message ? (
          <p className={styles.notice}>{params.message}</p>
        ) : null}
        {params.error ? (
          <p className={`${styles.notice} ${styles.noticeError}`}>
            {params.error}
          </p>
        ) : null}
        <div className={styles.pageHeading}>
          <div>
            <p className={styles.eyebrow}>{section === "today" ? `Welcome, ${name.split(/\s+/)[0]}` : "My M’ma"}</p>
            <h1>{section === "today" ? "Today" : section === "deliveries" ? "Your deliveries" : section === "orders" ? "Orders" : "Settings"}</h1>
            <p className={styles.intro}>{section === "today" ? "A little closer to the farm, every day." : section === "deliveries" ? "Your routine, upcoming dates and recorded delivery results." : section === "orders" ? "Your purchases and payment details, together." : "The details that make it yours."}</p>
          </div>
          {section === "today" ? <AccountDate initialDate={todayInIndia()} /> : <Link className={styles.startOrder} href="/milk">Start an order</Link>}
        </div>
        {section === "today" ? <>
          <TodayDelivery initial={todaySnapshot} />
          <Link className={styles.contactSummary} href="/account?section=settings"><span><strong>Delivering to you</strong><small>{hasAddress ? [profile?.address_line, profile?.postal_code].filter(Boolean).join(", ") : "Add your delivery address in Settings."}</small></span><span>Manage details →</span></Link>
        </> : null}
        {section === "settings" ? <>
        {profileError ? <p className={styles.noticeError}>Your personal details couldn’t be loaded. Please refresh this page.</p> : null}
        <section
          className={styles.accountSection}
          aria-labelledby="profile-heading"
        >
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

          <Link prefetch={false} className={styles.editDetails} href="/order">
            {hasDeliveryDetails
              ? "Update delivery details"
              : "Add delivery details"}
          </Link>
        </section>

        <section className={styles.settingsGroup} aria-labelledby="appearance-heading"><div><h2 id="appearance-heading">Appearance</h2><p>Make yourself comfortable. Your theme stays with you across the shop.</p></div><ThemeToggle /></section>
        <section className={styles.settingsGroup} aria-labelledby="sign-in-heading"><div><h2 id="sign-in-heading">Sign-in & account</h2><p>{googleConnected ? "Connected through Google." : "Signed in with your email address."}</p></div><form action={signOut}><button className={styles.textAction} type="submit">Sign out</button></form></section>
        </> : null}
        {section === "deliveries" ? <>
        {plansError ? <p className={styles.noticeError}>We couldn’t load your plans. Please refresh to try again.</p> : null}
        {(deliveryPlans?.length ?? 0) > 1 ? <nav className={styles.planPicker} aria-label="Choose a plan">{deliveryPlans?.map((plan, index) => <Link key={plan.id} aria-current={deliveryPlan?.id === plan.id ? "page" : undefined} href={`/account?section=deliveries&plan=${plan.id}`}>{plan.billing_model === "calendar_month" ? "Monthly plan" : "Weekly plan"} {deliveryPlans.length - index}<small>{plan.status.replaceAll("_", " ")}</small></Link>)}</nav> : null}
        {deliveryPlan?.billing_model === "calendar_month" ? (
          <MonthlyPlan
            id={deliveryPlan.id}
            start={deliveryPlan.start_date}
            end={deliveryPlan.period_end_exclusive}
            status={deliveryPlan.status}
            deliveredDates={(monthlyCompleted ?? []).map(
              (x) => x.delivery_date,
            )}
            items={deliveryPlan.scheduled_delivery_items.map((x) => ({
              ...x,
              quantity: Number(x.quantity),
            }))}
            preview={deliveryPlan.status === "pending_confirmation"}
          />
        ) : deliveryPlan ? (
          <section
            className={styles.planSection}
            aria-labelledby="plan-heading"
          >
            <div className={styles.planHeading}>
              <div>
                <h2 id="plan-heading">Your weekly delivery plan</h2>
                <p>
                  {deliveryPlans?.length === 1
                    ? "Milk and farm add-ons saved together in one routine."
                    : `${deliveryPlans?.length ?? 0} paid plans · ${totalPlanBalance} deliveries remaining in total.`}
                </p>
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
                <Link href={`/calendar?plan=${deliveryPlan.id}`}>
                  Change a date
                </Link>
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
                      href={`/calendar?plan=${deliveryPlan.id}&date=${day.date}`}
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

            <div
              className={styles.planWeek}
              aria-label="Saved weekly milk schedule"
            >
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
              <Link
                className={styles.openCalendar}
                href={`/calendar?plan=${deliveryPlan.id}`}
              >
                Open delivery calendar
              </Link>
              <Link className={styles.editPlan} href="/milk?edit=plan">
                Edit normal week
              </Link>
            </div>


          </section>
        ) : null}

        {(deliveryPlans?.length ?? 0) > 0 ? (
          <section className={styles.accountSection} aria-labelledby="manage-plans-heading">
            <div className={styles.sectionHeading}>
              <h2 id="manage-plans-heading">Manage your plans</h2>
              <p>Cancel any current plan immediately. No farm approval is needed.</p>
            </div>
            {deliveryPlans?.map((plan, index) => (
              <PlanCancellationForm key={plan.id} planId={plan.id}
                label={deliveryPlans.length === 1 ? "Cancel plan" : `Cancel plan ${index + 1} · starts ${formatPlanStartDate(plan.start_date)}`} />
            ))}

          </section>
        ) : null}

        {!deliveryPlan && !plansError ? <div className={styles.emptyPanel}><h2>Your next routine starts here.</h2><p>Confirmed plans and their calendars will appear here.</p><Link className={styles.startOrder} href="/milk">Choose your farm favourites</Link></div> : null}
        <CustomerDeliveryHistory userId={user.id} />
        </> : null}
        {section === "orders" ? <>
        {ordersError ? <p className={styles.noticeError}>We couldn’t load your orders. Please refresh to try again.</p> : null}
        {!orders?.length && !ordersError ? <div className={styles.emptyPanel}><h2>Good things start at the farm.</h2><p>Your orders and payment status will appear here after your first order.</p><Link className={styles.startOrder} href="/milk">Visit the shop</Link></div> : null}
        {(orders?.length ?? 0) > 0 ? (
          <section
            className={styles.ordersSection}
            aria-labelledby="orders-heading"
          >
            <div className={styles.sectionHeading}>
              <h2 id="orders-heading">Order history</h2>
              <p>Every order remains attached to this customer profile.</p>
            </div>
            <div className={styles.orderHistory}>
              {orders?.map((order, index) => (
                <details key={order.id} open={index === 0}>
                  <summary>
                    <span>
                      <strong>
                        {order.purchase_mode === "plan"
                          ? "Scheduled plan"
                          : order.purchase_mode === "adjustment"
                            ? "Milk quantity change"
                            : "One-time order"}
                      </strong>
                      <small>
                        {new Date(order.created_at).toLocaleDateString(
                          "en-IN",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          },
                        )}
                      </small>
                    </span>
                    <span>
                      <b>
                        {formatCheckoutAmount(
                          order.paid_total_paise ?? order.total_paise,
                        )}
                      </b>
                      <small>{order.status.replaceAll("_", " ")}</small>
                    </span>
                  </summary>
                  <div>
                    {(order.order_items ?? []).map((item) => (
                      <p key={item.id}>
                        <span>{item.product_name}</span>
                        <b>
                          {Number(item.quantity)} {item.unit}
                        </b>
                      </p>
                    ))}
                    <small>
                      Order MMA-{order.id.slice(0, 8).toUpperCase()} · Delivery{" "}
                      {formatPlanStartDate(order.start_date)}
                    </small>
                  </div>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        </> : null}

        {section === "today" ? <>
        {notificationsError ? <p className={styles.noticeError}>Recent updates couldn’t be loaded. Refresh to try again.</p> : null}
        {(notifications?.length ?? 0) > 0 ? (
          <section
            className={styles.activitySection}
            aria-labelledby="activity-heading"
          >
            <div className={styles.activityHeading}>
              <div>
                <h2 id="activity-heading">Updates</h2>
                <p>Payment and delivery activity from the farm.</p>
              </div>
              {notifications?.some((item) => !item.read_at) ? (
                <form action={markNotificationsRead}>
                  <button type="submit">Mark all read</button>
                </form>
              ) : null}
            </div>
            <div className={styles.activityList}>
              {notifications?.map((item) => (
                <article
                  className={!item.read_at ? styles.unread : undefined}
                  key={item.id}
                >
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                  </div>
                  <time dateTime={item.created_at}>
                    {new Date(item.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </time>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        </> : null}
        {section === "deliveries" ? <>
        {requestsError ? <p className={styles.noticeError}>Cancellation requests couldn’t be loaded. Please refresh.</p> : null}
        {(cancellationRequests?.length ?? 0) > 0 ? (
          <section
            className={styles.requestSection}
            aria-labelledby="request-heading"
          >
            <h2 id="request-heading">Cancellation history</h2>
            {cancellationRequests?.some((request) => request.plan_id && ["completed", "approved"].includes(request.status)) && <p><Link href="/welcome-back">Ready to rejoin? Plan your fresh start.</Link></p>}
            {cancellationRequests?.map((request) => (
              <article key={request.id}>
                <div>
                  <strong>{request.plan_id && ["completed", "approved"].includes(request.status) ? "Plan cancelled" : request.status.replaceAll("_", " ")}</strong>
                  <span>{request.reason}</span>
                </div>
                {request.resolution_note ? (
                  <p>{request.resolution_note}</p>
                ) : null}
              </article>
            ))}
          </section>
        ) : null}

        </> : null}
        <div className={styles.accountFooter}>
          <span>Signed in as {email}</span>
          {section !== "settings" ? <form action={signOut}>
            <button className={styles.signOut} type="submit">
              Sign out
            </button>
          </form> : null}
        </div>
      </section>
      </div>
    </main>
  );
}
