import assert from "node:assert/strict";
import test from "node:test";
import { advanceFilm, FILM_CUES, FILM_DURATION_MS, FILM_STAGES, MACRO_VIDEO_DURATION_MS, filmFrame, heroProgress, liquidGeometry, macroPresentation, milkFill, playing, startFilm } from "../lib/hero-motion.ts";

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

test('every photograph has a clean hold; matching transitions are continuous and bounded', () => {
  for (const [time, weights] of [[0,[0,0,0,0]], [780,[1,0,0,0]], [1660,[1,1,0,0]], [2800,[1,1,0,1]], [FILM_CUES.overheadFull + 100,[1,0,1,0]]]) {
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
  assert.deepEqual(filmFrame(film.time), { coffee: 0, elevation: 0, side: 0, top: 0, macro: 0, macroDrift: 0, overheadSettle: 0, stage: 'filled-front' });
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


test('directed rhythm gives the camera lift room while preserving the longer macro payoff', () => {
  const cue = FILM_CUES;
  assert.ok(Math.abs(FILM_DURATION_MS - 6221.667) < .000001);
  assert.ok(Math.abs(cue.overheadStart - cue.macroFull - MACRO_VIDEO_DURATION_MS) < .000001);
  assert.ok(cue.coffeeStart >= 300, 'full milk registers before treatment');
  assert.ok(cue.elevatedStart - cue.coffeeEnd >= 300, 'coffee gets a clean frontal hold');
  assert.ok(cue.macroStart - cue.elevatedEnd >= 500, 'the elevated glass has time to register');
  assert.ok(cue.elevatedEnd - cue.elevatedStart >= 450, 'the second view glides in instead of snapping');
  assert.ok(cue.overheadStart - cue.macroFull >= 1200, 'the macro is the longest payoff');
  assert.ok(cue.end - cue.overheadFull >= 500, 'the ending has a calm landing');
});

test('camera lift eases out of and into still holds and retraces smoothly in reverse', () => {
  const { elevatedStart: start, elevatedEnd: end } = FILM_CUES;
  assert.equal(filmFrame(start).elevation, 0);
  assert.equal(filmFrame(end).elevation, 1);
  assert.ok(filmFrame(start + 1).elevation < .000001);
  assert.ok(1 - filmFrame(end - 1).elevation < .000001);
  let previous = 0;
  for (let t = start; t <= end; t++) {
    const lift = filmFrame(t).elevation;
    assert.ok(lift >= previous && lift - previous < .004);
    assert.ok(Math.abs(lift + filmFrame(end - (t - start)).elevation - 1) < 1e-12);
    previous = lift;
  }
});

test('macro creep and closing settle stay bounded, continuous and reverse on the same clock', () => {
  assert.equal(filmFrame(FILM_CUES.macroFull).macroDrift, 0);
  assert.equal(filmFrame(FILM_CUES.overheadStart).macroDrift, 1);
  assert.equal(filmFrame(FILM_CUES.overheadFull).macroDrift, 0);
  assert.equal(filmFrame(FILM_CUES.overheadFull).overheadSettle, 0);
  assert.equal(filmFrame(FILM_DURATION_MS).overheadSettle, 1);
  for (let t = 1; t <= FILM_DURATION_MS; t++) {
    for (const key of ['macroDrift', 'overheadSettle']) {
      const a = filmFrame(t - 1)[key], b = filmFrame(t)[key];
      assert.ok(b >= 0 && b <= 1 && Math.abs(b-a) < .005);
    }
  }
});
