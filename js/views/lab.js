// Explore — Fleet sounds (a cue as an editable recipe), Elements (one gesture
// at a time), My sounds (the composer) and the Guide. Design:
// docs/explore-design.md; the organisation: docs/ux-pass-2026-09.md.

import * as Packs from '../packs.js';
import * as Rec from '../recorder.js';
import { ComposerView } from './composer.js';
import * as Render from '../render.js';
import * as Stats from '../stats.js';
import * as Share from '../share.js';
import * as Cues from '../user-cues.js';
import { elementControls } from '../element-ui.js';
import { ELEMENTS, ELEMENT_NAMES, BODY_PRESETS } from '../element-params.js';
import { CUE_PARAMS, noteFor, defaultParams } from '../cue-params.js';
import { kindOf, pairFor } from '../param-kinds.js';
import { KINDS, PANELS, GUIDE, paramHelp } from '../help.js';
import { control, panelHelp, el, fmtMs, fmtHz, noteOf, dB } from '../controls.js';
import { menu, more, intro, groupedControls, soundPicker } from '../ui.js';
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
    this.expert = !!prefs.get('allControls');
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
    const hello = intro(this.prefs, 'explore', {
      title: 'See how a sound is made',
      lines: [
        'Pick a game, tap one of its sounds. You get its recipe: the gestures it is built from, in order, with every value as a control you can drag. Play hears your version; Original hears the game\'s.',
        'Each layer shows its essentials first — pitch, length, level, and whatever the game varies per play — with the rest under More. Show all controls opens everything and stays on.',
        'The game\'s pack is read-only. Tweaks live here until you Reset or pick another sound; Save as my sound keeps one.',
      ],
    });
    this.root.append(...(hello ? [hello] : []), this.tabs, this.body, this.scope);
    this.renderTabs();
    this.renderScope();
    this.showTab(this.tab);
    document.addEventListener('keydown', this.onKey);
  }

  unmount() {
    document.removeEventListener('keydown', this.onKey);
    this.stopAllBeds(0.3);
    if (this.composer) { this.composer.unmount(); this.composer = null; }
    if (this.loop) { this.loop.dispose(); this.loop = null; }
    if (this.labOut) { try { this.labOut.disconnect(); } catch (e) { /* noop */ } }
    if (this.analyser) { try { this.analyser.disconnect(); } catch (e) { /* noop */ } }
    this.labOut = this.labBus = this.analyser = null;
  }

  stopAllBeds(fade) { for (const h of this.beds) h.stop(fade); this.beds = []; }

  renderTabs() {
    const T = [['fleet', 'Fleet sounds'], ['elements', 'Elements'], ['mine', 'My sounds'], ['guide', 'Guide']];
    const all = el('label', { class: 'control-opt' },
      el('input', { type: 'checkbox', checked: this.expert, onchange: (e) => { this.expert = e.target.checked; this.prefs.set('allControls', this.expert); this.showTab(this.tab); } }),
      el('span', {}, 'Show all controls'), panelHelp(PANELS.essentials.title, PANELS.essentials.body));
    this.tabs.replaceChildren(...T.map(([id, label]) => el('button', { class: 'subtab', role: 'tab', type: 'button', 'aria-selected': String(id === this.tab), onclick: () => this.showTab(id) }, label)), all);
  }

  showTab(id) {
    this.tab = id; this.prefs.set('labTab', id); this.renderTabs();
    this.stopAllBeds(0.3);
    if (this.composer) { this.composer.unmount(); this.composer = null; }
    this.body.replaceChildren();
    if (id === 'fleet') this.renderFleet();
    else if (id === 'elements') this.renderElements();
    else if (id === 'mine') { this.composer = new ComposerView(this.body, { prefs: this.prefs, wakeScope: (s) => this.wakeScope(s), expert: () => this.expert }); this.composer.mount(); }
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
    // Only packs the recorder can read: graph packs, and not the user's own
    // (My sounds has its own tab, where its layers are the real thing).
    const packs = Packs.list().filter((p) => p.kind === 'graph' && p.id !== Cues.PACK_ID);
    if (this.packId && !packs.some((p) => p.id === this.packId)) { this.packId = ''; this.cueName = ''; }
    this.picker = soundPicker({
      packs, picked: this.packId && this.cueName ? { pack: this.packId, cue: this.cueName } : (this.packId ? { pack: this.packId, cue: null } : null),
      audition: false, label: 'fleet sounds',
      onPick: (packId, cueName) => {
        this.packId = packId; this.cueName = cueName;
        this.prefs.set('labPack', packId); this.prefs.set('labCue', cueName);
        this.entry = Packs.get(packId);
        this.pickCue();
        const head = this.recipeRoot.querySelector('.recipe-head');
        if (head) head.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    });
    this.recipeRoot = el('div', { class: 'recipe' });
    this.body.append(
      el('section', { class: 'card' },
        el('h2', { class: 'card-h' }, 'Fleet sounds', panelHelp(PANELS.fleet.title, PANELS.fleet.body)),
        el('p', { class: 'card-sub' }, 'A game, then one of its sounds. You will see exactly how it is made — and you can change any of it.'),
        this.picker),
      this.recipeRoot,
    );
    if (this.packId && this.cueName) this.restoreCue();
  }

  async restoreCue() {
    this.recipeRoot.append(el('p', { class: 'card-sub' }, 'Loading pack…'));
    const entry = await Packs.load(this.packId);
    if (this.tab !== 'fleet') return;
    this.recipeRoot.replaceChildren();
    if (entry.status !== 'ready') { this.recipeRoot.append(el('p', { class: 'board-status is-error' }, `Pack unavailable — ${entry.error}`)); return; }
    this.entry = entry;
    if (entry.pack.cues.some((c) => c.name === this.cueName)) this.pickCue();
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

  changedCount() { return Object.values(this.overrides).reduce((n, ov) => n + Object.keys(ov.params || {}).length + ('at' in ov ? 1 : 0) + ('dur' in ov ? 1 : 0), 0); }

  renderRecipe() {
    const R = this.recipeRoot;
    R.replaceChildren();
    if (!this.recipe) { R.append(el('p', { class: 'board-status is-error' }, `Could not record this cue — ${this.recipeError}`)); return; }
    const meta = (CUE_PARAMS[this.packId] || {})[this.cueName] || {};
    const desc = this.entry.desc;
    const n = this.recipe.layers.length;

    // head: what it is, how to play it, and where tweaks go
    const head = el('section', { class: 'card recipe-head' },
      el('h2', { class: 'card-h' }, this.cueName, el('small', {}, ` · ${desc.name}`), panelHelp(PANELS.layer.title, PANELS.layer.body)),
      el('p', { class: 'card-sub' }, noteFor(this.packId, this.cueName) || '—'),
      el('p', { class: 'recipe-facts' },
        `${n} gesture${n === 1 ? '' : 's'} · send ${num(this.cue.send)} · room: ${desc.name}${this.cue.sustained ? ' · bed (8 s take)' : ''}${this.recipe.countVaried ? ' · some plays add or drop a layer' : ''}`),
    );
    this.takeLabel = el('span', { class: 'take-label' }, `take #${this.takeNo}`);
    const transport = el('div', { class: 'transport' },
      el('button', { class: 'tool tool-primary', type: 'button', onclick: () => this.playRecipe(false) }, '▶ Play'),
      el('button', { class: 'tool', type: 'button', title: 'the untouched take, for A/B', onclick: () => this.playRecipe(true) }, 'Original'),
      el('button', { class: 'tool', type: 'button', onclick: () => this.reroll() }, '⚄ Re-roll'),
      el('button', { class: 'tool', type: 'button', onclick: () => { this.overrides = {}; this.renderRecipe(); } }, 'Reset'),
      this.takeLabel,
      el('label', { class: 'control-opt' }, el('input', { type: 'checkbox', checked: this.auditionOnChange, onchange: (e) => { this.auditionOnChange = e.target.checked; } }), el('span', {}, 'play on change')),
      panelHelp(PANELS.transport.title, PANELS.transport.body),
      menu({ label: 'More for this sound', items: [
        { label: 'Copy as pack code', onSelect: () => this.copy(this.codeNode ? this.codeNode.textContent : '') },
        { label: 'Download as WAV', onSelect: () => this.renderRecipeWav() },
      ] }),
    );
    head.append(transport);
    // read-only, and the way out
    const tooBig = n > Cues.MAX_LAYERS;
    this.changedLabel = el('span', { class: 'readonly-state' });
    head.append(el('div', { class: 'readonly' },
      el('span', {}, `${desc.name}'s pack is read-only — nothing here changes the game or the board.`),
      this.changedLabel,
      el('button', { class: 'tool', type: 'button', disabled: tooBig, title: tooBig ? `${n} layers — a sound holds at most ${Cues.MAX_LAYERS}` : 'keep this take, with your changes, as a sound of your own',
        onclick: () => this.saveAsSound() }, 'Save as my sound'),
      panelHelp(PANELS.readOnly.title, `${PANELS.readOnly.body} ${PANELS.saveAsSound.body}`)));
    R.append(head);

    // the values the game passes per play
    if (this.cueParams) {
      const grid = el('div', { class: 'controls' });
      const rerecord = () => { this.record(); this.renderRecipe(); if (this.auditionOnChange) this.playRecipe(false); };
      for (const [k, v] of Object.entries(this.cueParams)) {
        const spec = meta.params && meta.params[k];
        const help = `The game passes \`${k}\` to this cue per play; the recipe is recorded with this value.`;
        if (Array.isArray(spec)) grid.append(control({ kind: 'count', name: k, label: k, value: v, range: [spec[0], spec[1], spec[2]], help, onChange: (nv) => { this.cueParams[k] = nv; rerecord(); } }));
        else if (spec && spec.options) grid.append(control({ kind: 'choice', name: k, label: k, value: v, options: spec.options, help, onChange: (nv) => { this.cueParams[k] = nv; rerecord(); } }));
        else if (spec && spec.bool) grid.append(control({ kind: 'toggle', name: k, label: k, value: v, help, onChange: (nv) => { this.cueParams[k] = nv; rerecord(); } }));
      }
      R.append(el('section', { class: 'card' },
        el('h3', { class: 'card-h' }, 'Game parameters', panelHelp(PANELS.gameParams.title, PANELS.gameParams.body)),
        el('p', { class: 'card-sub' }, 'What the game hands this cue when it plays it. The recipe below is recorded at these values.'),
        grid));
    }

    R.append(this.renderTimeline());
    this.recipe.layers.forEach((L) => R.append(this.renderLayer(L)));

    // code, folded away
    const code = el('pre', { class: 'lab-code', tabindex: '0' });
    this.codeNode = code;
    const refresh = () => { code.textContent = Rec.cueSource(this.cueName, this.recipe, { end: typeof this.recipe.end === 'number' ? this.recipe.end : this.lastDur, overrides: this.overrides }); };
    this.refreshCode = refresh;
    refresh();
    R.append(el('section', { class: 'card' },
      more('Recreate it — pack code', [
        el('p', { class: 'card-sub' }, 'This take, with your changes, as a cue for a game\'s js/soundpack.js. ', panelHelp(PANELS.code.title, PANELS.code.body)),
        el('div', { class: 'row' }, el('button', { class: 'tool', type: 'button', onclick: () => this.copy(code.textContent) }, 'Copy')),
        code,
      ])));
    this.markChanged();
  }

  markChanged() {
    const c = this.changedCount();
    if (this.changedLabel) this.changedLabel.textContent = c ? `${c} change${c === 1 ? '' : 's'} in this session` : 'no changes yet';
  }

  async saveAsSound() {
    if (!this.recipe) return;
    let cue;
    try { cue = Cues.fromRecipe(`${this.cueName}-${this.entry.desc.id}`, this.recipe, { overrides: this.overrides, send: this.cue.send }); }
    catch (e) { Share.toast(`Could not save: ${e.message}`, 'error', 3000); return; }
    const ok = await Cues.save(cue);
    if (!ok) { Share.toast('Sounds need the launcher store to save', 'error'); return; }
    const { cues, room } = await Cues.list();
    Packs.registerVirtual(Cues.PACK_DESC, Cues.buildPack(cues, room, Rec.library() || E(), BODY_PRESETS));
    Stats.bump('soundsBuilt');
    this.prefs.set('cue', cue.id);
    Share.toast(`Saved "${cue.name}" to My sounds`, 'success', 2500);
    this.showTab('mine');
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

  /** One line that says what this layer is: pitch, length, band, level. */
  summarize(L) {
    const p = this.paramsOf(L);
    const bits = [];
    const pk = ['f0', 'freq', 'f'].find((k) => typeof p[k] === 'number');
    if (pk) {
      const meta = kindOf(L.el, pk);
      let s = meta.kind === 'filter' ? `${meta.filter === 'bandpass' ? 'around' : 'near'} ${fmtHz(p[pk])}` : `${noteOf(p[pk]).name} · ${fmtHz(p[pk])}`;
      if (typeof p.f1 === 'number' && p.f1) s += ` → ${fmtHz(p.f1)}`;
      bits.push(s);
    }
    const d = this.durOf(L); if (d) bits.push(fmtMs(d));
    if (typeof p.hp === 'number' && p.hp) bits.push(`above ${fmtHz(p.hp)}`);
    if (typeof p.lp === 'number' && p.lp) bits.push(`below ${fmtHz(p.lp)}`);
    if (Array.isArray(p.partials)) bits.push(`${p.partials.length} partials`);
    if (typeof p.gain === 'number') bits.push(p.gain > 0 ? `${dB(p.gain).toFixed(0)} dB` : 'silent');
    return bits.join(' · ');
  }

  renderLayer(L) {
    const def = ELEMENTS[L.el] || { params: {}, note: '' };
    const p = this.paramsOf(L);
    const card = el('section', { class: 'card layer', dataset: { layer: L.i }, style: `--i:${L.i}` },
      el('h3', { class: 'card-h' }, el('span', { class: 'layer-no' }, `${L.i + 1}`), L.el,
        el('small', {}, ` at ${fmtMs(this.at(L))}${L.atVaried ? ' · timing varies' : ''}`),
        panelHelp(`${L.el}`, def.note || KINDS.number.body)),
      el('p', { class: 'layer-sum' }, this.summarize(L)),
      el('p', { class: 'card-sub' }, def.note || ''));
    const items = [];
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
      if (pair && pair.kind === 'sweep' && p[pair.a] != null && p[pair.b] != null) {
        done.add(pair.a); done.add(pair.b);
        const vr = L.varied.includes(pair.a) || L.varied.includes(pair.b);
        const c = control({ kind: 'sweep', name: `${pair.a}-${pair.b}`, label: `${pair.a} → ${pair.b}`, values: { from: p[pair.a], to: p[pair.b] },
          ranges: { from: rangeFor(def, pair.a, p[pair.a]), to: rangeFor(def, pair.b, p[pair.b]) },
          help: `${paramHelp(L.el, pair.a)} ${paramHelp(L.el, pair.b)}`, varied: vr,
          onChange: ({ from, to }) => onChange({ params: { [pair.a]: from, [pair.b]: to } }) });
        c.setChanged(this.changed(L, pair.a) || this.changed(L, pair.b));
        items.push({ kind: 'sweep', name: `${pair.a}-${pair.b}`, varied: vr, node: c }); continue;
      }
      if (pair && pair.kind === 'envelope' && (p[pair.b] != null || L.dur != null)) {
        done.add(pair.a); done.add(pair.b);
        const durVal = L.dur != null ? (this.durOf(L)) : p[pair.b];
        const vr = L.varied.includes(pair.a) || L.varied.includes(pair.b) || L.varied.includes('dur');
        const c = control({ kind: 'envelope', name: `${pair.a}-${pair.b}`, label: `${pair.a} · ${pair.b}`, values: { attack: p[pair.a] ?? null, dur: durVal },
          ranges: { attack: p[pair.a] != null ? rangeFor(def, pair.a, p[pair.a]) : null, dur: rangeFor(def, pair.b, durVal) },
          help: `${paramHelp(L.el, pair.a)} ${paramHelp(L.el, pair.b)}`, varied: vr,
          onChange: ({ attack, dur }) => {
            const patch = { params: {} };
            if (p[pair.a] != null) patch.params[pair.a] = attack;
            if (L.dur != null) patch.dur = dur; else patch.params[pair.b] = dur;
            onChange(patch);
          } });
        c.setChanged(this.changed(L, pair.a) || this.changed(L, pair.b) || (this.overrides[L.i] && 'dur' in this.overrides[L.i]));
        items.push({ kind: 'envelope', name: `${pair.a}-${pair.b}`, varied: vr, node: c }); continue;
      }
      done.add(k);
      const c = this.controlFor(L.el, k, v, spec, help, varied, (nv) => onChange({ params: { [k]: nv } }));
      if (c) { c.setChanged(this.changed(L, k)); items.push({ kind: c.dataset.kind, name: k, varied, node: c }); }
    }
    if (L.dur != null && !done.has('dur')) {
      const c = control({ kind: 'time', name: 'dur', label: 'length', value: this.durOf(L), range: rangeFor(def, 'dur', this.durOf(L)), help: paramHelp(L.el, 'dur'), varied: L.varied.includes('dur'),
        onChange: (nv) => onChange({ dur: nv }) });
      c.setChanged(!!(this.overrides[L.i] && 'dur' in this.overrides[L.i]));
      items.push({ kind: 'time', name: 'dur', varied: L.varied.includes('dur'), node: c });
    }
    card.append(groupedControls(items, { expert: this.expert }));
    return card;
  }

  controlFor(element, k, v, spec, help, varied, onChange) {
    const meta = kindOf(element, k);
    const base = { name: k, label: meta.label || k, value: v, help, varied, onChange };
    const tag = (node, kind) => { node.dataset.kind = kind; return node; };
    if (meta.kind === 'partials' || (Array.isArray(v) && v.length && typeof v[0] === 'object' && 'ratio' in v[0])) {
      return tag(control({ ...base, kind: 'partials', presets: BODY_PRESETS }), 'partials');
    }
    if (typeof v === 'boolean') return tag(control({ ...base, kind: 'toggle' }), 'toggle');
    if (typeof v === 'string') {
      const options = spec && spec.options ? spec.options : [v];
      return tag(control({ ...base, kind: 'choice', options: options.includes(v) ? options : [v, ...options] }), 'choice');
    }
    if (typeof v !== 'number') return null;
    const range = rangeFor(ELEMENTS[element] || { params: {} }, k, v);
    switch (meta.kind) {
      case 'pitch': return tag(control({ ...base, kind: 'pitch', range }), 'pitch');
      case 'filter': return tag(control({ ...base, kind: 'filter', filter: meta.filter, range }), 'filter');
      case 'gain': return tag(control({ ...base, kind: 'gain', range: [0, 1, 0.005] }), 'gain');
      case 'time': return tag(control({ ...base, kind: 'time', range }), 'time');
      case 'count': return tag(control({ ...base, kind: 'count', range: [range[0], range[1], 1] }), 'count');
      case 'character': return tag(control({ ...base, kind: 'character', range, poles: meta.poles, unit: meta.unit, center: k === 'end' || k === 'bend' ? 1 : undefined }), 'character');
      default: return tag(control({ ...base, kind: 'number', range }), 'number');
    }
  }

  afterChange() {
    if (this.refreshCode) this.refreshCode();
    this.markChanged();
    // mark changed dots and refresh summaries without a full re-render
    this.recipeRoot.querySelectorAll('.layer').forEach((card) => {
      const i = Number(card.dataset.layer);
      const ov = this.overrides[i];
      const L = this.recipe.layers[i];
      const sum = card.querySelector('.layer-sum'); if (sum && L) sum.textContent = this.summarize(L);
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

  async renderRecipeWav() {
    if (!this.cue || !this.entry) return;
    const lib = Rec.library() || E();
    const sampleRate = Render.SAMPLE_RATE;
    const tail = (this.entry.pack.room && this.entry.pack.room.dur) || 1;
    const seconds = (this.cue.sustained ? 8 : Math.max(2, (this.lastDur || 2))) + tail + 0.5;
    try {
      const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
      const bus = lib.createBus(ctx, ctx.destination, this.entry.pack.room);
      const o = lib.out(bus, this.cue.send);
      const params = this.cue.sustained ? { ...(this.cueParams || {}), dur: 8 } : this.cueParams;
      Rec.run(() => this.cue.fn(ctx, o, 0.05, params, lib.rng(this.takeSeed)), { when: 0.05, overrides: this.overrides });
      const buffer = await ctx.startRendering();
      const ch = Render.trimTail([buffer.getChannelData(0), buffer.getChannelData(1)], sampleRate);
      Render.downloadWav(Render.wavName(`${this.entry.desc.id}-${this.cueName}-take${this.takeNo}`), ch, sampleRate);
      Stats.bump('rendersMade');
    } catch (e) { Share.toast(`Render failed: ${e.message}`, 'error', 3000); }
  }

  reroll() {
    if (this.locked) return;
    this.takeSeed = Packs.nextSeed(); this.takeNo += 1;
    this.record(); this.renderRecipe();
    if (this.auditionOnChange) this.playRecipe(false);
  }

  async copy(text) {
    const ok = await Share.copyText(text);
    Share.toast(ok ? 'Copied as pack code' : 'Select the code and copy it', ok ? 'success' : 'info', 1600);
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
    const change = () => { refreshCode(); if (this.auditionOnChange) { clearTimeout(this.playTimer); this.playTimer = setTimeout(() => this.play(0), 140); } };
    const grid = elementControls(name, st, change, { expert: this.expert });
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
        menu({ label: 'More for this element', items: [{ label: 'Copy as pack code', onSelect: () => this.copy(code.textContent) }] }),
      ),
      kbHint,
      grid,
      el('div', { class: 'control-group' }, el('div', { class: 'group-h', 'aria-hidden': 'true' }, 'Place'),
        el('div', { class: 'controls' }, control({ kind: 'distance', name: 'send', label: 'send', value: this.send, help: 'How far away this gesture sits in the lab room.', onChange: (v) => { this.send = v; } }))),
      more('Pack code', [el('p', { class: 'card-sub' }, 'The line a pack would carry for these values. ', panelHelp(PANELS.code.title, PANELS.code.body)), code]),
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
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'SUMMARY')) return;
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
      more('Room controls', [grid], { open: this.expert }));
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
    if (this.loop && !this.loop.running()) this.loop.start();
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
