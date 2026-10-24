import assert from "node:assert/strict";
import test from "node:test";
import { dampProgress, heroFrame, heroProgress, liquidGeometry, macroPresentation, stepCamera, CAMERA_TRANSITION_MS } from "../lib/hero-motion.ts";

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

test("scroll fill stays continuous and reversible while photograph targets stay clean", () => {
  let previous = heroFrame(0);
  const frames = [];
  for (let i = 0; i <= 1000; i++) {
    const frame = heroFrame(i / 1000);
    frames.push(frame);
    for (const key of Object.keys(frame)) {
      assert.ok(frame[key] >= 0 && frame[key] <= 1);
      if (key === "fill") assert.ok(Math.abs(frame[key] - previous[key]) < 0.04);
      else assert.ok(frame[key] === 0 || frame[key] === 1);
    }
    assert.ok(frame.fill >= previous.fill);
    previous = frame;
  }
  for (let i = 1000; i >= 0; i--) assert.deepEqual(heroFrame(i / 1000), frames[i]);
  assert.deepEqual(heroFrame(-1), heroFrame(0));
  assert.deepEqual(heroFrame(2), heroFrame(1));
});

test("distinct photographic views include an image-only insert and finish overhead", () => {
  assert.equal(heroFrame(.66).side, 1);
  assert.equal(heroFrame(.7).side, 1);
  assert.equal(heroFrame(.9).macro, 1);
  assert.equal(heroFrame(.88).macro, 1);
  assert.equal(heroFrame(.96).top, 1);
  assert.deepEqual(heroFrame(1), { fill: 1, coffee: 1, side: 0, top: 1, macro: 0 });
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

test("the full-screen insert stays bounded and anchor skips restore the page", () => {
  const full = macroPresentation(844, 844, 1, 80);
  assert.deepEqual(full, { opacity: 1, offsetY: 0, immersive: true });
  const leaving = macroPresentation(422, 844, 1, 80);
  assert.deepEqual(leaving, { opacity: 1, offsetY: -422, immersive: true });
  assert.equal(macroPresentation(100, 844, 1, 80).opacity, 0);
  assert.equal(macroPresentation(-1, 844, 1, 80).immersive, false);
  assert.deepEqual(macroPresentation(844, 844, 1, 80), full);
});


test("camera dissolves finish on a sharp frame when scrolling stops in an old blend interval", () => {
  for (const [from, to] of [[.59, .625], [.73, .785], [.89, .935], [.49, .53]]) {
    let step = stepCamera(undefined, heroFrame(from), 0);
    const target = heroFrame(to, false, step.state.to);
    step = stepCamera(step.state, target, 10);
    const middle = stepCamera(step.state, target, 10 + CAMERA_TRANSITION_MS / 2);
    assert.equal(middle.active, true);
    for (const value of Object.values(middle.values)) assert.ok(value >= 0 && value <= 1);
    const end = stepCamera(middle.state, target, 10 + CAMERA_TRANSITION_MS);
    assert.equal(end.active, false);
    assert.deepEqual(end.values, { coffee: target.coffee, side: target.side, top: target.top, macro: target.macro });
    assert.ok(Object.values(end.values).every(value => value === 0 || value === 1));
  }
});

test("reversing during a camera dissolve continues from the current image weights", () => {
  const front = heroFrame(.57), side = heroFrame(.66);
  let step = stepCamera(undefined, front, 0);
  step = stepCamera(step.state, side, 10);
  const middle = stepCamera(step.state, side, 60);
  const reverse = stepCamera(middle.state, front, 60);
  assert.deepEqual(reverse.values, middle.values);
  const end = stepCamera(reverse.state, front, 60 + CAMERA_TRANSITION_MS);
  assert.equal(end.values.side, 0);
  assert.equal(end.active, false);
});

test("small scroll jitter around a camera boundary does not restart the dissolve", () => {
  const before = heroFrame(.60);
  assert.equal(heroFrame(.623, false, before).side, 0);
  const after = heroFrame(.63, false, before);
  assert.equal(after.side, 1);
  assert.equal(heroFrame(.619, false, after).side, 1);
  assert.equal(heroFrame(.615, false, after).side, 0);
});
