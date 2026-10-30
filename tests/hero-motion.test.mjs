import assert from "node:assert/strict";
import test from "node:test";
import { advanceFilm, FILM_CUES, FILM_DURATION_MS, FILM_STAGES, MACRO_VIDEO_DURATION_MS, filmFrame, heroProgress, liquidGeometry, macroPresentation, macroCamera, milkFill, playing, startFilm } from "../lib/hero-motion.ts";

const empty = () => ({ state: 'FILLING', time: 0 });

test('native fill advances smoothly and retains its high-water mark on upward scrolling', () => {
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
  assert.equal(milkFill(.2, .8), .8);
  assert.equal(milkFill(0, 1), 1);
  assert.equal(filmFrame(0).coffee, 0);
});

test('one trigger starts one film; repeated triggers and direction changes cannot restart or reverse it', () => {
  let film = startFilm(empty());
  assert.equal(film.state, 'PLAYING_FORWARD');
  assert.equal(advanceFilm(film, 0).state, 'PLAYING_FORWARD');
  for (let i = 0; i < 12; i++) {
    film = advanceFilm(film, 16);
    assert.strictEqual(startFilm(film), film);
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
  for (const [time, weights] of [[0,[0,0,0]], [780,[1,0,0]], [1430,[1,0,0]], [2800,[1,0,1]], [FILM_CUES.overheadFull + 100,[1,1,0]]]) {
    const { coffee, top, macro } = filmFrame(time);
    assert.deepEqual([coffee,top,macro], weights);
  }
  for (let time = 1; time <= FILM_DURATION_MS; time++) {
    const prev = filmFrame(time - 1), next = filmFrame(time);
    for (const key of ['coffee','top','macro']) {
      assert.ok(next[key] >= 0 && next[key] <= 1);
      assert.ok(Math.abs(next[key] - prev[key]) < .015);
    }
  }
});

test('completed introduction cannot restart or rewind after returning upward', () => {
  const completed = { state: 'COMPLETED', time: FILM_DURATION_MS };
  assert.strictEqual(startFilm(completed), completed);
  for (const delta of [-500, 0, 500]) assert.strictEqual(advanceFilm(completed, delta), completed);
  assert.equal(playing(completed), false);
  assert.equal(filmFrame(completed.time).top, 1);
  assert.equal(milkFill(0, 1), 1);
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


test('directed rhythm gives the camera traverse room while preserving the longer macro payoff', () => {
  const cue = FILM_CUES;
  assert.ok(Math.abs(FILM_DURATION_MS - 4200) < .000001);
  assert.ok(Math.abs(cue.overheadStart - cue.macroFull - MACRO_VIDEO_DURATION_MS) < .000001);
  assert.ok(cue.coffeeStart >= 120, 'full milk registers before treatment');
  assert.ok(cue.cameraStart - cue.coffeeEnd >= 160, 'coffee gets a clean frontal hold');
  assert.ok(cue.macroStart - cue.cameraEnd >= 40, 'the fixed view lands briefly before the macro');
  assert.ok(cue.cameraEnd - cue.cameraStart >= 800, 'the curved path has room to register');
  assert.ok(cue.overheadStart - cue.macroFull >= 1200, 'the macro is the longest payoff');
  assert.ok(cue.end - cue.overheadFull >= 300, 'the ending has a calm landing');
});

test('fixed-angle camera follows a bounded downward parabola with smooth endpoints', () => {
  const { cameraStart: start, cameraEnd: end } = FILM_CUES;
  const first = filmFrame(start), last = filmFrame(end), middle = filmFrame((start + end) / 2);
  assert.equal(first.cameraY, 0);
  assert.equal(last.cameraY, 6);
  assert.equal(last.cameraX, 0);
  assert.equal(middle.cameraX, -3);
  assert.equal(middle.cameraY, 1.5);
  assert.ok(filmFrame(start + 1).cameraProgress < .000001);
  assert.ok(1 - filmFrame(end - 1).cameraProgress < .000001);
  let previous = first;
  for (let t = start; t <= end; t++) {
    const sample = filmFrame(t);
    assert.ok(sample.cameraY >= previous.cameraY, 'camera descends without an upward leg');
    assert.ok(sample.cameraX >= -3 && sample.cameraX <= 0);
    assert.ok(sample.cameraY <= 6, 'whole-glass framing bounds travel');
    assert.ok(Math.abs(sample.cameraX - previous.cameraX) < .03);
    assert.ok(Math.abs(sample.cameraY - previous.cameraY) < .03);
    const reverse = filmFrame(end - (t - start));
    assert.ok(Math.abs(sample.cameraX - reverse.cameraX) < 1e-12);
    assert.ok(Math.abs(sample.cameraProgress + reverse.cameraProgress - 1) < 1e-12);
    previous = sample;
  }
});

test('macro creep and closing settle stay bounded, continuous on the same clock', () => {
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

test('camera fills the view with the glass interior before a registered overhead pullback', () => {
  const front = {x:80,y:300,width:240,height:360}, top = {x:80,y:300,width:240,height:360};
  const first = macroCamera(0,0,0,390,844,front,top);
  assert.equal(first.frontScale,1);
  assert.ok(Math.abs(first.frontX)<1e-9);
  assert.ok(Math.abs(first.frontY)<1e-9);
  const close = macroCamera(1,0,0,390,844,front,top);
  assert.ok(close.frontScale*front.width*.46>390);
  assert.ok(close.frontScale*front.height*.46>844);
  assert.ok(Math.abs(front.x+close.frontX+front.width*.5*close.frontScale-195)<1e-9);
  assert.ok(Math.abs(front.y+close.frontY+front.height*.44*close.frontScale-422)<1e-9);
  const end = macroCamera(1,1,1,390,844,front,top);
  assert.ok(Math.abs(end.topScale-1.12)<1e-9);
  assert.ok(Math.abs(end.topX-(1-1.12)*top.width/2)<1e-9);
  assert.ok(Math.abs(end.topY-(1-1.12)*top.height/2)<1e-9);
});
