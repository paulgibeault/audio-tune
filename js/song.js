// The song document — tracks, patterns, a chain — and the history that
// makes it undoable. Pure: no DOM, no audio.
//
//   Song {
//     v: 1, id, name, bpm, swing, stepsPerBar, bars,
//     tracks:   [{ id, name, pad: { pack, cue, params, seedLock, seed }, gain, mute, solo }],
//     patterns: [{ id, name, steps: { [trackId]: number[] } }],   // 0 = off, else velocity
//     chain:    [{ pattern: id, repeat: n }],
//   }

export const SONG_VERSION = 1;
export const STEP_OPTIONS = [8, 16, 32];
export const BAR_OPTIONS = [1, 2, 4];

let counter = 0;
export function uid(prefix) {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export function newSong({ name = 'Untitled', bpm = 100, stepsPerBar = 16, bars = 1 } = {}) {
  const p = newPattern('A');
  return { v: SONG_VERSION, id: uid('s'), name, bpm, swing: 0, stepsPerBar, bars, tracks: [], patterns: [p], chain: [{ pattern: p.id, repeat: 1 }] };
}

export function newPattern(name) {
  return { id: uid('p'), name, steps: {} };
}

export function newTrack(pad, name) {
  return { id: uid('t'), name: name || pad.cue, pad: { pack: pad.pack, cue: pad.cue, params: pad.params || null, seedLock: false, seed: 1 }, gain: 1, mute: false, solo: false };
}

export function patternLength(song) { return song.stepsPerBar * song.bars; }

export function addTrack(song, track) { song.tracks.push(track); return track; }

export function removeTrack(song, trackId) {
  song.tracks = song.tracks.filter((t) => t.id !== trackId);
  for (const p of song.patterns) delete p.steps[trackId];
}

export function addPattern(song, name) {
  const p = newPattern(name || nextPatternName(song));
  song.patterns.push(p);
  return p;
}

export function nextPatternName(song) {
  const used = new Set(song.patterns.map((p) => p.name));
  for (let i = 0; i < 26; i++) { const n = String.fromCharCode(65 + i); if (!used.has(n)) return n; }
  return `P${song.patterns.length + 1}`;
}

export function removePattern(song, patternId) {
  if (song.patterns.length <= 1) return false;
  song.patterns = song.patterns.filter((p) => p.id !== patternId);
  song.chain = song.chain.filter((c) => c.pattern !== patternId);
  if (!song.chain.length) song.chain = [{ pattern: song.patterns[0].id, repeat: 1 }];
  return true;
}

export function stepsFor(song, pattern, trackId) {
  const len = patternLength(song);
  let row = pattern.steps[trackId];
  if (!row) row = pattern.steps[trackId] = new Array(len).fill(0);
  if (row.length !== len) {
    const next = new Array(len).fill(0);
    for (let i = 0; i < Math.min(len, row.length); i++) next[i] = row[i];
    row = pattern.steps[trackId] = next;
  }
  return row;
}

export function setStep(song, pattern, trackId, i, vel) {
  const row = stepsFor(song, pattern, trackId);
  row[i] = Math.max(0, Math.min(1, vel));
  return row[i];
}

export function toggleStep(song, pattern, trackId, i, vel = 1) {
  const row = stepsFor(song, pattern, trackId);
  row[i] = row[i] > 0 ? 0 : vel;
  return row[i];
}

/** Resize every pattern's rows when the step count or bars change. */
export function resizePatterns(song) {
  for (const p of song.patterns) for (const id of Object.keys(p.steps)) stepsFor(song, p, id);
}

export function chainAdd(song, patternId, repeat = 1) { song.chain.push({ pattern: patternId, repeat }); }
export function chainRemove(song, index) { if (song.chain.length > 1) song.chain.splice(index, 1); }
export function chainRepeat(song, index, repeat) { if (song.chain[index]) song.chain[index].repeat = Math.max(1, Math.min(64, Math.round(repeat))); }
export function chainMove(song, from, to) {
  if (from === to || !song.chain[from] || to < 0 || to >= song.chain.length) return;
  const [item] = song.chain.splice(from, 1);
  song.chain.splice(to, 0, item);
}

/** Total steps in one pass of the chain. */
export function chainLength(song) {
  const len = patternLength(song);
  return song.chain.reduce((n, c) => n + c.repeat * len, 0) || len;
}

/**
 * Where absolute step `n` lands: { pattern, index, chainPos, pass }.
 * The chain loops; an empty chain loops the first pattern.
 */
export function resolveStep(song, n) {
  const len = patternLength(song);
  const total = chainLength(song);
  const pass = Math.floor(n / total);
  let m = n % total;
  const chain = song.chain.length ? song.chain : [{ pattern: song.patterns[0].id, repeat: 1 }];
  for (let ci = 0; ci < chain.length; ci++) {
    const span = chain[ci].repeat * len;
    if (m < span) {
      const pattern = song.patterns.find((p) => p.id === chain[ci].pattern) || song.patterns[0];
      return { pattern, index: m % len, chainPos: ci, pass };
    }
    m -= span;
  }
  return { pattern: song.patterns[0], index: 0, chainPos: 0, pass };
}

/** Tracks that should sound: solo wins; otherwise everything not muted. */
export function audibleTracks(song) {
  const solo = song.tracks.filter((t) => t.solo);
  return (solo.length ? solo : song.tracks).filter((t) => !t.mute);
}

// ── history ───────────────────────────────────────────────────────────

export class History {
  constructor(cap = 60) { this.cap = cap; this.past = []; this.future = []; }
  push(song) { this.past.push(JSON.stringify(song)); if (this.past.length > this.cap) this.past.shift(); this.future = []; }
  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }
  undo(current) { if (!this.past.length) return null; this.future.push(JSON.stringify(current)); return JSON.parse(this.past.pop()); }
  redo(current) { if (!this.future.length) return null; this.past.push(JSON.stringify(current)); return JSON.parse(this.future.pop()); }
}

