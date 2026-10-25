import assert from "node:assert/strict";
import test from "node:test";
import { advanceFilm, FILM_DURATION_MS, FILM_STAGES, filmFrame, heroProgress, liquidGeometry, macroPresentation, milkFill, playing, startFilm } from "../lib/hero-motion.ts";

const empty = () => ({ state: 'FILLING', time: 0 });

test('native scroll fill is continuous, reversible, stationary and reaches full before the film', () => {
  assert.equal(heroProgress(126, 1300, 774, 126), 0);
  assert.equal(heroProgress(-400, 1300, 774, 126), 1);
  let previous = 0;
  for (let i = 0; i <= 1000; i++) {
    const fill = milkFill(i / 1000);
    assert.ok(fill >= previous && fill - previous < .002);
    assert.equal(milkFill(1 - (1000 - i) / 1000).toFixed(9), fill.toFixed(9));
    previous = fill;
  }
  assert.equal(milkFill(1), 1);
  assert.equal(milkFill(-1), 0);
  assert.equal(milkFill(2), 1);
  assert.equal(filmFrame(0).coffee, 0);
});

test('one trigger starts one film; repeated triggers and direction changes cannot restart or reverse it', () => {
  let film = startFilm(empty());
  assert.equal(film.state, 'PLAYING_FORWARD');
  assert.equal(advanceFilm(film, 0).state, 'PLAYING_FORWARD');
  for (let i = 0; i < 12; i++) {
    film = advanceFilm(film, 16);
    assert.strictEqual(startFilm(film), film);
    assert.strictEqual(startFilm(film, true), film);
  }
});

test('foreground stalls cannot skip stages; playback continues with no scroll input', () => {
  let film = startFilm(empty());
  const stages = [];
  for (let i = 0; i < 200 && playing(film); i++) {
    const name = filmFrame(film.time).stage;
    if (stages.at(-1) !== name) stages.push(name);
    film = advanceFilm(film, 9000); // A huge gesture/stall never selects a target frame.
  }
  assert.deepEqual(stages, FILM_STAGES.map(stage => stage.name));
  assert.deepEqual(film, { state: 'COMPLETED', time: FILM_DURATION_MS });
  assert.deepEqual(advanceFilm(film, 10000), film);
  assert.strictEqual(startFilm(film), film);
});

test('every photograph has a clean hold; matching transitions are short and bounded', () => {
  for (const [time, weights] of [[0,[0,0,0,0]], [180,[1,0,0,0]], [400,[1,1,0,0]], [1000,[1,1,0,1]], [1700,[1,0,1,0]]]) {
    const { coffee, side, top, macro } = filmFrame(time);
    assert.deepEqual([coffee,side,top,macro], weights);
  }
  for (let time = 1; time <= FILM_DURATION_MS; time++) {
    const prev = filmFrame(time - 1), next = filmFrame(time);
    for (const key of ['coffee','side','top','macro']) {
      assert.ok(next[key] >= 0 && next[key] <= 1);
      assert.ok(Math.abs(next[key] - prev[key]) < .015);
    }
  }
});

test('returning plays every stage backward and ends on a filled frontal milk glass', () => {
  let film = startFilm({ state: 'COMPLETED', time: FILM_DURATION_MS }, true);
  assert.equal(advanceFilm(film, 0).state, 'PLAYING_REVERSE');
  const stages = [];
  while (playing(film)) {
    const name = filmFrame(film.time).stage;
    if (stages.at(-1) !== name) stages.push(name);
    film = advanceFilm(film, 50);
  }
  assert.deepEqual(stages, FILM_STAGES.map(stage => stage.name).reverse());
  assert.deepEqual(film, empty());
  assert.deepEqual(filmFrame(film.time), { coffee: 0, side: 0, top: 0, macro: 0, stage: 'filled-front' });
  assert.ok(milkFill(.5) < milkFill(1));
});

test('a paused/hidden clock preserves its point and invalid deltas never advance it', () => {
  const film = advanceFilm(startFilm(empty()), 40);
  for (const elapsed of [0, -100, NaN, Infinity]) assert.deepEqual(advanceFilm(film, elapsed), film);
  assert.equal(advanceFilm(film, 10).time, 50);
});

test('liquid surface stays inside the approved tapered rim', () => {
  let previous = liquidGeometry(0);
  for (let i = 0; i <= 100; i++) {
    const level = liquidGeometry(i / 100);
    assert.ok(level.y <= previous.y && level.left <= previous.left);
    assert.ok(level.y - level.depth > .13);
    assert.ok(level.left > .08 && level.right < .92);
    assert.match(level.path, / A /);
    previous = level;
  }
});

test('full-screen macro stays bounded to the hero, including direct anchor exits', () => {
  assert.deepEqual(macroPresentation(844, 844, 1, 80), { opacity: 1, offsetY: 0, immersive: true });
  assert.deepEqual(macroPresentation(422, 844, 1, 80), { opacity: 1, offsetY: -422, immersive: true });
  assert.equal(macroPresentation(100, 844, 1, 80).opacity, 0);
  assert.equal(macroPresentation(-1, 844, 1, 80).immersive, false);
});
