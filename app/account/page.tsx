import { DeliveryPin } from "./delivery-pin";
import { MonthlyPlan } from "@/app/components/monthly-plan/monthly-plan";
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
import { buildDeliveryCalendar, formatDeliveryQuantity, productName, todayInIndia } from "@/lib/delivery-calendar";
import { FARM_PRODUCTS, type FarmProductId } from "@/lib/farm-products";
import { formatPlanStartDate, MILK_PLAN_DAYS } from "@/lib/milk-plan";
import { completedMonthlyDates } from "@/lib/monthly-delivery-completion";
import { createClient } from "@/lib/supabase/server";
import {
  markNotificationsRead,
  saveAccountDeliveryDetails,
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
  searchParams: Promise<{ error?: string; message?: string; section?: string; plan?: string; order_view?: string; order_page?: string }>;
}) {
  const params = await searchParams;
  const requestedSection = params.section === "deliveries" ? "plans" : params.section;
  const section: AccountSection = accountSections.includes(requestedSection as AccountSection) ? requestedSection as AccountSection : "today";
  const orderView = params.order_view === "pending" || params.order_view === "other" ? params.order_view : "paid";
  const requestedPage = Number(params.order_page ?? "1");
  const orderPage = Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? Math.min(1000, requestedPage) : 1;
  const orderStatuses = orderView === "paid" ? ["paid"] : orderView === "pending" ? ["pending_payment", "payment_failed"] : ["cancelled"];
  const orderPageSize = 10;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const todayResult = section === "today" ? loadCustomerDelivery(supabase, user.id).catch(() => null) : Promise.resolve(null);
  const { data: profile, error: profileError } = await supabase
    .from("customer_profiles")
    .select("full_name, email, avatar_url, phone, address_line, postal_code, updated_at")
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
    { data: orders, error: ordersError, count: orderCount },
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
    section === "orders" ? supabase
      .from("orders")
      .select(
        "id, status, purchase_mode, total_paise, paid_total_paise, start_date, created_at, order_items(id, product_name, quantity, unit)",
        { count: "exact" },
      )
      .eq("user_id", user.id)
      .in("status", orderStatuses)
      .order("created_at", { ascending: false })
      .range((orderPage - 1) * orderPageSize, orderPage * orderPageSize - 1)
      : Promise.resolve({ data: [], error: null, count: 0 }),
  ]);

  const selectedPlan = deliveryPlans?.find(plan => plan.id === params.plan) ?? deliveryPlans?.find(plan => plan.status === "active" || plan.status === "paused") ?? deliveryPlans?.[0];
  const todaySnapshot = await todayResult;
  const { data: monthlyRecords, error: monthlyRecordsError } =
    section === "plans" && selectedPlan?.billing_model === "calendar_month"
      ? await supabase
          .from("daily_deliveries")
          .select("delivery_date,status,delivery_confirmed,daily_delivery_items(product_key,quantity,unit,fulfilled_quantity)")
          .eq("plan_id", selectedPlan.id)
          .eq("user_id", user.id)
          .eq("is_test", false)
      : { data: null, error: null };
  const name = profile?.full_name ?? user.user_metadata.full_name ?? "Customer";
  const email = profile?.email ?? user.email ?? "";
  const googleConnected = user.identities?.some(
    (identity) => identity.provider === "google",
  );
  const hasAddress = Boolean(profile?.address_line?.trim());
  const hasPhone = Boolean(profile?.phone?.trim());
  const hasDeliveryDetails = hasPhone || hasAddress;
  const pinResult = section === "settings" && profile?.address_line
    ? await supabase.from("customer_delivery_pins").select("latitude,longitude,accuracy_metres").eq("user_id",user.id).maybeSingle()
    : { data: null, error: null };
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
  const purchasedDeliveries = deliveryPlan?.purchased_deliveries == null ? null : Number(deliveryPlan.purchased_deliveries);
  const deliveredDeliveries = Number(deliveryPlan?.delivered_deliveries ?? 0);
  const remainingDeliveries = Math.max(
    0,
    (purchasedDeliveries ?? 0) - deliveredDeliveries,
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
            <h1>{section === "today" ? "Your day, made fresh." : section === "schedule" ? "Delivery schedule" : section === "plans" ? "My plans" : section === "orders" ? "Your orders" : "Your account"}</h1>
            <p className={styles.intro}>{section === "today" ? "Today's delivery, at a glance." : section === "schedule" ? "See what's coming. Change eligible future deliveries." : section === "plans" ? "Your subscriptions and everyday routine." : section === "orders" ? "Paid purchases first. Unfinished checkouts stay separate." : "Your details and delivery preferences."}</p>
          </div>
          {section === "today" ? <AccountDate initialDate={todayInIndia()} /> : null}
        </div>
        {section === "today" ? <>
          <Link className={styles.todayAddress} href="/account?section=settings">
            <span className={styles.addressIcon} aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>
            <span className={styles.addressCopy}><strong>Delivery address</strong><small>{profileError ? "Your address couldn’t be loaded. Try refreshing." : hasAddress ? [profile?.address_line, profile?.postal_code].filter(Boolean).join(", ") : "Add a delivery address to your account."}</small></span>
            <span className={styles.addressManage}>Manage →</span>
          </Link>
          <TodayDelivery initial={todaySnapshot} editablePlanId={deliveryPlan && deliveryPlan.billing_model !== "calendar_month" && ["active", "paused"].includes(deliveryPlan.status) ? deliveryPlan.id : undefined} />
          {!plansError && deliveryPlan ? <section className={styles.nextDeliveryPanel} aria-labelledby="today-plan-heading">
            <div className={styles.nextDeliveryHeading}><h2 id="today-plan-heading">Your plan</h2><Link href="/account?section=plans">View plans →</Link></div>
            <Link className={styles.summaryRow} href="/account?section=plans">
              <span><strong>{deliveryPlan.billing_model === "calendar_month" ? "Monthly plan" : "Weekly plan"} · {planStatus}</strong><small>{deliveryPlan.billing_model === "calendar_month" || purchasedDeliveries == null ? "See your plan dates and deliveries" : `${remainingDeliveries} prepaid deliveries remaining`}</small></span>
              <span aria-hidden="true">→</span>
            </Link>
          </section> : null}
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

          <details className={styles.deliveryDetailsEditor}>
            <summary className={styles.editDetails}>
              {hasDeliveryDetails ? "Update delivery details" : "Add delivery details"}
            </summary>
            <form action={saveAccountDeliveryDetails}>
              <label>Mobile number
                <input name="phone" type="tel" autoComplete="tel" defaultValue={profile?.phone ?? ""} required />
              </label>
              <div>
                <label htmlFor="account-delivery-address">Delivery address</label>
                <textarea id="account-delivery-address" name="address" autoComplete="street-address" rows={3}
                  minLength={8} maxLength={500} defaultValue={profile?.address_line ?? ""} required />
              </div>
              <label>PIN code
                <input name="postalCode" inputMode="numeric" autoComplete="postal-code"
                  pattern="[0-9]{6}" maxLength={6} defaultValue={profile?.postal_code ?? ""} />
              </label>
              <button className={styles.editDetails} type="submit">Save delivery details</button>
            </form>
          </details>
        </section>

        {profile?.address_line ? <DeliveryPin key={`${profile.address_line}:${profile.updated_at}`} address={profile.address_line} saved={pinResult.data} available={!pinResult.error} /> : null}
        <section className={styles.settingsGroup} aria-labelledby="appearance-heading"><div><h2 id="appearance-heading">Appearance</h2><p>Make yourself comfortable. Your theme stays with you across the shop.</p></div><ThemeToggle /></section>
        <section className={styles.settingsGroup} aria-labelledby="sign-in-heading"><div><h2 id="sign-in-heading">Sign-in & account</h2><p>{googleConnected ? "Connected through Google." : "Signed in with your email address."}</p></div><form action={signOut}><button className={styles.textAction} type="submit">Sign out</button></form></section>
        <section className={styles.settingsGroup} aria-labelledby="support-heading"><div><h2 id="support-heading">Help with a delivery</h2><p>Contact the farm about missing, incorrect or damaged items, or for help with your account.</p></div><Link className={styles.textAction} href="/contact">Contact the farm →</Link></section>
        </> : null}
        {section === "plans" ? <>
        {plansError ? <p className={styles.noticeError}>We couldn’t load your plans. Please refresh to try again.</p> : null}
        {(deliveryPlans?.length ?? 0) > 1 ? <nav className={styles.planPicker} aria-label="Choose a plan">{deliveryPlans?.map((plan, index) => <Link key={plan.id} aria-current={deliveryPlan?.id === plan.id ? "page" : undefined} href={`/account?section=deliveries&plan=${plan.id}`}>{plan.billing_model === "calendar_month" ? "Monthly plan" : "Weekly plan"} {deliveryPlans.length - index}<small>{plan.status.replaceAll("_", " ")}</small></Link>)}</nav> : null}
        {deliveryPlan?.billing_model === "calendar_month" ? (
          <>
          {monthlyRecordsError ? <p className={styles.noticeError} role="alert">Delivery confirmations couldn’t be loaded. Please refresh.</p> : null}
          <MonthlyPlan
            id={deliveryPlan.id}
            start={deliveryPlan.start_date}
            end={deliveryPlan.period_end_exclusive}
            status={deliveryPlan.status}
            deliveredDates={completedMonthlyDates(deliveryPlan.scheduled_delivery_items, monthlyRecords ?? [])}
            confirmationAvailable={!monthlyRecordsError}
            items={deliveryPlan.scheduled_delivery_items.map((x) => ({
              ...x,
              quantity: Number(x.quantity),
            }))}
            preview={deliveryPlan.status === "pending_confirmation"}
          />
          </>
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
                <dd>{purchasedDeliveries == null ? "Unavailable" : `${remainingDeliveries} deliveries`}</dd>
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
              {deliveryPlan.status === "pending_confirmation" ? (
                <Link className={styles.editPlan} href="/milk?edit=plan">Edit draft schedule</Link>
              ) : null}
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
        </> : null}
        {section === "schedule" ? <>
          {plansError ? <p className={styles.noticeError}>We couldn’t load your schedule. Please refresh to try again.</p> : null}
          {(deliveryPlans?.length ?? 0) > 1 ? <nav className={styles.planPicker} aria-label="Choose a plan">{deliveryPlans?.map((plan, index) => <Link key={plan.id} aria-current={deliveryPlan?.id === plan.id ? "page" : undefined} href={`/account?section=schedule&plan=${plan.id}`}>{plan.billing_model === "calendar_month" ? "Monthly" : "Weekly"} plan {deliveryPlans.length - index}<small>{plan.status.replaceAll("_", " ")}</small></Link>)}</nav> : null}
          {deliveryPlan?.status === "pending_confirmation" ? <div className={styles.emptyPanel}><h2>Plan awaiting confirmation.</h2><p>We’ll show your confirmed delivery dates here once payment and the plan are verified.</p><Link className={styles.startOrder} href="/account?section=orders&order_view=pending">Check payments</Link></div> : deliveryPlan ? <section className={styles.scheduleSurface} aria-label="Upcoming delivery schedule">

            <div className={styles.scheduleActions}><Link href={`/calendar?plan=${deliveryPlan.id}#date-heading`}>Change a delivery date →</Link><Link href={`/calendar?plan=${deliveryPlan.id}#pause-heading`}>Pause multiple days →</Link></div>
            <section
              className={styles.upcomingSchedule}
              aria-labelledby="upcoming-deliveries-heading"
            >
              <div className={styles.upcomingHeading}>
                <div>
                  <h2 id="upcoming-deliveries-heading">Next 7 days</h2>
                  <p>One-day quantity changes and skips appear here. Tap a date for details.</p>
                </div>
                <Link href={`/calendar?plan=${deliveryPlan.id}`}>
                  Manage dates
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
                              : addOns.length ? "Add-ons only" : "No delivery"}
                      </strong>
                      <small>
                        {addOns.length
                          ? addOns
                              .map((item) => productName(item.productKey))
                              .join(" · ")
                          : day.paused ? "No delivery" : milkSkipped ? "Skipped" : milk ? "Scheduled" : "Rest day"}
                      </small>
                    </Link>
                  );
                })}
              </div>
            </section>



          <p className={styles.scheduleNote}>Changes begin tomorrow. For help with today’s delivery, contact the farm.</p>
          </section> : !plansError ? <div className={styles.emptyPanel}><h2>No delivery schedule yet.</h2><p>Confirmed delivery dates will appear here.</p><Link className={styles.startOrder} href="/milk">Explore milk plans</Link></div> : null}
          <CustomerDeliveryHistory userId={user.id} />
        </> : null}
        {section === "orders" ? <>
          <nav className={styles.orderTabs} aria-label="Order status">
            {([{ id: "paid", label: "Paid orders" }, { id: "pending", label: "To pay" }, { id: "other", label: "Cancelled" }] as const).map(tab =>
              <Link key={tab.id} href={`/account?section=orders&order_view=${tab.id}`} aria-current={orderView === tab.id ? "page" : undefined}>{tab.label}</Link>)}
          </nav>
          {ordersError ? <p className={styles.noticeError} role="alert">We couldn’t load your orders. Please refresh to try again.</p> : null}
          {!orders?.length && !ordersError ? <div className={styles.emptyPanel}>
            <h2>{orderView === "paid" ? "No paid orders yet." : orderView === "pending" ? "Nothing to pay right now." : "No cancelled orders."}</h2>
            <p>{orderView === "paid" ? "Your paid purchases and their details will appear here." : orderView === "pending" ? "Only payments needing attention appear here. Drafts stay out of your order history." : "Cancelled purchases are kept here for reference."}</p>
            {orderView === "paid" ? <Link className={styles.startOrder} href="/milk">Shop fresh products</Link> : null}
          </div> : null}
          {(orders?.length ?? 0) > 0 ? <section className={styles.ordersSection} aria-labelledby="orders-heading">
            <div className={styles.sectionHeading}>
              <h2 id="orders-heading">{orderView === "paid" ? "Paid purchases" : orderView === "pending" ? "Payments needing attention" : "Cancelled purchases"}</h2>
              <p>{orderCount ?? 0} {orderCount === 1 ? "order" : "orders"} · Most recent first</p>
            </div>
            <div className={styles.orderHistory}>
              {orders?.map((order, index) => <details key={order.id} open={index === 0}>
                <summary>
                  <span>
                    <strong>{order.purchase_mode === "plan" ? "Scheduled milk plan" : order.purchase_mode === "adjustment" ? "Milk quantity change" : "One-time purchase"}</strong>
                    <small>{new Date(order.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })} · MMA-{order.id.slice(0, 8).toUpperCase()}</small>
                  </span>
                  <span>
                    <b>{formatCheckoutAmount(order.status === "paid" ? (order.paid_total_paise ?? order.total_paise) : order.total_paise)}</b>
                    <small className={styles.orderStatus} data-status={order.status}>{order.status === "paid" ? "✓ Paid" : order.status === "pending_payment" ? "Payment started" : order.status === "payment_failed" ? "Payment failed" : "Cancelled"}</small>
                  </span>
                </summary>
                <div className={styles.orderDetail}>
                  {(order.order_items ?? []).map(item => <p key={item.id}><span>{item.product_name}</span><b>{formatDeliveryQuantity(item.quantity, item.unit)}</b></p>)}
                  <p><span>Order total</span><b>{formatCheckoutAmount(order.total_paise)}</b></p>
                  {order.status === "paid" ? <p><span>Amount paid</span><b>{formatCheckoutAmount(order.paid_total_paise ?? order.total_paise)}</b></p> : null}
                  <small>{order.purchase_mode === "plan" ? "Plan starts" : "Delivery"} {formatPlanStartDate(order.start_date)}. Delivery progress is shown in Today and Schedule.</small>
                  {["pending_payment", "payment_failed"].includes(order.status) ? <Link className={styles.paymentAction} href={`/checkout/review?order=${order.id}`}>Review and complete payment →</Link> : null}
                </div>
              </details>)}
            </div>
            <nav className={styles.orderPagination} aria-label="Order pages">
              {orderPage > 1 ? <Link href={`/account?section=orders&order_view=${orderView}&order_page=${orderPage - 1}`}>← Previous</Link> : <span />}
              <span>Page {orderPage}</span>
              {(orderCount ?? 0) > orderPage * orderPageSize ? <Link href={`/account?section=orders&order_view=${orderView}&order_page=${orderPage + 1}`}>Next →</Link> : <span />}
            </nav>
          </section> : null}
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
              {notifications?.slice(0, 3).map((item) => (
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
                      timeZone: "Asia/Kolkata",
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
        {section === "plans" ? <>
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
      </section>
      </div>
    </main>
  );
}
