import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCue, newLayer, slug, layerParams, cueFunction, buildPack, cueSource, isSustained, PACK_ID } from '../js/user-cues.js';
import { validateUserCue } from '../js/validate.js';
import { BODY_PRESETS } from '../js/element-params.js';

// A stub library: records calls, returns durations, offers cents/between/teardown.
function stubLib() {
  const calls = [];
  const lib = {
    cents: (r, c) => Math.pow(2, ((r() * 2 - 1) * c) / 1200),
    between: (r, lo, hi) => lo + (hi - lo) * r(),
    teardown: (collect) => () => collect.length,
    strike: (ctx, o, t, p) => { calls.push(['strike', t, p]); return 0.12; },
    body: (ctx, o, t, p) => { calls.push(['body', t, p]); return 0.4; },
    drone: (ctx, o, t, dur, p) => { calls.push(['drone', t, dur, p]); if (p.collect) p.collect.push('osc'); },
  };
  return { lib, calls };
}
const fixedR = (v) => () => v;

test('newCue / newLayer produce valid cues with schema defaults', () => {
  const c = newCue('knock');
  assert.equal(validateUserCue(c), true);
  const L = newLayer('body', 0.004);
  assert.equal(L.params.f0, 330); assert.equal(L.params.partials, 'wood'); assert.equal(L.vary.cents, 15);
  const D = newLayer('drone', 0);
  assert.equal(D.dur, 6); assert.equal('dur' in D.params, false, 'explicit-dur elements keep dur off the params');
  assert.equal(slug('My Big Knock!'), 'my-big-knock');
  assert.equal(slug(''), 'sound');
});

test('layerParams: presets resolve, vary detunes pitch and jitters gain, seed drawn', () => {
  const { lib } = stubLib();
  const L = { el: 'body', at: 0, params: { f0: 200, gain: 0.3, partials: 'glass', type: 'sine' }, vary: { cents: 100, level: 0.5 } };
  const p = layerParams(L, lib, fixedR(1), BODY_PRESETS);      // r() = 1 → +100 cents, gain × 1.5
  assert.ok(Math.abs(p.f0 - 200 * Math.pow(2, 100 / 1200)) < 1e-9);
  assert.ok(Math.abs(p.gain - 0.45) < 1e-9);
  assert.deepEqual(p.partials, BODY_PRESETS.glass);
  assert.equal(p.type, 'sine');
  assert.equal('seed' in p, false, 'body is not seeded');
  const S = layerParams({ el: 'strike', at: 0, params: { gain: 0.2 }, vary: {} }, lib, fixedR(0.5), BODY_PRESETS);
  assert.equal(S.gain, 0.2);
  assert.equal(S.seed, 500000);
});

test('cueFunction plays layers at their offsets and reports the end; sustained cues return a teardown', () => {
  const { lib, calls } = stubLib();
  const cue = { v: 1, id: 'c', name: 'knock', send: 0.2, layers: [
    { el: 'strike', at: 0, params: { gain: 0.2 }, vary: {} },
    { el: 'body', at: 0.004, params: { f0: 200, gain: 0.3, partials: 'wood' }, vary: {} },
  ] };
  const fn = cueFunction(cue, lib, BODY_PRESETS);
  const end = fn(null, null, 10, null, fixedR(0.5));
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1], 10.004);
  assert.ok(Math.abs(end - 0.404) < 1e-9, 'end = latest layer offset + its reported duration');
  assert.equal(isSustained(cue), false);
  const bed = { v: 1, id: 'd', name: 'hum', layers: [{ el: 'drone', at: 0, dur: 3, params: { f: 55 }, vary: {} }] };
  assert.equal(isSustained(bed), true);
  const td = cueFunction(bed, lib, BODY_PRESETS)(null, null, 0, null, fixedR(0.5));
  assert.equal(typeof td, 'function');
  assert.equal(td(), 1, 'the collect array reached the element');
});

test('buildPack assembles the registerPack shape with sends and sustained map', () => {
  const { lib } = stubLib();
  const pack = buildPack([{ v: 1, id: 'a', name: 'knock', send: 0.3, layers: [{ el: 'strike', at: 0, params: {} }] }, { v: 1, id: 'b', name: 'hum', layers: [{ el: 'drone', at: 0, dur: 2, params: {} }] }], { dur: 2 }, lib, BODY_PRESETS);
  assert.equal(pack.name, PACK_ID);
  assert.deepEqual(Object.keys(pack.CUES), ['knock', 'hum']);
  assert.equal(pack.SENDS.knock, 0.3); assert.equal(pack.SENDS.hum, 0.25);
  assert.deepEqual(pack.SUSTAINED, { hum: true });
  assert.equal(pack.ROOM.dur, 2); assert.equal(pack.ROOM.decay, 0.3);
});

test('cueSource writes vary as the fleet does', () => {
  const cue = { v: 1, id: 'c', name: 'knock', layers: [
    { el: 'strike', at: 0, params: { dur: 0.005, hp: 3000, gain: 0.2 }, vary: { level: 0.2 } },
    { el: 'body', at: 0.004, params: { f0: 200, gain: 0.3, partials: 'wood', type: 'sine' }, vary: { cents: 15 } },
  ] };
  const src = cueSource(cue);
  assert.match(src, /^\/\/ PARTIALS_WOOD: the partial table/);
  assert.match(src, /S\.strike\(ctx, o, t, \{ dur: 0\.005, hp: 3000, gain: S\.between\(r, 0\.16, 0\.24\), seed: \(r\(\) \* 1e6\) \| 0 \}\);/);
  assert.match(src, /S\.body\(ctx, o, t \+ 0\.004, \{ f0: 200 \* S\.cents\(r, 15\), gain: 0\.3, partials: PARTIALS_WOOD, type: 'sine' \}\);/);
  assert.match(src, /return 0\.1;\n\},$/);
});
