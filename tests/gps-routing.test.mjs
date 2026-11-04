import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const cache = new Map();
function load(file) {
  const full = path.resolve(import.meta.dirname, "..", file);
  if (cache.has(full)) return cache.get(full).exports;
  const mod = { exports: {} };
  cache.set(full, mod);
  const source = ts.transpileModule(fs.readFileSync(full, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInThisContext(`(function(exports,require,module){${source}\n})`, {
    filename: full,
  })(
    mod.exports,
    (spec) =>
      load(
        path.relative(
          path.resolve(import.meta.dirname, ".."),
          path.resolve(path.dirname(full), spec) + ".ts",
        ),
      ),
    mod,
  );
  return mod.exports;
}
const { computeRoadProposal } = load("lib/gps-provider.ts");
const { validateFix, orderedPendingStops, locationState } =
  load("lib/gps-routing.ts");
const stops = [0, 1, 2].map((i) => ({
  visit_key: `v${i}`,
  id: `d${i}`,
  customer_name: `Sample ${i}`,
  address_snapshot: "Fixture gate",
  destination_latitude: 22.8 + i * 0.01,
  destination_longitude: 86.2 + i * 0.01,
  destination_confirmed_at: "2026-11-01T00:00:00Z",
  recorded: false,
  cancelled: false,
  items: [],
}));
const input = {
  origin: { latitude: 22.79, longitude: 86.19 },
  hub: { latitude: 22.79, longitude: 86.19 },
  stops,
  optimise: true,
  travelMode: "TWO_WHEELER",
};
const route = (duration = "600s", order = [2, 0, 1]) => ({
  routes: [
    {
      duration,
      distanceMeters: 3000,
      optimizedIntermediateWaypointIndex: order,
      legs: Array(4).fill({ duration: "150s" }),
    },
  ],
});
test("road provider sends confirmed pins and a vehicle profile, verifies every returned visit and compares like-for-like estimates", async () => {
  const calls = [];
  const transport = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return Response.json(route(calls.length === 1 ? "900s" : "600s"));
  };
  const result = await computeRoadProposal(input, "fixture-key", transport);
  assert.deepEqual(result.ordered_keys, ["v2", "v0", "v1"]);
  assert.equal(result.baseline_seconds, 900);
  assert.equal(result.duration_seconds, 600);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.travelMode, "TWO_WHEELER");
  assert.equal(calls[0].body.routingPreference, "TRAFFIC_UNAWARE");
  assert.equal(calls[1].body.optimizeWaypointOrder, true);
  assert.equal(calls[0].body.intermediates.length, 3);
  assert.deepEqual(calls[0].body.origin, calls[0].body.destination);
});
test("no key, missing pins, too many visits and malformed provider routes fail without a straight-line substitute", async () => {
  await assert.rejects(computeRoadProposal(input, ""), /awaiting/);
  await assert.rejects(
    computeRoadProposal(
      { ...input, stops: [{ ...stops[0], destination_confirmed_at: null }] },
      "key",
    ),
    /confirmed/,
  );
  await assert.rejects(
    computeRoadProposal(
      {
        ...input,
        stops: Array.from({ length: 26 }, (_, i) => ({
          ...stops[0],
          visit_key: String(i),
        })),
      },
      "key",
    ),
    /1–25/,
  );
  let calls = 0;
  await assert.rejects(
    computeRoadProposal(input, "key", async () =>
      Response.json(route(++calls === 1 ? "900s" : "600s", [0, 0, 1])),
    ),
    /incomplete/,
  );
  await assert.rejects(
    computeRoadProposal(input, "key", async () =>
      Response.json({ routes: [] }),
    ),
    /complete road route/,
  );
  await assert.rejects(
    computeRoadProposal(input, "key", async () =>
      Response.json({ ...route(), fallbackInfo: { reason: "OTHER" } }),
    ),
    /complete road route/,
  );
});
test("manual sequence stays fixed and a worse road proposal is discarded", async () => {
  let count = 0;
  const result = await computeRoadProposal(input, "key", async () =>
    Response.json(route(++count === 1 ? "600s" : "900s")),
  );
  assert.deepEqual(result.ordered_keys, ["v0", "v1", "v2"]);
  assert.equal(result.duration_seconds, 600);
  count = 0;
  const manual = await computeRoadProposal(
    { ...input, optimise: false },
    "key",
    async () => {
      count++;
      return Response.json(route());
    },
  );
  assert.equal(count, 1);
  assert.deepEqual(manual.ordered_keys, ["v0", "v1", "v2"]);
});
test("location fixes enforce precision/freshness and location status stops claiming freshness", () => {
  const now = Date.now(),
    fix = {
      latitude: 22.8,
      longitude: 86.2,
      accuracy: 20,
      captured_at: new Date(now).toISOString(),
    };
  assert.deepEqual(validateFix(fix, now), fix);
  assert.throws(
    () => validateFix({ ...fix, accuracy: 101 }, now),
    /100 metres/,
  );
  assert.throws(
    () =>
      validateFix(
        { ...fix, captured_at: new Date(now - 121000).toISOString() },
        now,
      ),
    /out of date/,
  );
  assert.equal(
    locationState({ ...fix, tracking: true }, now + 91000),
    "Location out of date",
  );
  assert.equal(locationState(null), "Not sharing");
});
test("accepted order filters recorded and cancelled visits without changing their records; invalid revisions fall back", () => {
  const run = {
    stops: [{ ...stops[0], recorded: true }, stops[1], stops[2]],
    version: 3,
    config: { version: 2 },
    accepted: {
      run_version: 3,
      config_version: 2,
      ordered_keys: ["v2", "v0", "v1"],
    },
  };
  assert.deepEqual(
    orderedPendingStops(run).map((s) => s.visit_key),
    ["v2", "v1"],
  );
  assert.equal(run.stops[0].recorded, true);
  assert.deepEqual(
    orderedPendingStops({ ...run, version: 4 }).map((s) => s.visit_key),
    ["v1", "v2"],
  );
});

const { gpsTime, gpsNavigationUrl } = load("lib/gps-routing.ts");
test("GPS times render identically across browsers and motorcycle navigation preserves its mode", () => {
  assert.equal(gpsTime("2026-11-01T23:40:15Z", true), "05:10:15");
  assert.equal(gpsTime("invalid"), "Unavailable");
  const url = new URL(gpsNavigationUrl(stops[0], "TWO_WHEELER"));
  assert.equal(url.searchParams.get("travelmode"), "two-wheeler");
  assert.equal(url.searchParams.get("dir_action"), "navigate");
  assert.equal(url.searchParams.has("origin"), false);
});
