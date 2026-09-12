// The shape of a loaded pack, normalised — pure, so it is testable under
// node --test without a DOM or an AudioContext.
//
// A fleet pack publishes { name, ROOM, SENDS, CUES, … } via registerPack.
// Beds (sustained cues) come in two conventions: si-syn and grav-well keep
// them inside CUES with a SUSTAINED map; moon-lit and hecknsic export them as
// extra top-level keys with their sends living in the game's own registration
// module. The manifest's `beds` entry carries that second case, and this
// module folds both into one cue list so nothing downstream has to know.
//
// A spec pack (pi-game) is an ES module exporting CUES as spec objects; it has
// no room and no sends, and its cues play through the SDK's spec engine.

export const DEFAULT_SEND = 0.25;

/** Normalise a graph pack into an ordered cue list. */
export function normaliseGraphPack(pack, desc) {
  if (!pack || typeof pack !== 'object') throw new TypeError('pack must be an object');
  for (const k of ['ROOM', 'SENDS', 'CUES']) {
    if (!pack[k] || typeof pack[k] !== 'object') throw new TypeError(`pack.${k} missing`);
  }
  const d = desc || {};
  // A pack names itself; usually that is the gameId, but not always (sowduku's
  // pack is 'sow-duku'), so the manifest may say what name to expect.
  const expected = d.packName || d.id;
  if (expected && pack.name !== expected) {
    throw new Error(`pack registered as '${pack.name}', expected '${expected}'`);
  }
  const sustained = new Set(Object.keys(pack.SUSTAINED || {}).filter((k) => pack.SUSTAINED[k]));
  const bedDesc = d.beds || {};
  const cues = [];
  for (const name of Object.keys(pack.CUES)) {
    const fn = pack.CUES[name];
    if (typeof fn !== 'function') continue;
    cues.push({
      name, fn,
      send: numberOr(pack.SENDS[name], DEFAULT_SEND),
      sustained: sustained.has(name) || Object.prototype.hasOwnProperty.call(bedDesc, name),
      params: bedDesc[name] && bedDesc[name].params ? bedDesc[name].params : null,
    });
  }
  // Beds the manifest names that are NOT in CUES: top-level pack keys.
  for (const name of Object.keys(bedDesc)) {
    if (pack.CUES[name]) continue;
    const fn = pack[name];
    if (typeof fn !== 'function') continue;
    cues.push({
      name, fn,
      send: numberOr(bedDesc[name].send, numberOr(pack.SENDS[name], DEFAULT_SEND)),
      sustained: true,
      params: bedDesc[name].params || null,
    });
  }
  return { id: d.id || pack.name, kind: 'graph', room: pack.ROOM, cues };
}

/** Normalise a spec pack (an ES module namespace) into an ordered cue list. */
export function normaliseSpecPack(mod, desc) {
  if (!mod || typeof mod !== 'object' || !mod.CUES || typeof mod.CUES !== 'object') {
    throw new TypeError('spec pack must export CUES');
  }
  const cues = [];
  for (const name of Object.keys(mod.CUES)) {
    const spec = mod.CUES[name];
    if (!spec || typeof spec !== 'object') continue;
    cues.push({ name, spec, send: 0, sustained: false, params: null });
  }
  return { id: desc && desc.id ? desc.id : 'spec', kind: 'spec', room: null, cues, module: mod };
}

/**
 * Scale a spec (single voice or array) by a velocity and merge per-play
 * overrides, returning a fresh spec the SDK can play inline. The SDK only
 * merges overrides onto single-object cues; doing it here means array cues
 * get them too, and velocity reaches every voice.
 */
export function scaleSpec(spec, velocity, overrides) {
  const v = clamp(velocity == null ? 1 : velocity, 0, 1);
  const one = (s) => {
    const out = Object.assign({}, s, overrides || {});
    out.gain = clamp(numberOr(out.gain, 0.3) * v, 0, 1);
    return out;
  };
  return Array.isArray(spec) ? spec.map(one) : one(spec);
}

export function numberOr(v, dflt) {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
