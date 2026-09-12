// Play — the soundboards. One board per fleet pack, generated from the pack
// itself at load time; every pad is a cue fired through js/packs.js.

import * as Packs from '../packs.js';
import { paramsFor, noteFor, defaultParams } from '../cue-params.js';
import { padForKey, keyForPad } from '../keys.js';

const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, String(v));
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
};

const LONG_PRESS_MS = 420;

export class BoardsView {
  constructor(root, { prefs }) {
    this.root = root;
    this.prefs = prefs;               // { get(key), set(key, v) }
    this.boardId = null;
    this.pads = [];                   // current board's pad models
    this.beds = new Map();            // pad index → bed handle
    this.sheet = null;
    this.onKey = this.onKey.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.held = new Set();
  }

  mount() {
    this.root.replaceChildren();
    this.tabs = el('div', { class: 'packs', role: 'tablist', 'aria-label': 'Boards' });
    this.head = el('div', { class: 'board-head' });
    this.grid = el('div', { class: 'pads', role: 'group', 'aria-label': 'Pads' });
    this.root.append(this.tabs, this.head, this.grid);
    this.renderTabs();
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('keyup', this.onKeyUp);
    const last = this.prefs.get('board');
    const ids = Packs.list().map((p) => p.id);
    this.open(ids.includes(last) ? last : ids[0]);
  }

  unmount() {
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('keyup', this.onKeyUp);
    this.stopAllBeds(0.3);
    this.closeSheet();
  }

  renderTabs() {
    this.tabs.replaceChildren(...Packs.list().map((p) => el('button', {
      class: 'pack-tab', role: 'tab', type: 'button', 'aria-selected': String(p.id === this.boardId),
      style: `--hue:${p.hue}`, dataset: { id: p.id }, onclick: () => this.open(p.id),
    }, p.name)));
  }

  async open(id) {
    if (!id) return;
    this.stopAllBeds(0.3);
    this.closeSheet();
    this.boardId = id;
    this.prefs.set('board', id);
    this.renderTabs();
    const desc = Packs.get(id).desc;
    this.root.style.setProperty('--hue', desc.hue);
    this.head.replaceChildren(
      el('h2', { class: 'board-name' }, desc.name),
      el('p', { class: 'board-place' }, desc.place || ''),
      el('p', { class: 'board-status' }, 'Loading pack…'),
    );
    this.grid.replaceChildren();
    const entry = await Packs.load(id);
    if (this.boardId !== id) return;      // switched away while loading
    const status = this.head.querySelector('.board-status');
    if (entry.status !== 'ready') {
      status.textContent = `Pack unavailable — ${entry.error || 'unknown error'}`;
      status.classList.add('is-error');
      return;
    }
    status.remove();
    this.pads = entry.pack.cues.map((c, i) => ({
      index: i, pack: id, cue: c.name, sustained: c.sustained,
      params: defaultParams(id, c.name) || (c.params ? Object.fromEntries(
        Object.entries(c.params).map(([k, d]) => [k, d[3]])) : null),
      paramSpec: paramsFor(id, c.name) || c.params || null,
      seedLock: false, seed: 1, velocity: 1,
    }));
    this.renderGrid();
    this.head.append(el('div', { class: 'board-tools' },
      el('button', { class: 'tool', type: 'button', onclick: () => this.stopAllBeds(0.4) }, 'Stop beds'),
      el('span', { class: 'tool-hint' }, 'Tap a pad, or use the keyboard rows. Hold a pad for its settings.'),
    ));
  }

  renderGrid() {
    this.grid.replaceChildren(...this.pads.map((p) => this.renderPad(p)));
  }

