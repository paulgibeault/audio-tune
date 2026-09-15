import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchSounds, normQuery } from '../js/find-sounds.js';

const S = [
  { pack: 'moon-lit', game: 'Moon Lit', cue: 'match', note: 'Lanterns catching fire — one flare per lamp.', elements: ['flare', 'thump'] },
  { pack: 'hecknsic', game: 'HecknSic', cue: 'match', note: 'A match clearing — the tiles SHATTER.' },
  { pack: 'moon-lit', game: 'Moon Lit', cue: 'win', note: 'The temple bell.' },
  { pack: 'sowduku', game: 'Sowdoku', cue: 'thud', note: 'A piggy set down in wet mud.', elements: ['squelch', 'thump', 'rustle'] },
  { pack: 'cozy-solitaire', game: 'Cozy Solitaire', cue: 'place', note: 'The workhorse.' },
  { pack: 'moon-lit', game: 'Moon Lit', cue: 'menu-click', note: 'Hyoshigi — the hardwood clapper.' },
];

test('an empty query matches nothing; whitespace and case are ignored', () => {
  assert.deepEqual(matchSounds(S, ''), []);
  assert.deepEqual(matchSounds(S, '   '), []);
  assert.equal(normQuery('  MaTch '), 'match');
  assert.deepEqual(matchSounds(S, 'MATCH').map((s) => s.cue), ['match', 'match']);
});

test('name hits outrank game hits outrank note hits', () => {
  const hits = matchSounds(S, 'moon');
  assert.deepEqual(hits.map((s) => s.cue), ['match', 'menu-click', 'win'], 'game-name hits, alphabetical');
  const bell = matchSounds(S, 'bell');
  assert.deepEqual(bell.map((s) => s.cue), ['win'], 'a note hit');
  const m = matchSounds(S, 'm');
  assert.equal(m[0].cue, 'match', 'prefix beats contains');
  assert.ok(m.map((s) => s.cue).includes('menu-click'));
});

test('the gestures a sound is built from count, below its game and above its note', () => {
  assert.deepEqual(matchSounds(S, 'thump').map((s) => s.cue), ['match', 'thud'], 'by element, alphabetical');
  assert.deepEqual(matchSounds(S, 'sow').map((s) => s.cue), ['thud'], 'game before element');
  const m = matchSounds(S, 'th');
  assert.equal(m[0].cue, 'thud', 'a name prefix beats an element');
});

test('every word must match, across name, game, gestures and note', () => {
  assert.deepEqual(matchSounds(S, 'match heck').map((s) => s.pack), ['hecknsic']);
  assert.deepEqual(matchSounds(S, 'match fire').map((s) => s.pack), ['moon-lit']);
  assert.deepEqual(matchSounds(S, 'thump mud').map((s) => s.cue), ['thud']);
  assert.deepEqual(matchSounds(S, 'match nowhere'), []);
});

test('limit caps the list', () => {
  assert.equal(matchSounds(S, 'm', 2).length, 2);
});
