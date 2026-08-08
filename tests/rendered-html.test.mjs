import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);
const signInUrl = new URL("../app/sign-in/page.tsx", import.meta.url);
const authActionsUrl = new URL("../app/sign-in/actions.ts", import.meta.url);
const forgotPasswordUrl = new URL("../app/forgot-password/actions.ts", import.meta.url);
const resetPasswordUrl = new URL("../app/reset-password/actions.ts", import.meta.url);
const accountLinkUrl = new URL("../app/components/account-link.tsx", import.meta.url);
const accountPageUrl = new URL("../app/account/page.tsx", import.meta.url);
const authCallbackUrl = new URL("../app/auth/callback/route.ts", import.meta.url);
const proxyUrl = new URL("../proxy.ts", import.meta.url);
const orderPageUrl = new URL("../app/order/page.tsx", import.meta.url);
const orderActionsUrl = new URL("../app/order/actions.ts", import.meta.url);
const profileSchemaUrl = new URL("../supabase/customer_profiles.sql", import.meta.url);

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
  assert.match(page, /AccountLink/);
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /redirect\("\/sign-in\?next=%2F"\)/);
});

test("provides Google and email account creation without delivery friction", async () => {
  const [signIn, actions, callback, proxy, schema] = await Promise.all([
    readFile(signInUrl, "utf8"),
    readFile(authActionsUrl, "utf8"),
    readFile(authCallbackUrl, "utf8"),
    readFile(proxyUrl, "utf8"),
    readFile(profileSchemaUrl, "utf8"),
  ]);

  assert.match(signIn, /Continue with Google/);
  assert.match(signIn, /google-g\.svg/);
  assert.match(signIn, /Create your account/);
  assert.match(signIn, /Delivery details come later/);
  assert.doesNotMatch(signIn, /quantity|delivery time|payment method/i);
  assert.match(actions, /signInWithOAuth/);
  assert.match(actions, /provider: "google"/);
  assert.match(actions, /redirectTo: `\$\{origin\}\/auth\/callback`/);
  assert.doesNotMatch(actions, /auth\/callback\?next=/);
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
  const [page, accountLink, accountPage] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(accountLinkUrl, "utf8"),
    readFile(accountPageUrl, "utf8"),
  ]);

  assert.match(page, /AccountLink/);
  assert.match(accountLink, /onAuthStateChange/);
  assert.match(accountLink, /\/account/);
  assert.match(accountPage, /customer_profiles/);
  assert.match(accountPage, /Google connected/);
  assert.match(accountPage, /signOut/);
});

test("collects delivery details only when a customer starts an order", async () => {
  const [page, signIn, callback, orderPage, orderActions] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(signInUrl, "utf8"),
    readFile(authCallbackUrl, "utf8"),
    readFile(orderPageUrl, "utf8"),
    readFile(orderActionsUrl, "utf8"),
  ]);

  assert.match(page, /const orderPath = "\/order"/);
  assert.match(signIn, /name="next"/);
  assert.match(callback, /mma_auth_next/);
  assert.match(orderPage, /Mobile number/);
  assert.match(orderPage, /Delivery address/);
  assert.match(orderPage, /Save &amp; continue to WhatsApp/);
  assert.doesNotMatch(orderPage, /quantity|delivery time|payment method/i);
  assert.match(orderActions, /customer_profiles/);
  assert.match(orderActions, /phone: `\+91\$\{phone\}`/);
  assert.match(orderActions, /address_line: address/);
  assert.match(orderActions, /wa\.me\/919818804419/);
});
