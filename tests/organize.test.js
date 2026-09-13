// Cards are organised by rule, not by hand: roles in a fixed order,
// essentials first, More only when it hides more than one thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organize, byRole, roleOf, isEssential, ROLES } from '../js/organize.js';
import { KINDS } from '../js/help.js';
import { allKinds } from '../js/param-kinds.js';

test('every control kind has a role, and roles come in one fixed order', () => {
  for (const k of Object.keys(KINDS)) assert.ok(ROLES.includes(roleOf(k)), k);
  assert.deepEqual(ROLES, ['pitch', 'shape', 'tone', 'level']);
});

test('essentials: pitch, length, level, and anything the pack varies', () => {
  assert.equal(isEssential({ kind: 'pitch', name: 'f0' }), true);
  assert.equal(isEssential({ kind: 'sweep', name: 'f0-f1' }), true);
  assert.equal(isEssential({ kind: 'gain', name: 'gain' }), true);
  assert.equal(isEssential({ kind: 'time', name: 'dur' }), true);
  assert.equal(isEssential({ kind: 'envelope', name: 'attack-dur' }), true);
  assert.equal(isEssential({ kind: 'time', name: 'attack' }), false);
  assert.equal(isEssential({ kind: 'filter', name: 'hp' }), false);
  assert.equal(isEssential({ kind: 'character', name: 'crack' }), false);
  assert.equal(isEssential({ kind: 'character', name: 'crack', varied: true }), true, 'a varied parameter is always essential');
});

test('organize: a strike shows everything (hiding one control is not worth a More)', () => {
  const items = [{ kind: 'time', name: 'dur' }, { kind: 'filter', name: 'hp' }, { kind: 'gain', name: 'gain' }];
  const r = organize(items);
  assert.deepEqual(r.more, []);
  assert.deepEqual(r.groups.map((g) => g.role), ['shape', 'tone', 'level']);
});

test('organize: a flare keeps its sweep, envelope and gain up front; tone under More; expert shows all', () => {
  const items = [
    { kind: 'sweep', name: 'f0-f1' }, { kind: 'envelope', name: 'attack-dur' }, { kind: 'gain', name: 'gain' },
    { kind: 'character', name: 'bright' }, { kind: 'character', name: 'Q' }, { kind: 'filter', name: 'lp' },
    { kind: 'character', name: 'weight' }, { kind: 'pitch', name: 'wf0' },
  ];
  const r = organize(items);
  assert.deepEqual(r.groups.map((g) => g.role), ['pitch', 'shape', 'level']);
  assert.deepEqual(r.groups[0].items.map((i) => i.name), ['f0-f1', 'wf0']);
  assert.deepEqual(r.more.map((g) => g.role), ['tone']);
  assert.equal(r.more[0].items.length, 4);
  const x = organize(items, { expert: true });
  assert.deepEqual(x.more, []);
  assert.equal(x.groups.reduce((a, g) => a + g.items.length, 0), items.length);
});

test('byRole keeps the items in role order and drops empty roles', () => {
  const r = byRole([{ kind: 'gain', name: 'g' }, { kind: 'pitch', name: 'p' }]);
  assert.deepEqual(r.map((g) => [g.role, g.label]), [['pitch', 'Pitch'], ['level', 'Level']]);
});

test('every element parameter lands in a role', () => {
  for (const k of allKinds()) assert.ok(ROLES.includes(roleOf(k.pair ? k.pair.kind : k.kind)), `${k.element}.${k.param}`);
});