// ── validation (imports are hostile input) ────────────────────────────

const ID = /^[A-Za-z0-9_-]{1,40}$/;

export function validateSong(x, { packs = null } = {}) {
  const fail = (m) => { throw new Error(`song: ${m}`); };
  if (!x || typeof x !== 'object' || Array.isArray(x)) fail('not an object');
  if (x.v !== SONG_VERSION) fail(`version ${x.v}`);
  if (typeof x.name !== 'string' || x.name.length > 60) fail('name');
  if (!(x.bpm >= 20 && x.bpm <= 300)) fail('bpm');
  if (!(x.swing >= 0 && x.swing <= 1)) fail('swing');
  if (!STEP_OPTIONS.includes(x.stepsPerBar)) fail('stepsPerBar');
  if (!BAR_OPTIONS.includes(x.bars)) fail('bars');
  if (!Array.isArray(x.tracks) || x.tracks.length > 32) fail('tracks');
  if (!Array.isArray(x.patterns) || x.patterns.length < 1 || x.patterns.length > 16) fail('patterns');
  if (!Array.isArray(x.chain) || x.chain.length > 64) fail('chain');
  const len = x.stepsPerBar * x.bars;
  const trackIds = new Set();
  for (const t of x.tracks) {
    if (!ID.test(t.id) || trackIds.has(t.id)) fail('track id'); trackIds.add(t.id);
    if (typeof t.name !== 'string' || t.name.length > 40) fail('track name');
    if (!t.pad || !ID.test(t.pad.pack) || !/^[a-z0-9-]{1,40}$/.test(t.pad.cue)) fail('track pad');
    if (packs && !packs.includes(t.pad.pack)) fail(`unknown pack ${t.pad.pack}`);
    if (t.pad.params != null && (typeof t.pad.params !== 'object' || Object.keys(t.pad.params).length > 8)) fail('track params');
    if (t.pad.params) for (const [k, v] of Object.entries(t.pad.params)) {
      if (!/^[a-z][a-zA-Z0-9]{0,15}$/.test(k)) fail('param key');
      if (!(typeof v === 'number' && Number.isFinite(v)) && typeof v !== 'boolean' && !(typeof v === 'string' && v.length <= 16)) fail('param value');
    }
    if (!(t.gain >= 0 && t.gain <= 1)) fail('track gain');
    if (typeof t.mute !== 'boolean' || typeof t.solo !== 'boolean') fail('track flags');
    if (typeof t.pad.seedLock !== 'boolean' || !Number.isInteger(t.pad.seed)) fail('track seed');
  }
  const patIds = new Set();
  for (const p of x.patterns) {
    if (!ID.test(p.id) || patIds.has(p.id)) fail('pattern id'); patIds.add(p.id);
    if (typeof p.name !== 'string' || p.name.length > 12) fail('pattern name');
    if (!p.steps || typeof p.steps !== 'object' || Array.isArray(p.steps)) fail('pattern steps');
    for (const [tid, row] of Object.entries(p.steps)) {
      if (!trackIds.has(tid)) fail('steps for unknown track');
      if (!Array.isArray(row) || row.length !== len || !row.every((v) => typeof v === 'number' && v >= 0 && v <= 1)) fail('step row');
    }
  }
  for (const c of x.chain) {
    if (!patIds.has(c.pattern)) fail('chain pattern');
    if (!(Number.isInteger(c.repeat) && c.repeat >= 1 && c.repeat <= 64)) fail('chain repeat');
  }
  return true;
}