  renderPad(p) {
    const btn = el('button', {
      class: `pad${p.sustained ? ' is-bed' : ''}${p.paramSpec ? ' has-params' : ''}`,
      type: 'button', dataset: { index: p.index },
      'aria-label': `${p.cue}${p.sustained ? ' (bed)' : ''} — ${Packs.get(p.pack).desc.name}`,
      'aria-pressed': p.sustained ? 'false' : null,
    },
      el('span', { class: 'pad-key', 'aria-hidden': 'true' }, keyForPad(p.index)),
      el('span', { class: 'pad-name' }, p.cue),
      el('span', { class: 'pad-meta', 'aria-hidden': 'true' },
        p.sustained ? '∞ ' : '', p.paramSpec ? Object.keys(p.paramSpec).join(' · ') : ''),
    );
    let timer = null, longPressed = false;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      longPressed = false;
      timer = setTimeout(() => { longPressed = true; this.openSheet(p); }, LONG_PRESS_MS);
    });
    btn.addEventListener('pointerup', cancel);
    btn.addEventListener('pointerleave', cancel);
    btn.addEventListener('pointercancel', cancel);
    btn.addEventListener('click', (e) => {
      if (longPressed) { longPressed = false; return; }
      if (e.detail === 0) return;          // keyboard "click" — handled by keydown
      this.hit(p, btn);
    });
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); this.openSheet(p); });
    p.el = btn;
    return btn;
  }

  hit(p, btn) {
    btn = btn || p.el;
    if (p.sustained) {
      const live = this.beds.get(p.index);
      if (live && live.live) {
        live.stop(0.6);
        this.beds.delete(p.index);
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('is-live');
      } else {
        const h = Packs.startBed(p.pack, p.cue, p.params);
        if (h.live) {
          this.beds.set(p.index, h);
          btn.setAttribute('aria-pressed', 'true');
          btn.classList.add('is-live');
        }
      }
      return;
    }
    const r = Packs.fire(p.pack, p.cue, {
      params: p.params, velocity: p.velocity, seed: p.seedLock ? p.seed : undefined,
    });
    if (!r) return;
    btn.classList.remove('hit');
    void btn.offsetWidth;                  // restart the animation
    btn.classList.add('hit');
  }

  stopAllBeds(fade) {
    for (const [i, h] of this.beds) {
      h.stop(fade);
      const p = this.pads[i];
      if (p && p.el) { p.el.setAttribute('aria-pressed', 'false'); p.el.classList.remove('is-live'); }
    }
    this.beds.clear();
  }

  onKey(e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (this.sheet) return;
    if (e.key === 'Escape') { this.stopAllBeds(0.4); return; }
    const i = padForKey(e.key);
    if (i < 0 || !this.pads[i]) return;
    e.preventDefault();
    this.held.add(e.key);
    this.hit(this.pads[i]);
  }

  onKeyUp(e) { this.held.delete(e.key); }

  // ── pad sheet ─────────────────────────────────────────────────────────

  openSheet(p) {
    this.closeSheet();
    const desc = Packs.get(p.pack).desc;
    const dlg = el('dialog', { class: 'sheet', 'aria-label': `${p.cue} settings` });
    const body = el('div', { class: 'sheet-body' });
    body.append(
      el('h3', { class: 'sheet-title' }, p.cue, el('small', {}, ` · ${desc.name}`)),
      el('p', { class: 'sheet-note' }, noteFor(p.pack, p.cue)),
    );
    const live = () => this.beds.get(p.index);
    if (p.paramSpec) {
      for (const [k, def] of Object.entries(p.paramSpec)) {
        body.append(this.paramControl(k, def, p.params[k], (v) => {
          p.params[k] = v;
          const h = live();
          if (h && h.live) h.retune(p.params, 0.8);
        }));
      }
    }
    if (!p.sustained) {
      body.append(this.rangeControl('velocity', 0.05, 1, 0.01, p.velocity, (v) => { p.velocity = v; }));
      const seedRow = el('label', { class: 'ctl ctl-check' },
        el('input', { type: 'checkbox', checked: p.seedLock, onchange: (e) => {
          p.seedLock = e.target.checked; seedIn.disabled = !p.seedLock;
        } }),
        el('span', {}, 'Lock seed'),
      );
      const seedIn = el('input', { type: 'number', min: 1, max: 999999, step: 1, value: p.seed,
        disabled: !p.seedLock, 'aria-label': 'seed',
        onchange: (e) => { p.seed = Math.max(1, Math.floor(Number(e.target.value) || 1)); } });
      body.append(el('div', { class: 'ctl-row' }, seedRow, seedIn,
        el('span', { class: 'ctl-hint' }, 'Locked, the same stream plays every time — hear what per-play variation buys.')));
    }
    body.append(el('div', { class: 'sheet-actions' },
      el('button', { class: 'tool', type: 'button', onclick: () => this.hit(p) },
        p.sustained ? (live() && live().live ? 'Stop' : 'Start') : 'Play'),
      el('button', { class: 'tool tool-primary', type: 'button', onclick: () => this.closeSheet() }, 'Done'),
    ));
    dlg.append(body);
    dlg.addEventListener('close', () => { if (this.sheet === dlg) this.sheet = null; dlg.remove(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
    this.sheet = dlg;
    dlg.showModal();
  }

  closeSheet() {
    if (this.sheet) { try { this.sheet.close(); } catch (e) { /* noop */ } this.sheet = null; }
  }

  paramControl(name, def, value, onChange) {
    if (Array.isArray(def)) return this.rangeControl(name, def[0], def[1], def[2], value, onChange);
    if (def.options) {
      const sel = el('select', { onchange: (e) => onChange(coerce(e.target.value, def.options)) },
        ...def.options.map((o) => el('option', { value: String(o), selected: o === value }, String(o))));
      return el('label', { class: 'ctl' }, el('span', { class: 'ctl-name' }, name), sel);
    }
    if (def.bool) {
      return el('label', { class: 'ctl ctl-check' },
        el('input', { type: 'checkbox', checked: !!value, onchange: (e) => onChange(e.target.checked) }),
        el('span', {}, name));
    }
    return el('span');
  }

  rangeControl(name, min, max, step, value, onChange) {
    const out = el('output', {}, fmt(value));
    const input = el('input', { type: 'range', min, max, step, value, 'aria-label': name,
      oninput: (e) => { const v = Number(e.target.value); out.value = fmt(v); onChange(v); } });
    return el('label', { class: 'ctl' }, el('span', { class: 'ctl-name' }, name), input, out);
  }
}

function coerce(v, options) {
  const hit = options.find((o) => String(o) === v);
  return hit === undefined ? v : hit;
}
function fmt(v) { return Number.isInteger(v) ? String(v) : v.toFixed(2); }
