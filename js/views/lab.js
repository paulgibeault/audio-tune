// Explore — Fleet sounds (a cue as an editable recipe), Elements (one gesture
// at a time), and the Guide. Design: docs/explore-design.md.

import * as Packs from '../packs.js';
import * as Rec from '../recorder.js';
import { ELEMENTS, ELEMENT_NAMES, BODY_PRESETS } from '../element-params.js';
import { CUE_PARAMS, noteFor, defaultParams } from '../cue-params.js';
import { kindOf, pairFor } from '../param-kinds.js';
import { KINDS, PANELS, GUIDE, paramHelp } from '../help.js';
import { control, dice, panelHelp, el, fmtMs, fmtHz } from '../controls.js';
import { defaultsFor, buildParams, explicitDur, snippet, semitoneForKey, noteName, ROOM_KNOBS, ROOM_PRESETS, roomState, num } from '../lab.js';

const E = () => window.ArcadeAudioElements;

const ROOM_META = {
  dur: { kind: 'time', label: 'length', help: 'How long the tail runs before it is gone.' },
  decay: { kind: 'time', label: 'decay', help: 'How fast the tail dies. Short is a small dry room; long is a hall or open water.' },
  preDelay: { kind: 'time', label: 'pre-delay', help: 'The gap before the first reflection arrives — the size of the space in front of you.' },
  wet: { kind: 'character', label: 'wet', poles: ['dry', 'wet'], help: 'The room\'s overall level against the dry sound.' },
  shelfHz: { kind: 'filter', filter: 'lowpass', label: 'warmth', help: 'A high-shelf cut above this frequency, so nothing reads as brittle or digital.' },
  shelfDb: { kind: 'character', label: 'shelf cut', poles: ['deep cut', 'no cut'], unit: 'dB', help: 'How hard the shelf cuts the top end.' },
};

export class LabView {
  constructor(root, { prefs }) {
    this.root = root;
    this.prefs = prefs;
    this.tab = prefs.get('labTab') || 'fleet';
    // fleet recipe state
    this.packId = prefs.get('labPack') || '';
    this.cueName = prefs.get('labCue') || '';
    this.recipe = null; this.entry = null; this.cue = null;
    this.overrides = {}; this.takeNo = 1; this.locked = false; this.auditionOnChange = true;
    this.cueParams = null;
    // element state
    this.element = prefs.get('labElement') || 'strike';
    this.state = {}; this.vary = true; this.cents = 15; this.seed = 1; this.keyboard = false; this.octave = 0;
    // room + plumbing
    this.send = 0.25; this.room = { ...ROOM_PRESETS.default, seed: 7 }; this.roomName = 'default';
    this.labOut = null; this.labBus = null; this.analyser = null; this.loop = null; this.activeUntil = 0;
    this.beds = []; this.holdTimer = null; this.playTimer = null;
    this.onKey = this.onKey.bind(this);
  }

  // ── lifecycle ─────────────────────────────────────────────────────────

  mount() {
    Rec.install(window);
    this.root.replaceChildren();
    this.root.style.setProperty('--hue', 190);
    this.tabs = el('div', { class: 'subtabs', role: 'tablist', 'aria-label': 'Explore' });
    this.body = el('div', { class: 'lab-body' });
    this.scope = el('section', { class: 'lab-scope card' });
    this.root.append(this.tabs, this.body, this.scope);
    this.renderTabs();
    this.renderScope();
    this.showTab(this.tab);
    document.addEventListener('keydown', this.onKey);
  }

  unmount() {
    document.removeEventListener('keydown', this.onKey);
    this.stopAllBeds(0.3);
    if (this.loop) { this.loop.dispose(); this.loop = null; }
    if (this.labOut) { try { this.labOut.disconnect(); } catch (e) { /* noop */ } }
    if (this.analyser) { try { this.analyser.disconnect(); } catch (e) { /* noop */ } }
    this.labOut = this.labBus = this.analyser = null;
  }

  stopAllBeds(fade) { for (const h of this.beds) h.stop(fade); this.beds = []; }

  renderTabs() {
    const T = [['fleet', 'Fleet sounds'], ['elements', 'Elements'], ['guide', 'Guide']];
    this.tabs.replaceChildren(...T.map(([id, label]) => el('button', { class: 'subtab', role: 'tab', type: 'button', 'aria-selected': String(id === this.tab), onclick: () => this.showTab(id) }, label)));
  }

  showTab(id) {
    this.tab = id; this.prefs.set('labTab', id); this.renderTabs();
    this.stopAllBeds(0.3);
    this.body.replaceChildren();
    if (id === 'fleet') this.renderFleet();
    else if (id === 'elements') this.renderElements();
    else this.renderGuide();
  }

  // ── audio plumbing ────────────────────────────────────────────────────

