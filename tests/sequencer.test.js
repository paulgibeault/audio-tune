import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepSeconds, swingOffset, makeClock, advance, nearestStep } from '../js/scheduler.js';
import * as Song from '../js/song.js';
import { layout, totalDuration } from '../js/spec-voice.js';

test('stepSeconds: 120 bpm, 16 steps to the bar is an eighth of a second', () => {
  assert.ok(Math.abs(stepSeconds(120, 16) - 0.125) < 1e-12);
  assert.ok(Math.abs(stepSeconds(60, 4) - 1) < 1e-12);
  assert.ok(Math.abs(stepSeconds(100, 8) - 0.3) < 1e-12);
});

test('advance schedules every step up to the horizon, in order, and carries the grid', () => {
  const cfg = { bpm: 120, swing: 0, stepsPerBar: 16 };
  const c = makeClock(10);
  const a = advance(c, 10.3, cfg);
  assert.deepEqual(a.map((e) => e.step), [0, 1, 2]);
  assert.ok(Math.abs(a[2].time - 10.25) < 1e-9);
  const b = advance(c, 10.3, cfg);
  assert.deepEqual(b, [], 'nothing twice');
  const d = advance(c, 10.6, cfg);
  assert.deepEqual(d.map((e) => e.step), [3, 4]);
  assert.ok(Math.abs(d[0].time - 10.375) < 1e-9);
});

test('swing delays odd steps only and is never accumulated', () => {
  const stepDur = stepSeconds(120, 16);
  assert.equal(swingOffset(0, 1, stepDur), 0);
  assert.ok(Math.abs(swingOffset(1, 1, stepDur) - stepDur * 0.5) < 1e-12);
  assert.ok(Math.abs(swingOffset(3, 0.5, stepDur) - stepDur * 0.25) < 1e-12);
  const c = makeClock(0);
  const ev = advance(c, 1, { bpm: 120, swing: 1, stepsPerBar: 16 });
  assert.ok(Math.abs(ev[2].time - 0.25) < 1e-9, 'even steps stay on the grid');
  assert.ok(Math.abs(ev[3].time - (0.375 + 0.0625)) < 1e-9);
});

test('a tempo change keeps the grid continuous from the next step', () => {
  const c = makeClock(0);
  advance(c, 0.3, { bpm: 120, swing: 0, stepsPerBar: 16 });   // steps 0..2 at 0.125
  const ev = advance(c, 1, { bpm: 60, swing: 0, stepsPerBar: 16 });
  assert.ok(Math.abs(ev[0].time - 0.375) < 1e-9, 'step 3 is where the old grid put it');
  assert.ok(Math.abs(ev[1].time - 0.625) < 1e-9, 'step 4 is a slow step later');
});

test('nearestStep quantises a hit to the grid', () => {
  const cfg = { bpm: 120, swing: 0, stepsPerBar: 16 };
  const c = makeClock(5);
  advance(c, 5.5, cfg);                     // next step is 4 at 5.5
  assert.equal(nearestStep(c, 5.51, cfg), 4);
  assert.equal(nearestStep(c, 5.44, cfg), 4);
  assert.equal(nearestStep(c, 5.3, cfg), 2);
  assert.equal(nearestStep(c, 5.06, cfg), 0);
});

test('song: tracks, patterns, steps, resize', () => {
  const s = Song.newSong({ name: 'x', bpm: 100 });
  const t = Song.addTrack(s, Song.newTrack({ pack: 'moon-lit', cue: 'match', params: { count: 4 } }));
  const p = s.patterns[0];
  assert.equal(Song.patternLength(s), 16);
  assert.equal(Song.toggleStep(s, p, t.id, 3), 1);
  assert.equal(Song.toggleStep(s, p, t.id, 3), 0);
  assert.equal(Song.setStep(s, p, t.id, 5, 1.7), 1, 'velocity clamps');
  assert.equal(Song.stepsFor(s, p, t.id).length, 16);
  s.bars = 2; Song.resizePatterns(s);
  assert.equal(Song.stepsFor(s, p, t.id).length, 32);
  assert.equal(Song.stepsFor(s, p, t.id)[5], 1, 'existing steps survive a resize');
  Song.removeTrack(s, t.id);
  assert.equal(s.tracks.length, 0);
  assert.equal(p.steps[t.id], undefined);
});

test('song: chain resolves and loops; solo/mute audibility', () => {
  const s = Song.newSong({});
  const a = s.patterns[0];
  const b = Song.addPattern(s);
  assert.equal(b.name, 'B');
  s.chain = [{ pattern: a.id, repeat: 2 }, { pattern: b.id, repeat: 1 }];
  assert.equal(Song.chainLength(s), 48);
  assert.deepEqual(pick(Song.resolveStep(s, 0)), [a.id, 0, 0, 0]);
  assert.deepEqual(pick(Song.resolveStep(s, 17)), [a.id, 1, 0, 0]);
  assert.deepEqual(pick(Song.resolveStep(s, 33)), [b.id, 1, 1, 0]);
  assert.deepEqual(pick(Song.resolveStep(s, 48)), [a.id, 0, 0, 1], 'loops');
  assert.equal(Song.removePattern(s, b.id), true);
  assert.deepEqual(s.chain, [{ pattern: a.id, repeat: 2 }]);
  assert.equal(Song.removePattern(s, a.id), false, 'the last pattern stays');
  const t1 = Song.addTrack(s, Song.newTrack({ pack: 'x', cue: 'a' }));
  const t2 = Song.addTrack(s, Song.newTrack({ pack: 'x', cue: 'b' }));
  t1.mute = true;
  assert.deepEqual(Song.audibleTracks(s).map((t) => t.id), [t2.id]);
  t2.solo = true; t1.mute = false;
  assert.deepEqual(Song.audibleTracks(s).map((t) => t.id), [t2.id]);
});
function pick(r) { return [r.pattern.id, r.index, r.chainPos, r.pass]; }

