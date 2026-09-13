// Explore › My sounds — the cue composer. Stack gestures with offsets into a
// sound of your own; it becomes a cue in the "My sounds" pack, so it is a
// pad on any board and a track in any song, and its code pastes into a game.

import * as Packs from '../packs.js';
import * as Cues from '../user-cues.js';
import { ELEMENTS, ELEMENT_NAMES, BODY_PRESETS } from '../element-params.js';
import { elementItems } from '../element-ui.js';
import { PANELS } from '../help.js';
import { control, panelHelp, el, fmtMs } from '../controls.js';
import { menu, more, groupedControls } from '../ui.js';
import { ROOM_KNOBS, roomState } from '../lab.js';
import * as Share from '../share.js';
import * as Render from '../render.js';
import * as Stats from '../stats.js';

const ROOM_META = {
  dur: { kind: 'time', label: 'length', help: 'How long the tail runs before it is gone.' },
  decay: { kind: 'time', label: 'decay', help: 'How fast the tail dies. Short is a small dry room; long is a hall or open water.' },
  preDelay: { kind: 'time', label: 'pre-delay', help: 'The gap before the first reflection arrives — the size of the space in front of you.' },
  wet: { kind: 'character', label: 'wet', poles: ['dry', 'wet'], help: 'The room\'s overall level against the dry sound.' },
  shelfHz: { kind: 'filter', filter: 'lowpass', label: 'warmth', help: 'A high-shelf cut above this frequency, so nothing reads as brittle or digital.' },
  shelfDb: { kind: 'character', label: 'shelf cut', poles: ['deep cut', 'no cut'], unit: 'dB', help: 'How hard the shelf cuts the top end.' },
};

export class ComposerView {
  constructor(root, { prefs, wakeScope, expert }) {
    this.root = root;
    this.prefs = prefs;
    this.wakeScope = wakeScope || (() => {});
    this.expert = typeof expert === 'function' ? expert : () => !!expert;
    this.cues = [];
    this.room = { ...Cues.DEFAULT_ROOM };
    this.cue = null;
    this.holdTimer = null;
    this.playTimer = null;
    this.auditionOnChange = true;
    this.beds = [];
  }

  async mount() {
    const loading = el('p', { class: 'card-sub' }, 'Loading your sounds…');
    this.root.append(loading);
    const { cues, room } = await Cues.list();
    loading.remove();
    if (!this.root.isConnected) return;
    this.cues = cues;
    if (room) this.room = { ...Cues.DEFAULT_ROOM, ...room };
    this.publish();
    const wanted = this.prefs.get('cue');
    this.cue = this.cues.find((c) => c.id === wanted) || this.cues[0] || null;
    this.side = el('nav', { class: 'lab-side', 'aria-label': 'My sounds' });
    this.main = el('div', { class: 'lab-main' });
    this.root.append(el('div', { class: 'lab' }, this.side, this.main));
    this.renderSide();
    this.renderEditor();
  }

  unmount() { this.stopAllBeds(0.3); this.endHold(); }
  stopAllBeds(fade) { for (const h of this.beds) h.stop(fade); this.beds = []; }
  endHold() { if (this.holdTimer) { clearInterval(this.holdTimer); this.holdTimer = null; } }

  /** Rebuild the 'mine' pack from the current cues (unsaved edits included). */
  publish(roomChanged = false) {
    const lib = Packs.available() ? window.ArcadeAudioElements : null;
    if (!lib) return;
    Packs.registerVirtual(Cues.PACK_DESC, Cues.buildPack(this.cues, this.room, lib, BODY_PRESETS), { roomChanged });
  }

  renderSide() {
    this.side.replaceChildren(
      el('h2', { class: 'card-h side-h' }, 'My sounds', panelHelp(PANELS.mySounds.title, PANELS.mySounds.body)),
      ...this.cues.map((c) => el('button', { class: `lab-el${this.cue && c.id === this.cue.id ? ' is-current' : ''}`, type: 'button', 'aria-pressed': String(!!(this.cue && c.id === this.cue.id)),
        onclick: () => { this.cue = c; this.prefs.set('cue', c.id); this.renderSide(); this.renderEditor(); } }, c.name)),
      el('button', { class: 'tool', type: 'button', onclick: () => this.create() }, '+ New sound'),
    );
  }

  async create() {
    const c = Cues.newCue(`sound-${this.cues.length + 1}`);
    this.cues.unshift(c); this.cue = c;
    await Cues.save(c);
    this.publish();
    this.prefs.set('cue', c.id);
    this.renderSide(); this.renderEditor();
  }

