// Pack loader, registry and the per-pack rooms.
//
// This is the soundboard's whole relationship with the fleet: it loads each
// game's real js/soundpack.js (or pi-game's chiptune module), keeps one room
// per pack chained into the SDK's bus, and fires cues through the exact
// contract the launcher's offline audition renderer uses —
//
//   CUES[name](ctx, E.out(packBus, SENDS[name]), when, params, E.rng(seed))
//
// — so every sound here is the sound the game ships, running the same code.
// See docs/soundboard-plan-2026-09.md §3.2–3.4.

import { normaliseGraphPack, normaliseSpecPack, scaleSpec, clamp } from './pack-shape.js';

const registry = new Map();      // id → entry
let manifest = null;
let loadChain = Promise.resolve(); // pack scripts load one at a time (§3.2)
let seedCounter = (Date.now() & 0xffff) + 1;
let sdkRoomNeutralised = false;

const audio = () => (window.Arcade && window.Arcade.audio) ? window.Arcade.audio : null;
const E = () => window.ArcadeAudioElements || null;

export function available() {
  const a = audio();
  return !!(a && typeof a.bus === 'function' && E() && typeof E().createBus === 'function');
}

export async function loadManifest(url = 'fleet-packs.json') {
  if (manifest) return manifest;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`manifest ${url}: HTTP ${res.status}`);
  manifest = await res.json();
  for (const d of manifest.packs) {
    registry.set(d.id, { desc: d, status: 'idle', pack: null, bus: null, error: null });
  }
  return manifest;
}

export function list() {
  return [...registry.values()].map((e) => ({ ...e.desc, status: e.status, error: e.error }));
}

export function get(id) {
  return registry.get(id) || null;
}

/** Load one pack (idempotent; concurrent calls share the same promise). */
export function load(id) {
  const entry = registry.get(id);
  if (!entry) return Promise.reject(new Error(`unknown pack '${id}'`));
  if (entry.promise) return entry.promise;
  entry.status = 'loading';
  entry.promise = (loadChain = loadChain.then(() => loadOne(entry)).catch(() => {}))
    .then(() => entry);
  return entry.promise;
}

async function loadOne(entry) {
  const d = entry.desc;
  try {
    if (d.kind === 'spec') {
      const mod = await import(d.url);
      entry.pack = normaliseSpecPack(mod, d);
    } else {
      if (!E()) throw new Error('element library not loaded');
      delete window.ArcadeSoundPack;
      await injectScript(d.url);
      const raw = window.ArcadeSoundPack;
      if (!raw) throw new Error('pack did not register (stale library or gated pack)');
      entry.pack = normaliseGraphPack(raw, d);
    }
    entry.status = 'ready';
  } catch (err) {
    entry.status = 'failed';
    entry.error = err && err.message ? err.message : String(err);
    console.warn(`[audio-tune] pack '${d.id}' unavailable:`, entry.error);
  }
}

function injectScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = false;
    s.onload = () => { s.remove(); resolve(); };
    s.onerror = () => { s.remove(); reject(new Error(`failed to load ${url}`)); };
    document.head.appendChild(s);
  });
}

/**
 * The SDK bus, with its own room neutralised (§3.3): every cue meets exactly
 * one room, its pack's. Called on the first user gesture so the compressor's
 * ~250 ms warm-up happens before the first pad hit, not during it.
 */
export function sdkBus() {
  const a = audio();
  if (!a || typeof a.bus !== 'function') return null;
  if (!sdkRoomNeutralised && typeof a.room === 'function') {
    a.room({ wet: 0, shelfDb: 0 });
    sdkRoomNeutralised = true;
  }
  const b = a.bus();
  if (b && b.ctx && b.ctx.state === 'suspended' && !suspendedByArcade()) {
    try { b.ctx.resume(); } catch (e) { /* needs a gesture */ }
  }
  return b;
}

function suspendedByArcade() {
  return !!(window.Arcade && window.Arcade.context && window.Arcade.context.suspended);
}

/** The pack's own room, chained into the SDK bus. Built lazily. */
function packBus(entry) {
  if (entry.bus) return entry.bus;
  const b = sdkBus();
  if (!b) return null;
  entry.bus = E().createBus(b.ctx, b.dry, entry.pack.room);
  return entry.bus;
}

export function enabled() {
  const a = audio();
  return !!(a && typeof a.enabled === 'function' && a.enabled());
}

export function nextSeed() {
  seedCounter = (seedCounter + 1) >>> 0;
  return seedCounter;
}

export function cue(id, name) {
  const entry = registry.get(id);
  if (!entry || !entry.pack) return null;
  return entry.pack.cues.find((c) => c.name === name) || null;
}

/**
 * Fire a one-shot cue. opts: { params, seed, velocity, when }.
 * Returns { dur } (seconds the cue asked for) or null when nothing played.
 */
