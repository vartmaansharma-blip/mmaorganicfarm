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
const milkPlanUrl = new URL("../lib/milk-plan.ts", import.meta.url);
const profileSchemaUrl = new URL("../supabase/customer_profiles.sql", import.meta.url);
const deliveryPlanSchemaUrl = new URL("../supabase/delivery_plans.sql", import.meta.url);
const sidebarUrl = new URL("../app/components/landing-sidebar.tsx", import.meta.url);
const whatsappIconUrl = new URL("../public/whatsapp.svg", import.meta.url);

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
  assert.match(sidebarStyles, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
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
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /redirect\("\/sign-in\?next=%2F"\)/);
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
  assert.match(accountPage, /Google connected/);
  assert.match(accountPage, /hasDeliveryDetails/);
  assert.match(accountPage, /hasPhone \? \(/);
  assert.match(accountPage, /hasAddress \? \(/);
  assert.match(accountPage, /delivery_plans/);
  assert.match(accountPage, /weekly_delivery_items/);
  assert.match(accountPage, /Your weekly milk plan/);
  assert.match(accountPage, /Saved weekly milk schedule/);
  assert.match(accountPage, /Awaiting confirmation/);
  assert.doesNotMatch(accountPage, /Not added yet/);
  assert.match(accountPage, /signOut/);
});

test("provides a separate mobile-first farm product and plan page", async () => {
  const [page, builder, styles, products, landing, sidebar, account, order] =
    await Promise.all([
      readFile(milkPageUrl, "utf8"),
      readFile(milkBuilderUrl, "utf8"),
      readFile(milkStylesUrl, "utf8"),
      readFile(farmProductsUrl, "utf8"),
      readFile(pageUrl, "utf8"),
      readFile(sidebarUrl, "utf8"),
      readFile(accountPageUrl, "utf8"),
      readFile(orderPageUrl, "utf8"),
    ]);

  assert.match(page, /One farm order/);
  assert.match(page, /₹62/);
  assert.match(page, /cowshed\.jpeg/);
  assert.doesNotMatch(page, /farm-bottle\.png/);
  assert.match(page, /MilkPlanBuilder/);
  assert.match(page, /redirect\("\/sign-in\?next=%2Fmilk"\)/);
  assert.match(builder, /Order once/);
  assert.match(builder, /Build a weekly plan/);
  assert.match(builder, /Weekly quantity/);
  assert.match(builder, /Start date/);
  assert.match(builder, /Review milk plan/);
  assert.match(builder, /weeklyLitres/);
  assert.match(builder, /PRICE_PER_LITRE = 62/);
  assert.match(builder, /NEW_BOTTLE_PRICE = 10/);
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
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /grid-template-columns: 1fr/);
  assert.match(landing, /const orderPath = "\/milk"/);
  assert.match(sidebar, /href="\/milk"/);
  assert.match(account, /href="\/milk"/);
  assert.match(order, /href="\/milk"/);
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
  assert.match(orderPage, /Save &amp; continue to WhatsApp/);
  assert.doesNotMatch(orderPage, /Delivery city/);
  assert.doesNotMatch(orderPage, /quantity|delivery time|payment method/i);
  assert.match(orderActions, /customer_profiles/);
  assert.match(orderActions, /phone: `\+91\$\{phone\}`/);
  assert.match(orderActions, /address_line: address/);
  assert.match(orderActions, /Added farm products/);
  assert.match(orderActions, /parseFarmProductSelections/);
  assert.match(orderActions, /No milk this time/);
  assert.match(orderActions, /Weekly schedule/);
  assert.match(orderActions, /parseWeeklyMilkSchedule/);
  assert.match(orderActions, /save_pending_weekly_milk_plan/);
  assert.match(orderActions, /milkLitres === 0/);
  assert.doesNotMatch(orderActions, /city: "Jamshedpur"/);
  assert.doesNotMatch(orderActions, /Delivery address: \$\{address\}, Jamshedpur/);
  assert.match(orderActions, /wa\.me\/919818804419/);
  assert.match(milkPlan, /MILK_PLAN_DAYS/);
  assert.match(milkPlan, /serializeWeeklyMilkSchedule/);
  assert.match(milkPlan, /describeWeeklyMilkSchedule/);
  assert.match(deliveryPlanSchema, /create table if not exists public\.delivery_plans/);
  assert.match(deliveryPlanSchema, /create table if not exists public\.weekly_delivery_items/);
  assert.match(deliveryPlanSchema, /enable row level security/);
  assert.match(deliveryPlanSchema, /\(select auth\.uid\(\)\) = user_id/);
  assert.match(deliveryPlanSchema, /save_pending_weekly_milk_plan/);
});
