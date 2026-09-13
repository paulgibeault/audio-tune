// Element Lab — the pure half. Turns a knob state into the params object an
// element takes and into the pack-code snippet a designer pastes into a
// game's js/soundpack.js. No DOM, no audio; tested under node.

import { ELEMENTS, BODY_PRESETS } from './element-params.js';

/** The knob state a fresh panel starts from. */
export function defaultsFor(name) {
  const e = ELEMENTS[name];
  if (!e) throw new Error(`unknown element '${name}'`);
  const out = {};
  for (const [k, d] of Object.entries(e.params)) {
    if (Array.isArray(d)) out[k] = d[3];
    else if (d.options) out[k] = d.options[0];
    else if (d.preset) out[k] = d.preset[0];
    else if (d.range) out[k] = d.off;
  }
  return out;
}

/** Is this param's current value "off" (omitted from the call)? */
export function isOff(def, value) {
  return !!(def && def.optional && value === def.off);
}

/**
 * The params object for one play. `opts`: { seed, transpose (semitones),
 * cents (±, from vary) } — `rnd` is a seeded stream the caller supplies
 * when varying, so the lab varies exactly as a pack would.
 */
export function buildParams(name, state, opts = {}, rnd = null) {
  const e = ELEMENTS[name];
  const p = {};
  const pitched = new Set(e.pitched || []);
  const ratio = Math.pow(2, (opts.transpose || 0) / 12);
  for (const [k, def] of Object.entries(e.params)) {
    if (e.explicitDur && k === 'dur') continue;
    let v = state[k];
    if (isOff(def, v)) continue;
    if (def.preset) { p[k] = Array.isArray(v) ? v : (BODY_PRESETS[v] || BODY_PRESETS[def.preset[0]]); continue; }
    if (pitched.has(k) && typeof v === 'number') {
      v *= ratio;
      if (rnd && opts.cents) v *= cents(rnd, opts.cents);
    }
    p[k] = v;
  }
  if (e.seeded) p.seed = rnd ? ((rnd() * 1e6) | 0) : (opts.seed || 1);
  return p;
}

/** Explicit duration argument for stream/drone, else null. */
export function explicitDur(name, state) {
  return ELEMENTS[name].explicitDur ? state.dur : null;
}

/** Same as the library's E.cents: a ratio within ±c cents. */
export function cents(rnd, c) {
  return Math.pow(2, ((rnd() * 2 - 1) * c) / 1200);
}

/** Copy-as-pack-code: the line a pack would carry for this knob state. */
export function snippet(name, state, opts = {}) {
  const e = ELEMENTS[name];
  const pitched = new Set(e.pitched || []);
  const parts = [];
  for (const [k, def] of Object.entries(e.params)) {
    if (e.explicitDur && k === 'dur') continue;
    const v = state[k];
    if (isOff(def, v)) continue;
    if (def.preset) { parts.push(`${k}: ${formatPartials(Array.isArray(v) ? v : (BODY_PRESETS[v] || []))}`); continue; }
    if (def.options) { parts.push(`${k}: '${v}'`); continue; }
    if (pitched.has(k) && opts.cents) { parts.push(`${k}: ${num(v)} * S.cents(r, ${opts.cents})`); continue; }
    parts.push(`${k}: ${num(v)}`);
  }
  if (e.seeded) parts.push(opts.vary ? 'seed: (r() * 1e6) | 0' : `seed: ${opts.seed || 1}`);
  const dur = e.explicitDur ? `${num(state.dur)}, ` : '';
  return `S.${name}(ctx, o, t, ${dur}{ ${parts.join(', ')} });`;
}

export function formatPartials(list) {
  return '[' + list.map((pt) => '{ ' + Object.entries(pt).map(([k, v]) => `${k}: ${num(v)}`).join(', ') + ' }').join(', ') + ']';
}

export function num(v) {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v)) return String(v);
  return String(+v.toFixed(4));
}

// ── keyboard mode ─────────────────────────────────────────────────────
// The common web-piano layout: a home-row white-key run with sharps on the
// row above, from C at `a`. z / x shift the octave.

const PIANO = 'awsedftgyhujkolp;';

export function semitoneForKey(key) {
  if (typeof key !== 'string' || key.length !== 1) return null;
  const i = PIANO.indexOf(key.toLowerCase());
  return i < 0 ? null : i;
}

export function noteName(semitone, base = 'C4') {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const baseIdx = names.indexOf(base.slice(0, -1));
  const baseOct = Number(base.slice(-1));
  const n = baseIdx + semitone;
  const oct = baseOct + Math.floor(n / 12);
  return names[((n % 12) + 12) % 12] + oct;
}

// ── rooms ─────────────────────────────────────────────────────────────

export const ROOM_KNOBS = {
  dur: [0.2, 4, 0.05, 2.0], decay: [0.05, 2, 0.01, 0.55], preDelay: [0, 0.06, 0.001, 0.012],
  wet: [0, 1, 0.01, 0.9], shelfHz: [1000, 12000, 100, 6000], shelfDb: [-12, 0, 0.5, -4],
};

export const ROOM_PRESETS = {
  dry: { dur: 0.2, decay: 0.05, preDelay: 0, wet: 0, shelfHz: 12000, shelfDb: 0 },
  default: Object.fromEntries(Object.entries(ROOM_KNOBS).map(([k, d]) => [k, d[3]])),
};

/** Fold a pack's ROOM into a full knob state (packs may omit keys). */
export function roomState(room) {
  const s = { ...ROOM_PRESETS.default, seed: 7 };
  for (const k of Object.keys(ROOM_KNOBS)) if (typeof room[k] === 'number') s[k] = room[k];
  if (typeof room.seed === 'number') s.seed = room.seed;
  return s;
}
