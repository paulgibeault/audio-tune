// The recorder — how a fleet cue becomes a recipe (docs/explore-design.md).
//
// Every pack captures `const S = global.ArcadeAudioElements` at load, so a
// wrapper installed on that global BEFORE packs load sees every element call
// a cue makes. The wrapper forwards everything to the real library untouched;
// while a session is open it also records each call, and when the session
// carries overrides it merges them into each call by index. Re-running the
// original cue function with a fixed seed and an override table is what makes
// "tweak any parameter" exact: the cue's own structure keeps running.

import { num } from './lab.js';

// Library functions that are NOT gestures (never recorded).
const HELPERS = new Set(['registerPack', 'rng', 'between', 'cents', 'env', 'noiseBuffer',
  'impulseResponse', 'createBus', 'out', 'track', 'teardown']);

let real = null;
let wrapper = null;
let session = null;

export function isElementName(name, fn) {
  return typeof fn === 'function' && !HELPERS.has(name) && !/Buffer$/.test(name) && fn.length >= 4;
}

/** Wrap the global element library once. Returns the wrapper (or null). */
export function install(g = globalThis) {
  if (wrapper && g.ArcadeAudioElements === wrapper) return wrapper;
  const lib = g.ArcadeAudioElements;
  if (!lib || typeof lib !== 'object') return null;
  if (lib.__recorderReal) { wrapper = lib; real = lib.__recorderReal; return wrapper; }
  real = lib;
  const w = {};
  for (const k of Object.keys(lib)) {
    const v = lib[k];
    if (!isElementName(k, v)) { w[k] = v; continue; }
    w[k] = function recorded(ctx, dest, t, a4, a5) {
      const explicit = typeof a4 === 'number';
      let dur = explicit ? a4 : null;
      let p = explicit ? a5 : a4;
      if (session) {
        const i = session.calls.length;
        const ov = session.overrides && session.overrides[i];
        if (ov) {
          if (ov.params) p = Object.assign({}, p, ov.params);
          if (typeof ov.at === 'number') t = session.when + ov.at;
          if (explicit && typeof ov.dur === 'number') dur = ov.dur;
        }
        session.calls.push({ i, el: k, at: round(t - session.when), dur, params: snapshot(p) });
      }
      return explicit ? v.call(lib, ctx, dest, t, dur, p) : v.call(lib, ctx, dest, t, p);
    };
  }
  Object.defineProperty(w, '__recorderReal', { value: lib, enumerable: false });
  g.ArcadeAudioElements = w;
  wrapper = w;
  return w;
}

export function library() { return real; }

function round(x) { return Math.round(x * 1e4) / 1e4; }

// A plain copy of a call's params for display: no `collect` (a live node
// list), no functions, arrays and nested objects copied.
export function snapshot(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  for (const [k, v] of Object.entries(p)) {
    if (k === 'collect' || typeof v === 'function') continue;
    out[k] = Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? { ...x } : x))
      : (v && typeof v === 'object') ? { ...v } : v;
  }
  return out;
}

/**
 * Run `fn` with a recording session open. `when` is the cue's start time
 * (call offsets are measured from it); `overrides` is { [callIndex]:
 * { params, at, dur } }. Returns { calls, result }.
 */
export function run(fn, { when = 0, overrides = null } = {}) {
  if (!wrapper) throw new Error('recorder not installed');
  if (session) throw new Error('recorder session already open');
  session = { when, overrides, calls: [] };
  try {
    const result = fn();
    return { calls: session.calls, result };
  } finally {
    session = null;
  }
}

/**
 * Record `n` silent takes of a cue — each with its own seed — and fold them
 * into a recipe: the first take's layers, with every parameter that differs
 * between takes marked as varied per play.
 *
 * `silentCtx` is an OfflineAudioContext nobody renders; `makeOut(ctx)`
 * returns a destination node for it.
 */
