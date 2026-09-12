// The daily kit — eight pads across the fleet, the same eight for everyone
// today. Pure: picks from the static cue catalogue (js/cue-params.js) with
// a seeded stream, so it needs no packs loaded to decide.

import { CUE_PARAMS, defaultParams } from './cue-params.js';

// Beds and per-play-only cues stay off the kit: a pad should be a hit.
const SKIP = new Set(['moon-lit/ambient', 'moon-lit/insects', 'hecknsic/pulse', 'hecknsic/tension', 'si-syn/bench', 'grav-well/well-hum']);

/** Every candidate pad, in a stable order. */
export function catalogue(packIds = null) {
  const out = [];
  for (const [pack, cues] of Object.entries(CUE_PARAMS)) {
    if (packIds && !packIds.includes(pack)) continue;
    for (const cue of Object.keys(cues)) if (!SKIP.has(`${pack}/${cue}`)) out.push({ pack, cue });
  }
  return out;
}

/**
 * Pick `n` pads with a seeded rng (an Arcade.rng-shaped function: rng() in
 * [0,1)). At most two pads from any one game, so a kit always spans the fleet.
 */
export function pickKit(rng, n = 8, packIds = null) {
  const pool = catalogue(packIds);
  const perPack = new Map();
  const out = [];
  let guard = 0;
  while (out.length < n && pool.length && guard++ < 2000) {
    const i = Math.floor(rng() * pool.length);
    const cand = pool[i];
    const used = perPack.get(cand.pack) || 0;
    if (used >= 2) { pool.splice(i, 1); continue; }
    pool.splice(i, 1);
    perPack.set(cand.pack, used + 1);
    out.push({ pack: cand.pack, cue: cand.cue, params: defaultParams(cand.pack, cand.cue), label: null, velocity: 1, seedLock: false, seed: 1 });
  }
  return out;
}

/** A board-shaped object for the kit (not stored; regenerated each day). */
export function kitBoard(dateStr, rng, packIds = null) {
  const pads = pickKit(rng, 8, packIds);
  while (pads.length < 16) pads.push(null);
  return { v: 1, id: `daily-${dateStr}`, name: `Daily kit · ${dateStr}`, pads, daily: true };
}