/** A plain-object copy safe to store or share. */
export function serialize(song) { return JSON.parse(JSON.stringify(song)); }

// ── compact form for share codes / config payloads ────────────────────
// Step rows become run-length strings ("0" and velocity digits 1–9 for
// 10–100%), tracks lose their ids (index-addressed), and the result is a
// few hundred bytes for a typical song.

export function compactSong(song) {
  const tIndex = new Map(song.tracks.map((t, i) => [t.id, i]));
  return {
    v: SONG_VERSION, n: song.name, b: song.bpm, w: +song.swing.toFixed(2), s: song.stepsPerBar, r: song.bars,
    t: song.tracks.map((t) => [t.name, t.pad.pack, t.pad.cue, t.pad.params || 0, +t.gain.toFixed(2), t.pad.seedLock ? t.pad.seed : 0]),
    p: song.patterns.map((p) => [p.name, Object.fromEntries(Object.entries(p.steps).filter(([id]) => tIndex.has(id)).map(([id, row]) => [tIndex.get(id), row.map((v) => (v <= 0 ? '0' : String(Math.max(1, Math.min(9, Math.round(v * 9)))))).join('')]))]),
    c: song.chain.map((c) => [song.patterns.findIndex((p) => p.id === c.pattern), c.repeat]),
  };
}

/** Expand a compact song into a full document with fresh ids. Validate after. */
export function expandSong(c) {
  if (!c || typeof c !== 'object' || c.v !== SONG_VERSION) throw new Error('song: version');
  if (!Array.isArray(c.t) || !Array.isArray(c.p) || !Array.isArray(c.c)) throw new Error('song: shape');
  const song = { v: SONG_VERSION, id: uid('s'), name: typeof c.n === 'string' ? c.n.slice(0, 60) : 'Imported song', bpm: Number(c.b), swing: Number(c.w) || 0, stepsPerBar: Number(c.s), bars: Number(c.r), tracks: [], patterns: [], chain: [], updated: Date.now() };
  const len = song.stepsPerBar * song.bars;
  for (const t of c.t) {
    if (!Array.isArray(t)) throw new Error('song: track');
    const [name, pack, cue, params, gain, seed] = t;
    song.tracks.push({ id: uid('t'), name: String(name).slice(0, 40), pad: { pack, cue, params: params && typeof params === 'object' ? params : null, seedLock: !!seed, seed: seed || 1 }, gain: Number(gain), mute: false, solo: false });
  }
  for (const p of c.p) {
    if (!Array.isArray(p)) throw new Error('song: pattern');
    const [name, rows] = p;
    const pat = { id: uid('p'), name: String(name).slice(0, 12), steps: {} };
    if (rows && typeof rows === 'object') for (const [idx, str] of Object.entries(rows)) {
      const track = song.tracks[Number(idx)];
      if (!track || typeof str !== 'string' || str.length !== len) throw new Error('song: step row');
      pat.steps[track.id] = [...str].map((ch) => (ch === '0' ? 0 : Math.max(0, Math.min(1, Number(ch) / 9))));
    }
    song.patterns.push(pat);
  }
  for (const ch of c.c) {
    if (!Array.isArray(ch) || !song.patterns[ch[0]]) throw new Error('song: chain');
    song.chain.push({ pattern: song.patterns[ch[0]].id, repeat: Number(ch[1]) });
  }
  if (!song.chain.length) song.chain = [{ pattern: song.patterns[0].id, repeat: 1 }];
  return song;
}
