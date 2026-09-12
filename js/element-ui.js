// The controls for one element's knob state — shared by the Elements tab
// and the composer's layer cards. Given the element schema and a state
// object, builds the grid of meaningful controls (js/controls.js), with
// pairs (sweep, envelope) drawn as one picture and optionals behind a switch.

import { ELEMENTS, BODY_PRESETS } from './element-params.js';
import { kindOf, pairFor } from './param-kinds.js';
import { paramHelp } from './help.js';
import { control, el } from './controls.js';

/**
 * @param {string} name element
 * @param {object} st knob state (mutated in place)
 * @param {(key, value) => void} change called after each edit
 * @param {object} [opts] { explicitDurKey: 'dur' handled by caller? }
 */
export function elementControls(name, st, change) {
  const def = ELEMENTS[name];
  const grid = el('div', { class: 'controls' });
  const done = new Set();
  for (const [k, d] of Object.entries(def.params)) {
    if (done.has(k)) continue;
    const pair = pairFor(name, k);
    const help = paramHelp(name, k);
    if (pair && pair.kind === 'sweep') {
      done.add(pair.a); done.add(pair.b);
      grid.append(control({ kind: 'sweep', name: `${pair.a}-${pair.b}`, label: `${pair.a} → ${pair.b}`, values: { from: st[pair.a], to: st[pair.b] },
        ranges: { from: def.params[pair.a].slice(0, 3), to: def.params[pair.b].slice(0, 3) }, help: `${paramHelp(name, pair.a)} ${paramHelp(name, pair.b)}`,
        onChange: ({ from, to }) => { st[pair.a] = from; st[pair.b] = to; change(pair.b, to); } }));
      continue;
    }
    if (pair && pair.kind === 'envelope') {
      done.add(pair.a); done.add(pair.b);
      grid.append(control({ kind: 'envelope', name: `${pair.a}-${pair.b}`, label: `${pair.a} · ${pair.b}`, values: { attack: st[pair.a], dur: st[pair.b] },
        ranges: { attack: def.params[pair.a].slice(0, 3), dur: def.params[pair.b].slice(0, 3) }, help: `${paramHelp(name, pair.a)} ${paramHelp(name, pair.b)}`,
        onChange: ({ attack, dur }) => { st[pair.a] = attack; st[pair.b] = dur; change(pair.b, dur); } }));
      continue;
    }
    done.add(k);
    const meta = kindOf(name, k);
    const base = { name: k, label: meta.label || k, help, onChange: (v) => { st[k] = v; change(k, v); } };
    if (Array.isArray(d)) {
      const range = d.slice(0, 3);
      switch (meta.kind) {
        case 'pitch': grid.append(control({ ...base, kind: 'pitch', value: st[k], range })); break;
        case 'filter': grid.append(control({ ...base, kind: 'filter', filter: meta.filter, value: st[k], range })); break;
        case 'gain': grid.append(control({ ...base, kind: 'gain', value: st[k], range })); break;
        case 'time': grid.append(control({ ...base, kind: 'time', value: st[k], range })); break;
        case 'count': grid.append(control({ ...base, kind: 'count', value: st[k], range })); break;
        case 'character': grid.append(control({ ...base, kind: 'character', value: st[k], range, poles: meta.poles, unit: meta.unit, center: k === 'end' || k === 'bend' ? 1 : undefined })); break;
        default: grid.append(control({ ...base, kind: 'number', value: st[k], range }));
      }
    } else if (d.range) {
      const wrap = el('div', { class: 'optional' });
      const on = st[k] != null && st[k] !== d.off;
      const inner = () => {
        const range = d.range;
        const val = (st[k] == null || st[k] === d.off) ? (meta.kind === 'filter' ? Math.sqrt(range[0] * range[1]) : (range[0] + range[1]) / 2) : st[k];
        if (meta.kind === 'filter') return control({ ...base, kind: 'filter', filter: meta.filter, value: val, range });
        if (meta.kind === 'pitch') return control({ ...base, kind: 'pitch', value: val, range });
        return control({ ...base, kind: 'character', value: val, range, poles: meta.poles, unit: meta.unit, center: k === 'bend' ? 1 : undefined });
      };
      let ctl = on ? inner() : null;
      const sw = control({ kind: 'toggle', name: `${k}-on`, label: `${meta.label || k} (optional)`, value: on, help: `${help} Off leaves it to the library's default behaviour.`,
        onChange: (v) => { if (v) { ctl = inner(); wrap.append(ctl); st[k] = ctl.value; change(k, st[k]); } else { if (ctl) ctl.remove(); ctl = null; st[k] = d.off; change(k, d.off); } } });
      wrap.append(sw); if (ctl) wrap.append(ctl);
      grid.append(wrap);
    } else if (d.options) {
      grid.append(control({ ...base, kind: 'choice', value: st[k], options: d.options }));
    } else if (d.preset) {
      const current = typeof st[k] === 'string' ? st[k] : d.preset[0];
      const list = BODY_PRESETS[current] || BODY_PRESETS[d.preset[0]];
      grid.append(control({ ...base, kind: 'partials', value: list, presets: BODY_PRESETS, onChange: (v) => {
        // a preset chip sets a name; a dragged bar makes the table itself the value
        const hit = Object.entries(BODY_PRESETS).find(([, p]) => JSON.stringify(p) === JSON.stringify(v));
        st[k] = hit ? hit[0] : v.map((x) => ({ ...x }));
        change(k, st[k]);
      } }));
    }
  }
  return grid;
}
