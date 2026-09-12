import { test } from 'node:test';
import assert from 'node:assert/strict';
import { install, run, foldTakes, cueSource, isElementName, snapshot, library } from '../js/recorder.js';

// A stub library with the real library's shapes: gestures of arity 4 and 5,
// helpers that must pass through untouched, and a seeded rng like the real one.
function makeStub() {
  const log = [];
  const stub = {
    registerPack: (p) => p,
    rng: (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; },
    between: (r, lo, hi) => lo + (hi - lo) * r(),
    cents: (r, c) => Math.pow(2, ((r() * 2 - 1) * c) / 1200),
    env: (param, t, peak, attack, dur) => {},
    teardown: (collect) => () => {},
    strike: (ctx, dest, t, p) => { log.push(['strike', t, p]); return p.dur || 0.006; },
    body: (ctx, dest, t, p) => { log.push(['body', t, p]); return 0.3; },
    drone: (ctx, dest, t, dur, p) => { log.push(['drone', t, dur, p]); return () => {}; },
    pluckBuffer: (ctx, f, d, damp, seed) => null,
  };
  return { stub, log };
}

test('isElementName: gestures in, helpers and buffers out', () => {
  const { stub } = makeStub();
  assert.equal(isElementName('strike', stub.strike), true);
  assert.equal(isElementName('drone', stub.drone), true);
  assert.equal(isElementName('env', stub.env), false);
  assert.equal(isElementName('between', stub.between), false);
  assert.equal(isElementName('pluckBuffer', stub.pluckBuffer), false);
});

test('install wraps once, forwards helpers, records calls with offsets and explicit dur', () => {
  const { stub, log } = makeStub();
  const g = { ArcadeAudioElements: stub };
  const w = install(g);
  assert.equal(g.ArcadeAudioElements, w);
  assert.equal(install(g), w, 'idempotent');
  assert.equal(w.between, stub.between, 'helpers pass through by identity');
  assert.equal(library(), stub);

  const cue = (ctx, o, t, p, r) => {
    w.strike(ctx, o, t, { dur: 0.005, gain: 0.1, seed: 3 });
    w.body(ctx, o, t + 0.02, { f0: 200 * w.cents(r, 0), partials: [{ ratio: 1, gain: 1, decay: 0.2 }] });
    const collect = [];
    w.drone(ctx, o, t + 0.5, 2.5, { f: 55, collect });
    return 3;
  };
  const { calls, result } = run(() => cue(null, null, 10, null, w.rng(1)), { when: 10 });
  assert.equal(result, 3);
  assert.deepEqual(calls.map((c) => [c.el, c.at, c.dur]), [['strike', 0, null], ['body', 0.02, null], ['drone', 0.5, 2.5]]);
  assert.deepEqual(calls[1].params, { f0: 200, partials: [{ ratio: 1, gain: 1, decay: 0.2 }] });
  assert.equal('collect' in calls[2].params, false, 'collect is not part of the snapshot');
  assert.equal(log.length, 3, 'every call reached the real library');
  assert.equal(log[2][2], 2.5, 'explicit dur forwarded positionally');
});

test('run with overrides merges params, shifts timing, changes explicit dur — by call index', () => {
  const { stub, log } = makeStub();
  const w = install({ ArcadeAudioElements: stub });
  const cue = (ctx, o, t) => {
    w.strike(ctx, o, t, { dur: 0.005, gain: 0.1 });
    w.drone(ctx, o, t + 0.5, 2.5, { f: 55 });
  };
  const overrides = { 0: { params: { gain: 0.4 }, at: 0.1 }, 1: { dur: 4, params: { f: 110 } } };
  const { calls } = run(() => cue(null, null, 100), { when: 100, overrides });
  assert.deepEqual(calls[0].params, { dur: 0.005, gain: 0.4 });
  assert.equal(calls[0].at, 0.1);
  assert.equal(log[0][1], 100.1, 'the real call got the shifted time');
  assert.equal(calls[1].dur, 4);
  assert.equal(log[1][2], 4);
  assert.equal(log[1][3].f, 110);
});

