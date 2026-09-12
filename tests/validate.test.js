import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBoard, packBoard, unpackBoard, validateRiff, validateUserCue, checkParams } from '../js/validate.js';
import { RiffBuffer, packRiff, unpackRiff, riffLength } from '../js/riff.js';

const packs = ['moon-lit', 'hecknsic', 'pi-game'];
const board = () => ({
  v: 1, id: 'b1', name: 'My board', updated: 1,
  pads: [
    { pack: 'moon-lit', cue: 'match', params: { count: 5 }, label: 'fire', velocity: 0.8, seedLock: true, seed: 42 },
    null,
    { pack: 'hecknsic', cue: 'ui-click', params: null, label: null, velocity: 1, seedLock: false, seed: 1 },
    ...new Array(13).fill(null),
  ],
});

test('board: a good board passes; hostile shapes fail with a reason', () => {
  assert.equal(validateBoard(board(), { packs }), true);
  const bad = (mut, re) => { const b = board(); mut(b); assert.throws(() => validateBoard(b, { packs }), re); };
  bad((b) => { b.v = 9; }, /version/);
  bad((b) => { b.name = ''; }, /name/);
  bad((b) => { b.pads = b.pads.slice(0, 5); }, /pads/);
  bad((b) => { b.pads[0].pack = '../evil'; }, /pack/);
  bad((b) => { b.pads[0].pack = 'nope'; }, /unknown pack/);
  bad((b) => { b.pads[0].cue = 'Bad Cue'; }, /cue/);
  bad((b) => { b.pads[0].label = 'x'.repeat(25); }, /label/);
  bad((b) => { b.pads[0].params = JSON.parse('{"__proto__": 1}'); }, /param key/);
  bad((b) => { b.pads[0].params = { x: 'y'.repeat(20) }; }, /param value/);
  bad((b) => { b.pads[0].velocity = 2; }, /velocity/);
  bad((b) => { b.pads[0].seed = 1.5; }, /seed/);
});

test('board: pack/unpack round-trips through the compact form and validates', () => {
  const c = packBoard(board());
  assert.equal(c.v, 1); assert.equal(c.s, 16);
  assert.deepEqual(c.p[0], ['moon-lit', 'match', { count: 5 }, 'fire', 0.8]);
  assert.equal(c.p[1], 0);
  assert.ok(JSON.stringify(c).length < 400);
  const b = unpackBoard(c, () => 'new1', { packs });
  assert.equal(b.id, 'new1'); assert.equal(b.name, 'My board');
  assert.deepEqual(b.pads[0].params, { count: 5 });
  assert.equal(b.pads[0].label, 'fire');
  assert.equal(b.pads[2].label, null);
  assert.equal(b.pads[1], null);
  assert.throws(() => unpackBoard({ v: 1, n: 'x', p: [['evil', 'a']] }, () => 'n'), /pads/);
  assert.throws(() => unpackBoard({ v: 1, n: 'x', p: new Array(16).fill(['nope', 'a', 0, 0, 1]) }, () => 'n', { packs }), /unknown pack/);
});

test('checkParams accepts numbers, booleans, short strings and partial tables only', () => {
  assert.doesNotThrow(() => checkParams({ count: 3, hard: true, kind: 'ring', partials: [{ ratio: 1, gain: 1, decay: 0.2 }] }, 't'));
  assert.throws(() => checkParams({ a: () => {} }, 't'), /param value/);
  assert.throws(() => checkParams({ a: { nested: 1 } }, 't'), /param value/);
  assert.throws(() => checkParams({ a: 1e9 }, 't'), /param value/);
  assert.throws(() => checkParams(Object.fromEntries(new Array(13).fill(0).map((_, i) => [`k${i}`, 1])), 't'), /params/);
});

test('riff: buffer keeps the last seconds, rebases, packs and unpacks', () => {
  const r = new RiffBuffer(4);
  r.add(10, { pack: 'moon-lit', cue: 'match', params: { count: 4 } }, 1, 7);
  r.add(11.25, { pack: 'hecknsic', cue: 'ui-click' }, 0.5, null);
  r.add(15, { pack: 'moon-lit', cue: 'drop' }, 1, 3);
  assert.equal(r.length, 2, 'the hit at 10 fell out of the 4 s window');
  const hits = r.take();
  assert.deepEqual(hits.map((h) => h.at), [0, 3.75]);
  const c = packRiff(hits);
  assert.deepEqual(c.h[0], [0, 'hecknsic', 'ui-click', 0, 0.5, 0]);
  assert.deepEqual(c.h[1], [3.75, 'moon-lit', 'drop', 0, 1, 3]);
  const back = unpackRiff(c, { packs });
  assert.equal(back[1].pad.cue, 'drop'); assert.equal(back[1].seed, 3); assert.equal(back[0].seed, null);
  assert.equal(riffLength(back), 4.25);
  assert.throws(() => validateRiff({ v: 1, h: [] }), /hits/);
  assert.throws(() => validateRiff({ v: 1, h: [[0, 'moon-lit', '<b>']] }), /cue/);
  assert.throws(() => validateRiff({ v: 1, h: [[99, 'moon-lit', 'match']] }), /hit time/);
});

test('user cue validation', () => {
  const cue = { v: 1, id: 'c1', name: 'my-knock', layers: [{ el: 'strike', at: 0, params: { gain: 0.2 } }, { el: 'body', at: 0.004, params: { f0: 200, partials: [{ ratio: 1, gain: 1, decay: 0.2 }] } }], send: 0.2, room: { dur: 0.9, decay: 0.3 } };
  assert.equal(validateUserCue(cue, { elements: ['strike', 'body'] }), true);
  assert.throws(() => validateUserCue({ ...cue, name: 'My Knock' }), /name/);
  assert.throws(() => validateUserCue({ ...cue, layers: [] }), /layers/);
  assert.throws(() => validateUserCue({ ...cue, layers: [{ el: 'eval', at: 0 }] }, { elements: ['strike'] }), /unknown element/);
  assert.throws(() => validateUserCue({ ...cue, layers: [{ el: 'strike', at: 99 }] }), /offset/);
  assert.throws(() => validateUserCue({ ...cue, room: { dur: 'x' } }), /room/);
});
