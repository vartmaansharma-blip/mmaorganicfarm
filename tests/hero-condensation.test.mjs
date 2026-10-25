import assert from 'node:assert/strict';
import test from 'node:test';
import { condensationFrame, GLASS_BEADS } from '../lib/hero-condensation.ts';

test('condensation remains sparse, deterministic and bounded across long visits', () => {
  assert.equal(GLASS_BEADS.length,8);
  for (const time of [-100,NaN,0,1000,4100,1000000]) {
    const drops=condensationFrame(time);
    assert.deepEqual(drops,condensationFrame(time));
    for(const d of drops){
      assert.ok(d.x>=220 && d.x<=580);
      assert.ok(d.y>=200 && d.y+d.distance<1050);
      assert.ok(d.radius>0 && d.radius<13);
      for(const key of ['opacity','satelliteOpacity','trailOpacity'])assert.ok(d[key]>=0 && d[key]<=1);
    }
  }
});

test('a bead grows while pinned, then accelerates down the glass', () => {
  const seed=GLASS_BEADS[0];
  const at=phase=>condensationFrame(seed.period*(1+phase)-seed.offset)[0];
  assert.equal(at(.1).distance,0);
  assert.equal(at(.2).distance,0);
  assert.ok(at(.2).radius>at(.1).radius);
  const a=at(.4).distance,b=at(.5).distance,c=at(.6).distance;
  assert.ok(a>0 && b>a && c-b>b-a);
});

test('collecting a neighbouring bead conserves approximate volume and fades the satellite', () => {
  const seed=GLASS_BEADS[0];
  const phase=.28+.72*Math.sqrt(70/seed.travel);
  const merged=condensationFrame(seed.period*(1+phase)-seed.offset)[0];
  assert.ok(Math.abs(merged.radius**3-(seed.radius**3+merged.satelliteRadius**3))<.00001);
  assert.equal(merged.satelliteOpacity,0);
  const reset=condensationFrame(seed.period-seed.offset)[0];
  assert.equal(reset.opacity,0,'resets happen while invisible');
});
