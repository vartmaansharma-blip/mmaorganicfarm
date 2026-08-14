import assert from "node:assert/strict";
import test from "node:test";
import {
  inferDeliveryArea,
  resolveDeliveryArea,
} from "../lib/delivery-area.ts";

const areas = [
  { active: true, id: "bistupur", name: "Bistupur" },
  { active: true, id: "new-baridih", name: "New Baridih" },
  { active: true, id: "baridih", name: "Baridih" },
  { active: false, id: "old-area", name: "Old Area" },
];

test("infers an area from a simple address relation", () => {
  assert.equal(
    inferDeliveryArea("H.N. 12, BISTUPUR, Jamshedpur", areas)?.id,
    "bistupur",
  );
});

test("prefers the more specific matching area name", () => {
  assert.equal(
    inferDeliveryArea("Road 3, New Baridih", areas)?.id,
    "new-baridih",
  );
});

test("keeps a manually assigned area ahead of address inference", () => {
  assert.equal(
    resolveDeliveryArea("baridih", "Bistupur", areas)?.id,
    "baridih",
  );
});

test("does not infer inactive or unrelated areas", () => {
  assert.equal(inferDeliveryArea("Old Area market", areas), null);
  assert.equal(inferDeliveryArea("Kadma, Jamshedpur", areas), null);
});
