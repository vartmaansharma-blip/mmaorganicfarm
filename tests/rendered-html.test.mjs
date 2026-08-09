import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);
const signInUrl = new URL("../app/sign-in/page.tsx", import.meta.url);
const googleSignInUrl = new URL(
  "../app/sign-in/google-sign-in-button.tsx",
  import.meta.url,
);
const authActionsUrl = new URL("../app/sign-in/actions.ts", import.meta.url);
const forgotPasswordUrl = new URL("../app/forgot-password/actions.ts", import.meta.url);
const resetPasswordUrl = new URL("../app/reset-password/actions.ts", import.meta.url);
const accountLinkUrl = new URL("../app/components/account-link.tsx", import.meta.url);
const accountPageUrl = new URL("../app/account/page.tsx", import.meta.url);
const authCallbackUrl = new URL("../app/auth/callback/route.ts", import.meta.url);
const proxyUrl = new URL("../proxy.ts", import.meta.url);
const orderPageUrl = new URL("../app/order/page.tsx", import.meta.url);
const orderActionsUrl = new URL("../app/order/actions.ts", import.meta.url);
const milkPageUrl = new URL("../app/milk/page.tsx", import.meta.url);
const milkBuilderUrl = new URL(
  "../app/milk/milk-plan-builder.tsx",
  import.meta.url,
);
const milkStylesUrl = new URL("../app/milk/milk.module.css", import.meta.url);
const farmProductsUrl = new URL("../lib/farm-products.ts", import.meta.url);
const orderPricingUrl = new URL("../lib/order-pricing.ts", import.meta.url);
const milkPlanUrl = new URL("../lib/milk-plan.ts", import.meta.url);
const profileSchemaUrl = new URL("../supabase/customer_profiles.sql", import.meta.url);
const deliveryPlanSchemaUrl = new URL("../supabase/delivery_plans.sql", import.meta.url);
const deliveryCalendarSchemaUrl = new URL(
  "../supabase/delivery_calendar.sql",
  import.meta.url,
);
const nextDayDeliverySchemaUrl = new URL(
  "../supabase/next_day_delivery_start.sql",
  import.meta.url,
);
const deliveryCalendarUrl = new URL(
  "../lib/delivery-calendar.ts",
  import.meta.url,
);
const calendarPageUrl = new URL("../app/calendar/page.tsx", import.meta.url);
const calendarActionsUrl = new URL(
  "../app/calendar/actions.ts",
  import.meta.url,
);
const calendarStylesUrl = new URL(
  "../app/calendar/calendar.module.css",
  import.meta.url,
);
const sidebarUrl = new URL("../app/components/landing-sidebar.tsx", import.meta.url);
const whatsappIconUrl = new URL("../public/whatsapp.svg", import.meta.url);
const farmDashboardUrl = new URL("../app/farm/page.tsx", import.meta.url);
const farmLocationsUrl = new URL(
  "../app/farm/locations/page.tsx",
  import.meta.url,
);
const farmActionsUrl = new URL(
  "../app/farm/locations/actions.ts",
  import.meta.url,
);
const farmSchemaUrl = new URL("../supabase/farm_dashboard.sql", import.meta.url);
const dailyDeliveriesSchemaUrl = new URL(
  "../supabase/daily_deliveries.sql",
  import.meta.url,
);
const farmDashboardActionsUrl = new URL("../app/farm/actions.ts", import.meta.url);
const pricingPageUrl = new URL("../app/pricing/page.tsx", import.meta.url);
const shippingPageUrl = new URL("../app/shipping/page.tsx", import.meta.url);
const contactPageUrl = new URL("../app/contact/page.tsx", import.meta.url);
const termsPageUrl = new URL("../app/terms/page.tsx", import.meta.url);
const privacyPageUrl = new URL("../app/privacy/page.tsx", import.meta.url);
const cancellationPageUrl = new URL(
  "../app/cancellation-refunds/page.tsx",
  import.meta.url,
);
const publicInformationLayoutUrl = new URL(
  "../app/components/public-information-layout.tsx",
  import.meta.url,
);
const shopifyUrl = new URL("../lib/shopify.ts", import.meta.url);
const shopifyCheckoutUrl = new URL(
  "../app/api/commerce/shopify/checkout/route.ts",
  import.meta.url,
);
const shopifyWebhookUrl = new URL(
  "../app/api/commerce/shopify/webhook/route.ts",
  import.meta.url,
);
const shopifyButtonUrl = new URL(
  "../app/checkout/review/shopify-checkout-button.tsx",
  import.meta.url,
);
const checkoutReviewUrl = new URL(
  "../app/checkout/review/page.tsx",
  import.meta.url,
);
const shopifySchemaUrl = new URL(
  "../supabase/shopify_commerce.sql",
  import.meta.url,
);

