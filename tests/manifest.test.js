// The fleet manifest and the cue-params table are the board's only per-game
// knowledge. They are data, so they get the checks data gets: well-formed,
// consistent with each other, and every range sane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUE_PARAMS, defaultParams, paramsFor } from '../js/cue-params.js';
import { padForKey, keyForPad } from '../js/keys.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'fleet-packs.json'), 'utf8'));

test('manifest: ids are kebab-case, urls root-relative under /<id>/, kinds known', () => {
  assert.equal(manifest.v, 1);
  const ids = new Set();
  for (const p of manifest.packs) {
    assert.match(p.id, /^[a-z][a-z0-9-]*$/, p.id);
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`); ids.add(p.id);
    assert.ok(['graph', 'spec'].includes(p.kind), `${p.id}: kind ${p.kind}`);
    assert.ok(p.url.startsWith(`/${p.id}/`), `${p.id}: url ${p.url} must be under its own scope`);
    if (p.kind === 'graph') assert.match(p.url, /\.js$/);
    if (p.kind === 'spec') assert.match(p.url, /\.mjs$/, 'spec packs are ES modules');
    assert.equal(typeof p.name, 'string');
    if (p.packName) assert.match(p.packName, /^[a-z][a-z0-9-]*$/, `${p.id}: packName`);
    assert.ok(Number.isInteger(p.hue) && p.hue >= 0 && p.hue < 360, `${p.id}: hue`);
    assert.equal(typeof p.place, 'string');
  }
});

test('manifest: bed overrides are well-formed', () => {
  for (const p of manifest.packs) {
    if (!p.beds) continue;
    for (const [name, b] of Object.entries(p.beds)) {
      assert.ok(b.send >= 0 && b.send <= 1, `${p.id}/${name}: send`);
      if (b.params) for (const [k, d] of Object.entries(b.params)) checkRange(`${p.id}/${name}.${k}`, d);
    }
  }
});

test('cue-params: every manifest pack has a table, and every entry is sane', () => {
  for (const p of manifest.packs) {
    assert.ok(CUE_PARAMS[p.id], `no cue-params for ${p.id}`);
    for (const [cue, meta] of Object.entries(CUE_PARAMS[p.id])) {
      assert.match(cue, /^[a-z0-9-]+$/, `${p.id}/${cue}: cue names are lowercase-kebab`);
      if (meta.params) {
        for (const [k, d] of Object.entries(meta.params)) {
          if (Array.isArray(d)) checkRange(`${p.id}/${cue}.${k}`, d);
          else if (d.options) assert.ok(d.options.length >= 2, `${p.id}/${cue}.${k}: options`);
          else assert.equal(d.bool, true, `${p.id}/${cue}.${k}: unknown param shape`);
        }
      }
      if (p.kind === 'graph') assert.ok(Array.isArray(meta.elements) && meta.elements.length, `${p.id}/${cue}: elements`);
    }
  }
  for (const id of Object.keys(CUE_PARAMS)) {
    assert.ok(manifest.packs.some((p) => p.id === id), `cue-params names unknown pack ${id}`);
  }
});

test('cue-params: manifest bed params agree with the table', () => {
  for (const p of manifest.packs) {
    if (!p.beds) continue;
    for (const [name, b] of Object.entries(p.beds)) {
      if (b.params) assert.deepEqual(paramsFor(p.id, name), b.params, `${p.id}/${name}`);
    }
  }
});

test('defaultParams returns defaults in range, or null', () => {
  assert.equal(defaultParams('sowduku', 'thud'), null);
  assert.deepEqual(defaultParams('moon-lit', 'match'), { count: 3 });
  assert.deepEqual(defaultParams('hecknsic', 'rotate'), { kind: 'cluster' });
  assert.deepEqual(defaultParams('cardstock', 'trick'), { bad: false });
  assert.deepEqual(defaultParams('grav-well', 'clear'), { count: 1, combo: 1 });
});

test('keys: four rows of ten, round-trips, ignores modifiers and long keys', () => {
  assert.equal(padForKey('1'), 0);
  assert.equal(padForKey('q'), 10);
  assert.equal(padForKey('Q'), 10);
  assert.equal(padForKey('/'), 39);
  assert.equal(padForKey('Enter'), -1);
  assert.equal(padForKey(''), -1);
  for (let i = 0; i < 40; i++) assert.equal(padForKey(keyForPad(i)), i);
  assert.equal(keyForPad(40), '');
});

function checkRange(label, d) {
  assert.equal(d.length, 4, `${label}: [min, max, step, default]`);
  const [min, max, step, dflt] = d;
  assert.ok(min < max, `${label}: min < max`);
  assert.ok(step > 0, `${label}: step`);
  assert.ok(dflt >= min && dflt <= max, `${label}: default in range`);
}