export function recordRecipe(cueFn, { ctx, out, params = null, seed = 1, takes = 3 }) {
  if (!real) throw new Error('recorder not installed');
  const runs = [];
  let end = null;
  for (let i = 0; i < takes; i++) {
    const r = real.rng(seed + i);
    const { calls, result } = run(() => cueFn(ctx, out, 0, params, r), { when: 0 });
    runs.push(calls);
    if (i === 0) end = typeof result === 'number' ? result : (typeof result === 'function' ? 'sustained' : null);
  }
  const recipe = foldTakes(runs, seed);
  recipe.end = end;   // what the cue reported: seconds, or 'sustained' (a bed's teardown)
  return recipe;
}

/** Pure: fold several takes into one recipe with `varied` marks. */
export function foldTakes(runs, seed = 1) {
  const base = runs[0] || [];
  const layers = base.map((c, i) => {
    const varied = new Set();
    let atVaried = false;
    for (const other of runs.slice(1)) {
      const o = other[i];
      if (!o || o.el !== c.el) { atVaried = true; continue; }
      if (o.at !== c.at) atVaried = true;
      if (o.dur !== c.dur) varied.add('dur');
      for (const k of new Set([...Object.keys(c.params), ...Object.keys(o.params)])) {
        if (!same(c.params[k], o.params[k])) varied.add(k);
      }
    }
    return { i, el: c.el, at: c.at, dur: c.dur, params: c.params, varied: [...varied], atVaried };
  });
  const countVaried = runs.some((r) => r.length !== base.length);
  return { seed, layers, countVaried, takes: runs.length };
}

function same(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => same(a[k], b[k]));
  }
  return false;
}

/**
 * Pack code for a recipe: the take as a cue function, values resolved,
 * varied parameters marked. `end` is the duration the cue reported.
 */
export function cueSource(name, recipe, { end = null, overrides = null } = {}) {
  if (end == null && typeof recipe.end === 'number') end = recipe.end;
  const sustained = recipe.end === 'sustained';
  const lines = [`'${name}': function (ctx, o, t, p, r) {`];
  if (sustained) lines.push('  const collect = [];');
  for (const L of recipe.layers) {
    const ov = overrides && overrides[L.i];
    const params = ov && ov.params ? { ...L.params, ...ov.params } : L.params;
    const at = ov && typeof ov.at === 'number' ? ov.at : L.at;
    const dur = ov && typeof ov.dur === 'number' ? ov.dur : L.dur;
    const varied = new Set(L.varied);
    const parts = [];
    for (const [k, v] of Object.entries(params)) {
      if (k === 'seed') { parts.push(varied.has('seed') ? 'seed: (r() * 1e6) | 0' : `seed: ${num(v)}`); continue; }
      parts.push(`${k}: ${literal(v)}`);
    }
    const tExpr = at === 0 ? 't' : `t + ${num(at)}`;
    const durArg = dur == null ? '' : `${num(dur)}, `;
    const note = [...varied].filter((k) => k !== 'seed');
    const comment = note.length || L.atVaried
      ? `  // varies per play: ${[L.atVaried ? 'timing' : null, ...note].filter(Boolean).join(', ')}` : '';
    if (sustained) parts.push('collect');
    lines.push(`  S.${L.el}(ctx, o, ${tExpr}, ${durArg}{ ${parts.join(', ')} });${comment}`);
  }
  if (recipe.countVaried) lines.push('  // some plays add or drop a layer');
  lines.push(sustained ? '  return S.teardown(collect);' : `  return ${end == null ? '1.0' : num(end)};`, '},');
  return lines.join('\n');
}

function literal(v) {
  if (typeof v === 'string') return `'${v}'`;
  if (Array.isArray(v)) return '[' + v.map(literal).join(', ') + ']';
  if (v && typeof v === 'object') return '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${literal(x)}`).join(', ') + ' }';
  return num(v);
}