  async save() {
    if (!this.cue) return;
    // names are cue names: unique within the pack
    const dup = this.cues.find((c) => c !== this.cue && c.name === this.cue.name);
    if (dup) { this.cue.name = `${this.cue.name}-2`; }
    const ok = await Cues.save(this.cue);
    if (ok) Stats.bump('soundsBuilt');
    this.publish();
    Share.toast(ok ? `Saved "${this.cue.name}"` : 'Could not save (no store)', ok ? 'success' : 'error');
    this.renderSide();
  }

  changed() {
    this.publish();
    if (this.refreshCode) this.refreshCode();
    if (this.refreshTimeline) this.refreshTimeline();
    if (this.auditionOnChange) { clearTimeout(this.playTimer); this.playTimer = setTimeout(() => this.play(), 160); }
    clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => Cues.save(this.cue).then(() => this.renderSide()), 900);
  }

  play() {
    if (!this.cue) return;
    if (Cues.isSustained(this.cue)) {
      this.stopAllBeds(0.2);
      const h = Packs.startBed(Cues.PACK_ID, this.cue.name, null);
      if (h.live) { this.beds.push(h); setTimeout(() => h.stop(0.4), 6000); this.wakeScope(6.5); }
      return;
    }
    const r = Packs.fire(Cues.PACK_ID, this.cue.name, {});
    if (r) this.wakeScope(r.dur + this.room.dur);
  }

  renderEditor() {
    const M = this.main;
    M.replaceChildren();
    if (!this.cue) {
      M.append(el('section', { class: 'card' }, el('h2', { class: 'card-h' }, 'Build a sound', panelHelp(PANELS.composer.title, PANELS.composer.body)),
        el('p', { class: 'card-sub' }, 'Stack a few gestures — a strike a few milliseconds before a body is a knock. Or tweak a fleet sound and Save as my sound.'),
        el('div', { class: 'row' }, el('button', { class: 'tool tool-primary', type: 'button', onclick: () => this.create() }, '+ New sound'))));
      return;
    }
    const c = this.cue;
    const nameIn = el('input', { class: 'song-name', type: 'text', value: c.name, maxlength: 40, 'aria-label': 'sound name', onchange: (e) => { c.name = Cues.slug(e.target.value); e.target.value = c.name; this.changed(); } });
    const code = el('pre', { class: 'lab-code', tabindex: '0' });
    this.refreshCode = () => { code.textContent = Cues.cueSource(c); };
    const head = el('section', { class: 'card' },
      el('h2', { class: 'card-h' }, 'Sound', panelHelp(PANELS.composer.title, PANELS.composer.body)),
      el('div', { class: 'row' }, nameIn,
        control({ kind: 'distance', name: 'send', label: 'send', value: c.send == null ? 0.25 : c.send, help: 'How far away this sound sits in the My sounds room.', onChange: (v) => { c.send = v; this.changed(); } })),
      el('div', { class: 'transport' },
        el('button', { class: 'tool tool-primary', type: 'button', onclick: () => this.play() }, '▶ Play'),
        el('button', { class: 'tool', type: 'button', onpointerdown: () => { this.play(); this.holdTimer = setInterval(() => this.play(), 380); }, onpointerup: () => this.endHold(), onpointerleave: () => this.endHold(), onpointercancel: () => this.endHold() }, 'Hold'),
        el('button', { class: 'tool', type: 'button', onclick: () => this.save() }, 'Save'),
        el('label', { class: 'control-opt' }, el('input', { type: 'checkbox', checked: this.auditionOnChange, onchange: (e) => { this.auditionOnChange = e.target.checked; } }), el('span', {}, 'play on change')),
        menu({ label: 'More for this sound', items: [
          { label: 'Copy as pack code', onSelect: async () => { const ok = await Share.copyText(code.textContent); Share.toast(ok ? 'Copied as pack code' : 'Select the code and copy it', ok ? 'success' : 'info'); } },
          { label: 'Download as WAV', onSelect: async () => {
            try { const r = await Render.renderCue(Cues.PACK_ID, c.name, {}); const ch = Render.trimTail(r.channels, r.sampleRate); Render.downloadWav(Render.wavName(c.name), ch, r.sampleRate); Stats.bump('rendersMade'); }
            catch (e) { Share.toast(`Render failed: ${e.message}`, 'error', 3000); }
          } },
          { sep: true },
          { label: 'Delete this sound', danger: true, onSelect: async () => {
            if (!(await Share.confirm(`Delete "${c.name}"?`, 'Delete'))) return;
            await Cues.remove(c.id); this.cues = this.cues.filter((x) => x.id !== c.id); this.cue = this.cues[0] || null; this.publish(); this.renderSide(); this.renderEditor();
          } },
        ] }),
      ),
    );
    M.append(head);
    // timeline
    const tlCard = el('section', { class: 'card timeline-card' }, el('h3', { class: 'card-h' }, 'Timeline', panelHelp(PANELS.timeline.title, PANELS.timeline.body)));
    const tlHost = el('div');
    tlCard.append(tlHost);
    this.refreshTimeline = () => tlHost.replaceChildren(this.buildTimeline(c));
    this.refreshTimeline();
    M.append(tlCard);
    // layers
    c.layers.forEach((L, i) => M.append(this.renderLayer(c, L, i)));
    // add layer
    const addSel = el('select', { 'aria-label': 'add a gesture' }, el('option', { value: '' }, '+ Add a gesture…'), ...ELEMENT_NAMES.map((n) => el('option', { value: n }, n)));
    addSel.addEventListener('change', () => {
      if (!addSel.value || c.layers.length >= Cues.MAX_LAYERS) return;
      const last = c.layers[c.layers.length - 1];
      c.layers.push(Cues.newLayer(addSel.value, last ? Math.round((last.at + 0.01) * 1000) / 1000 : 0));
      this.changed(); this.renderEditor();
    });
    M.append(el('section', { class: 'card' }, el('div', { class: 'row' }, addSel, el('span', { class: 'ctl-hint' }, `${c.layers.length} of ${Cues.MAX_LAYERS} layers`))));
    // code, folded
    M.append(el('section', { class: 'card' }, more('Pack code', [el('p', { class: 'card-sub' }, 'This sound as a cue for a game\'s js/soundpack.js. ', panelHelp(PANELS.code.title, PANELS.code.body)), code])));
    this.refreshCode();
    // room
    M.append(this.renderRoom());
  }

  layerDur(L) {
    const def = ELEMENTS[L.el];
    if (def && def.explicitDur) return L.dur || 4;
    if (L.params && typeof L.params.dur === 'number') return L.params.dur;
    if (L.el === 'body') { const list = typeof L.params.partials === 'string' ? BODY_PRESETS[L.params.partials] : L.params.partials; return Array.isArray(list) ? Math.max(...list.map((p) => (p.delay || 0) + (p.decay || 0.1))) : 0.3; }
    const d = def && def.params.dur; return Array.isArray(d) ? d[3] : 0.1;
  }

  buildTimeline(c) {
    const ends = c.layers.map((L) => L.at + this.layerDur(L));
    const lastEnd = ends.length ? Math.max(...ends) : 0;
    const span = Math.max(0.2, lastEnd) + this.room.dur;
    const tl = el('div', { class: 'timeline' }, el('div', { class: 'tl-room', style: `left:${(lastEnd / span) * 100}%; width:${(this.room.dur / span) * 100}%` }, el('span', {}, 'room')));
    c.layers.forEach((L, i) => {
      const block = el('button', { class: 'tl-block', type: 'button', style: `left:${(L.at / span) * 100}%; width:${Math.max(1.5, (this.layerDur(L) / span) * 100)}%; --i:${i}`, 'aria-label': `${L.el} at ${fmtMs(L.at)} — drag to move`,
        onclick: () => { const card = this.main.querySelector(`[data-layer="${i}"]`); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, el('span', {}, L.el));
      let startX = 0, startAt = 0, moved = false;
      block.addEventListener('pointerdown', (e) => { startX = e.clientX; startAt = L.at; moved = false; block.setPointerCapture(e.pointerId); });
      block.addEventListener('pointermove', (e) => {
        if (!block.hasPointerCapture(e.pointerId)) return;
        const dx = (e.clientX - startX) / tl.getBoundingClientRect().width * span;
        if (Math.abs(dx) > 0.002) moved = true;
        L.at = Math.max(0, Math.min(10, Math.round((startAt + dx) * 1000) / 1000));
        block.style.left = `${(L.at / span) * 100}%`;
      });
      block.addEventListener('pointerup', () => { if (moved) { this.changed(); this.renderEditor(); } });
      tl.append(block);
    });
    const ruler = el('div', { class: 'tl-ruler' });
    const step = span > 4 ? 1 : span > 1.5 ? 0.5 : span > 0.6 ? 0.2 : 0.05;
    for (let t = 0; t <= span; t += step) ruler.append(el('span', { style: `left:${(t / span) * 100}%` }, fmtMs(t)));
    return el('div', {}, tl, ruler);
  }

  renderLayer(c, L, i) {
    const def = ELEMENTS[L.el];
    const card = el('section', { class: 'card layer', dataset: { layer: i }, style: `--i:${i}` });
    const elSel = el('select', { 'aria-label': 'gesture', onchange: () => { c.layers[i] = Cues.newLayer(elSel.value, L.at); this.changed(); this.renderEditor(); } },
      ...ELEMENT_NAMES.map((n) => el('option', { value: n, selected: n === L.el }, n)));
    card.append(
      el('h3', { class: 'card-h' }, el('span', { class: 'layer-no' }, `${i + 1}`), elSel, el('small', {}, ` at ${fmtMs(L.at)}`), panelHelp(L.el, def.note),
        el('span', { class: 'layer-tools' },
          el('button', { class: 'mini', type: 'button', 'aria-label': 'move up', disabled: i === 0, onclick: () => { [c.layers[i - 1], c.layers[i]] = [c.layers[i], c.layers[i - 1]]; this.changed(); this.renderEditor(); } }, '▲'),
          el('button', { class: 'mini', type: 'button', 'aria-label': 'move down', disabled: i === c.layers.length - 1, onclick: () => { [c.layers[i + 1], c.layers[i]] = [c.layers[i], c.layers[i + 1]]; this.changed(); this.renderEditor(); } }, '▼'),
          el('button', { class: 'mini', type: 'button', 'aria-label': 'duplicate', disabled: c.layers.length >= Cues.MAX_LAYERS, onclick: () => { c.layers.splice(i + 1, 0, JSON.parse(JSON.stringify(L))); this.changed(); this.renderEditor(); } }, '⧉'),
          el('button', { class: 'mini', type: 'button', 'aria-label': 'remove', disabled: c.layers.length <= 1, onclick: () => { c.layers.splice(i, 1); this.changed(); this.renderEditor(); } }, '×'))),
      el('p', { class: 'card-sub' }, def.note),
    );
    // the element's own knobs, through the shared builder, grouped by role
    const st = { ...(L.params || {}) };
    if (def.explicitDur) st.dur = L.dur || 4;
    const sync = () => { if (def.explicitDur) { L.dur = st.dur; const { dur, ...rest } = st; void dur; L.params = rest; } else L.params = { ...st }; this.changed(); };
    card.append(groupedControls(elementItems(L.el, st, sync), { expert: this.expert() }));
    // when it starts, and how much it may vary — a group of its own
    const when = el('div', { class: 'controls' },
      control({ kind: 'time', name: 'at', label: 'offset', value: L.at, range: [0, Math.max(1, Math.ceil(L.at * 2)), 0.001], help: 'When this gesture starts, from the sound\'s start. A few milliseconds between a strike and its body is what makes them one event.', onChange: (v) => { L.at = v; this.changed(); } }),
      def.pitched ? control({ kind: 'character', name: 'cents', label: 'pitch vary', value: (L.vary && L.vary.cents) || 0, range: [0, 100, 1], poles: ['exact', 'wide'], unit: '¢', help: 'How far each play may drift in pitch, in cents. The fleet uses 10–25 for most gestures. Zero is byte-identical, which the ear reads as chiptune.', onChange: (v) => { L.vary = { ...(L.vary || {}), cents: v }; this.changed(); } }) : null,
      control({ kind: 'character', name: 'level', label: 'level vary', value: (L.vary && L.vary.level) || 0, range: [0, 0.5, 0.01], poles: ['exact', 'loose'], help: 'How much each play may vary in level, as a fraction of the gain.', onChange: (v) => { L.vary = { ...(L.vary || {}), level: v }; this.changed(); } }),
    );
    card.append(el('div', { class: 'control-group role-when' }, el('div', { class: 'group-h', 'aria-hidden': 'true' }, 'When · variation'), when));
    return card;
  }

  renderRoom() {
    const grid = el('div', { class: 'controls' });
    const state = roomState(this.room);
    for (const [k, d] of Object.entries(ROOM_KNOBS)) {
      const m = ROOM_META[k];
      grid.append(control({ kind: m.kind, name: k, label: m.label, value: state[k], range: d.slice(0, 3), poles: m.poles, filter: m.filter, unit: m.unit, help: m.help,
        onChange: (v) => { this.room[k] = v; this.publish(true); clearTimeout(this.roomTimer); this.roomTimer = setTimeout(() => Cues.saveRoom(this.room), 800); if (this.refreshTimeline) this.refreshTimeline(); } }));
    }
    return el('section', { class: 'card' },
      el('h3', { class: 'card-h' }, 'My sounds room', panelHelp(PANELS.room.title, PANELS.room.body)),
      el('p', { class: 'card-sub' }, 'One room for every sound you build — the fleet\'s rule, one room per pack, so your sounds fuse into one place.'),
      more('Room controls', [grid], { open: this.expert() }));
  }
}
