import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('approved MP4 is byte-identical, H.264, 1284×724, 73/24 seconds and has no audio track', async () => {
  const bytes = await readFile(new URL('../public/hero/coffee-macro-motion.mp4', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'cc255f456ffa3304be88bcdc40fc1fd9671c46762b4ca0d82ed4039e5b206612');
  function boxes(start, end) {
    const entries = [];
    while (start + 8 <= end) {
      let size = bytes.readUInt32BE(start), data = start + 8;
      if (size === 1) { size = Number(bytes.readBigUInt64BE(data)); data += 8; }
      if (size === 0) size = end - start;
      assert.ok(size >= data - start && start + size <= end);
      entries.push({ type: bytes.toString('ascii', start + 4, start + 8), start: data, end: start + size });
      start += size;
    }
    return entries;
  }
  const child = (parent, type) => {
    const found = boxes(parent.start, parent.end).find(box => box.type === type);
    assert.ok(found, `MP4 ${type} atom exists`); return found;
  };
  const moov = child({ start: 0, end: bytes.length }, 'moov');
  const tracks = boxes(moov.start, moov.end).filter(box => box.type === 'trak');
  assert.equal(tracks.length, 1, 'exactly one track, including no hidden audio track');
  const mdia = child(tracks[0], 'mdia');
  assert.equal(bytes.toString('ascii', child(mdia, 'hdlr').start + 8, child(mdia, 'hdlr').start + 12), 'vide');
  const header = child(tracks[0], 'tkhd');
  assert.equal(bytes.readUInt32BE(header.end - 8) / 65536, 1284);
  assert.equal(bytes.readUInt32BE(header.end - 4) / 65536, 724);
  const clock = child(mdia, 'mdhd').start;
  const offset = clock + (bytes[clock] === 1 ? 20 : 12);
  assert.ok(Math.abs(bytes.readUInt32BE(offset + 4) / bytes.readUInt32BE(offset) - 73 / 24) < 1e-6);
  const samples = child(child(child(mdia, 'minf'), 'stbl'), 'stsd').start;
  assert.equal(bytes.toString('ascii', samples + 12, samples + 16), 'avc1');
});
