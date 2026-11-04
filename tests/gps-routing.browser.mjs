import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { gpsFixture } from "./helpers/gps-fixture.mjs";
import {
  sessionFor,
  startFixtureServer,
} from "./database/supabase-fixture-server.mjs";
const port = 3292,
  base = `http://127.0.0.1:${port}`,
  output = "work/gps-routing";
await mkdir(output, { recursive: true });
const cookie = (user) => ({
  name: "sb-127-auth-token",
  value:
    "base64-" +
    Buffer.from(JSON.stringify(sessionFor(user))).toString("base64url"),
  domain: "127.0.0.1",
  path: "/",
});
let server,
  log = "",
  fixture,
  bridge;
const results = [];
try {
  for (const [name, engine] of Object.entries({ chromium, webkit }))
    for (const [width, theme] of [
      [390, "light"],
      [390, "dark"],
      [1440, "light"],
      [1440, "dark"],
    ]) {
      if (process.env.GPS_TEST_ENGINE && process.env.GPS_TEST_ENGINE !== name)
        continue;
      if (
        process.env.GPS_TEST_WIDTH &&
        Number(process.env.GPS_TEST_WIDTH) !== width
      )
        continue;
      fixture = await gpsFixture();
      await fixture.release();
      bridge = await startFixtureServer(fixture.config, { port: 55489 });
      if (!server) {
        server = spawn(
          process.execPath,
          [
            "--import",
            "./tests/helpers/gps-provider-fixture.mjs",
            "node_modules/next/dist/bin/next",
            "start",
            "--hostname",
            "127.0.0.1",
            "--port",
            String(port),
          ],
          {
            env: {
              ...process.env,
              NEXT_PUBLIC_SUPABASE_URL: bridge.url,
              NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-publishable",
              SUPABASE_SECRET_KEY: "local-service-fixture",
              GPS_ROAD_ROUTING_ENABLED: "true",
              GPS_GOOGLE_ROUTES_KEY: "fixture-provider-key",
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        server.stdout.on("data", (x) => (log += x));
        server.stderr.on("data", (x) => (log += x));
        for (let i = 0; i < 150; i++) {
          if (server.exitCode !== null) throw Error(log);
          try {
            if ((await fetch(base + "/sign-in")).ok) break;
          } catch {}
          if (i === 149) throw Error(log);
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      const browser = await engine.launch();
      try {
        const mctx = await browser.newContext({
            viewport: { width, height: 950 },
            reducedMotion: "reduce",
          }),
          dctx = await browser.newContext({
            viewport: { width, height: 950 },
            reducedMotion: "reduce",
          });
        for (const ctx of [mctx, dctx])
          await ctx.addInitScript((theme) => {
            localStorage.setItem("mma-theme", theme);
            Object.defineProperty(navigator, "geolocation", {
              configurable: true,
              value: {
                watchPosition(success) {
                  setTimeout(
                    () =>
                      success({
                        coords: {
                          latitude: 22.8,
                          longitude: 86.2,
                          accuracy: 12,
                        },
                        timestamp: Date.now(),
                      }),
                    50,
                  );
                  return 1;
                },
                clearWatch() {},
                getCurrentPosition(success) {
                  setTimeout(
                    () =>
                      success({
                        coords: {
                          latitude: 22.8,
                          longitude: 86.2,
                          accuracy: 12,
                        },
                        timestamp: Date.now(),
                      }),
                    50,
                  );
                },
              },
            });
          }, theme);
        await mctx.addCookies([cookie(fixture.manager)]);
        await dctx.addCookies([cookie(fixture.driver)]);
        const m = await mctx.newPage(),
          d = await dctx.newPage();
        const errors = [];
        for (const p of [m, d])
          p.on("pageerror", (e) => errors.push(e.message));
        await m.goto(base + "/farm/gps", { waitUntil: "networkidle" });
        await m
          .getByLabel("Start mode")
          .selectOption(width === 390 ? "farm_pickup" : "already_loaded");
        await m
          .getByLabel("Stop sequence")
          .selectOption(width === 390 ? "review" : "road");
        await m.getByLabel("Farm / return point name").fill("Fixture farm");
        await m.getByLabel("Return-point latitude").fill("22.79");
        await m.getByLabel("Return-point longitude").fill("86.19");
        await m.getByRole("button", { name: "Save GPS settings" }).click();
        await m.getByRole("status").filter({ hasText: "Saved" }).waitFor();
        await d.goto(base + "/farm/gps", { waitUntil: "networkidle" });
        if (width === 390) {
          await d
            .getByRole("button", { name: "I collected my checked load" })
            .click();
          await d.getByLabel("Opening odometer · km").waitFor();
        }
        await d.getByLabel("Opening odometer · km").fill("100");
        await d.getByRole("button", { name: "Start my run" }).click();
        await d
          .getByRole("button", { name: "Stop sharing location" })
          .waitFor();
        if (width === 390) {
          await d
            .getByRole("status")
            .filter({ hasText: "Position shared" })
            .waitFor();
          await d
            .getByRole("button", { name: "Calculate road proposal" })
            .click();
          await d
            .getByRole("button", { name: "Waiting for manager approval" })
            .waitFor();
        } else
          await d.getByRole("button", { name: "Sequence accepted" }).waitFor();
        await m.getByRole("button", { name: "Update now" }).click();
        await m
          .getByRole("button", {
            name: width === 390 ? "Approve this sequence" : "Manager approved",
          })
          .waitFor();
        await m.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
        await m.screenshot({
          path: `${output}/${name}-${width}-${theme}-manager.png`,
          fullPage: true,
        });
        if (width === 390) {
          await m
            .getByRole("button", { name: "Approve this sequence" })
            .click();
          await m.getByRole("button", { name: "Manager approved" }).waitFor();
          await d.getByRole("button", { name: "Update now" }).click();
          await d
            .getByRole("button", { name: "Accept this road plan" })
            .click();
          await d.getByRole("button", { name: "Sequence accepted" }).waitFor();
        }
        const order = await d
          .locator("ol")
          .last()
          .locator("strong")
          .allTextContents();
        assert.equal(order[0], "Sample household 3");
        for (const p of [m, d]) {
          assert.equal(
            await p.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            `${name}/${width} overflow`,
          );
          assert.equal(
            await p.locator("html").getAttribute("data-theme"),
            theme,
          );
        }
        await d.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
        await d.screenshot({
          path: `${output}/${name}-${width}-${theme}-driver.png`,
          fullPage: true,
        });
        await d.getByRole("button", { name: "Stop sharing location" }).click();
        await d.getByText("Not sharing", { exact: true }).waitFor();
        await dctx.addInitScript(() =>
          Object.defineProperty(navigator, "geolocation", {
            configurable: true,
            value: {
              watchPosition(_success, error) {
                setTimeout(() => error({ code: 1 }), 20);
                return 2;
              },
              clearWatch() {},
            },
          }),
        );
        await d.reload({ waitUntil: "networkidle" });
        await d
          .getByRole("button", { name: "Share my current position" })
          .click();
        await d
          .getByRole("alert")
          .filter({ hasText: "permission was denied" })
          .waitFor();
        for (const p of [m, d]) {
          await p.setViewportSize({ width: 320, height: 900 });
          assert.equal(
            await p.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            `${name}/${theme} 320px overflow`,
          );
        }
        await d.getByRole("link", { name: "Open delivery record", exact: true }).click();
        await d.getByRole("heading", { name: "Sample household 3", exact: true }).waitFor();
        const snapshot = (await fixture.workspace(fixture.driver)).runs[0];
        const expectedNext = snapshot.stops.find(s=>s.visit_key===snapshot.accepted.ordered_keys[1]).id;
        assert.ok((await d.getByRole("link",{name:"Next stop →",exact:true}).getAttribute("href")).includes(expectedNext));
        assert.deepEqual(errors, []);
        results.push({
          engine: name,
          width,
          theme,
          startMode: width === 390 ? "farm_pickup" : "already_loaded",
          syntheticGps: true,
          syntheticRoadProvider: true,
          approvedSequence: true,
          permissionDenied: true,
          overflow: false,
        });
        console.log(
          `${name} ${width} ${theme}: pickup/start, GPS, proposal, manager approval, driver acceptance and permission denial passed`,
        );
        await mctx.close();
        await dctx.close();
      } finally {
        await browser.close();
        await bridge.stop();
        bridge = null;
        await fixture.stop();
        fixture = null;
      }
    }
  await writeFile(output + "/results.json", JSON.stringify(results, null, 2));
} catch (e) {
  await writeFile(output + "/server.log", log);
  throw e;
} finally {
  server?.kill("SIGTERM");
  if (bridge) await bridge.stop();
  if (fixture) await fixture.stop();
}