test("defines search and social metadata for fresh milk delivery", async () => {
  const layout = await readFile(layoutUrl, "utf8");

  assert.match(layout, /Fresh Farm Milk Delivery in Jamshedpur/);
  assert.match(layout, /fresh milk delivery Jamshedpur/);
  assert.match(layout, /milk home delivery Jamshedpur/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /twitter/);
  assert.match(layout, /canonical/);
  assert.match(layout, /hero-milk\.png/);
});

test("loads one consistent Inter typography system", async () => {
  const [layout, styles, signInStyles, orderStyles] = await Promise.all([
    readFile(layoutUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(new URL("../app/sign-in/sign-in.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/order/order.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /Inter/);
  assert.match(layout, /variable: "--font-inter"/);
  assert.match(styles, /--font-sans: var\(--font-inter\)/);
  assert.match(styles, /font-family: var\(--font-sans\)/);
  assert.doesNotMatch(signInStyles, /font-weight: 900/);
  assert.doesNotMatch(orderStyles, /font-weight: 850/);
});

test("uses scoped layouts for authentication, ordering, and landing navigation", async () => {
  const [styles, page, signInStyles, orderStyles, sidebarStyles] =
    await Promise.all([
      readFile(stylesUrl, "utf8"),
      readFile(pageUrl, "utf8"),
      readFile(new URL("../app/sign-in/sign-in.module.css", import.meta.url), "utf8"),
      readFile(new URL("../app/order/order.module.css", import.meta.url), "utf8"),
      readFile(
        new URL("../app/components/landing-sidebar.module.css", import.meta.url),
        "utf8",
      ),
    ]);

  assert.doesNotMatch(styles, /^main\s*\{/m);
  assert.match(page, /LandingSidebar/);
  assert.match(page, /landingStyles\.main/);
  assert.match(signInStyles, /background: #fff/);
  assert.doesNotMatch(signInStyles, /farmShade|farmPanel/);
  assert.doesNotMatch(signInStyles, /grid-template-columns: minmax\(0, 1\.06fr\)/);
  assert.match(orderStyles, /width: min\(100%, 620px\)/);
  assert.doesNotMatch(orderStyles, /box-shadow/);
  assert.doesNotMatch(orderStyles, /grid-template-columns: minmax\(0, 0\.88fr\)/);
  assert.match(sidebarStyles, /grid-template-columns: repeat\(6, calc\(\(100% - 10px\) \/ 6\)\)/);
});

test("uses stable profile and home navigation labels", async () => {
  const accountLink = await readFile(accountLinkUrl, "utf8");
  const sidebar = await readFile(sidebarUrl, "utf8");
  const whatsappIcon = await readFile(whatsappIconUrl, "utf8");

  assert.match(accountLink, /authenticatedLabel = "Profile"/);
  assert.doesNotMatch(accountLink, /firstName/);
  assert.match(sidebar, /<span>01<\/span>Home/);
  assert.match(sidebar, /href="#milk">\s*<span>02<\/span>Milk/);
  assert.match(sidebar, /href="\/milk">\s*<span>03<\/span>Products/);
  assert.match(sidebar, /authenticatedLabel="Profile"/);
  assert.match(sidebar, /prefix="06"/);
  assert.match(whatsappIcon, /viewBox="0 0 24 24"/);
});

test("keeps the landing page focused on milk conversion and trust", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /Fresh farm milk, delivered daily in Jamshedpur/);
  assert.match(page, /hero-brand-lockup/);
  assert.match(page, /order-orbit/);
  assert.match(page, /ORDER NOW/);
  assert.match(page, /₹62 per litre/);
  assert.match(page, /919818804419/);
  assert.match(page, /20 years operating/);
  assert.match(page, /500\+ families/);
  assert.match(page, /1,000 L\+/);
  assert.match(page, /Official ordering/);
  assert.match(page, /Current milk price/);
  assert.match(page, /Delivery area/);
  assert.match(page, /Glass bottle/);
  assert.doesNotMatch(page, /Comparison metrics/);
  assert.doesNotMatch(page, /Bone-supporting nutrition/);
  assert.doesNotMatch(page, /Why people believe it/);
  assert.doesNotMatch(page, /not in a mystery supply chain/);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /LocalBusiness/);
  assert.match(page, /Product/);
  assert.doesNotMatch(page, /AccountLink/);
  assert.doesNotMatch(page, /supabase\.auth\.getUser\(\)/);
  assert.doesNotMatch(page, /redirect\("\/sign-in\?next=%2F"\)/);
  assert.match(page, /href="\/pricing"/);
  assert.match(page, /href="\/privacy"/);
  assert.match(page, /href="\/cancellation-refunds"/);
});

test("publishes complete business and policy information", async () => {
  const [pricing, shipping, contact, terms, privacy, cancellation, shell] =
    await Promise.all([
      readFile(pricingPageUrl, "utf8"),
      readFile(shippingPageUrl, "utf8"),
      readFile(contactPageUrl, "utf8"),
      readFile(termsPageUrl, "utf8"),
      readFile(privacyPageUrl, "utf8"),
      readFile(cancellationPageUrl, "utf8"),
      readFile(publicInformationLayoutUrl, "utf8"),
    ]);

  assert.match(pricing, /MILK_PRICE_PER_LITRE/);
  assert.match(pricing, /FARM_PRODUCTS/);
  assert.match(shipping, /Jamshedpur/);
  assert.match(shipping, /next delivery day/);
  assert.match(contact, /919818804419/);
  assert.match(terms, /Terms and conditions/);
  assert.match(privacy, /Supabase/);
  assert.match(privacy, /does not store complete card or bank credentials/);
  assert.match(cancellation, /does not create a cash refund/);
  assert.match(cancellation, /carried forward/);
  assert.match(shell, /Cancellations & refunds/);
  assert.doesNotMatch(shell, /createClient|redirect\(/);
});

test("hands commerce to Shopify without replacing the delivery calendar", async () => {
  const [shopify, checkout, webhook, button, review, schema, calendar] =
    await Promise.all([
      readFile(shopifyUrl, "utf8"),
      readFile(shopifyCheckoutUrl, "utf8"),
      readFile(shopifyWebhookUrl, "utf8"),
      readFile(shopifyButtonUrl, "utf8"),
      readFile(checkoutReviewUrl, "utf8"),
      readFile(shopifySchemaUrl, "utf8"),
      readFile(deliveryCalendarUrl, "utf8"),
    ]);

  assert.match(shopify, /cartCreate/);
  assert.match(shopify, /checkoutUrl/);
  assert.match(shopify, /X-Shopify-Storefront-Access-Token/);
  assert.match(checkout, /mma_delivery_plan_id/);
  assert.match(checkout, /shopify_cart_id/);
  assert.match(webhook, /x-shopify-hmac-sha256/);
  assert.match(webhook, /timingSafeEqual/);
  assert.match(webhook, /orders\/paid/);
  assert.match(webhook, /status: "active"/);
  assert.match(button, /Continue to pay/);
  assert.match(review, /Your delivery calendar stays with/);
  assert.match(schema, /commerce_provider/);
  assert.match(schema, /provider in \('razorpay', 'shopify'\)/);
  assert.match(calendar, /buildDeliveryCalendar/);
});

test("provides Google and email account creation without delivery friction", async () => {
  const [signIn, googleSignIn, actions, callback, proxy, schema] = await Promise.all([
    readFile(signInUrl, "utf8"),
    readFile(googleSignInUrl, "utf8"),
    readFile(authActionsUrl, "utf8"),
    readFile(authCallbackUrl, "utf8"),
    readFile(proxyUrl, "utf8"),
    readFile(profileSchemaUrl, "utf8"),
  ]);

  assert.match(signIn, /GoogleSignInButton/);
  assert.match(googleSignIn, /Continue with Google/);
  assert.match(googleSignIn, /google-g\.svg/);
  assert.match(signIn, /Create your account/);
  assert.match(signIn, /delivery details only after/i);
  assert.doesNotMatch(signIn, /quantity|delivery time|payment method/i);
  assert.doesNotMatch(signIn, /Mobile number|Delivery address/);
  assert.match(googleSignIn, /signInWithOAuth/);
  assert.match(googleSignIn, /provider: "google"/);
  assert.match(googleSignIn, /new URL\("\/auth\/callback", window\.location\.origin\)/);
  assert.match(googleSignIn, /started\.current/);
  assert.match(googleSignIn, /disabled=\{isStarting\}/);
  assert.match(googleSignIn, /searchParams\.set\("next", next\)/);
  assert.doesNotMatch(actions, /signInWithOAuth/);
  assert.match(callback, /: "\/"/);
  assert.match(signIn, /if \(user\) \{\s*redirect\(next\)/);
  assert.match(proxy, /searchParams\.has\("code"\)/);
  assert.match(proxy, /callbackUrl\.pathname = "\/auth\/callback"/);
  assert.match(actions, /signUpWithEmail/);
  assert.match(actions, /Customer accounts are being connected/);
  assert.match(schema, /enable row level security/i);
  assert.match(schema, /auth\.uid\(\).*user_id/);
  assert.match(schema, /sync_customer_profile_from_auth/);
  assert.match(schema, /security definer/i);
  assert.doesNotMatch(schema, /service_role/i);
});

test("styles the official details section responsively", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(styles, /\.official-section/);
  assert.match(styles, /\.official-grid/);
  assert.match(styles, /\.hero-reassurance/);
  assert.match(styles, /order-ring-spin/);
  assert.match(styles, /order-ring-pulse/);
  assert.match(styles, /bottle-mobile-turn/);
  assert.match(styles, /bottle-orbit-mobile/);
  assert.match(styles, /bottle-shadow-mobile/);
  assert.match(styles, /grid-column: 1/);
  assert.match(styles, /object-fit: contain/);
  assert.doesNotMatch(styles, /\.benefit-bar-section/);
  assert.doesNotMatch(styles, /\.benefit-track/);
  assert.doesNotMatch(styles, /\.proof-section/);
  assert.doesNotMatch(styles, /\.image-belief-section/);
  assert.doesNotMatch(styles, /\.story-photo-section/);
  assert.match(styles, /@media \(max-width: 980px\)/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /grid-template-columns:\s*1fr/);
});

test("provides a complete password recovery path", async () => {
  const [signIn, forgotPassword, resetPassword] = await Promise.all([
    readFile(signInUrl, "utf8"),
    readFile(forgotPasswordUrl, "utf8"),
    readFile(resetPasswordUrl, "utf8"),
  ]);

  assert.match(signIn, /Forgot your password/);
  assert.match(forgotPassword, /resetPasswordForEmail/);
  assert.match(forgotPassword, /next=\/reset-password/);
  assert.match(resetPassword, /updateUser\(\{ password \}\)/);
  assert.match(resetPassword, /signOut/);
});

test("shows a real customer account after authentication", async () => {
  const [accountLink, accountPage] = await Promise.all([
    readFile(accountLinkUrl, "utf8"),
    readFile(accountPageUrl, "utf8"),
  ]);

  assert.match(accountLink, /onAuthStateChange/);
  assert.match(accountLink, /\/account/);
  assert.match(accountPage, /customer_profiles/);
  assert.match(accountPage, /<h1>Profile<\/h1>/);
  assert.doesNotMatch(accountPage, /<h1>Your account<\/h1>/);
  assert.match(accountPage, /Google connected/);
  assert.match(accountPage, /hasDeliveryDetails/);
  assert.match(accountPage, /hasPhone \? \(/);
  assert.match(accountPage, /hasAddress \? \(/);
  assert.match(accountPage, /delivery_plans/);
  assert.match(accountPage, /weekly_delivery_items/);
  assert.match(accountPage, /Your weekly delivery plan/);
  assert.match(accountPage, /Saved weekly milk schedule/);
  assert.match(accountPage, /Scheduled add-ons/);
  assert.match(accountPage, /scheduled_delivery_items/);
  assert.match(accountPage, /remainingDeliveries/);
  assert.match(accountPage, /href="\/calendar"/);
  assert.match(accountPage, /Open delivery calendar/);
  assert.match(accountPage, /Awaiting confirmation/);
  assert.match(accountPage, /href="\/milk\?edit=plan"/);
  assert.doesNotMatch(accountPage, /Not added yet/);
  assert.match(accountPage, /signOut/);
});

test("provides an intelligent customer delivery calendar", async () => {
  const [page, actions, styles, calendar, schema, nextDaySchema, account] =
    await Promise.all([
      readFile(calendarPageUrl, "utf8"),
      readFile(calendarActionsUrl, "utf8"),
      readFile(calendarStylesUrl, "utf8"),
      readFile(deliveryCalendarUrl, "utf8"),
      readFile(deliveryCalendarSchemaUrl, "utf8"),
      readFile(nextDayDeliverySchemaUrl, "utf8"),
      readFile(accountPageUrl, "utf8"),
    ]);

  assert.match(page, /Delivery calendar/);
  assert.match(page, /7-day order sheet/);
  assert.match(page, /Skip this delivery day/);
  assert.match(page, /Skip milk only/);
  assert.match(page, /Keep add-on/);
  assert.match(page, /Pause multiple days/);
  assert.match(page, /Minimum 2 consecutive days/);
  assert.match(page, /Plan from tomorrow/);
  assert.match(page, /30-day plan/);
  assert.match(page, /nextDeliveryDateInIndia/);
  assert.match(page, /Purchased/);
  assert.match(page, /Delivered/);
  assert.match(page, /Remaining/);
  assert.match(page, /days: 7/);
  assert.doesNotMatch(page, /days: 120/);
  assert.doesNotMatch(page, /estimateCompletionDate/);
  assert.match(actions, /saveDeliveryDayChange/);
  assert.match(actions, /saveDateChange/);
  assert.match(actions, /savePause/);
  assert.match(actions, /endDate <= startDate/);
  assert.match(actions, /delivery_exceptions/);
  assert.match(actions, /delivery_pauses/);
  assert.match(actions, /date < minimumDate/);
  assert.match(calendar, /normal weekly/i);
  assert.match(calendar, /buildDeliveryCalendar/);
  assert.match(calendar, /weekdayFromYmd/);
  assert.match(calendar, /estimateCompletionDate/);
  assert.match(calendar, /nextDeliveryDateInIndia/);
  assert.match(schema, /purchased_deliveries/);
  assert.match(schema, /delivered_deliveries/);
  assert.match(schema, /create table if not exists public\.delivery_exceptions/);
  assert.match(schema, /create table if not exists public\.delivery_pauses/);
  assert.match(schema, /check \(end_date > start_date\)/);
  assert.match(schema, /enable row level security/);
  assert.match(schema, /revoke update on public\.delivery_plans from authenticated/);
  assert.match(schema, /grant update \(status, start_date, bottle_choice, updated_at\)/);
  assert.match(nextDaySchema, /enforce_next_day_delivery_start/);
  assert.match(nextDaySchema, /Asia\/Kolkata/);
  assert.match(nextDaySchema, /new\.start_date < v_earliest_start/);
  assert.match(account, /Only a completed milk delivery uses one delivery/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(min-width: 900px\)/);
});

test("provides a separate mobile-first farm product and plan page", async () => {
  const [page, builder, styles, products, pricing, landing, sidebar, account, order] =
    await Promise.all([
      readFile(milkPageUrl, "utf8"),
      readFile(milkBuilderUrl, "utf8"),
      readFile(milkStylesUrl, "utf8"),
      readFile(farmProductsUrl, "utf8"),
      readFile(orderPricingUrl, "utf8"),
      readFile(pageUrl, "utf8"),
      readFile(sidebarUrl, "utf8"),
      readFile(accountPageUrl, "utf8"),
      readFile(orderPageUrl, "utf8"),
    ]);

  assert.match(page, /Build your farm basket/);
  assert.match(page, /₹62/);
  assert.match(page, /cowshed\.jpeg/);
  assert.doesNotMatch(page, /farm-bottle\.png/);
  assert.match(page, /MilkPlanBuilder/);
  assert.match(page, /params\.edit === "plan"/);
  assert.match(page, /weekly_delivery_items/);
  assert.match(page, /initialSchedule=\{savedSchedule\}/);
  assert.match(page, /redirect\("\/sign-in\?next=%2Fmilk"\)/);
  assert.match(builder, /Order once/);
  assert.match(builder, /Build a weekly plan/);
  assert.match(builder, /Two recommended schedules/);
  assert.match(builder, /Everyday family/);
  assert.match(builder, /Lighter four-day/);
  assert.match(builder, /Edit your weekly milk plan/);
  assert.match(builder, /Review updated plan/);
  assert.match(builder, /Undo changes/);
  assert.match(builder, /Weekly quantity/);
  assert.match(builder, /Start date/);
  assert.match(builder, /Earliest delivery is tomorrow/);
  assert.match(builder, /min=\{minimumStartDate\}/);
  assert.match(builder, /nextDeliveryDateInIndia/);
  assert.match(builder, /Review milk plan/);
  assert.match(builder, /weeklyLitres/);
  assert.match(builder, /calculateOrderPricing/);
  assert.match(pricing, /MILK_PRICE_PER_LITRE = 62/);
  assert.match(pricing, /NEW_BOTTLE_CHARGE = 10/);
  assert.match(pricing, /calculatePaidMilkAdjustment/);
  assert.match(pricing, /additionalPayment/);
  assert.match(pricing, /carryForwardLitres/);
  assert.match(pricing, /refund: 0/);
  assert.match(builder, /STEP = 1/);
  assert.match(builder, /useState\(1\)/);
  assert.match(builder, /Math\.max\(0/);
  assert.match(builder, /Choose 0 L for an add-ons-only delivery/);
  assert.match(builder, /onceQuantity > 0 \|\| selectedExtras\.length > 0/);
  assert.match(builder, /Select milk or an add-on/);
  assert.doesNotMatch(builder, /STEP = 0\.5/);
  assert.match(builder, /Return a bottle/);
  assert.match(builder, /hand it back on delivery/);
  assert.match(builder, /No bottle to return/);
  assert.match(builder, /includes a ₹10 glass bottle/);
  assert.match(builder, /More from M&apos;ma Organic Farm/);
  assert.match(builder, /First delivery/);
  assert.match(builder, /Every week/);
  assert.match(builder, /Choose delivery days/);
  assert.match(builder, /updateExtraQuantity/);
  assert.match(builder, /toggleExtraDay/);
  assert.match(builder, /serializeFarmProductSelections/);
  assert.match(builder, /orderHref/);
  assert.match(products, /Fresh paneer/);
  assert.match(products, /price: 400/);
  assert.match(products, /Farm ghee/);
  assert.match(products, /price: 750/);
  assert.match(products, /Papaya/);
  assert.match(products, /price: 80/);
  assert.match(products, /Fresh milk sweets/);
  assert.match(products, /price: 450/);
  assert.doesNotMatch(products, /vegetables/i);
  assert.doesNotMatch(builder, /Shopify|checkout|payment/i);
  assert.doesNotMatch(builder, /delivery charge|delivery fee/i);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /grid-template-columns: 1fr/);
  assert.match(landing, /const orderPath = "\/milk"/);
  assert.match(sidebar, /href="\/milk"/);
  assert.match(account, /href="\/milk"/);
  assert.match(order, /href="\/milk"/);
});

test("presents the product builder as a visible farm shop", async () => {
  const [page, builder, styles] = await Promise.all([
    readFile(new URL("../app/milk/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/milk/milk-plan-builder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/milk/milk.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Farm shop/);
  assert.match(page, /Build your farm basket/);
  assert.match(page, /collectionStrip/);
  assert.match(builder, /Current basket/);
  assert.match(builder, /productMarker/);
  assert.match(styles, /scroll-snap-type: x mandatory/);
  assert.match(styles, /position: sticky/);
});

test("provides persistent mobile-first farm delivery operations", async () => {
  const [dashboard, dashboardActions, locations, actions, schema, dailySchema, styles] = await Promise.all([
    readFile(farmDashboardUrl, "utf8"),
    readFile(farmDashboardActionsUrl, "utf8"),
    readFile(farmLocationsUrl, "utf8"),
    readFile(farmActionsUrl, "utf8"),
    readFile(farmSchemaUrl, "utf8"),
    readFile(dailyDeliveriesSchemaUrl, "utf8"),
    readFile(new URL("../app/farm/farm.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /Tomorrow&apos;s delivery plan/);
  assert.match(dashboard, /Date → area → route → customer/);
  assert.match(dashboard, /Generate tomorrow&apos;s sheet/);
  assert.match(dashboard, /daily_deliveries/);
  assert.match(dashboard, /Open map/);
  assert.match(dashboard, /google\.com\/maps\/search/);
  assert.match(dashboard, /Pending plans are excluded/);
  assert.match(dashboard, /Work remaining/);
  assert.match(dashboardActions, /generate_daily_deliveries/);
  assert.match(dashboardActions, /nextDeliveryDateInIndia/);
  assert.match(locations, /Delivery locations/);
  assert.match(locations, /Assignment queue/);
  assert.match(locations, /Unassigned area/);
  assert.match(actions, /assignCustomerLocation/);
  assert.match(actions, /route\.area_id/);
  assert.match(schema, /create table if not exists public\.farm_staff/);
  assert.match(schema, /create table if not exists public\.delivery_areas/);
  assert.match(schema, /create table if not exists public\.delivery_routes/);
  assert.match(schema, /enable row level security/);
  assert.match(schema, /Customers and staff can read profiles/);
  assert.doesNotMatch(schema, /service_role/);
  assert.match(dailySchema, /create table if not exists public\.daily_deliveries/);
  assert.match(dailySchema, /create table if not exists public\.daily_delivery_items/);
  assert.match(dailySchema, /create or replace function public\.generate_daily_deliveries/);
  assert.match(dailySchema, /plans\.status = 'active'/);
  assert.match(dailySchema, /delivery_pauses/);
  assert.match(dailySchema, /delivery_exceptions/);
  assert.match(dailySchema, /unique \(plan_id, delivery_date\)/);
  assert.match(dailySchema, /enable row level security/);
  assert.match(dailySchema, /farm_staff\.active/);
  assert.doesNotMatch(dailySchema, /service_role/);
  assert.match(styles, /\.headerActions/);
  assert.match(styles, /width: 100%/);
  assert.match(styles, /@media \(min-width: 700px\)/);
});

test("collects delivery details only when a customer starts an order", async () => {
  const [page, signIn, callback, orderPage, orderActions, milkPlan, deliveryPlanSchema] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(signInUrl, "utf8"),
    readFile(authCallbackUrl, "utf8"),
    readFile(orderPageUrl, "utf8"),
    readFile(orderActionsUrl, "utf8"),
    readFile(milkPlanUrl, "utf8"),
    readFile(deliveryPlanSchemaUrl, "utf8"),
  ]);

  assert.match(page, /const orderPath = "\/milk"/);
  assert.match(signIn, /name="next"/);
  assert.match(callback, /mma_auth_next/);
  assert.match(orderPage, /Phone number/);
  assert.match(orderPage, /Used only for delivery updates/);
  assert.match(orderPage, /Delivery address/);
  assert.match(orderPage, /Added to this farm order/);
  assert.match(orderPage, /name="extras"/);
  assert.match(orderPage, /name="milk"/);
  assert.match(orderPage, /name="schedule"/);
  assert.match(orderPage, /name="start"/);
  assert.match(orderPage, /Weekly milk schedule/);
  assert.match(orderPage, /First 7-day estimate/);
  assert.match(orderPage, /calculateOrderPricing/);
  assert.match(orderPage, /Save &amp; review order/);
  assert.doesNotMatch(orderPage, /Delivery city/);
  assert.doesNotMatch(orderPage, /delivery time|payment method/i);
  assert.match(orderActions, /customer_profiles/);
  assert.match(orderActions, /phone: `\+91\$\{phone\}`/);
  assert.match(orderActions, /address_line: address/);
  assert.match(orderActions, /parseFarmProductSelections/);
  assert.match(orderActions, /parseWeeklyMilkSchedule/);
  assert.match(orderActions, /save_pending_delivery_plan/);
  assert.match(orderActions, /start < minimumStartDate/);
  assert.match(orderActions, /Delivery plans can begin from tomorrow/);
  assert.match(orderActions, /p_add_ons/);
  assert.match(orderActions, /day_of_week/);
  assert.match(orderActions, /calculateOrderPricing/);
  assert.match(orderActions, /milkLitres === 0/);
  assert.match(orderActions, /\.from\("orders"\)/);
  assert.match(orderActions, /\.from\("order_items"\)/);
  assert.match(orderActions, /checkout\/review/);
  assert.doesNotMatch(orderActions, /delivery charge|delivery fee/i);
  assert.doesNotMatch(orderActions, /city: "Jamshedpur"/);
  assert.doesNotMatch(orderActions, /Delivery address: \$\{address\}, Jamshedpur/);
  assert.doesNotMatch(orderActions, /wa\.me\/919818804419/);
  assert.match(milkPlan, /MILK_PLAN_DAYS/);
  assert.match(milkPlan, /serializeWeeklyMilkSchedule/);
  assert.match(milkPlan, /describeWeeklyMilkSchedule/);
  assert.match(deliveryPlanSchema, /create table if not exists public\.delivery_plans/);
  assert.match(deliveryPlanSchema, /create table if not exists public\.weekly_delivery_items/);
  assert.match(deliveryPlanSchema, /create table if not exists public\.scheduled_delivery_items/);
  assert.match(deliveryPlanSchema, /enable row level security/);
  assert.match(deliveryPlanSchema, /\(select auth\.uid\(\)\) = user_id/);
  assert.match(deliveryPlanSchema, /save_pending_delivery_plan/);
  assert.match(deliveryPlanSchema, /p_add_ons jsonb/);
  assert.match(deliveryPlanSchema, /Asia\/Kolkata/);
  assert.match(deliveryPlanSchema, /'none'/);
  assert.doesNotMatch(deliveryPlanSchema, /delivery charge|delivery fee/i);
});
