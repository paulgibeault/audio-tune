import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { normaliseGraphPack, normaliseSpecPack, scaleSpec, DEFAULT_SEND } from '../js/pack-shape.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Load the fixture pack the way the browser would: a plain script reading a
// global element library, with a stub that records which gestures it used.
function loadFixture() {
  const used = new Set();
  const S = { registerPack: (p) => { S.pack = p; return p; } };
  for (const name of ['strike', 'body', 'drone', 'stream', 'teardown']) {
    S[name] = () => { used.add(name); return name === 'teardown' ? () => {} : undefined; };
  }
  const sandbox = { ArcadeAudioElements: S };
  vm.runInNewContext(fs.readFileSync(path.join(HERE, 'fixtures', 'pack.js'), 'utf8'), sandbox);
  return { pack: S.pack, S, used };
}

test('graph pack: CUES order, sends, and both bed conventions', () => {
  const { pack } = loadFixture();
  const desc = { id: 'fixture', beds: { wind: { send: 0.5, params: { f: [100, 2000, 1, 800] } } } };
  const n = normaliseGraphPack(pack, desc);
  assert.equal(n.kind, 'graph');
  assert.deepEqual(n.cues.map((c) => c.name), ['tick', 'knock', 'hum', 'wind']);
  assert.equal(n.cues[0].send, 0.04);
  assert.equal(n.cues[2].sustained, true, 'SUSTAINED map marks hum');
  assert.equal(n.cues[3].sustained, true, 'manifest beds mark wind');
  assert.equal(n.cues[3].send, 0.5, 'bed send comes from the manifest');
  assert.deepEqual(n.cues[3].params, { f: [100, 2000, 1, 800] });
  assert.equal(typeof n.cues[3].fn, 'function');
  assert.equal(n.room.dur, 0.45);
});

test('graph pack: a cue with no declared send gets the SDK default', () => {
  const { pack } = loadFixture();
  const copy = { ...pack, SENDS: {} };
  const n = normaliseGraphPack(copy, { id: 'fixture' });
  assert.ok(n.cues.every((c) => c.send === DEFAULT_SEND));
});

test('graph pack: registering under the wrong name is refused', () => {
  const { pack } = loadFixture();
  assert.throws(() => normaliseGraphPack(pack, { id: 'moon-lit' }), /registered as 'fixture'/);
});

test('graph pack: the manifest can name a pack that differs from its gameId', () => {
  const { pack } = loadFixture();
  const n = normaliseGraphPack(pack, { id: 'fixture-game', packName: 'fixture' });
  assert.equal(n.id, 'fixture-game');
  assert.throws(() => normaliseGraphPack(pack, { id: 'fixture-game', packName: 'other' }), /expected 'other'/);
});

test('graph pack: missing ROOM/SENDS/CUES is refused', () => {
  assert.throws(() => normaliseGraphPack({ name: 'x', CUES: {} }, { id: 'x' }), /ROOM missing/);
});

test('fixture cues run against the stub library and return their duration', () => {
  const { pack, used } = loadFixture();
  assert.equal(pack.CUES.tick(null, null, 0, null, () => 0.5), 0.12);
  assert.equal(pack.CUES.knock(null, null, 0, { f0: 300 }, () => 0.5), 0.3);
  assert.equal(typeof pack.CUES.hum(null, null, 0, null, () => 0.5), 'function');
  assert.deepEqual([...used].sort(), ['body', 'drone', 'strike', 'teardown']);
});

test('spec pack: cues from the module namespace, no room', () => {
  const mod = { CUES: { a: { type: 'sine', freq: 440, dur: 0.1, gain: 0.2 }, b: [{ dur: 0.1 }, { dur: 0.2 }] } };
  const n = normaliseSpecPack(mod, { id: 'pi-game' });
  assert.equal(n.kind, 'spec');
  assert.equal(n.room, null);
  assert.deepEqual(n.cues.map((c) => c.name), ['a', 'b']);
  assert.ok(n.cues.every((c) => c.send === 0 && !c.sustained));
  assert.throws(() => normaliseSpecPack({}, { id: 'x' }), /must export CUES/);
});

test('scaleSpec scales every voice and merges overrides without mutating', () => {
  const single = { type: 'triangle', freq: 440, dur: 0.07, gain: 0.14 };
  const out = scaleSpec(single, 0.5, { freq: 880 });
  assert.deepEqual(out, { type: 'triangle', freq: 880, dur: 0.07, gain: 0.07 });
  assert.equal(single.gain, 0.14);
  const arr = [{ type: 'noise', dur: 0.05, gain: 0.1 }, { type: 'sawtooth', freq: 150, dur: 0.5, gain: 0.08 }];
  const out2 = scaleSpec(arr, 0.25);
  assert.equal(out2[0].gain, 0.025);
  assert.equal(out2[1].gain, 0.02);
  assert.equal(scaleSpec({ dur: 0.1 }, 3).gain, 0.3, 'velocity clamps to 1 and a missing gain defaults to 0.3');
});
