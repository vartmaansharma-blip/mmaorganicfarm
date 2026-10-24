import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, webkit } from "playwright";
const base = process.env.SHOP_BASE_URL ?? "http://127.0.0.1:3210",
  output = path.resolve(
    process.env.SHOP_ARTIFACT_DIR ?? "work/shop-verification",
  );
await mkdir(output, { recursive: true });
const results = [];
for (const [engine, driver] of Object.entries({ chromium, webkit })) {
  const browser = await driver.launch();
  try {
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        hasTouch: width < 769,
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      for (const theme of ["dark", "light"]) {
        await page.goto(`${base}/shop`, { waitUntil: "networkidle" });
        if ((await page.locator("html").getAttribute("data-theme")) !== theme)
          await page.getByRole("button", { name: /Switch to .* mode/ }).click();
        assert.equal(
          await page
            .getByRole("heading", { name: "Bring M’ma home." })
            .isVisible(),
          true,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${engine} ${width} shop overflow`,
        );
        assert.equal(
          await page.locator("[class*=heroPhoto] button").count(),
          0,
        );
        const trigger = page.getByRole("button", { name: /Open cart,/ });
        await trigger.click();
        const dialog = page.getByRole("dialog", { name: "Your cart." });
        assert.equal(
          await dialog.getByText("Good things belong here.").isVisible(),
          true,
        );
        await page.keyboard.press("Escape");
        assert.equal(
          await trigger.evaluate((el) => el === document.activeElement),
          true,
          "Escape returns focus to cart trigger",
        );
        assert.equal(await trigger.locator("svg").getAttribute("fill"), "none");
        if (width < 901) {
          const menu = page.getByRole("button", {
            name: "Open navigation menu",
          });
          assert.equal(await menu.locator("svg").getAttribute("fill"), "none");
          await menu.click();
          await page.keyboard.press("Escape");
          assert.equal(
            await menu.evaluate((el) => el === document.activeElement),
            true,
          );
        }
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: path.join(output, `${engine}-${width}-${theme}-shop.png`),
            fullPage: true,
          });
        await page.goto(`${base}/shop/milk`, { waitUntil: "networkidle" });
        const mode = page.getByRole("switch", { name: "Scheduled orders" });
        await mode.check();
        await page
          .getByRole("button", { name: "Increase milk quantity", exact: true })
          .click();
        await mode.uncheck();
        assert.equal(await page.locator("output").first().innerText(), "1");
        await page
          .getByRole("button", { name: "Increase milk quantity", exact: true })
          .click();
        await mode.check();
        assert.equal(await page.locator("output").first().innerText(), "2");
        await page
          .getByRole("button", { name: "Add to cart", exact: true })
          .click();
        assert.equal(await dialog.isVisible(), true);
        assert.equal(
          await page
            .getByRole("button", { name: "Open cart, 1 product" })
            .count(),
          1,
        );
        const checkout = dialog.getByRole("link", {
          name: "Continue to delivery details",
        });
        assert.match(
          await checkout.getAttribute("href"),
          /schedule=2%2C2%2C2%2C2%2C2%2C2%2C2/,
        );
        await dialog
          .getByRole("button", { name: "One-time (0)", exact: true })
          .click();
        assert.equal(
          await dialog.getByText("Good things belong here.").isVisible(),
          true,
        );
        await dialog
          .getByRole("button", { name: "Scheduled (1)", exact: true })
          .click();
        assert.equal(
          await dialog
            .getByRole("link", { name: "Farm milk", exact: true })
            .isVisible(),
          true,
        );
        await dialog
          .getByRole("button", { name: "Increase cart milk quantity" })
          .click();
        assert.match(
          await checkout.getAttribute("href"),
          /schedule=3%2C3%2C3%2C3%2C3%2C3%2C3/,
        );
        await dialog
          .getByRole("button", { name: "Decrease cart milk quantity" })
          .click();
        assert.equal(
          await dialog.evaluate((el) => el.scrollWidth > el.clientWidth),
          false,
          "cart has no horizontal overflow",
        );
        const tiny = await dialog.locator("button:visible").evaluateAll((es) =>
          es
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width < 43.5 || r.height < 43.5;
            })
            .map((e) => e.getAttribute("aria-label") ?? e.textContent),
        );
        assert.deepEqual(tiny, []);
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: path.join(output, `${engine}-${width}-${theme}-cart.png`),
            fullPage: true,
          });
        await dialog.getByRole("button", { name: "Close cart" }).click();
        await page.goto(`${base}/shop/paneer`, { waitUntil: "networkidle" });
        await page.getByRole("switch", { name: "Scheduled orders" }).uncheck();
        await page
          .getByRole("button", { name: "Add to cart", exact: true })
          .click();
        await dialog.getByRole("button", { name: "Close cart" }).click();
        await page.goto(`${base}/shop/ghee`, { waitUntil: "networkidle" });
        await page
          .getByRole("button", { name: "Add to cart", exact: true })
          .click();
        assert.equal(
          await page
            .getByRole("button", { name: "Open cart, 2 products" })
            .count(),
          1,
        );
        assert.match(
          await checkout.getAttribute("href"),
          /paneer%3Aonce%3A1%3Bghee%3Aonce%3A1/,
        );
        await dialog
          .getByRole("button", { name: "Increase cart paneer quantity" })
          .click();
        await dialog.getByRole("button", { name: "Remove Farm ghee" }).click();
        assert.match(await checkout.getAttribute("href"), /paneer%3Aonce%3A2/);
        assert.doesNotMatch(await checkout.getAttribute("href"), /ghee/);
        await dialog.getByRole("button", { name: "Close cart" }).click();
        await page.goto(base, { waitUntil: "networkidle" });
        await page
          .getByRole("button", { name: "Open cart, 1 product" })
          .click();
        assert.equal(
          await dialog
            .getByRole("link", { name: "Fresh paneer", exact: true })
            .isVisible(),
          true,
          "cart survives route change and full reload",
        );
        await checkout.click();
        await page.waitForURL("**/sign-in?**");
        const next = new URL(page.url()).searchParams.get("next");
        assert.ok(next.startsWith("/order?"));
        assert.match(next, /paneer%3Aonce%3A2/);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1500);
        await page.evaluate(() =>
          sessionStorage.removeItem("mma-shop-draft-v1"),
        );
        results.push({
          engine,
          width,
          theme,
          overflow: false,
          cart: true,
          draftsPreserved: true,
          authReturnPreserved: true,
          tapTargets: 44,
        });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  await page.goto(`${base}/shop`, { waitUntil: "networkidle" });
  const photo = page.locator("[class*=heroPhoto]");
  const first = await photo.getAttribute("href");
  await page.getByRole("switch", { name: "Scheduled orders" }).uncheck();
  await page.getByRole("button", { name: /Open cart,/ }).click();
  await page.waitForTimeout(6250);
  assert.notEqual(
    await photo.getAttribute("href"),
    first,
    "mode and cart do not stop autoplay",
  );
  await page.keyboard.press("Escape");
  const destination = await photo.getAttribute("href");
  await photo.click();
  await page.waitForURL(`**${destination}`);
  await page.goBack();
  await page.waitForTimeout(6250);
  assert.notEqual(
    await photo.getAttribute("href"),
    "/shop/milk",
    "return to shop resumes autoplay",
  );
  await page.goto(`${base}/shop/milk`, { waitUntil: "networkidle" });
  await page.getByRole("switch", { name: "Scheduled orders" }).check();
  await page.getByText("Add paneer or ghee", { exact: true }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Weekly", exact: true }).click();
  await page
    .getByRole("group", { name: "Fresh paneer delivery days" })
    .getByRole("button", { name: "Sun", exact: true })
    .click();
  await page.getByRole("button", { name: "Weekdays", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Add to cart", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    (
      await page.request.post(`${base}/api/payments/razorpay/order`, {
        data: {},
      })
    ).status(),
    401,
  );
  await context.close();
  const reduced = await browser.newContext({ reducedMotion: "reduce" }),
    rp = await reduced.newPage();
  await rp.goto(`${base}/shop`, { waitUntil: "networkidle" });
  const before = await rp.locator("[class*=heroPhoto]").getAttribute("href");
  await rp.waitForTimeout(6250);
  assert.equal(
    await rp.locator("[class*=heroPhoto]").getAttribute("href"),
    before,
  );
  await reduced.close();
} finally {
  await browser.close();
}
await writeFile(
  path.join(output, "results.json"),
  JSON.stringify(
    {
      scope:
        "Anonymous actual Next.js app. No authenticated order creation or payment attempted.",
      results,
      autoplay: true,
      reducedMotion: true,
      paymentUnauthenticated: 401,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    checks: results.length,
    engines: 2,
    runtimeErrors: 0,
    cart: true,
    autoplay: true,
    reducedMotion: true,
    paymentUnauthenticated: 401,
  }),
);