export function fire(id, name, opts = {}) {
  const entry = registry.get(id);
  if (!entry || entry.status !== 'ready') return null;
  if (!enabled()) return null;
  const c = cue(id, name);
  if (!c) return null;
  const velocity = clamp(opts.velocity == null ? 1 : opts.velocity, 0, 1);

  if (entry.pack.kind === 'spec') {
    const a = audio();
    const overrides = specOverrides(entry, c, opts.params);
    a.play(scaleSpec(c.spec, velocity, overrides));
    return { dur: specDuration(c.spec) };
  }

  const bus = packBus(entry);
  if (!bus) return null;
  const el = E();
  const ctx = bus.ctx;
  const o = el.out(bus, c.send);
  o.gain.value = velocity;
  const when = typeof opts.when === 'number' ? opts.when : ctx.currentTime;
  const seed = Number.isFinite(opts.seed) ? opts.seed : nextSeed();
  let dur = 0;
  try {
    const r = c.fn(ctx, o, when, opts.params || null, el.rng(seed));
    dur = typeof r === 'number' && Number.isFinite(r) ? r : 1.0;
  } catch (err) {
    console.warn(`[audio-tune] cue ${id}/${name} threw:`, err);
    try { o.disconnect(); } catch (e) { /* noop */ }
    return null;
  }
  // Release the per-play node once the cue and the longest room tail are done.
  const tail = (entry.pack.room && entry.pack.room.dur) || 2;
  setTimeout(() => { try { o.disconnect(); } catch (e) { /* noop */ } },
    (Math.max(0, when - ctx.currentTime) + dur + tail + 0.5) * 1000);
  return { dur };
}

/**
 * Start a bed (sustained cue). Mirrors Arcade.audio.start(): the handle's
 * stop(fade) fades and tears down; retune(params, fade) crossfades to a new
 * parameterisation under the same handle.
 */
export function startBed(id, name, params) {
  const noop = { stop() {}, retune() { return this; }, live: false };
  const entry = registry.get(id);
  if (!entry || entry.status !== 'ready' || entry.pack.kind === 'spec') return noop;
  const c = cue(id, name);
  if (!c || !c.sustained) return noop;
  if (!enabled()) return noop;
  const bus = packBus(entry);
  if (!bus) return noop;
  const el = E();
  const ctx = bus.ctx;
  let out = null;
  let teardown = null;

  function build(p) {
    const o = el.out(bus, c.send);
    let td = null;
    try { td = c.fn(ctx, o, ctx.currentTime, p || null, el.rng(nextSeed())); }
    catch (err) {
      console.warn(`[audio-tune] bed ${id}/${name} threw:`, err);
      try { o.disconnect(); } catch (e) { /* noop */ }
      return false;
    }
    out = o; teardown = td;
    return true;
  }
  function retire(o, td, f) {
    const now = ctx.currentTime;
    try {
      o.gain.cancelScheduledValues(now);
      o.gain.setValueAtTime(Math.max(o.gain.value, 0.0001), now);
      o.gain.exponentialRampToValueAtTime(0.0001, now + f);
    } catch (e) { /* noop */ }
    if (typeof td === 'function') { try { td(now + f); } catch (e) { /* noop */ } }
    setTimeout(() => { try { o.disconnect(); } catch (e) { /* noop */ } }, (f + 0.2) * 1000);
  }
  if (!build(params)) return noop;
  let stopped = false;
  const handle = {
    live: true,
    stop(fade) {
      if (stopped) return;
      stopped = true; handle.live = false;
      retire(out, teardown, Number.isFinite(fade) && fade > 0 ? fade : 0.4);
    },
    retune(p, fade) {
      if (stopped) return handle;
      const f = Number.isFinite(fade) && fade > 0 ? fade : 1.0;
      const oldOut = out, oldTd = teardown;
      if (build(p)) retire(oldOut, oldTd, f);
      return handle;
    },
  };
  return handle;
}

// pi-game's module exports the per-play helpers the game itself uses; the pad
// exposes their inputs as parameters (js/cue-params.js) and folds them into
// overrides here, so the board plays what the game would at that digit.
function specOverrides(entry, c, params) {
  const m = entry.pack.module;
  const p = params || {};
  if (!m) return null;
  if (c.name === 'correct' && typeof m.correctFreq === 'function' && p.digit != null) {
    return { freq: m.correctFreq(p.digit) };
  }
  if (c.name === 'combo' && typeof m.comboOverrides === 'function' && typeof m.correctFreq === 'function') {
    return m.comboOverrides(m.correctFreq(p.digit == null ? 0 : p.digit), p.level == null ? 5 : p.level);
  }
  return null;
}

export function specDuration(spec) {
  if (!Array.isArray(spec)) return clamp(spec.dur || 0.15, 0.001, 30);
  let t = 0, end = 0, prevDur = 0;
  spec.forEach((s, i) => {
    const d = clamp(s.dur || 0.15, 0.001, 30);
    if (i > 0) t += typeof s.delay === 'number' ? s.delay : prevDur;
    end = Math.max(end, t + d);
    prevDur = d;
  });
  return end;
}
