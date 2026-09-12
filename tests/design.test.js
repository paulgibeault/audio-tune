// The semantic layer is data: every parameter has a control kind, a named
// meaning, and help. These tests are what keeps "no text boxes and sliders"
// and "help on every control" true as the schema grows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS } from '../js/element-params.js';
import { kindOf, pairFor, allKinds, PAIRS } from '../js/param-kinds.js';
import { KINDS, PANELS, GUIDE, paramHelp } from '../js/help.js';

test('every element parameter resolves to a real control kind, never the plain number fallback', () => {
  const bad = allKinds().filter((k) => k.kind === 'number');
  assert.deepEqual(bad.map((k) => `${k.element}.${k.param}`), []);
  for (const k of allKinds()) assert.ok(KINDS[k.kind], `${k.element}.${k.param}: kind ${k.kind} has no help`);
});

test('character controls name both poles', () => {
  for (const k of allKinds().filter((k) => k.kind === 'character')) {
    assert.ok(Array.isArray(k.poles) && k.poles.length === 2 && k.poles.every((p) => p.length > 1), `${k.element}.${k.param}`);
  }
});

test('pairs name real params of the right kinds', () => {
  for (const [element, pairs] of Object.entries(PAIRS)) {
    assert.ok(ELEMENTS[element], element);
    for (const [kind, [a, b]] of Object.entries(pairs)) {
      assert.ok(ELEMENTS[element].params[a] && ELEMENTS[element].params[b], `${element}: ${a}/${b}`);
      if (kind === 'sweep') {
        assert.equal(kindOf(element, a).kind, 'pitch', `${element}.${a}`);
        assert.equal(kindOf(element, b).kind, 'pitch', `${element}.${b}`);
      }
      if (kind === 'envelope') assert.equal(kindOf(element, b).kind, 'time', `${element}.${b}`);
      assert.deepEqual(pairFor(element, a), { kind, a, b, first: true });
      assert.deepEqual(pairFor(element, b), { kind, a, b, first: false });
    }
  }
  assert.equal(pairFor('strike', 'dur'), null);
});

test('element-specific meanings win over the default by name', () => {
  assert.equal(kindOf('stream', 'f').kind, 'filter');
  assert.equal(kindOf('stream', 'f').filter, 'bandpass');
  assert.equal(kindOf('chirp', 'f').kind, 'pitch');
  assert.equal(kindOf('blast', 'tone').kind, 'character');
  assert.equal(kindOf('pluck', 'tone').kind, 'filter');
});

test('help: every parameter of every element has text; every kind and panel too', () => {
  for (const [el, e] of Object.entries(ELEMENTS)) {
    for (const p of Object.keys(e.params)) assert.ok(paramHelp(el, p).length > 10, `${el}.${p} help`);
  }
  for (const [k, v] of Object.entries(KINDS)) assert.ok(v.title && v.body.length > 20, k);
  for (const [k, v] of Object.entries(PANELS)) assert.ok(v.title && v.body.length > 40, k);
  assert.ok(GUIDE.length >= 4);
  for (const g of GUIDE) assert.ok(g.id && g.title && g.body.every((s) => s.length > 40), g.id);
});
