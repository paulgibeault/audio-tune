// User cues — sounds built in the composer, kept in the store, and published
// as a pack of their own ('mine', "My sounds") so they are first-class:
// pads on boards, tracks in songs, and code you can paste into a game.
//
//   UserCue { v: 1, id, name, send, layers: [{ el, at, dur?, params, vary? }], updated }
//   vary: { cents?: number (± for the layer's pitched params), level?: 0..1 (± fraction of gain) }
//
// The pack is rebuilt from the store whenever a cue changes. Its ROOM is one
// room for all user cues — the fleet's own rule, one room per pack.

import { ELEMENTS } from './element-params.js';
import { validateUserCue, CUE_VERSION } from './validate.js';
import { num, formatPartials } from './lab.js';

export const MAX_LAYERS = 12;

export const PACK_ID = 'mine';
export const PACK_DESC = { id: PACK_ID, name: 'My sounds', kind: 'graph', hue: 48, place: 'Sounds you built in Explore — any of them is a pad or a track.', url: null };
export const DEFAULT_ROOM = { dur: 1.0, decay: 0.3, preDelay: 0.012, wet: 0.5, shelfHz: 5000, shelfDb: -4, seed: 7 };

let counter = 0;
export function uid() { counter = (counter + 1) % 1e6; return `c${Date.now().toString(36)}${counter.toString(36)}`; }

export function newCue(name = 'new-sound') {
  return { v: CUE_VERSION, id: uid(), name, send: 0.25, layers: [{ el: 'strike', at: 0, params: { dur: 0.006, hp: 2200, gain: 0.3 }, vary: { cents: 0, level: 0 } }], updated: Date.now() };
}

export function newLayer(el, at = 0) {
  const def = ELEMENTS[el];
  const params = {};
  for (const [k, d] of Object.entries(def.params)) {
    if (Array.isArray(d)) params[k] = d[3];
    else if (d.options) params[k] = d.options[0];
    else if (d.preset) params[k] = 'wood';
  }
  const L = { el, at, params, vary: { cents: def.pitched ? 15 : 0, level: 0.1 } };
  if (def.explicitDur) { L.dur = params.dur; delete params.dur; }
  return L;
}

/** Make a kebab-case cue name from free text. */
export function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'sound';
}

/**
 * A user cue from a recorded fleet recipe (js/recorder.js) with the user's
 * overrides applied — the way a tweaked take becomes a sound of your own.
 * Fleet packs are read-only; this is where tweaks go. Values are the take's
 * (no per-play variation until the user adds some). Throws when the recipe
 * has more layers than a user cue may hold.
 */
export function fromRecipe(name, recipe, { overrides = null, send = 0.25 } = {}) {
  if (!recipe || !Array.isArray(recipe.layers)) throw new Error('no recipe');
  if (recipe.layers.length > MAX_LAYERS) throw new Error(`${recipe.layers.length} layers — a sound holds at most ${MAX_LAYERS}`);
  const layers = recipe.layers.map((L) => {
    const ov = overrides && overrides[L.i];
    const params = { ...L.params, ...((ov && ov.params) || {}) };
    delete params.seed; delete params.collect;
    for (const [k, v] of Object.entries(params)) if (typeof v === 'function' || v == null) delete params[k];
    const def = ELEMENTS[L.el];
    const at = ov && typeof ov.at === 'number' ? ov.at : L.at;
    const layer = { el: L.el, at: Math.max(0, Math.min(10, Math.round(at * 1000) / 1000)), params, vary: { cents: 0, level: 0 } };
    if (def && def.explicitDur) {
      const d = ov && typeof ov.dur === 'number' ? ov.dur : (L.dur != null ? L.dur : params.dur);
      layer.dur = Math.max(0.05, Math.min(60, typeof d === 'number' ? d : 4));
      delete params.dur;
    }
    return layer;
  });
  const cue = { v: CUE_VERSION, id: uid(), name: slug(name), send: Math.max(0, Math.min(1, send)), layers, updated: Date.now() };
  validateUserCue(cue);
  return cue;
}

/**
 * The params one play of a layer uses: presets resolved, pitched params
 * detuned by `vary.cents`, gain jittered by `vary.level`, a seed drawn.
 * `lib` is the element library (for cents/between); `r` the seeded stream.
 */
export function layerParams(L, lib, r, presets) {
  const def = ELEMENTS[L.el] || { params: {} };
  const out = {};
  const pitched = new Set(def.pitched || []);
  const vary = L.vary || {};
  for (const [k, v] of Object.entries(L.params || {})) {
    // a preset name, or the partial table itself once a bar has been dragged
    if (def.params[k] && def.params[k].preset) { out[k] = Array.isArray(v) ? v : (presets[v] || presets[def.params[k].preset[0]]); continue; }
    if (typeof v === 'number' && pitched.has(k) && vary.cents) { out[k] = v * lib.cents(r, vary.cents); continue; }
    if (k === 'gain' && typeof v === 'number' && vary.level) { out[k] = Math.max(0, v * (1 + (r() * 2 - 1) * vary.level)); continue; }
    out[k] = v;
  }
  if (def.seeded) out.seed = (r() * 1e6) | 0;
  return out;
}

/** True when the cue has any sustained layer (stream/drone). */
export function isSustained(cue) {
  return cue.layers.some((L) => ELEMENTS[L.el] && ELEMENTS[L.el].explicitDur);
}

