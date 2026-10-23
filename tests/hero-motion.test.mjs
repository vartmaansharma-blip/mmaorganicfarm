import assert from "node:assert/strict";
import test from "node:test";
import { dampProgress, heroFrame, heroProgress, liquidGeometry, macroPresentation } from "../lib/hero-motion.ts";

test("fill starts at the sticky header and reaches full before coffee or camera changes", () => {
  assert.equal(heroProgress(126, 2200, 774, 126), 0);
  assert.equal(heroProgress(-1300, 2200, 774, 126), 1);
  assert.deepEqual(heroFrame(0), { fill: 0, coffee: 0, side: 0, top: 0, macro: 0 });
  assert.equal(heroFrame(.48).fill, 1);
  assert.equal(heroFrame(.48).coffee, 0);
  for (let p = 0; p < .48; p += .005) {
    assert.equal(heroFrame(p).side, 0);
    assert.equal(heroFrame(p).coffee, 0);
  }
});

test("every sample is bounded, continuous, monotonic during filling, and reversible", () => {
  let previous = heroFrame(0);
  const frames = [];
  for (let i = 0; i <= 1000; i++) {
    const frame = heroFrame(i / 1000);
    frames.push(frame);
    for (const key of Object.keys(frame)) {
      assert.ok(frame[key] >= 0 && frame[key] <= 1);
      assert.ok(Math.abs(frame[key] - previous[key]) < 0.04);
    }
    assert.ok(frame.fill >= previous.fill);
    previous = frame;
  }
  for (let i = 1000; i >= 0; i--) assert.deepEqual(heroFrame(i / 1000), frames[i]);
  assert.deepEqual(heroFrame(-1), heroFrame(0));
  assert.deepEqual(heroFrame(2), heroFrame(1));
});

test("three independent photographic views finish on the macro", () => {
  assert.equal(heroFrame(.66).side, 1);
  assert.equal(heroFrame(.78).top, 1);
  assert.equal(heroFrame(.9).macro, 1);
  assert.deepEqual(heroFrame(1), { fill: 1, coffee: 1, side: 0, top: 0, macro: 1 });
});

test("reduced motion always returns a static finished front glass", () => {
  for (const p of [0, .2, .5, .8, 1]) assert.deepEqual(heroFrame(p, true), { fill: 1, coffee: 1, side: 0, top: 0, macro: 0 });
});

test("damping is time based, settles, reverses and never overshoots", () => {
  const after = (hz) => {
    let p = 0;
    for (let i = 0; i < hz / 2; i++) p = dampProgress(p, 1, 1000 / hz);
    return p;
  };
  assert.ok(Math.abs(after(30) - after(120)) < .0001);
  assert.ok(after(60) > .999);
  let up = .8;
  for (let i = 0; i < 40; i++) {
    const next = dampProgress(up, .2, 16.67);
    assert.ok(next <= up && next >= .2);
    up = next;
  }
  assert.ok(Math.abs(up - .2) < .0001);
});

test("liquid surface stays inside the rim and widens smoothly with the tapered glass", () => {
  let previous = liquidGeometry(0);
  for (let i = 0; i <= 100; i++) {
    const level = liquidGeometry(i / 100);
    assert.ok(level.y <= previous.y);
    assert.ok(level.left <= previous.left);
    assert.ok(level.y - level.depth > .13, "surface must remain below the rim");
    assert.ok(level.left > .08 && level.right < .92);
    assert.match(level.path, / A /, "surface uses a curved meniscus");
    previous = level;
  }
});

test("the final full-screen frame slides away directly into content and reverses", () => {
  const full = macroPresentation(844, 844, 1, 80);
  assert.deepEqual(full, { opacity: 1, offsetY: 0, immersive: true });
  const leaving = macroPresentation(422, 844, 1, 80);
  assert.deepEqual(leaving, { opacity: 1, offsetY: -422, immersive: true });
  assert.equal(macroPresentation(100, 844, 1, 80).opacity, 0);
  assert.equal(macroPresentation(-1, 844, 1, 80).immersive, false);
  assert.deepEqual(macroPresentation(844, 844, 1, 80), full);
});
