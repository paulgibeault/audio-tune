// Validation for everything that crosses a trust boundary: share codes,
// config pushes from a linked device, imported files, and (defensively) what
// comes back out of the store. Treat every field as an attacker's input:
// types, lengths, ranges, and only known packs and cue-shaped names. Rendering
// stays textContent-only elsewhere; this is the shape check.

export const BOARD_VERSION = 1;
export const RIFF_VERSION = 1;
export const CUE_VERSION = 1;
export const BOARD_SIZES = [16, 32, 48];

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const CUE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const PARAM_KEY = /^[a-z][a-zA-Z0-9]{0,15}$/;
const ELEMENT = /^[a-z]{2,16}$/;

function fail(what, m) { throw new Error(`${what}: ${m}`); }

export function checkParams(params, what) {
  if (params == null) return;
  if (typeof params !== 'object' || Array.isArray(params) || Object.keys(params).length > 12) fail(what, 'params');
  for (const [k, v] of Object.entries(params)) {
    if (!PARAM_KEY.test(k)) fail(what, `param key ${k}`);
    const ok = (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e6) || typeof v === 'boolean'
      || (typeof v === 'string' && v.length <= 16)
      || (Array.isArray(v) && v.length <= 16 && v.every((x) => x && typeof x === 'object' && Object.keys(x).length <= 8 && Object.values(x).every((y) => typeof y === 'number' && Number.isFinite(y))));
    if (!ok) fail(what, `param value ${k}`);
  }
}

export function checkPad(p, { packs = null } = {}, what = 'pad') {
  if (p === null) return;
  if (!p || typeof p !== 'object') fail(what, 'not an object');
  if (!ID.test(p.pack)) fail(what, 'pack');
  if (packs && !packs.includes(p.pack)) fail(what, `unknown pack ${p.pack}`);
  if (!CUE.test(p.cue)) fail(what, 'cue');
  checkParams(p.params, what);
  if (p.label != null && (typeof p.label !== 'string' || p.label.length > 24)) fail(what, 'label');
  if (p.velocity != null && !(p.velocity >= 0 && p.velocity <= 1)) fail(what, 'velocity');
  if (p.seedLock != null && typeof p.seedLock !== 'boolean') fail(what, 'seedLock');
  if (p.seed != null && !(Number.isInteger(p.seed) && p.seed >= 0 && p.seed < 1e7)) fail(what, 'seed');
  if (p.hidden != null && typeof p.hidden !== 'boolean') fail(what, 'hidden');
}

/** A stored / imported board. */
export function validateBoard(x, opts = {}) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) fail('board', 'not an object');
  if (x.v !== BOARD_VERSION) fail('board', `version ${x.v}`);
  if (!ID.test(x.id)) fail('board', 'id');
  if (typeof x.name !== 'string' || !x.name.length || x.name.length > 40) fail('board', 'name');
  if (!Array.isArray(x.pads) || !BOARD_SIZES.includes(x.pads.length)) fail('board', 'pads');
  x.pads.forEach((p, i) => checkPad(p, opts, `pad ${i + 1}`));
  return true;
}

/** Compact a board for a share code / config payload. */
export function packBoard(board) {
  return {
    v: BOARD_VERSION, n: board.name, s: board.pads.length,
    // a hidden pad carries a sixth element; older codes have five
    p: board.pads.map((p) => (p ? [p.pack, p.cue, p.params || 0, p.label || 0, p.velocity == null ? 1 : +p.velocity.toFixed(2), ...(p.hidden ? [1] : [])] : 0)),
  };
}

/** Expand a compact board, validating it. `mkId` supplies a fresh id. */
export function unpackBoard(c, mkId, opts = {}) {
  if (!c || typeof c !== 'object' || c.v !== BOARD_VERSION) fail('board', 'version');
  if (!Array.isArray(c.p) || !BOARD_SIZES.includes(c.p.length)) fail('board', 'pads');
  const board = {
    v: BOARD_VERSION, id: mkId(), name: typeof c.n === 'string' ? c.n.slice(0, 40) || 'Imported board' : 'Imported board',
    pads: c.p.map((e) => {
      if (!Array.isArray(e)) return null;
      const [pack, cue, params, label, velocity, hidden] = e;
      return { pack, cue, params: params && typeof params === 'object' ? params : null, label: typeof label === 'string' ? label : null, velocity: typeof velocity === 'number' ? velocity : 1, seedLock: false, seed: 1, ...(hidden === 1 ? { hidden: true } : {}) };
    }),
    updated: Date.now(),
  };
  validateBoard(board, opts);
  return board;
}

/** A riff: pad hits with offsets, up to a few bars. */
export function validateRiff(x, opts = {}) {
  if (!x || typeof x !== 'object') fail('riff', 'not an object');
  if (x.v !== RIFF_VERSION) fail('riff', `version ${x.v}`);
  if (!Array.isArray(x.h) || !x.h.length || x.h.length > 128) fail('riff', 'hits');
  for (const h of x.h) {
    if (!Array.isArray(h) || h.length < 3) fail('riff', 'hit');
    const [at, pack, cue, params, vel, seed] = h;
    if (!(typeof at === 'number' && at >= 0 && at <= 30)) fail('riff', 'hit time');
    checkPad({ pack, cue, params: params && typeof params === 'object' ? params : null, velocity: vel == null ? 1 : vel, seed: seed == null ? 1 : seed }, opts, 'riff hit');
  }
  return true;
}

/** A user cue from the composer: layers of library gestures. */
export function validateUserCue(x, { elements = null } = {}) {
  if (!x || typeof x !== 'object') fail('cue', 'not an object');
  if (x.v !== CUE_VERSION) fail('cue', `version ${x.v}`);
  if (!ID.test(x.id)) fail('cue', 'id');
  if (!CUE.test(x.name)) fail('cue', 'name (lowercase, digits, dashes)');
  if (!Array.isArray(x.layers) || !x.layers.length || x.layers.length > 12) fail('cue', 'layers');
  for (const L of x.layers) {
    if (!L || typeof L !== 'object') fail('cue', 'layer');
    if (!ELEMENT.test(L.el)) fail('cue', 'layer element');
    if (elements && !elements.includes(L.el)) fail('cue', `unknown element ${L.el}`);
    if (!(typeof L.at === 'number' && L.at >= 0 && L.at <= 10)) fail('cue', 'layer offset');
    if (L.dur != null && !(typeof L.dur === 'number' && L.dur > 0 && L.dur <= 60)) fail('cue', 'layer dur');
    checkParams(L.params, 'cue layer');
    if (L.vary != null) checkParams(L.vary, 'cue layer vary');
  }
  if (x.send != null && !(x.send >= 0 && x.send <= 1)) fail('cue', 'send');
  if (x.room != null) {
    if (typeof x.room !== 'object') fail('cue', 'room');
    for (const [k, v] of Object.entries(x.room)) if (!/^[a-zA-Z]{2,10}$/.test(k) || typeof v !== 'number' || !Number.isFinite(v)) fail('cue', `room ${k}`);
  }
  return true;
}
