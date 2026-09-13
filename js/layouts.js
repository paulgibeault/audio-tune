// Board layouts — how a board is arranged without touching what is on it.
//
// A fleet board's pads are the pack's cues, which are read-only. The layout
// is a small document of the user's own, keyed by pack id in a store of its
// own: { v: 1, order: [cueName…], hidden: [cueName…] }. A cue the pack adds
// later appears at the end; a cue the pack drops just falls out. My boards
// carry their order in pads[] and a hidden flag on the pad itself, so the
// same helpers move items in either.

export const LAYOUT_VERSION = 1;

export function emptyLayout() { return { v: LAYOUT_VERSION, order: [], hidden: [] }; }

export function isEmptyLayout(layout) {
  return !layout || (!(layout.order && layout.order.length) && !(layout.hidden && layout.hidden.length));
}

/** Every name in layout order, pack additions appended, drops removed. */
export function fullOrder(names, layout) {
  const known = new Set(names);
  const seen = new Set();
  const out = [];
  for (const n of (layout && layout.order) || []) if (known.has(n) && !seen.has(n)) { out.push(n); seen.add(n); }
  for (const n of names) if (!seen.has(n)) { out.push(n); seen.add(n); }
  return out;
}

/** { visible, hidden } — visible in play order; hidden as a Set of names. */
export function applyLayout(names, layout) {
  const hidden = new Set(((layout && layout.hidden) || []).filter((n) => names.includes(n)));
  const all = fullOrder(names, layout);
  return { all, visible: all.filter((n) => !hidden.has(n)), hidden };
}

/** A new layout with `names[from]` moved to position `to` (indices in fullOrder). */
export function moveName(layout, names, from, to) {
  const order = moveItem(fullOrder(names, layout), from, to);
  return { v: LAYOUT_VERSION, order, hidden: [...((layout && layout.hidden) || [])] };
}

export function setHidden(layout, names, name, hidden) {
  const base = layout && layout.order && layout.order.length ? layout : { ...emptyLayout(), order: fullOrder(names, layout) };
  const h = new Set((layout && layout.hidden) || []);
  if (hidden) h.add(name); else h.delete(name);
  return { v: LAYOUT_VERSION, order: [...base.order], hidden: [...h] };
}

/** Generic: a copy of `arr` with the item at `from` moved to `to`. */
export function moveItem(arr, from, to) {
  const out = arr.slice();
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

export function validateLayout(x) {
  if (!x || typeof x !== 'object' || x.v !== LAYOUT_VERSION) throw new Error('layout: version');
  for (const k of ['order', 'hidden']) {
    if (!Array.isArray(x[k]) || x[k].length > 200 || !x[k].every((n) => typeof n === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(n))) throw new Error(`layout: ${k}`);
  }
  return true;
}

// ── store ─────────────────────────────────────────────────────────────

let store = null;
function open() {
  if (store) return store;
  const A = globalThis.Arcade;
  store = (A && A.store && typeof A.store.open === 'function') ? A.store.open('layouts') : null;
  return store;
}

export async function load(packId) {
  const s = open(); if (!s) return emptyLayout();
  try { const v = await s.get(packId); if (v) { validateLayout(v); return v; } } catch (e) { /* fall through */ }
  return emptyLayout();
}

export async function save(packId, layout) {
  const s = open(); if (!s) return false;
  try {
    if (isEmptyLayout(layout)) await s.del(packId); else await s.set(packId, JSON.parse(JSON.stringify(layout)));
    return true;
  } catch (e) { return false; }
}