test('a session that throws still closes', () => {
  const { stub } = makeStub();
  install({ ArcadeAudioElements: stub });
  assert.throws(() => run(() => { throw new Error('boom'); }), /boom/);
  assert.doesNotThrow(() => run(() => 1));
});

test('foldTakes marks parameters that differ between takes as varied', () => {
  const takes = [
    [{ el: 'strike', at: 0, dur: null, params: { hp: 2200, gain: 0.1, seed: 5 } },
     { el: 'body', at: 0.01, dur: null, params: { f0: 330, gain: 0.2 } }],
    [{ el: 'strike', at: 0, dur: null, params: { hp: 2200, gain: 0.1, seed: 9 } },
     { el: 'body', at: 0.01, dur: null, params: { f0: 334, gain: 0.2 } }],
    [{ el: 'strike', at: 0, dur: null, params: { hp: 2200, gain: 0.1, seed: 12 } },
     { el: 'body', at: 0.012, dur: null, params: { f0: 329, gain: 0.2 } }],
  ];
  const r = foldTakes(takes, 7);
  assert.equal(r.seed, 7);
  assert.equal(r.takes, 3);
  assert.deepEqual(r.layers[0].varied, ['seed']);
  assert.deepEqual(r.layers[1].varied, ['f0']);
  assert.equal(r.layers[1].atVaried, true);
  assert.equal(r.layers[0].atVaried, false);
  assert.equal(r.countVaried, false);
  const r2 = foldTakes([takes[0], takes[1].slice(0, 1)]);
  assert.equal(r2.countVaried, true);
  assert.equal(r2.layers[1].atVaried, true, 'a missing layer in another take counts as timing variation');
});

test('cueSource renders the take as pack code with varied marks and overrides', () => {
  const recipe = foldTakes([
    [{ el: 'strike', at: 0, dur: null, params: { dur: 0.003, hp: 1800, gain: 0.2, seed: 5 } },
     { el: 'body', at: 0.004, dur: null, params: { f0: 1200, gain: 0.14, partials: [{ ratio: 1, gain: 1, decay: 0.045, detune: 4 }] } },
     { el: 'drone', at: 0.2, dur: 3, params: { f: 55, type: 'sine' } }],
    [{ el: 'strike', at: 0, dur: null, params: { dur: 0.003, hp: 1800, gain: 0.2, seed: 8 } },
     { el: 'body', at: 0.004, dur: null, params: { f0: 1260, gain: 0.14, partials: [{ ratio: 1, gain: 1, decay: 0.045, detune: 4 }] } },
     { el: 'drone', at: 0.2, dur: 3, params: { f: 55, type: 'sine' } }],
  ]);
  const src = cueSource('menu-click', recipe, { end: 0.12 });
  assert.equal(src.split('\n')[0], "'menu-click': function (ctx, o, t, p, r) {");
  assert.match(src, /S\.strike\(ctx, o, t, \{ dur: 0\.003, hp: 1800, gain: 0\.2, seed: \(r\(\) \* 1e6\) \| 0 \}\);/);
  assert.match(src, /S\.body\(ctx, o, t \+ 0\.004, \{ f0: 1200, gain: 0\.14, partials: \[\{ ratio: 1, gain: 1, decay: 0\.045, detune: 4 \}\] \}\);  \/\/ varies per play: f0/);
  assert.match(src, /S\.drone\(ctx, o, t \+ 0\.2, 3, \{ f: 55, type: 'sine' \}\);/);
  assert.match(src, /return 0\.12;\n\},$/);
  const tweaked = cueSource('menu-click', recipe, { end: 0.12, overrides: { 1: { params: { f0: 900 }, at: 0.05 }, 2: { dur: 6 } } });
  assert.match(tweaked, /S\.body\(ctx, o, t \+ 0\.05, \{ f0: 900,/);
  assert.match(tweaked, /S\.drone\(ctx, o, t \+ 0\.2, 6, /);
});

test('snapshot copies arrays and objects and drops functions', () => {
  const s = snapshot({ a: 1, list: [{ x: 1 }], obj: { y: 2 }, fn: () => {}, collect: [] });
  assert.deepEqual(s, { a: 1, list: [{ x: 1 }], obj: { y: 2 } });
});