  bus() {
    if (this.labBus) return this.labBus;
    const sdk = Packs.sdkBus();
    if (!sdk) return null;
    const ctx = sdk.ctx;
    this.labOut = ctx.createGain(); this.labOut.connect(sdk.dry);
    this.labBus = E().createBus(ctx, this.labOut, this.room);
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.6;
      sdk.dry.connect(this.analyser);
    }
    return this.labBus;
  }

  rebuildRoom() {
    if (this.labOut) { try { this.labOut.disconnect(); } catch (e) { /* noop */ } }
    this.labOut = null; this.labBus = null;
  }

  // ── FLEET SOUNDS ──────────────────────────────────────────────────────

  renderFleet() {
    const packSel = el('select', { 'aria-label': 'game', onchange: () => { this.packId = packSel.value; this.cueName = ''; this.prefs.set('labPack', this.packId); this.pickPack(); } },
      el('option', { value: '' }, 'Pick a game…'),
      ...Packs.list().filter((p) => p.kind === 'graph').map((p) => el('option', { value: p.id, selected: p.id === this.packId }, p.name)));
    this.cueSel = el('select', { 'aria-label': 'sound', disabled: true, onchange: () => { this.cueName = this.cueSel.value; this.prefs.set('labCue', this.cueName); this.pickCue(); } });
    this.recipeRoot = el('div', { class: 'recipe' });
    this.body.append(
      el('section', { class: 'card' },
        el('h2', { class: 'card-h' }, 'Fleet sounds', panelHelp(PANELS.fleet.title, PANELS.fleet.body)),
        el('p', { class: 'card-sub' }, 'Pick a game and one of its sounds. You will see exactly how it is made — and you can change any of it.'),
        el('div', { class: 'row' }, packSel, this.cueSel)),
      this.recipeRoot,
    );
    if (this.packId) this.pickPack();
  }

  async pickPack() {
    this.cueSel.disabled = true; this.cueSel.replaceChildren(); this.recipeRoot.replaceChildren();
    if (!this.packId) return;
    this.recipeRoot.append(el('p', { class: 'card-sub' }, 'Loading pack…'));
    const entry = await Packs.load(this.packId);
    if (this.tab !== 'fleet') return;
    this.recipeRoot.replaceChildren();
    if (entry.status !== 'ready') { this.recipeRoot.append(el('p', { class: 'board-status is-error' }, `Pack unavailable — ${entry.error}`)); return; }
    this.entry = entry;
    this.cueSel.replaceChildren(el('option', { value: '' }, 'Pick a sound…'),
      ...entry.pack.cues.map((c) => el('option', { value: c.name, selected: c.name === this.cueName }, c.name + (c.sustained ? ' (bed)' : ''))));
    this.cueSel.disabled = false;
    if (this.cueName && entry.pack.cues.some((c) => c.name === this.cueName)) this.pickCue();
  }

  pickCue() {
    this.stopAllBeds(0.3);
    this.overrides = {}; this.takeNo = 1; this.locked = false;
    this.cue = this.entry && this.entry.pack.cues.find((c) => c.name === this.cueName);
    this.recipeRoot.replaceChildren();
    if (!this.cue) return;
    this.cueParams = defaultParams(this.packId, this.cueName);
    this.takeSeed = Packs.nextSeed();
    this.record();
    this.renderRecipe();
  }

  record() {
    const ctx = new OfflineAudioContext(1, 1, 48000);
    const out = ctx.createGain();
    const params = this.cue.sustained ? { ...(this.cueParams || {}), dur: 8 } : this.cueParams;
    try {
      this.recipe = Rec.recordRecipe(this.cue.fn, { ctx, out, params, seed: this.takeSeed, takes: 3 });
      this.recipeError = null;
    } catch (err) {
      this.recipe = null; this.recipeError = err && err.message ? err.message : String(err);
    }
    // drop overrides for layers that no longer exist
    for (const k of Object.keys(this.overrides)) if (!this.recipe || !this.recipe.layers[k]) delete this.overrides[k];
  }

  renderRecipe() {
    const R = this.recipeRoot;
    R.replaceChildren();
    if (!this.recipe) { R.append(el('p', { class: 'board-status is-error' }, `Could not record this cue — ${this.recipeError}`)); return; }
    const meta = (CUE_PARAMS[this.packId] || {})[this.cueName] || {};
    const desc = this.entry.desc;

    // header + transport
    const head = el('section', { class: 'card recipe-head' },
      el('h2', { class: 'card-h' }, this.cueName, el('small', {}, ` · ${desc.name}`), panelHelp(PANELS.layer.title, PANELS.layer.body)),
      el('p', { class: 'card-sub' }, noteFor(this.packId, this.cueName) || '—'),
      el('p', { class: 'recipe-facts' },
        `${this.recipe.layers.length} gesture${this.recipe.layers.length === 1 ? '' : 's'} · send ${num(this.cue.send)} · room: ${desc.name}${this.cue.sustained ? ' · bed (8 s take)' : ''}${this.recipe.countVaried ? ' · some plays add or drop a layer' : ''}`),
    );
    const transport = el('div', { class: 'transport' },
      el('button', { class: 'tool tool-primary', type: 'button', onclick: () => this.playRecipe(false) }, '▶ Play'),
      el('button', { class: 'tool', type: 'button', onclick: () => this.playRecipe(true) }, 'Original'),
      el('button', { class: 'tool', type: 'button', onclick: () => this.reroll() }, '⚄ Re-roll'),
      el('button', { class: 'tool', type: 'button', onclick: () => { this.overrides = {}; this.renderRecipe(); } }, 'Reset'),
      el('label', { class: 'control-opt' }, el('input', { type: 'checkbox', checked: this.auditionOnChange, onchange: (e) => { this.auditionOnChange = e.target.checked; } }), el('span', {}, 'play on change')),
      el('span', { class: 'take-label' }, `take #${this.takeNo}`),
      panelHelp(PANELS.transport.title, PANELS.transport.body),
    );
    head.append(transport);
    if (this.cueParams) {
      const pc = el('div', { class: 'row cue-params' }, el('span', { class: 'card-sub' }, 'the game passes:'));
      for (const [k, v] of Object.entries(this.cueParams)) {
        const spec = meta.params && meta.params[k];
        if (Array.isArray(spec)) {
          pc.append(control({ kind: 'count', name: k, label: k, value: v, range: [spec[0], spec[1], spec[2]], help: `The game passes \`${k}\` to this cue per play; the recipe is recorded with this value.`,
            onChange: (nv) => { this.cueParams[k] = nv; this.record(); this.renderRecipe(); if (this.auditionOnChange) this.playRecipe(false); } }));
        } else if (spec && spec.options) {
          pc.append(control({ kind: 'choice', name: k, label: k, value: v, options: spec.options, help: `The game passes \`${k}\` to this cue.`,
            onChange: (nv) => { this.cueParams[k] = nv; this.record(); this.renderRecipe(); if (this.auditionOnChange) this.playRecipe(false); } }));
        } else if (spec && spec.bool) {
          pc.append(control({ kind: 'toggle', name: k, label: k, value: v, help: `The game passes \`${k}\` to this cue.`,
            onChange: (nv) => { this.cueParams[k] = nv; this.record(); this.renderRecipe(); if (this.auditionOnChange) this.playRecipe(false); } }));
        }
      }
      head.append(pc);
    }
    R.append(head);

    // timeline
    R.append(this.renderTimeline());

    // layers
    this.recipe.layers.forEach((L) => R.append(this.renderLayer(L)));

    // code
    const code = el('pre', { class: 'lab-code', tabindex: '0' });
    const refresh = () => { code.textContent = Rec.cueSource(this.cueName, this.recipe, { end: typeof this.recipe.end === 'number' ? this.recipe.end : this.lastDur, overrides: this.overrides }); };
    this.refreshCode = refresh;
    refresh();
    R.append(el('section', { class: 'card' },
      el('h3', { class: 'card-h' }, 'Recreate it — pack code', panelHelp(PANELS.code.title, PANELS.code.body)),
      el('p', { class: 'card-sub' }, 'This take, with your changes, as a cue for a game\'s js/soundpack.js.'),
      el('div', { class: 'row' }, el('button', { class: 'tool', type: 'button', onclick: () => this.copy(code.textContent) }, 'Copy')),
      code));
  }

  renderTimeline() {
    const layers = this.recipe.layers;
    const roomTail = (this.entry.pack.room && this.entry.pack.room.dur) || 1;
    const ends = layers.map((L) => this.at(L) + (this.durOf(L) || 0.05));
    const lastEnd = ends.length ? Math.max(...ends) : 0;
    const span = Math.max(0.2, lastEnd) + roomTail;
    const wrap = el('section', { class: 'card timeline-card' },
      el('h3', { class: 'card-h' }, 'Timeline', panelHelp(PANELS.timeline.title, PANELS.timeline.body)));
    const tl = el('div', { class: 'timeline', style: `--span:${span}` });
    const tail = el('div', { class: 'tl-room', style: `left:${(lastEnd / span) * 100}%; width:${(roomTail / span) * 100}%` }, el('span', {}, 'room'));
    tl.append(tail);
    layers.forEach((L, i) => {
      const at = this.at(L), d = this.durOf(L) || 0.05;
      const block = el('button', { class: `tl-block${L.atVaried ? ' is-varied' : ''}`, type: 'button', style: `left:${(at / span) * 100}%; width:${Math.max(1.5, (d / span) * 100)}%; --i:${i}`,
        'aria-label': `${L.el} at ${fmtMs(at)}, ${fmtMs(d)} long — drag to move, tap to jump`,
        onclick: () => { const c = this.recipeRoot.querySelector(`[data-layer="${L.i}"]`); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
        el('span', {}, L.el));
      // drag to move
      let startX = 0, startAt = 0, moved = false;
      block.addEventListener('pointerdown', (e) => { startX = e.clientX; startAt = at; moved = false; block.setPointerCapture(e.pointerId); });
      block.addEventListener('pointermove', (e) => {
        if (!block.hasPointerCapture(e.pointerId)) return;
        const dx = (e.clientX - startX) / tl.getBoundingClientRect().width * span;
        if (Math.abs(dx) > 0.002) moved = true;
        const nat = Math.max(0, Math.round((startAt + dx) * 1000) / 1000);
        this.setOverride(L.i, { at: nat });
        block.style.left = `${(nat / span) * 100}%`;
      });
      block.addEventListener('pointerup', () => { if (moved) { this.renderRecipe(); if (this.auditionOnChange) this.playRecipe(false); } });
      tl.append(block);
    });
    const ruler = el('div', { class: 'tl-ruler' });
    const step = span > 4 ? 1 : span > 1.5 ? 0.5 : span > 0.6 ? 0.2 : 0.05;
    for (let t = 0; t <= span; t += step) ruler.append(el('span', { style: `left:${(t / span) * 100}%` }, fmtMs(t)));
    wrap.append(tl, ruler);
    return wrap;
  }

  at(L) { const ov = this.overrides[L.i]; return ov && typeof ov.at === 'number' ? ov.at : L.at; }
  durOf(L) {
    const ov = this.overrides[L.i];
    if (L.dur != null) return ov && typeof ov.dur === 'number' ? ov.dur : L.dur;
    const p = this.paramsOf(L);
    if (typeof p.dur === 'number') return p.dur;
    if (L.el === 'body' && Array.isArray(p.partials)) return Math.max(...p.partials.map((x) => (x.delay || 0) + (x.decay || 0)));
    const d = ELEMENTS[L.el] && ELEMENTS[L.el].params.dur;
    return Array.isArray(d) ? d[3] : 0.1;
  }
  paramsOf(L) { const ov = this.overrides[L.i]; return ov && ov.params ? { ...L.params, ...ov.params } : L.params; }
  setOverride(i, patch) {
    const ov = this.overrides[i] || (this.overrides[i] = {});
    if (patch.params) ov.params = { ...(ov.params || {}), ...patch.params };
    if ('at' in patch) ov.at = patch.at;
    if ('dur' in patch) ov.dur = patch.dur;
  }
  changed(L, k) { const ov = this.overrides[L.i]; return !!(ov && ov.params && k in ov.params); }

  renderLayer(L) {
    const def = ELEMENTS[L.el] || { params: {}, note: '' };
    const p = this.paramsOf(L);
    const card = el('section', { class: 'card layer', dataset: { layer: L.i }, style: `--i:${L.i}` },
      el('h3', { class: 'card-h' }, el('span', { class: 'layer-no' }, `${L.i + 1}`), L.el,
        el('small', {}, ` at ${fmtMs(this.at(L))}${L.atVaried ? ' · timing varies' : ''}`),
        panelHelp(`${L.el}`, def.note || KINDS.number.body)),
      el('p', { class: 'card-sub' }, def.note || ''));
    const grid = el('div', { class: 'controls' });
    const done = new Set();
    const onChange = (patch) => { this.setOverride(L.i, patch); this.afterChange(); };
    const keys = Object.keys(p).filter((k) => k !== 'seed');
    for (const k of keys) {
      if (done.has(k)) continue;
      const v = p[k];
      const pair = pairFor(L.el, k);
      const spec = def.params[k];
      const help = paramHelp(L.el, k);
      const varied = L.varied.includes(k);
      // explicit-dur elements: the duration is the 4th argument, not a param
      if (pair && pair.kind === 'sweep' && p[pair.a] != null && p[pair.b] != null) {
        done.add(pair.a); done.add(pair.b);
        const c = control({ kind: 'sweep', name: `${pair.a}-${pair.b}`, label: `${pair.a} → ${pair.b}`, values: { from: p[pair.a], to: p[pair.b] },
          ranges: { from: rangeFor(def, pair.a, p[pair.a]), to: rangeFor(def, pair.b, p[pair.b]) },
          help: `${paramHelp(L.el, pair.a)} ${paramHelp(L.el, pair.b)}`, varied: L.varied.includes(pair.a) || L.varied.includes(pair.b),
          onChange: ({ from, to }) => onChange({ params: { [pair.a]: from, [pair.b]: to } }) });
        c.setChanged(this.changed(L, pair.a) || this.changed(L, pair.b));
        grid.append(c); continue;
      }
      if (pair && pair.kind === 'envelope' && (p[pair.b] != null || L.dur != null)) {
        done.add(pair.a); done.add(pair.b);
        const durVal = L.dur != null ? (this.durOf(L)) : p[pair.b];
        const c = control({ kind: 'envelope', name: `${pair.a}-${pair.b}`, label: `${pair.a} · ${pair.b}`, values: { attack: p[pair.a] ?? null, dur: durVal },
          ranges: { attack: p[pair.a] != null ? rangeFor(def, pair.a, p[pair.a]) : null, dur: rangeFor(def, pair.b, durVal) },
          help: `${paramHelp(L.el, pair.a)} ${paramHelp(L.el, pair.b)}`, varied: L.varied.includes(pair.a) || L.varied.includes(pair.b) || L.varied.includes('dur'),
          onChange: ({ attack, dur }) => {
            const patch = { params: {} };
            if (p[pair.a] != null) patch.params[pair.a] = attack;
            if (L.dur != null) patch.dur = dur; else patch.params[pair.b] = dur;
            onChange(patch);
          } });
        c.setChanged(this.changed(L, pair.a) || this.changed(L, pair.b) || (this.overrides[L.i] && 'dur' in this.overrides[L.i]));
        grid.append(c); continue;
      }
      done.add(k);
      const c = this.controlFor(L.el, k, v, spec, help, varied, (nv) => onChange({ params: { [k]: nv } }));
      if (c) { c.setChanged(this.changed(L, k)); grid.append(c); }
    }
    if (L.dur != null && !done.has('dur')) {
      const c = control({ kind: 'time', name: 'dur', label: 'length', value: this.durOf(L), range: rangeFor(def, 'dur', this.durOf(L)), help: paramHelp(L.el, 'dur'), varied: L.varied.includes('dur'),
        onChange: (nv) => onChange({ dur: nv }) });
      c.setChanged(!!(this.overrides[L.i] && 'dur' in this.overrides[L.i]));
      grid.append(c);
    }
    if ('seed' in p) {
      const c = control({ kind: 'time', name: 'seed', label: 'seed', value: 0, range: [0, 1, 1], help: '' });
      c.remove(); // seeds are shown once, on the transport's take — not per layer
    }
    card.append(grid);
    return card;
  }

  controlFor(element, k, v, spec, help, varied, onChange) {
    const meta = kindOf(element, k);
    const base = { name: k, label: meta.label || k, value: v, help, varied, onChange };
    if (meta.kind === 'partials' || (Array.isArray(v) && v.length && typeof v[0] === 'object' && 'ratio' in v[0])) {
      return control({ ...base, kind: 'partials', presets: BODY_PRESETS });
    }
    if (typeof v === 'boolean') return control({ ...base, kind: 'toggle' });
    if (typeof v === 'string') {
      const options = spec && spec.options ? spec.options : [v];
      return control({ ...base, kind: 'choice', options: options.includes(v) ? options : [v, ...options] });
    }
    if (typeof v !== 'number') return null;
    const range = rangeFor(ELEMENTS[element] || { params: {} }, k, v);
    switch (meta.kind) {
      case 'pitch': return control({ ...base, kind: 'pitch', range });
      case 'filter': return control({ ...base, kind: 'filter', filter: meta.filter, range });
      case 'gain': return control({ ...base, kind: 'gain', range: [0, 1, 0.005] });
      case 'time': return control({ ...base, kind: 'time', range });
      case 'count': return control({ ...base, kind: 'count', range: [range[0], range[1], 1] });
      case 'character': return control({ ...base, kind: 'character', range, poles: meta.poles, unit: meta.unit, center: k === 'end' || k === 'bend' ? 1 : undefined });
      default: return control({ ...base, kind: 'number', range });
    }
  }

  afterChange() {
    if (this.refreshCode) this.refreshCode();
    // mark changed dots without a full re-render
    this.recipeRoot.querySelectorAll('.layer').forEach((card) => {
      const i = Number(card.dataset.layer);
      const ov = this.overrides[i];
      card.querySelectorAll('.control').forEach((c) => {
        const name = c.dataset.param || '';
        const parts = name.split('-');
        const hit = ov && ((ov.params && parts.some((k) => k in ov.params)) || (name.includes('dur') && 'dur' in ov));
        c.classList.toggle('is-changed', !!hit);
      });
    });
    if (this.auditionOnChange) {
      clearTimeout(this.playTimer);
      this.playTimer = setTimeout(() => this.playRecipe(false), 140);
    }
  }

  playRecipe(original) {
    if (!this.cue || !this.entry || !Packs.enabled()) return;
    const lib = Rec.library() || E();
    const sdk = Packs.sdkBus(); if (!sdk) return;
    const bus = Packs.busFor(this.packId); if (!bus) return;
    const ctx = bus.ctx;
    const o = lib.out(bus, this.cue.send);
    const when = ctx.currentTime + 0.02;
    const params = this.cue.sustained ? { ...(this.cueParams || {}), dur: 8 } : this.cueParams;
    let res;
    try {
      res = Rec.run(() => this.cue.fn(ctx, o, when, params, lib.rng(this.takeSeed)), { when, overrides: original ? null : this.overrides });
    } catch (err) { console.warn('[audio-tune] recipe play threw:', err); try { o.disconnect(); } catch (e) { /* noop */ } return; }
    const r = res.result;
    if (typeof r === 'function') {
      const handle = { live: true, stop: (fade) => { handle.live = false; const now = ctx.currentTime, f = fade || 0.4; try { o.gain.setValueAtTime(Math.max(o.gain.value, 1e-4), now); o.gain.exponentialRampToValueAtTime(1e-4, now + f); } catch (e) { /* noop */ } try { r(now + f); } catch (e) { /* noop */ } setTimeout(() => { try { o.disconnect(); } catch (e) { /* noop */ } }, (f + 0.2) * 1000); } };
      this.stopAllBeds(0.2);
      this.beds.push(handle);
      setTimeout(() => { if (handle.live) handle.stop(0.5); }, 8000);
      this.lastDur = 8;
    } else {
      this.lastDur = typeof r === 'number' ? r : 1;
      const tail = (this.entry.pack.room && this.entry.pack.room.dur) || 1;
      setTimeout(() => { try { o.disconnect(); } catch (e) { /* noop */ } }, (this.lastDur + tail + 0.5) * 1000);
    }
    if (this.refreshCode) this.refreshCode();
    this.wakeScope(this.lastDur + ((this.entry.pack.room && this.entry.pack.room.dur) || 1));
  }

  reroll() {
    if (this.locked) return;
    this.takeSeed = Packs.nextSeed(); this.takeNo += 1;
    this.record(); this.renderRecipe();
    if (this.auditionOnChange) this.playRecipe(false);
  }

  async copy(text) {
    let ok = false;
    if (window.Arcade && Arcade.ui && typeof Arcade.ui.copy === 'function') { try { ok = await Arcade.ui.copy(text); } catch (e) { ok = false; } }
    if (!ok && navigator.clipboard) { try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; } }
    if (window.Arcade && Arcade.ui && Arcade.ui.toast) Arcade.ui.toast(ok ? 'Copied as pack code' : 'Select the code and copy it', { kind: ok ? 'success' : 'info', duration: 1600 });
  }

  // ── ELEMENTS ──────────────────────────────────────────────────────────

  knobs() { if (!this.state[this.element]) this.state[this.element] = defaultsFor(this.element); return this.state[this.element]; }

  renderElements() {
    const lib = E() || {};
    this.side = el('nav', { class: 'lab-side', 'aria-label': 'Elements' });
    this.panel = el('section', { class: 'card' });
    this.roomPanel = el('section', { class: 'card' });
    this.body.append(el('div', { class: 'lab' }, this.side, el('div', { class: 'lab-main' }, this.panel, this.roomPanel)));
    const renderSide = () => this.side.replaceChildren(
      el('h2', { class: 'card-h side-h' }, 'Elements', panelHelp(PANELS.elements.title, PANELS.elements.body)),
      ...ELEMENT_NAMES.map((n) => el('button', {
        class: `lab-el${n === this.element ? ' is-current' : ''}`, type: 'button', 'aria-pressed': String(n === this.element),
        disabled: typeof lib[n] !== 'function', title: typeof lib[n] !== 'function' ? 'not in the loaded element library' : ELEMENTS[n].note,
        onclick: () => { this.element = n; this.prefs.set('labElement', n); renderSide(); this.renderElementPanel(); },
      }, n)));
    renderSide();
    this.renderElementPanel();
    this.renderRoom();
  }

  renderElementPanel() {
    const name = this.element, def = ELEMENTS[name], st = this.knobs();
    const code = el('pre', { class: 'lab-code', tabindex: '0', 'aria-label': 'pack code' });
    const refreshCode = () => { code.textContent = snippet(name, st, { vary: this.vary, cents: this.vary ? this.cents : 0, seed: this.seed }); };
    const grid = el('div', { class: 'controls' });
    const done = new Set();
    const change = (k, v) => { st[k] = v; refreshCode(); if (this.auditionOnChange) { clearTimeout(this.playTimer); this.playTimer = setTimeout(() => this.play(0), 140); } };
    for (const [k, d] of Object.entries(def.params)) {
      if (done.has(k)) continue;
      const pair = pairFor(name, k);
      const help = paramHelp(name, k);
      if (pair && pair.kind === 'sweep') {
        done.add(pair.a); done.add(pair.b);
        grid.append(control({ kind: 'sweep', name: `${pair.a}-${pair.b}`, label: `${pair.a} → ${pair.b}`, values: { from: st[pair.a], to: st[pair.b] },
          ranges: { from: def.params[pair.a].slice(0, 3), to: def.params[pair.b].slice(0, 3) }, help: `${paramHelp(name, pair.a)} ${paramHelp(name, pair.b)}`,
          onChange: ({ from, to }) => { st[pair.a] = from; change(pair.b, to); } }));
        continue;
      }
      if (pair && pair.kind === 'envelope') {
        done.add(pair.a); done.add(pair.b);
        grid.append(control({ kind: 'envelope', name: `${pair.a}-${pair.b}`, label: `${pair.a} · ${pair.b}`, values: { attack: st[pair.a], dur: st[pair.b] },
          ranges: { attack: def.params[pair.a].slice(0, 3), dur: def.params[pair.b].slice(0, 3) }, help: `${paramHelp(name, pair.a)} ${paramHelp(name, pair.b)}`,
          onChange: ({ attack, dur }) => { st[pair.a] = attack; change(pair.b, dur); } }));
        continue;
      }
      done.add(k);
      const meta = kindOf(name, k);
      const base = { name: k, label: meta.label || k, help, onChange: (v) => change(k, v) };
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
        // optional: a switch plus the control
        const wrap = el('div', { class: 'optional' });
        const on = st[k] !== d.off;
        const inner = () => {
          const range = d.range;
          const val = st[k] === d.off ? (meta.kind === 'filter' ? Math.sqrt(range[0] * range[1]) : (range[0] + range[1]) / 2) : st[k];
          if (meta.kind === 'filter') return control({ ...base, kind: 'filter', filter: meta.filter, value: val, range });
          if (meta.kind === 'pitch') return control({ ...base, kind: 'pitch', value: val, range });
          return control({ ...base, kind: 'character', value: val, range, poles: meta.poles, unit: meta.unit, center: k === 'bend' ? 1 : undefined });
        };
        let ctl = on ? inner() : null;
        const sw = control({ kind: 'toggle', name: `${k}-on`, label: `${meta.label || k} (optional)`, value: on, help: `${help} Off leaves it to the library's default behaviour.`,
          onChange: (v) => { if (v) { ctl = inner(); wrap.append(ctl); change(k, ctl.value); } else { if (ctl) ctl.remove(); ctl = null; change(k, d.off); } } });
        wrap.append(sw); if (ctl) wrap.append(ctl);
        grid.append(wrap);
      } else if (d.options) {
        grid.append(control({ ...base, kind: 'choice', value: st[k], options: d.options }));
      } else if (d.preset) {
        const list = BODY_PRESETS[st[k]] || BODY_PRESETS[d.preset[0]];
        grid.append(control({ ...base, kind: 'partials', value: list, presets: BODY_PRESETS, onChange: (v) => { st[k] = v; refreshCode(); if (this.auditionOnChange) this.play(0); } }));
      }
    }
    const kbBox = el('input', { type: 'checkbox', checked: this.keyboard, disabled: !def.pitched, onchange: (e) => { this.keyboard = e.target.checked; kbHint.hidden = !this.keyboard; } });
    const kbHint = el('p', { class: 'ctl-hint', hidden: !this.keyboard }, 'A W S E D F T G Y H U J K O L P ; play C4 up from the current pitch; Z / X shift the octave.');
    const varyBox = el('input', { type: 'checkbox', checked: this.vary, onchange: (e) => { this.vary = e.target.checked; refreshCode(); } });
    this.panel.replaceChildren(
      el('h2', { class: 'card-h' }, name, def.explicitDur ? el('small', { class: 'lab-tag' }, ' sustained') : null, panelHelp(name, def.note)),
      el('p', { class: 'card-sub' }, def.note),
      el('div', { class: 'transport' },
        el('button', { class: 'tool tool-primary', type: 'button', onclick: () => this.play(0) }, '▶ Play'),
        el('button', { class: 'tool', type: 'button', onpointerdown: () => { this.play(0); this.holdTimer = setInterval(() => this.play(0), 380); }, onpointerup: () => this.endHold(), onpointerleave: () => this.endHold(), onpointercancel: () => this.endHold() }, 'Hold'),
        def.explicitDur ? el('button', { class: 'tool', type: 'button', onclick: () => this.stopAllBeds(0.3) }, 'Stop') : null,
        el('label', { class: 'control-opt' }, varyBox, el('span', {}, 'vary per play')),
        el('label', { class: 'control-opt' }, kbBox, el('span', {}, 'keyboard')),
        el('label', { class: 'control-opt' }, el('input', { type: 'checkbox', checked: this.auditionOnChange, onchange: (e) => { this.auditionOnChange = e.target.checked; } }), el('span', {}, 'play on change')),
        panelHelp(PANELS.transport.title, 'Play fires the gesture; Hold repeats it so you can hear it at play density. Vary draws pitch and seed from the stream as a pack would; off, the same seed repeats exactly.'),
      ),
      kbHint,
      grid,
      el('div', { class: 'row' }, control({ kind: 'distance', name: 'send', label: 'send', value: this.send, help: 'How far away this gesture sits in the lab room.', onChange: (v) => { this.send = v; } })),
      el('h3', { class: 'card-h' }, 'Pack code', panelHelp(PANELS.code.title, PANELS.code.body)),
      el('div', { class: 'row' }, el('button', { class: 'tool', type: 'button', onclick: () => this.copy(code.textContent) }, 'Copy')),
      code,
    );
    refreshCode();
  }

  endHold() { if (this.holdTimer) { clearInterval(this.holdTimer); this.holdTimer = null; } }

  play(transpose = 0) {
    if (!Packs.enabled()) return;
    const bus = this.bus(); if (!bus) return;
    const lib = Rec.library() || E();
    const ctx = bus.ctx, name = this.element, def = ELEMENTS[name];
    if (typeof lib[name] !== 'function') return;
    const st = this.knobs();
    const rnd = this.vary ? lib.rng(Packs.nextSeed()) : null;
    const params = buildParams(name, st, { seed: this.seed, transpose, cents: this.vary ? this.cents : 0 }, rnd);
    const o = lib.out(bus, this.send);
    const when = ctx.currentTime;
    let dur;
    try {
      if (def.explicitDur) {
        const collect = []; params.collect = collect;
        const d = explicitDur(name, st);
        lib[name](ctx, o, when, d, params);
        const teardown = lib.teardown(collect);
        const handle = { live: true, stop: (fade) => { handle.live = false; const now = ctx.currentTime, f = fade || 0.3; try { o.gain.setValueAtTime(Math.max(o.gain.value, 1e-4), now); o.gain.exponentialRampToValueAtTime(1e-4, now + f); } catch (e) { /* noop */ } teardown(now + f); setTimeout(() => { try { o.disconnect(); } catch (e) { /* noop */ } }, (f + 0.2) * 1000); } };
        this.stopAllBeds(0.2);
        this.beds.push(handle);
        setTimeout(() => { if (handle.live) handle.stop(0.1); this.beds = this.beds.filter((h) => h !== handle); }, (d + 0.5) * 1000);
        dur = d;
      } else {
        dur = lib[name](ctx, o, when, params);
        if (typeof dur !== 'number') dur = 1;
        setTimeout(() => { try { o.disconnect(); } catch (e) { /* noop */ } }, (dur + this.room.dur + 0.5) * 1000);
      }
    } catch (err) { console.warn(`[audio-tune] ${name} threw:`, err); try { o.disconnect(); } catch (e) { /* noop */ } return; }
    this.wakeScope(dur + this.room.dur);
  }

  onKey(e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON')) return;
    if (e.key === ' ') { e.preventDefault(); if (this.tab === 'fleet') this.playRecipe(false); else if (this.tab === 'elements') this.play(0); return; }
    if (this.tab !== 'elements' || !this.keyboard) return;
    if (e.key === 'z') { this.octave = Math.max(-3, this.octave - 1); return; }
    if (e.key === 'x') { this.octave = Math.min(3, this.octave + 1); return; }
    const s = semitoneForKey(e.key);
    if (s == null) return;
    e.preventDefault();
    this.play(s + this.octave * 12);
    let n = this.panel.querySelector('.lab-note');
    if (!n) { n = el('span', { class: 'lab-note', 'aria-live': 'polite' }); this.panel.querySelector('.transport').append(n); }
    n.textContent = noteName(s + this.octave * 12);
  }

  // ── ROOM ──────────────────────────────────────────────────────────────

  renderRoom() {
    const presets = el('select', { 'aria-label': 'room preset', onchange: (e) => this.pickRoom(e.target.value) });
    const fill = () => {
      presets.replaceChildren(
        el('option', { value: 'dry' }, 'dry'), el('option', { value: 'default' }, 'default (library)'),
        ...Packs.list().filter((p) => p.status === 'ready' && Packs.get(p.id).pack.room).map((p) => el('option', { value: `pack:${p.id}` }, `${p.name} — its own room`)),
        el('option', { value: 'custom' }, 'custom'));
      presets.value = this.roomName;
    };
    fill();
    const loadAll = el('button', { class: 'tool', type: 'button', onclick: async () => {
      loadAll.disabled = true; loadAll.textContent = 'Loading rooms…';
      for (const p of Packs.list()) if (p.status === 'idle') await Packs.load(p.id);
      fill(); loadAll.textContent = 'Fleet rooms loaded';
    } }, 'Load fleet rooms');
    const grid = el('div', { class: 'controls' });
    const draw = () => {
      grid.replaceChildren();
      for (const [k, d] of Object.entries(ROOM_KNOBS)) {
        const m = ROOM_META[k];
        grid.append(control({ kind: m.kind, name: k, label: m.label, value: this.room[k], range: d.slice(0, 3), poles: m.poles, filter: m.filter, unit: m.unit, help: m.help,
          onChange: (v) => { this.room[k] = v; this.roomName = 'custom'; presets.value = 'custom'; this.rebuildRoom(); } }));
      }
    };
    draw();
    this.redrawRoomKnobs = draw;
    this.roomPanel.replaceChildren(
      el('h3', { class: 'card-h' }, 'Room', panelHelp(PANELS.room.title, PANELS.room.body)),
      el('p', { class: 'card-sub' }, 'Every element you play here feeds this one room. Try the same strike in the pond and in the well.'),
      el('div', { class: 'row' }, presets, loadAll),
      grid);
  }

  pickRoom(v) {
    this.roomName = v;
    if (v === 'dry' || v === 'default') this.room = { ...ROOM_PRESETS[v], seed: 7 };
    else if (v.startsWith('pack:')) { const entry = Packs.get(v.slice(5)); if (entry && entry.pack && entry.pack.room) this.room = roomState(entry.pack.room); }
    this.rebuildRoom();
    if (this.redrawRoomKnobs) this.redrawRoomKnobs();
  }

  // ── GUIDE ─────────────────────────────────────────────────────────────

  renderGuide() {
    const nav = el('nav', { class: 'guide-nav', 'aria-label': 'Guide' });
    const main = el('div', { class: 'guide-main' });
    for (const g of GUIDE) {
      nav.append(el('a', { href: `#guide-${g.id}`, class: 'guide-link' }, g.title));
      main.append(el('section', { class: 'card', id: `guide-${g.id}` }, el('h2', { class: 'card-h' }, g.title), ...g.body.map((p) => el('p', { class: 'guide-p' }, p))));
    }
    // controls legend
    main.append(el('section', { class: 'card' }, el('h2', { class: 'card-h' }, 'The controls'),
      el('p', { class: 'guide-p' }, 'Every parameter is drawn as what it means. Each control also has a ? for its own note.'),
      el('dl', { class: 'legend' }, ...Object.entries(KINDS).filter(([k]) => !['number', 'toggle'].includes(k)).flatMap(([k, v]) => [el('dt', {}, v.title), el('dd', {}, v.body)]))));
    this.body.append(el('div', { class: 'guide' }, nav, main));
  }

  // ── SCOPE ─────────────────────────────────────────────────────────────

  renderScope() {
    this.canvas = el('canvas', { class: 'lab-canvas', width: 800, height: 140, 'aria-label': 'waveform and spectrum' });
    this.meter = el('output', { class: 'lab-meter' }, '−∞ dB');
    this.scope.replaceChildren(el('h3', { class: 'card-h' }, 'Scope ', this.meter, panelHelp(PANELS.scope.title, PANELS.scope.body)), this.canvas);
  }

  animated() {
    const s = window.Arcade && Arcade.settings;
    const rm = s && typeof s.reducedMotion === 'function' ? s.reducedMotion() : false;
    const ps = s && s.powerSaver ? s.powerSaver() : false;
    return !rm && !ps;
  }

  wakeScope(seconds) {
    this.activeUntil = performance.now() + (seconds + 0.3) * 1000;
    if (!this.analyser) { this.bus(); if (!this.analyser) return; }
    if (!this.animated()) { let n = 0; const tick = () => { this.readMeter(); if (++n < 8) setTimeout(tick, 120); }; tick(); return; }
    if (!this.loop && window.Arcade && typeof Arcade.loop === 'function') this.loop = Arcade.loop(() => this.drawScope());
    if (this.loop && !this.loop.running) this.loop.start();
  }

  readMeter() {
    const a = this.analyser, d = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(d);
    let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    this.meter.value = peak > 1e-5 ? `${(20 * Math.log10(peak)).toFixed(1)} dB` : '−∞ dB';
    return d;
  }

  drawScope() {
    const c = this.canvas, g = c.getContext('2d'), w = c.width, h = c.height;
    const d = this.readMeter();
    const f = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(f);
    const cs = getComputedStyle(this.root);
    g.clearRect(0, 0, w, h);
    g.fillStyle = cs.getPropertyValue('--accent').trim() || '#7fc9c9';
    const bars = 96;
    for (let i = 0; i < bars; i++) {
      const lo = Math.floor(Math.pow(f.length, i / bars)), hi = Math.max(lo + 1, Math.floor(Math.pow(f.length, (i + 1) / bars)));
      let m = 0; for (let j = lo; j < hi && j < f.length; j++) m = Math.max(m, f[j]);
      const bh = (m / 255) * (h - 4);
      g.globalAlpha = 0.45; g.fillRect((i / bars) * w, h - bh, w / bars - 1, bh);
    }
    g.globalAlpha = 1;
    g.strokeStyle = cs.getPropertyValue('--fg').trim() || '#fff'; g.lineWidth = 1.5; g.beginPath();
    for (let i = 0; i < d.length; i++) { const x = (i / d.length) * w, y = h / 2 - d[i] * (h / 2 - 2); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    if (performance.now() > this.activeUntil && this.loop) this.loop.stop();
  }
}

// A range for a recorded value: the schema's if it has one, else a sensible
// envelope around the value (a pack can use values outside the lab's knobs).
function rangeFor(def, k, v) {
  const d = def.params && def.params[k];
  let r = Array.isArray(d) ? d.slice(0, 3) : d && d.range ? d.range.slice(0, 3) : null;
  if (!r) {
    if (v <= 0) return [0, Math.max(1, v * 4), 0.01];
    return v < 1 ? [0, Math.max(1, v * 4), 0.005] : [Math.max(0, v / 8), v * 4, v < 100 ? 0.5 : 1];
  }
  const [min, max, step] = r;
  return [Math.min(min, v), Math.max(max, v), step];
}
void fmtHz;
