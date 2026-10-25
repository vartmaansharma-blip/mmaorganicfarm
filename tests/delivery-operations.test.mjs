import test from "node:test";
import assert from "node:assert/strict";
import {
  validOperationalDate,
  entitlementAdapter,
  quantitiesBalance,
  outcomeLabel,
  reasonLabel,
} from "../lib/delivery-operations.ts";
test("operational dates reject rollover and missing data", () => {
  assert.equal(validOperationalDate("2026-02-29"), null);
  assert.equal(validOperationalDate("2028-02-29"), "2028-02-29");
  assert.equal(validOperationalDate("2026-10-25T12:00:00Z"), null);
  assert.equal(validOperationalDate(null), null);
});
test("legacy 30 entitlements retain 20 after ten genuine fulfilments", () =>
  assert.equal(
    entitlementAdapter("legacy_delivery_count", 30, 10).remaining,
    20,
  ));
test("monthly and unknown models cannot fabricate delivery-count balances", () => {
  for (const model of ["calendar_period", "unknown", null])
    assert.equal(entitlementAdapter(model, 30, 10).supported, false);
});
test("one-time obligations have no invented subscription count", () =>
  assert.equal(entitlementAdapter("one_time", null, null).remaining, null));
test("zero and missing entitlement/quantity data are distinct", () => {
  assert.equal(
    entitlementAdapter("legacy_delivery_count", 30, 30).remaining,
    0,
  );
  assert.equal(
    entitlementAdapter("legacy_delivery_count", 30, null).supported,
    false,
  );
  assert.equal(
    quantitiesBalance({
      scheduled: 0,
      delivered: 0,
      cancelled: 0,
      outstanding: 0,
    }),
    true,
  );
  assert.equal(
    quantitiesBalance({
      scheduled: 1,
      delivered: null,
      cancelled: 0,
      outstanding: 1,
    }),
    false,
  );
  assert.equal(
    quantitiesBalance({
      scheduled: 2,
      delivered: 1,
      cancelled: 0,
      outstanding: 0,
    }),
    false,
  );
});
test("staff labels distinguish failure, skip, reschedule and partial delivery", () => {
  assert.equal(outcomeLabel("attempt_failed"), "Attempt failed");
  assert.equal(outcomeLabel("reschedule_requested"), "Reschedule requested");
  assert.equal(reasonLabel("gate_locked"), "Gate locked");
});
