// A fleet board's layout is the user's; the pack underneath never changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLayout, isEmptyLayout, fullOrder, applyLayout, moveName, setHidden, moveItem, validateLayout } from '../js/layouts.js';

const CUES = ['a', 'b', 'c', 'd'];

test('an empty layout is the pack order with nothing hidden', () => {
  const L = emptyLayout();
  assert.equal(isEmptyLayout(L), true);
  assert.deepEqual(applyLayout(CUES, L).visible, CUES);
  assert.equal(applyLayout(CUES, null).hidden.size, 0);
});

test('moving reorders; pack additions append; pack drops fall out', () => {
  let L = moveName(emptyLayout(), CUES, 3, 0);
  assert.deepEqual(L.order, ['d', 'a', 'b', 'c']);
  assert.deepEqual(fullOrder([...CUES, 'e'], L), ['d', 'a', 'b', 'c', 'e'], 'a new cue appears at the end');
  assert.deepEqual(fullOrder(['a', 'c'], L), ['a', 'c'], 'a dropped cue is gone');
  L = moveName(L, [...CUES, 'e'], 4, 1);
  assert.deepEqual(L.order, ['d', 'e', 'a', 'b', 'c']);
  assert.deepEqual(moveItem([1, 2, 3], 5, 0), [1, 2, 3], 'out of range is a no-op');
  assert.deepEqual(moveItem([null, 'x', 'y'], 2, 0), ['y', null, 'x'], 'my boards move pads with their empties');
});

test('hiding keeps the cue in the full order and out of the visible one', () => {
  let L = setHidden(emptyLayout(), CUES, 'b', true);
  const r = applyLayout(CUES, L);
  assert.deepEqual(r.visible, ['a', 'c', 'd']);
  assert.deepEqual(r.all, CUES);
  assert.ok(r.hidden.has('b'));
  assert.equal(isEmptyLayout(L), false);
  L = setHidden(L, CUES, 'b', false);
  assert.deepEqual(applyLayout(CUES, L).visible, CUES);
  assert.deepEqual(L.hidden, []);
});

test('validateLayout takes only cue-shaped names', () => {
  assert.equal(validateLayout({ v: 1, order: ['ui-click'], hidden: [] }), true);
  assert.throws(() => validateLayout({ v: 2, order: [], hidden: [] }), /version/);
  assert.throws(() => validateLayout({ v: 1, order: ['<img>'], hidden: [] }), /order/);
  assert.throws(() => validateLayout({ v: 1, order: [], hidden: 'x' }), /hidden/);
});
