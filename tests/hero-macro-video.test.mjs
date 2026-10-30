import assert from 'node:assert/strict';
import test from 'node:test';
import { createMacroVideo } from '../lib/hero-macro-video.ts';

class Clip extends EventTarget {
  src = ''; readyState = 2; currentTime = 0; ended = false;
  duration = 3.041667; error = null; plays = 0; pauses = 0; playbackRate = 3;
  getAttribute() { return this.src; }
  removeAttribute() { this.src = ''; }
  canPlayType() { return 'probably'; }
  load() {}
  play() { this.plays++; return this.playResult ?? Promise.resolve(); }
  pause() { this.pauses++; }
  requestVideoFrameCallback(fn) { this.present = fn; return 1; }
  cancelVideoFrameCallback() { this.present = undefined; }
}

test('one forward shot plays from zero at 1x and reveals only a presented frame', async () => {
  const clip = new Clip(); clip.currentTime = 2;
  const media = createMacroVideo(clip, () => {});
  assert.equal(clip.src, '', 'arrival does not fetch the MP4');
  media.prepare(); media.begin();
  assert.equal(clip.currentTime, 0);
  assert.equal(clip.playbackRate, 1);
  assert.equal(clip.muted, true);
  assert.equal(media.tick(16).visible, false);
  await Promise.resolve();
  clip.present();
  for (let i = 1; i <= 100; i++) { clip.currentTime = i / 40; media.tick(25); }
  assert.equal(clip.plays, 1, 'no repeated play calls or frame seeking');
  assert.equal(clip.currentTime, 2.5);
  assert.equal(media.tick(0).visible, true);
  clip.ended = true; clip.dispatchEvent(new Event('ended'));
  assert.equal(media.tick(16).phase, 'finishing');
  assert.equal(clip.currentTime, clip.duration - .001, 'one buffered final seek, only after playback ends');
  clip.present();
  assert.equal(media.tick(16).phase, 'ended');
  media.stop();
  assert.equal(media.tick(0).visible, false, 'reverse uses the static photograph');
  assert.equal(clip.plays, 1);
});

test('failed, unsupported, stalled and slow playback fall back without endless holding', async () => {
  for (const mode of ['rejected', 'unsupported', 'stalled', 'slow', 'error']) {
    const clip = new Clip();
    if (mode === 'rejected') clip.playResult = Promise.reject(new Error('autoplay denied'));
    if (mode === 'unsupported') clip.canPlayType = () => '';
    if (mode === 'slow') clip.readyState = 0;
    const media = createMacroVideo(clip, () => {});
    media.begin();
    if (mode === 'error') clip.dispatchEvent(new Event('error'));
    media.tick(16); await Promise.resolve();
    for (let i = 0; i < 125; i++) media.tick(16);
    assert.equal(media.tick(0).phase, 'fallback', mode);
    clip.readyState = 4; clip.currentTime = 1;
    assert.equal(media.tick(0).visible, false, 'late media cannot replace the chosen fallback');
    media.dispose();
  }
});

test('visibility resume continues from the same frame, and stop invalidates pending callbacks', async () => {
  const clip = new Clip(); const media = createMacroVideo(clip, () => {});
  media.begin(); media.tick(16); await Promise.resolve();
  clip.currentTime = 1; media.tick(16);
  media.pause(); media.resume(); media.tick(0); await Promise.resolve();
  assert.equal(clip.currentTime, 1);
  assert.equal(clip.plays, 2, 'only explicit resume starts playback again');
  let finish;
  clip.playResult = new Promise(resolve => { finish = resolve; });
  media.pause(); media.resume(); media.tick(0);
  const stale = clip.present;
  media.stop(); finish(); stale(); await Promise.resolve();
  assert.equal(media.tick(0).visible, false);
  assert.equal(media.tick(0).phase, 'idle');
  media.dispose();
  assert.equal(clip.src, '');
});


test('final-frame preparation is bounded, accepts a seeked paint fallback, and never replays', async () => {
  for (const decoded of [false, true]) {
    const clip = new Clip(); const media = createMacroVideo(clip, () => {});
    media.begin(); media.tick(16); await Promise.resolve();
    clip.ended = true; clip.dispatchEvent(new Event('ended'));
    if (decoded) clip.dispatchEvent(new Event('seeked'));
    for (let i = 0; i < 130; i++) media.tick(16);
    assert.equal(media.tick(0).phase, decoded ? 'ended' : 'fallback');
    assert.equal(clip.plays, 1);
    media.dispose();
  }
});
