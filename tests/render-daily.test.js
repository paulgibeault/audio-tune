import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = { addEventListener() {}, createElement() { return {}; }, createElementNS() { return {}; } };
globalThis.window = globalThis;
const R = await import('../js/render.js');
const D = await import('../js/daily.js');
const Song = await import('../js/song.js');

test('encodeWav writes a valid 16-bit PCM header and interleaves channels', () => {
  const left = new Float32Array([0, 0.5, -0.5, 1]);
  const right = new Float32Array([0, -1, 0.25, 0]);
  const buf = R.encodeWav([left, right], 48000);
  const v = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  assert.equal(buf.byteLength, 44 + 4 * 2 * 2);
  assert.equal(str(0, 4), 'RIFF'); assert.equal(str(8, 4), 'WAVE'); assert.equal(str(12, 4), 'fmt '); assert.equal(str(36, 4), 'data');
  assert.equal(v.getUint16(20, true), 1, 'PCM');
  assert.equal(v.getUint16(22, true), 2, 'stereo');
  assert.equal(v.getUint32(24, true), 48000);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 16);
  assert.equal(v.getInt16(44, true), 0);
  assert.equal(v.getInt16(46, true), 0);
  assert.equal(v.getInt16(48, true), 16383, '0.5 left');
  assert.equal(v.getInt16(50, true), -32768, '-1 right');
  assert.equal(v.getInt16(56, true), 32767, '1 clamps to full scale');
});

test('measure and trimTail', () => {
  const d = new Float32Array(48000); d[100] = 0.5; d[200] = -0.25;
  const m = R.measure([d]);
  assert.equal(m.peak, 0.5);
  assert.ok(m.rms > 0 && m.rms < 0.01);
  const t = R.trimTail([d], 48000, 0.1);
  assert.ok(t[0].length >= 200 + 0.2 * 48000 - 1 && t[0].length < 48000, `trimmed to ${t[0].length}`);
  const quiet = R.trimTail([new Float32Array(48000)], 48000, 0.5);
  assert.equal(quiet[0].length, 24000, 'silence keeps the minimum');
});

test('songSeconds covers the chain, the passes and the tail', () => {
  const s = Song.newSong({ bpm: 120, stepsPerBar: 16 });   // 16 steps × 0.125 = 2 s per pass
  assert.ok(Math.abs(R.songSeconds(s, 1, 1.9) - (2 + 0.0625 + 1.9 + 0.5)) < 1e-9);
  assert.ok(Math.abs(R.songSeconds(s, 3, 0.5) - (6 + 0.0625 + 0.5 + 0.5)) < 1e-9);
  assert.equal(R.wavName('My Song!'), 'my-song.wav');
});

test('daily kit: deterministic, spans the fleet, never a bed', () => {
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const a = D.pickKit(rng(42)), b = D.pickKit(rng(42)), c = D.pickKit(rng(43));
  assert.equal(a.length, 8);
  assert.deepEqual(a, b, 'same seed, same kit');
  assert.notDeepEqual(a, c, 'different seed, different kit');
  const counts = {};
  for (const p of a) counts[p.pack] = (counts[p.pack] || 0) + 1;
  assert.ok(Object.values(counts).every((n) => n <= 2), 'at most two pads per game');
  assert.ok(Object.keys(counts).length >= 4, 'spans several games');
  for (const p of a) assert.ok(!['ambient', 'insects', 'pulse', 'tension', 'bench', 'well-hum'].includes(p.cue), p.cue);
  const kit = D.kitBoard('2026-09-12', rng(1));
  assert.equal(kit.pads.length, 16);
  assert.equal(kit.pads.filter(Boolean).length, 8);
  assert.equal(kit.name, 'Daily kit · 2026-09-12');
  assert.equal(D.pickKit(rng(1), 8, ['moon-lit']).length, 2, 'one game alone yields its two allowed pads');
});
