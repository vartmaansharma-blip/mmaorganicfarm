import assert from 'node:assert/strict';
import test from 'node:test';
import { latteFrame, latteProgress } from '../lib/hero-latte.ts';

test('latte reveal starts after the original fill runway and clamps both ends', () => {
  assert.equal(latteProgress(450, 550, 1250), 0);
  assert.equal(latteProgress(1175, 550, 1250), .5);
  assert.equal(latteProgress(1800, 550, 1250), 1);
  assert.equal(latteProgress(9000, 550, 1250), 1);
});
test('plain milk, crema, main heart, then lettering and small heart', () => {
  assert.deepEqual(latteFrame(.15), {crema:0, heart:0, name:0, farms:0, smallHeart:0, settle:0});
  assert.ok(latteFrame(.25).crema > 0);
  assert.equal(latteFrame(.25).heart,0);
  assert.equal(latteFrame(.55).heart,1);
  assert.equal(latteFrame(.55).name,0);
  assert.equal(latteFrame(.75).name,1);
  assert.equal(latteFrame(.75).farms,0);
  assert.deepEqual(latteFrame(.90), {crema:1, heart:1, name:1, farms:1, smallHeart:1, settle:1});
});
test('fast, slow and reverse scroll resolve the same mask without a clock', () => {
  const atHalf = latteFrame(.5);
  for (let p=0;p<1;p+=.01) latteFrame(p);
  for (let p=1;p>0;p-=.01) latteFrame(p);
  assert.deepEqual(latteFrame(.5), atHalf);
  for (const value of Object.values(latteFrame(NaN))) assert.equal(value,0);
});

test('user-selected artwork and fixed milk plate remain the approved files', async () => {
  const { createHash } = await import('node:crypto');
  const { readFile } = await import('node:fs/promises');
  for (const [file, digest] of [
    ['milk-overhead-fixed.webp', '61f90e0507acd03e3cf274de38bcbabeaf66a5d533a7077b5f112f360aebc82d'],
    ['latte-heart-approved.webp', '52055fd6d93a15704f693c2d2ec597c266dcc77173f12388e848629c937614c8'],
  ]) assert.equal(createHash('sha256').update(await readFile(new URL(`../public/hero/${file}`, import.meta.url))).digest('hex'), digest);
});
