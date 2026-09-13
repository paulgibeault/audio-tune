// How a card's controls are organised (docs/ux-pass-2026-09.md): every
// control has a ROLE — what it does to the sound — and cards show the same
// roles in the same order. A layer shows its ESSENTIALS first; the rest sit
// under "More" unless the user has asked for every control. Pure, so the
// rule is tested and the views only draw it.

export const ROLES = ['pitch', 'shape', 'tone', 'level'];
export const ROLE_LABEL = { pitch: 'Pitch', shape: 'Shape', tone: 'Tone', level: 'Level' };

const ROLE_OF_KIND = {
  pitch: 'pitch', sweep: 'pitch', partials: 'pitch',
  time: 'shape', envelope: 'shape', count: 'shape', offset: 'shape',
  filter: 'tone', character: 'tone', choice: 'tone', toggle: 'tone', number: 'tone',
  gain: 'level', distance: 'level',
};

export function roleOf(kind) { return ROLE_OF_KIND[kind] || 'tone'; }

// The controls that make a layer THIS sound: where it sits, how long it
// lasts, how loud it is — and anything the pack draws fresh on every play,
// because that is what the pack's author decided matters.
const ESSENTIAL_KINDS = new Set(['pitch', 'sweep', 'partials', 'envelope', 'gain', 'distance']);

export function isEssential({ kind, name = '', varied = false }) {
  if (varied) return true;
  if (ESSENTIAL_KINDS.has(kind)) return true;
  if (kind === 'time' && /(^|-)dur$/.test(name)) return true;
  return false;
}

/**
 * Split a card's controls into role groups. `items` are { kind, name,
 * varied, ...anything }. Returns { groups, more } where each is a list of
 * { role, label, items } in ROLES order; `more` is empty when `expert` is
 * set, or when hiding would leave only one control behind.
 */
export function organize(items, { expert = false } = {}) {
  let essential = items, rest = [];
  if (!expert) {
    essential = items.filter((it) => isEssential(it));
    rest = items.filter((it) => !isEssential(it));
    if (rest.length <= 1) { essential = items; rest = []; }
  }
  return { groups: byRole(essential), more: byRole(rest) };
}

export function byRole(items) {
  const out = [];
  for (const role of ROLES) {
    const its = items.filter((it) => roleOf(it.kind) === role);
    if (its.length) out.push({ role, label: ROLE_LABEL[role], items: its });
  }
  return out;
}
