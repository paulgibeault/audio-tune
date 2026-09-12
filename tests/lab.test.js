import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, ELEMENT_NAMES, BODY_PRESETS } from '../js/element-params.js';
import {
  defaultsFor, buildParams, snippet, isOff, explicitDur, semitoneForKey, noteName,
  ROOM_KNOBS, ROOM_PRESETS, roomState, cents,
} from '../js/lab.js';

// The gestures the shipped library exports, as of arcade-audio.js 3.10.0+.
// A new element in the library shows up in the lab only once it has a schema
// entry, so this list is the reminder.
const LIBRARY = ['strike', 'rustle', 'pluck', 'creak', 'droplet', 'body', 'thump', 'flare', 'blast',
  'chirp', 'stream', 'shatter', 'ratchet', 'drone', 'squelch', 'breath', 'grunt', 'flex'];

test('schema: every library gesture has an entry and every entry is sane', () => {
  assert.deepEqual(ELEMENT_NAMES.sort(), [...LIBRARY].sort());
  for (const [name, e] of Object.entries(ELEMENTS)) {
    assert.equal(typeof e.note, 'string', name);
    assert.ok(Object.keys(e.params).length > 0, name);
    for (const [k, d] of Object.entries(e.params)) {
      const label = `${name}.${k}`;
      if (Array.isArray(d)) {
        assert.equal(d.length, 4, label);
        assert.ok(d[0] < d[1] && d[2] > 0 && d[3] >= d[0] && d[3] <= d[1], label);
      } else if (d.range) {
        assert.equal(d.optional, true, label);
        assert.ok('off' in d, label);
      } else if (d.options) assert.ok(d.options.length >= 2, label);
      else if (d.preset) assert.ok(d.preset.every((p) => BODY_PRESETS[p]), label);
      else assert.fail(`${label}: unknown shape`);
    }
    for (const p of e.pitched || []) assert.ok(e.params[p], `${name}: pitched param ${p} missing`);
    if (e.explicitDur) assert.ok(Array.isArray(e.params.dur), `${name}: explicitDur needs a dur knob`);
  }
});

test('body presets are inharmonic stacks with per-partial decay', () => {
  for (const [name, list] of Object.entries(BODY_PRESETS)) {
    assert.ok(list.length >= 2, name);
    for (const pt of list) assert.ok(pt.ratio > 0 && pt.gain > 0 && pt.decay > 0, name);
  }
});

test('defaultsFor: library defaults, optionals off', () => {
  const s = defaultsFor('rustle');
  assert.equal(s.f0, 900);
  assert.equal(s.lp, 0, 'optional lp starts off');
  assert.equal(isOff(ELEMENTS.rustle.params.lp, s.lp), true);
  assert.equal(defaultsFor('body').partials, 'wood');
  assert.throws(() => defaultsFor('nope'), /unknown element/);
});

test('buildParams: omits off optionals, resolves presets, seeds, transposes', () => {
  const st = defaultsFor('pluck');
  let p = buildParams('pluck', st, { seed: 42 });
  assert.equal(p.freq, 220);
  assert.equal(p.seed, 42);
  assert.equal('bend' in p, false, 'bend off → omitted');
  st.bend = 0.9;
  p = buildParams('pluck', st, { seed: 42, transpose: 12 });
  assert.equal(p.bend, 0.9);
  assert.equal(p.freq, 440, 'an octave up doubles freq');
  const b = buildParams('body', defaultsFor('body'), {});
  assert.deepEqual(b.partials, BODY_PRESETS.wood);
  assert.equal('seed' in b, false, 'body is not seeded');
  // explicit-dur elements keep dur out of params
  const d = buildParams('drone', defaultsFor('drone'), { seed: 3 });
  assert.equal('dur' in d, false);
  assert.equal(explicitDur('drone', defaultsFor('drone')), 6);
  assert.equal(explicitDur('strike', defaultsFor('strike')), null);
});

test('buildParams: vary draws the seed and pitch from the stream', () => {
  const seq = [0.25, 0.75, 0.5];
  let i = 0;
  const rnd = () => seq[i++ % seq.length];
  const p = buildParams('thump', defaultsFor('thump'), { cents: 50 }, rnd);
  assert.ok(p.f0 !== 110 && Math.abs(p.f0 / 110 - 1) < 0.03, 'pitched param moved within ±50 cents');
  assert.ok(Number.isInteger(p.seed) && p.seed >= 0 && p.seed < 1e6);
  assert.equal(cents(() => 0.5, 100), 1, 'midpoint of the stream is no detune');
});

test('snippet: pack code for a fixed seed and for a varying one', () => {
  assert.equal(snippet('strike', defaultsFor('strike'), { seed: 7 }),
    'S.strike(ctx, o, t, { dur: 0.006, hp: 2200, gain: 0.3, seed: 7 });');
  const v = snippet('thump', defaultsFor('thump'), { vary: true, cents: 15 });
  assert.match(v, /f0: 110 \* S\.cents\(r, 15\)/);
  assert.match(v, /seed: \(r\(\) \* 1e6\) \| 0/);
  assert.match(snippet('drone', defaultsFor('drone'), { seed: 1 }), /^S\.drone\(ctx, o, t, 6, \{ f: 55/);
  assert.match(snippet('body', defaultsFor('body'), {}), /partials: \[\{ ratio: 1, gain: 1, decay: 0\.16 \}/);
  assert.match(snippet('breath', defaultsFor('breath'), { seed: 1 }), /dir: 'out'/);
  assert.doesNotMatch(snippet('rustle', defaultsFor('rustle'), { seed: 1 }), /lp:/, 'off optional stays out of the code');
});

test('keyboard: piano row and note names', () => {
  assert.equal(semitoneForKey('a'), 0);
  assert.equal(semitoneForKey('w'), 1);
  assert.equal(semitoneForKey('k'), 12);
  assert.equal(semitoneForKey(';'), 16);
  assert.equal(semitoneForKey('q'), null);
  assert.equal(semitoneForKey('Enter'), null);
  assert.equal(noteName(0), 'C4');
  assert.equal(noteName(12), 'C5');
  assert.equal(noteName(-1), 'B3');
  assert.equal(noteName(10), 'A#4');
});

test('rooms: presets are complete and a pack ROOM folds into knob state', () => {
  for (const k of Object.keys(ROOM_KNOBS)) {
    assert.ok(k in ROOM_PRESETS.dry && k in ROOM_PRESETS.default, k);
  }
  const s = roomState({ dur: 1.9, decay: 0.38, wet: 0.6, seed: 1729 });
  assert.equal(s.dur, 1.9); assert.equal(s.wet, 0.6); assert.equal(s.seed, 1729);
  assert.equal(s.shelfHz, ROOM_PRESETS.default.shelfHz, 'missing keys fall back to the library default');
});