test('history: undo and redo round-trip, capped', () => {
  const h = new Song.History(3);
  let s = Song.newSong({ name: 'one' });
  h.push(s); s = { ...s, name: 'two' };
  h.push(s); s = { ...s, name: 'three' };
  assert.equal(h.canUndo(), true);
  s = h.undo(s); assert.equal(s.name, 'two');
  s = h.undo(s); assert.equal(s.name, 'one');
  assert.equal(h.undo(s), null);
  s = h.redo(s); assert.equal(s.name, 'two');
  h.push(s); h.push(s); h.push(s); h.push(s);
  assert.equal(h.past.length, 3, 'capped');
  assert.equal(h.canRedo(), false, 'a push clears redo');
});

test('validateSong accepts a real song and rejects hostile shapes', () => {
  const s = Song.newSong({ name: 'ok' });
  const t = Song.addTrack(s, Song.newTrack({ pack: 'moon-lit', cue: 'match', params: { count: 4 } }));
  Song.toggleStep(s, s.patterns[0], t.id, 0);
  assert.equal(Song.validateSong(Song.serialize(s), { packs: ['moon-lit'] }), true);
  const bad = (mut, re) => { const x = Song.serialize(s); mut(x); assert.throws(() => Song.validateSong(x, { packs: ['moon-lit'] }), re); };
  bad((x) => { x.v = 2; }, /version/);
  bad((x) => { x.bpm = 1000; }, /bpm/);
  bad((x) => { x.tracks[0].pad.pack = 'evil'; }, /unknown pack/);
  bad((x) => { x.tracks[0].pad.cue = '<img>'; }, /track pad/);
  bad((x) => { x.tracks[0].pad.params = { __proto__x: 1, a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1 }; }, /track params/);
  bad((x) => { x.tracks[0].name = 'x'.repeat(41); }, /track name/);
  bad((x) => { x.patterns[0].steps[t.id] = [1, 2]; }, /step row/);
  bad((x) => { x.patterns[0].steps.nope = new Array(16).fill(0); }, /unknown track/);
  bad((x) => { x.chain = [{ pattern: 'zzz', repeat: 1 }]; }, /chain pattern/);
  bad((x) => { x.chain[0].repeat = 0; }, /chain repeat/);
});

test('spec-voice layout follows the SDK sequence semantics', () => {
  assert.deepEqual(layout({ dur: 0.2 }), [{ at: 0, dur: 0.2 }]);
  assert.deepEqual(layout([{ dur: 0.1 }, { dur: 0.1 }]), [{ at: 0, dur: 0.1 }, { at: 0.1, dur: 0.1 }], 'back to back');
  assert.deepEqual(layout([{ dur: 0.1 }, { dur: 0.3, delay: 0.02 }, { dur: 0.1, delay: 0 }]),
    [{ at: 0, dur: 0.1 }, { at: 0.02, dur: 0.3 }, { at: 0.02, dur: 0.1 }], 'delay is from the previous START; 0 is a chord');
  assert.ok(Math.abs(totalDuration([{ dur: 0.1 }, { dur: 0.3, delay: 0.02 }]) - 0.32) < 1e-12);
  assert.equal(layout({}).length, 1);
  assert.equal(layout({}).at(0).dur, 0.15, 'default dur');
  assert.equal(layout({ dur: 99 })[0].dur, 30, 'clamped');
});

test('compactSong / expandSong round-trip a song into a few hundred bytes', () => {
  const s = Song.newSong({ name: 'Loop', bpm: 120 });
  const t1 = Song.addTrack(s, Song.newTrack({ pack: 'moon-lit', cue: 'menu-click', params: null }, 'clapper'));
  const t2 = Song.addTrack(s, Song.newTrack({ pack: 'hecknsic', cue: 'match', params: { count: 5 } }, 'glass'));
  t2.pad.seedLock = true; t2.pad.seed = 77; t2.gain = 0.5;
  const b = Song.addPattern(s);
  for (const i of [0, 4, 8, 12]) Song.toggleStep(s, s.patterns[0], t1.id, i, 1);
  Song.setStep(s, b, t2.id, 2, 0.6);
  s.chain = [{ pattern: s.patterns[0].id, repeat: 2 }, { pattern: b.id, repeat: 1 }];
  const c = Song.compactSong(s);
  assert.ok(JSON.stringify(c).length < 400, `compact ${JSON.stringify(c).length} bytes`);
  assert.equal(c.p[0][1][0], '9000900090009000', 'full loudness is digit 9');
  assert.equal(c.p[1][1][1][2], '5', '0.6 → digit 5 of 9');
  const back = Song.expandSong(c);
  assert.equal(Song.validateSong(back, { packs: ['moon-lit', 'hecknsic'] }), true);
  assert.equal(back.tracks[1].pad.seedLock, true);
  assert.equal(back.tracks[1].pad.seed, 77);
  assert.deepEqual(back.tracks[1].pad.params, { count: 5 });
  assert.deepEqual(back.patterns[0].steps[back.tracks[0].id].map((v) => (v > 0 ? 1 : 0)), [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  assert.ok(Math.abs(back.patterns[1].steps[back.tracks[1].id][2] - 5 / 9) < 1e-9);
  assert.equal(back.chain[0].repeat, 2);
  assert.equal(back.chain[1].pattern, back.patterns[1].id);
  assert.throws(() => Song.expandSong({ v: 1, t: [], p: [['A', { 0: 'x' }]], c: [] }), /step row/);
  assert.throws(() => Song.expandSong({ v: 1, t: [], p: [], c: [[3, 1]] }), /chain/);
});