/** Build the cue function in the fleet's shape: (ctx, o, t, p, r) → seconds | teardown. */
export function cueFunction(cue, lib, presets) {
  const sustained = isSustained(cue);
  return function userCue(ctx, o, t, p, r) {
    let end = 0;
    const collect = sustained ? [] : null;
    for (const L of cue.layers) {
      const fn = lib[L.el];
      if (typeof fn !== 'function') continue;
      const params = layerParams(L, lib, r, presets);
      if (collect) params.collect = collect;
      const def = ELEMENTS[L.el];
      let res;
      if (def && def.explicitDur) { res = fn(ctx, o, t + L.at, L.dur || 4, params); end = Math.max(end, L.at + (L.dur || 4)); }
      else { res = fn(ctx, o, t + L.at, params); end = Math.max(end, L.at + (typeof res === 'number' ? res : 0.1)); }
    }
    return sustained ? lib.teardown(collect) : end;
  };
}

/** Assemble a pack object (registerPack shape) from stored cues. */
export function buildPack(cues, room, lib, presets) {
  const CUES = {}, SENDS = {}, SUSTAINED = {};
  for (const c of cues) {
    CUES[c.name] = cueFunction(c, lib, presets);
    SENDS[c.name] = c.send == null ? 0.25 : c.send;
    if (isSustained(c)) SUSTAINED[c.name] = true;
  }
  return { name: PACK_ID, ROOM: { ...DEFAULT_ROOM, ...(room || {}) }, SENDS, SUSTAINED, CUES };
}

/** Pack code for a user cue, with vary expressed as the fleet writes it. */
export function cueSource(cue) {
  const sustained = isSustained(cue);
  const lines = [`'${cue.name}': function (ctx, o, t, p, r) {`];
  if (sustained) lines.push('  const collect = [];');
  for (const L of cue.layers) {
    const def = ELEMENTS[L.el] || { params: {} };
    const pitched = new Set(def.pitched || []);
    const vary = L.vary || {};
    const parts = [];
    for (const [k, v] of Object.entries(L.params || {})) {
      if (def.params[k] && def.params[k].preset && typeof v === 'string') { parts.push(`${k}: ${k.toUpperCase()}_${String(v).toUpperCase()}`); continue; }
      if (Array.isArray(v)) { parts.push(`${k}: ${formatPartials(v)}`); continue; }
      if (typeof v === 'string') { parts.push(`${k}: '${v}'`); continue; }
      if (typeof v === 'number' && pitched.has(k) && vary.cents) { parts.push(`${k}: ${num(v)} * S.cents(r, ${num(vary.cents)})`); continue; }
      if (k === 'gain' && typeof v === 'number' && vary.level) { parts.push(`gain: S.between(r, ${num(v * (1 - vary.level))}, ${num(v * (1 + vary.level))})`); continue; }
      parts.push(`${k}: ${num(v)}`);
    }
    if (def.seeded) parts.push('seed: (r() * 1e6) | 0');
    if (sustained) parts.push('collect');
    const tExpr = L.at ? `t + ${num(L.at)}` : 't';
    const durArg = def.explicitDur ? `${num(L.dur || 4)}, ` : '';
    lines.push(`  S.${L.el}(ctx, o, ${tExpr}, ${durArg}{ ${parts.join(', ')} });`);
  }
  const end = cue.layers.reduce((m, L) => Math.max(m, L.at + (L.dur || (L.params && L.params.dur) || 0.1)), 0);
  lines.push(sustained ? '  return S.teardown(collect);' : `  return ${num(Math.round(end * 100) / 100)};`, '},');
  const presetsUsed = cue.layers.flatMap((L) => Object.entries(L.params || {}).filter(([k, v]) => typeof v === 'string' && ELEMENTS[L.el] && ELEMENTS[L.el].params[k] && ELEMENTS[L.el].params[k].preset).map(([k, v]) => `${k.toUpperCase()}_${String(v).toUpperCase()}`));
  const pre = [...new Set(presetsUsed)].map((n) => `// ${n}: the partial table from the lab's "${n.split('_')[1].toLowerCase()}" preset`);
  return [...pre, ...lines].join('\n');
}

// ── store ─────────────────────────────────────────────────────────────

let store = null;
function open() {
  if (store) return store;
  const A = window.Arcade;
  store = (A && A.store && typeof A.store.open === 'function') ? A.store.open('cues') : null;
  return store;
}

export async function list() {
  const s = open(); if (!s) return { cues: [], room: null };
  const cues = []; let room = null;
  try {
    await s.each((v, k) => {
      if (k === '_room') { room = v && typeof v === 'object' ? v : null; return; }
      try { validateUserCue(v); cues.push(v); } catch (e) { console.warn('[audio-tune] stored cue rejected', k, e.message); }
    });
  } catch (e) { /* noop */ }
  cues.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  return { cues, room };
}

export async function save(cue) {
  const s = open(); if (!s) return false;
  cue.updated = Date.now();
  validateUserCue(cue);
  try { await s.set(cue.id, JSON.parse(JSON.stringify(cue))); return true; } catch (e) { return false; }
}

export async function remove(id) { const s = open(); if (!s) return; try { await s.del(id); } catch (e) { /* noop */ } }

export async function saveRoom(room) { const s = open(); if (!s) return; try { await s.set('_room', JSON.parse(JSON.stringify(room))); } catch (e) { /* noop */ } }
