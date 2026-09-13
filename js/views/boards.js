// Play — the soundboards. Fleet boards are generated from each pack; my
// boards are yours: any cue from any game on any pad, shared as codes,
// pushed to a linked device, or saved as a file. A riff is the last few
// seconds you played, as a code. Any board can be customized — moved,
// hidden, resized — without touching what is on it (js/layouts.js).

import * as Packs from '../packs.js';
import * as Boards from '../boards-store.js';
import * as Layouts from '../layouts.js';
import { paramsFor, noteFor, defaultParams } from '../cue-params.js';
import { padForKey, keyForPad } from '../keys.js';
import { PANELS } from '../help.js';
import { control, panelHelp, el } from '../controls.js';
import { menu, intro, soundPicker, sheet } from '../ui.js';
import { packBoard, BOARD_SIZES } from '../validate.js';
import { RiffBuffer, packRiff, unpackRiff, riffLength } from '../riff.js';
import * as Share from '../share.js';
import * as Daily from '../daily.js';
import * as Stats from '../stats.js';
import { checkPad } from '../validate.js';

const LONG_PRESS_MS = 420;
const SIZES = [{ label: 'Small pads', value: 's' }, { label: 'Regular pads', value: 'm' }, { label: 'Large pads', value: 'l' }];

export class BoardsView {
  constructor(root, { prefs }) {
    this.root = root;
    this.prefs = prefs;
    this.boardId = null;          // a pack id (fleet), 'daily', or a stored board id (mine)
    this.mine = [];               // stored boards
    this.board = null;            // the current user board, if any
    this.layout = null;           // the current fleet board's layout
    this.allPads = [];            // every pad in board order, hidden included
    this.pads = [];               // the visible pads, in key order
    this.beds = new Map();        // pad model → live bed handle
    this.sheet = null;
    this.customizing = false;
    this.padSize = prefs.get('padSize') || 'm';
    this.showKeys = prefs.get('showKeys') !== false;
    this.riff = new RiffBuffer();
    this.riffPlaying = null;
    this.unsubs = [];
    this.jamPeers = [];
    this.onKey = this.onKey.bind(this);
  }

  async mount() {
    this.root.replaceChildren();
    this.tabs = el('div', { class: 'packs', role: 'tablist', 'aria-label': 'Boards' });
    this.head = el('div', { class: 'board-head' });
    this.grid = el('div', { class: 'pads', role: 'group', 'aria-label': 'Pads' });
    this.riffCard = el('section', { class: 'card riff-card' });
    this.jamCard = el('section', { class: 'card jam-card', hidden: true });
    const hello = intro(this.prefs, 'play', {
      title: 'Every sound in the arcade, on one grid',
      lines: [
        'Each board is one game\'s real sound pack. Tap a pad, or play the keyboard rows — 1–0, Q–P, A–;, Z–/. Hold a pad for its settings.',
        'Customize any board: move pads, hide the ones you do not want, pick a pad size. Your own boards mix sounds from every game.',
        'Every ? explains what it sits next to. The Guide in Explore explains the whole system.',
      ],
    });
    this.root.append(...(hello ? [hello] : []), this.tabs, this.head, this.grid, this.riffCard, this.jamCard);
    this.applyGridPrefs();
    this.mountJam();
    document.addEventListener('keydown', this.onKey);
    this.mine = await Boards.list();
    this.renderTabs();
    this.renderRiff();
    const last = this.prefs.get('board');
    const ids = [...Packs.list().map((p) => p.id), 'daily', ...this.mine.map((b) => b.id)];
    this.open(ids.includes(last) ? last : ids[0]);
  }

  unmount() {
    document.removeEventListener('keydown', this.onKey);
    this.stopAllBeds(0.3);
    this.closeSheet();
    for (const u of this.unsubs) { try { u(); } catch (e) { /* noop */ } }
    this.unsubs = [];
    Stats.flush();
  }

  isMine() { return !!this.board; }
  isDaily() { return this.boardId === 'daily'; }

  applyGridPrefs() {
    this.grid.classList.toggle('pads-s', this.padSize === 's');
    this.grid.classList.toggle('pads-l', this.padSize === 'l');
    this.grid.classList.toggle('no-keys', !this.showKeys);
    this.grid.classList.toggle('is-customizing', this.customizing);
  }

  renderTabs() {
    const fleet = Packs.list().map((p) => el('button', {
      class: 'pack-tab', role: 'tab', type: 'button', 'aria-selected': String(p.id === this.boardId),
      style: `--hue:${p.hue}`, onclick: () => this.open(p.id),
    }, p.name));
    const mine = this.mine.map((b) => el('button', {
      class: 'pack-tab is-mine', role: 'tab', type: 'button', 'aria-selected': String(b.id === this.boardId),
      style: '--hue:48', onclick: () => this.open(b.id),
    }, b.name));
    const daily = el('button', { class: 'pack-tab is-daily', role: 'tab', type: 'button', 'aria-selected': String(this.boardId === 'daily'), style: '--hue:300', onclick: () => this.open('daily') }, '☼ Daily kit');
    this.tabs.replaceChildren(...fleet, el('span', { class: 'tab-sep', 'aria-hidden': 'true' }), daily, ...mine,
      el('button', { class: 'pack-tab is-new', type: 'button', onclick: () => this.createBoard() }, '+ New board'),
      el('button', { class: 'pack-tab is-new', type: 'button', onclick: () => this.importBoard() }, 'Import…'));
  }

  // ── opening boards ────────────────────────────────────────────────────

  async open(id) {
    if (!id) return;
    this.stopAllBeds(0.3);
    this.closeSheet();
    this.boardId = id;
    this.customizing = false;
    this.layout = null;
    this.prefs.set('board', id);
    this.board = this.mine.find((b) => b.id === id) || null;
    this.renderTabs();
    this.applyGridPrefs();
    if (id === 'daily') return this.openDaily();
    if (this.board) return this.openMine();
    return this.openFleet(Packs.get(id));
  }

  async openDaily() {
    const A = window.Arcade;
    const date = A && A.daily ? A.daily.dateStr() : new Date().toISOString().slice(0, 10);
    const seed = A && A.daily ? A.daily.seed('kit') : 1;
    const rng = A && typeof A.rng === 'function' ? A.rng(seed) : Math.random;
    const packIds = Packs.list().filter((p) => p.id !== 'mine').map((p) => p.id);
    const kit = Daily.kitBoard(date, rng, packIds);
    this.kit = kit;
    this.root.style.setProperty('--hue', 300);
    this.head.replaceChildren(
      el('h2', { class: 'board-name' }, kit.name),
      el('p', { class: 'board-place' }, 'Eight pads picked across the fleet — the same eight for everyone today. Play a riff on it and share the code.'),
      el('p', { class: 'board-status' }, 'Loading packs…'));
    this.grid.replaceChildren();
    await Promise.all([...new Set(kit.pads.filter(Boolean).map((p) => p.pack))].map((id) => Packs.load(id)));
    if (this.boardId !== 'daily') return;
    this.head.querySelector('.board-status').remove();
    this.allPads = kit.pads.map((p, i) => (p ? this.padModel(i, p, Packs.cue(p.pack, p.cue)) : { slot: i, empty: true, fixed: true }));
    this.reindex();
    this.renderGrid();
    this.renderTools('Hold a pad for its settings.', PANELS.dailyKit);
    Stats.bump('kitsPlayed');
  }

  async openFleet(entry) {
    const desc = entry.desc;
    this.root.style.setProperty('--hue', desc.hue);
    this.head.replaceChildren(
      el('h2', { class: 'board-name' }, desc.name),
      el('p', { class: 'board-place' }, desc.place || ''),
      el('p', { class: 'board-status' }, 'Loading pack…'));
    this.grid.replaceChildren();
    const [loaded, layout] = await Promise.all([Packs.load(desc.id), Layouts.load(desc.id)]);
    if (this.boardId !== desc.id) return;
    const status = this.head.querySelector('.board-status');
    if (loaded.status !== 'ready') { status.textContent = `Pack unavailable — ${loaded.error || 'unknown error'}`; status.classList.add('is-error'); return; }
    status.remove();
    this.layout = layout;
    this.buildFleet();
    this.renderTools('Tap a pad, or use the keyboard rows. Hold a pad for its settings.', PANELS.fleetBoard);
  }

  /** Fleet pad models from the pack's cues in the layout's order. */
  buildFleet() {
    const entry = Packs.get(this.boardId);
    const names = entry.pack.cues.map((c) => c.name);
    const { all, hidden } = Layouts.applyLayout(names, this.layout);
    this.allPads = all.map((n) => {
      const c = entry.pack.cues.find((x) => x.name === n);
      return this.padModel(n, { pack: entry.desc.id, cue: n, params: defaultParams(entry.desc.id, n) || bedDefaults(c), velocity: 1, seedLock: false, seed: 1, hidden: hidden.has(n) }, c);
    });
    this.reindex();
    this.renderGrid();
  }

  async openMine() {
    const b = this.board;
    this.root.style.setProperty('--hue', 48);
    this.head.replaceChildren(
      el('div', { class: 'row' },
        el('input', { class: 'song-name', type: 'text', value: b.name, maxlength: 40, 'aria-label': 'board name',
          onchange: (e) => { b.name = e.target.value.slice(0, 40) || 'My board'; this.saveBoard(); this.renderTabs(); } }),
        panelHelp(PANELS.myBoards.title, PANELS.myBoards.body)),
      el('p', { class: 'board-status' }, 'Loading packs…'));
    this.grid.replaceChildren();
    const packs = [...new Set(b.pads.filter(Boolean).map((p) => p.pack))];
    await Promise.all(packs.map((id) => Packs.load(id)));
    if (this.boardId !== b.id) return;
    this.head.querySelector('.board-status').remove();
    this.buildMine();
    this.renderTools(this.customizing ? 'Tap a pad to give it a sound; drag to move; the eye hides it.' : 'Customize to assign, move or hide pads. Hold a pad for its settings.', null);
  }

  /** My-board pad models from pads[]; the slot is the storage index. */
  buildMine() {
    const b = this.board;
    this.allPads = b.pads.map((p, i) => p ? this.padModel(i, p, Packs.cue(p.pack, p.cue)) : { slot: i, empty: true });
    this.reindex();
    this.renderGrid();
  }

  /** Visible pads in order; their index is the keyboard position. */
  reindex() {
    this.pads = this.allPads.filter((p) => !p.hidden);
    this.allPads.forEach((p) => { p.index = -1; });
    this.pads.forEach((p, i) => { p.index = i; });
  }

  padModel(slot, p, cueInfo) {
    return {
      slot, index: -1, pack: p.pack, cue: p.cue, sustained: !!(cueInfo && cueInfo.sustained),
      params: p.params ? { ...p.params } : null,
      paramSpec: paramsFor(p.pack, p.cue) || (cueInfo && cueInfo.params) || null,
      seedLock: !!p.seedLock, seed: p.seed || 1, velocity: p.velocity == null ? 1 : p.velocity,
      label: p.label || null, missing: !cueInfo, hidden: !!p.hidden,
    };
  }

  // ── head: customize + menu ────────────────────────────────────────────

  renderTools(hint, helpPanel) {
    const old = this.head.querySelector('.board-tools'); if (old) old.remove();
    const canCustomize = !this.isDaily();
    const customize = canCustomize ? el('button', { class: `tool${this.customizing ? ' tool-primary' : ''}`, type: 'button', 'aria-pressed': String(this.customizing), onclick: () => this.setCustomizing(!this.customizing) }, this.customizing ? '✓ Done' : 'Customize') : null;
    const hiddenCount = this.allPads.filter((p) => p.hidden).length;
    this.head.append(el('div', { class: 'board-tools' },
      customize,
      canCustomize ? panelHelp(PANELS.customize.title, PANELS.customize.body) : null,
      this.boardMenu(),
      el('span', { class: 'tool-hint' }, hint + (hiddenCount && !this.customizing ? ` ${hiddenCount} hidden.` : '')),
      helpPanel ? panelHelp(helpPanel.title, helpPanel.body) : null));
  }

  boardMenu() {
    return menu({ label: 'Board menu', items: () => {
      const b = this.board;
      const items = [
        { label: 'Pad size', options: SIZES, value: this.padSize, onSelect: (v) => { this.padSize = v; this.prefs.set('padSize', v); this.applyGridPrefs(); } },
        { label: 'Key hints on pads', checked: this.showKeys, onSelect: (v) => { this.showKeys = v; this.prefs.set('showKeys', v); this.applyGridPrefs(); } },
      ];
      if (b) items.push({ label: 'Board size', options: BOARD_SIZES.map((n) => ({ label: `${n} pads`, value: n })), value: b.pads.length, onSelect: (n) => this.resizeBoard(Number(n)) });
      items.push({ sep: true });
      if (!b && !this.isDaily()) items.push({ label: 'Reset layout', hint: 'the pack\'s order, nothing hidden', disabled: Layouts.isEmptyLayout(this.layout), onSelect: () => this.resetLayout() });
      items.push({ label: 'Stop all beds', onSelect: () => this.stopAllBeds(0.4) });
      if (!b) items.push({ label: 'Save a copy to My boards', onSelect: () => this.copyBoard() });
      if (b) {
        items.push({ sep: true },
          { label: 'Share as a code', onSelect: () => this.shareBoard() },
          Share.configsAvailable() ? { label: 'Send to a device', onSelect: () => this.sendBoard() } : null,
          { label: 'Export file', onSelect: () => Share.downloadJson(`${b.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'board'}.audio-tune-board.json`, packBoard(b)) },
          { sep: true },
          { label: 'Delete this board', danger: true, onSelect: () => this.deleteBoard() });
      }
      return items;
    } });
  }

  setCustomizing(on) {
    this.customizing = on;
    this.applyGridPrefs();
    this.renderGrid();
    this.renderTools(this.board
      ? (on ? 'Tap a pad to give it a sound; drag to move; the eye hides it.' : 'Customize to assign, move or hide pads. Hold a pad for its settings.')
      : (on ? 'Drag a pad to move it; the eye hides it. The pack itself is untouched.' : 'Tap a pad, or use the keyboard rows. Hold a pad for its settings.'),
      this.board ? null : PANELS.fleetBoard);
  }

  // ── grid ──────────────────────────────────────────────────────────────

  renderGrid() {
    const list = this.customizing ? this.allPads : this.pads;
    this.grid.replaceChildren(...list.map((p) => (p.empty ? this.renderEmpty(p) : this.renderPad(p))));
  }

  renderEmpty(p) {
    if (p.fixed) return el('div', { class: 'pad is-empty is-fixed', 'aria-hidden': 'true' });
    const btn = el('button', { class: 'pad is-empty', type: 'button', 'aria-label': `empty pad ${p.slot + 1} — assign a sound`, onclick: () => this.openPadEditor(p.slot) },
      el('span', { class: 'pad-key', 'aria-hidden': 'true' }, keyForPad(p.index)), el('span', { class: 'pad-name' }, '+'));
    return this.customizing ? this.wrapForCustomize(p, btn) : btn;
  }

  renderPad(p) {
    const desc = Packs.get(p.pack) && Packs.get(p.pack).desc;
    const hue = desc ? desc.hue : 0;
    const btn = el('button', {
      class: `pad${p.sustained ? ' is-bed' : ''}${p.paramSpec ? ' has-params' : ''}${p.missing ? ' is-missing' : ''}${p.hidden ? ' is-hidden' : ''}`,
      type: 'button', style: this.isMine() ? `--hue:${hue}` : null,
      'aria-label': `${p.label || p.cue}${p.sustained ? ' (bed)' : ''} — ${desc ? desc.name : p.pack}${p.missing ? ' (unavailable)' : ''}${p.hidden ? ' (hidden)' : ''}`,
      'aria-pressed': p.sustained ? 'false' : null,
    },
      el('span', { class: 'pad-key', 'aria-hidden': 'true' }, p.index >= 0 ? keyForPad(p.index) : ''),
      el('span', { class: 'pad-name' }, p.label || p.cue),
      el('span', { class: 'pad-meta', 'aria-hidden': 'true' }, this.isMine() && desc ? desc.name : (p.sustained ? '∞ ' : '') + (p.paramSpec ? Object.keys(p.paramSpec).join(' · ') : '')),
    );
    let timer = null, longPressed = false;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    btn.addEventListener('pointerdown', (e) => { if (e.button !== 0 || this.customizing) return; longPressed = false; timer = setTimeout(() => { longPressed = true; this.openSheet(p); }, LONG_PRESS_MS); });
    btn.addEventListener('pointerup', cancel); btn.addEventListener('pointerleave', cancel); btn.addEventListener('pointercancel', cancel);
    btn.addEventListener('click', (e) => {
      if (longPressed) { longPressed = false; return; }
      if (btn.dataset.dragged) { delete btn.dataset.dragged; return; }
      if (e.detail === 0 && this.customizing) return;
      if (this.customizing) { if (this.board) this.openPadEditor(p.slot); else this.openSheet(p); return; }
      this.hit(p, btn);
    });
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); this.openSheet(p); });
    p.el = btn;
    return this.customizing ? this.wrapForCustomize(p, btn) : btn;
  }

  /** In customize mode a pad gets handles: drag to move, ◀ ▶, and the eye. */
  wrapForCustomize(p, btn) {
    const pos = this.allPads.indexOf(p);
    const wrap = el('div', { class: `pad-wrap${p.hidden ? ' is-hidden' : ''}`, dataset: { pos } }, btn);
    const tools = el('div', { class: 'pad-tools' },
      el('button', { class: 'mini', type: 'button', 'aria-label': 'move earlier', disabled: pos === 0, onclick: () => this.movePad(pos, pos - 1) }, '◀'),
      p.fixed || p.empty ? null : el('button', { class: `mini${p.hidden ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(!!p.hidden), 'aria-label': p.hidden ? 'show pad' : 'hide pad', title: p.hidden ? 'show' : 'hide', onclick: () => this.toggleHidden(p) }, p.hidden ? '◌' : '◉'),
      el('button', { class: 'mini', type: 'button', 'aria-label': 'move later', disabled: pos === this.allPads.length - 1, onclick: () => this.movePad(pos, pos + 1) }, '▶'));
    wrap.append(tools);
    // drag to move
    let drag = null;
    btn.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, to: null }; btn.setPointerCapture(e.pointerId); });
    btn.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      drag.moved = true; btn.classList.add('is-dragging');
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const w = under && under.closest ? under.closest('.pad-wrap') : null;
      this.grid.querySelectorAll('.pad-wrap.is-over').forEach((x) => x.classList.remove('is-over'));
      if (w && w !== wrap) { w.classList.add('is-over'); drag.to = Number(w.dataset.pos); } else drag.to = null;
    });
    const end = () => {
      if (!drag) return;
      const d = drag; drag = null;
      btn.classList.remove('is-dragging');
      this.grid.querySelectorAll('.pad-wrap.is-over').forEach((x) => x.classList.remove('is-over'));
      if (d.moved) { btn.dataset.dragged = '1'; if (d.to != null && d.to !== pos) this.movePad(pos, d.to); }
    };
    btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
    return wrap;
  }

  async movePad(from, to) {
    if (to < 0 || to >= this.allPads.length || from === to) return;
    if (this.board) {
      const b = this.board;
      const data = this.allPads.map((p) => b.pads[p.slot]);
      b.pads = Layouts.moveItem(data, from, to);
      await this.saveBoard();
      this.buildMine();
    } else {
      const names = Packs.get(this.boardId).pack.cues.map((c) => c.name);
      this.layout = Layouts.moveName(this.layout, names, from, to);
      await Layouts.save(this.boardId, this.layout);
      this.buildFleet();
    }
    const moved = this.grid.children[to]; if (moved && moved.querySelector) { const b = moved.querySelector('.pad'); if (b) b.focus(); }
  }

  async toggleHidden(p) {
    const hidden = !p.hidden;
    if (this.board) {
      const src = this.board.pads[p.slot];
      if (src) { if (hidden) src.hidden = true; else delete src.hidden; }
      await this.saveBoard();
    } else {
      const names = Packs.get(this.boardId).pack.cues.map((c) => c.name);
      this.layout = Layouts.setHidden(this.layout, names, p.cue, hidden);
      await Layouts.save(this.boardId, this.layout);
    }
    p.hidden = hidden;
    if (hidden && this.beds.get(p)) { this.beds.get(p).stop(0.4); this.beds.delete(p); }
    this.reindex();
    this.renderGrid();
    this.renderTools(this.board ? 'Tap a pad to give it a sound; drag to move; the eye hides it.' : 'Drag a pad to move it; the eye hides it. The pack itself is untouched.', this.board ? null : PANELS.fleetBoard);
  }

  async resetLayout() {
    this.layout = Layouts.emptyLayout();
    await Layouts.save(this.boardId, this.layout);
    this.buildFleet();
    this.renderTools('Tap a pad, or use the keyboard rows. Hold a pad for its settings.', PANELS.fleetBoard);
    Share.toast('Layout reset to the pack\'s order', 'info');
  }

  hit(p, btn) {
    btn = btn || p.el;
    if (p.missing) return;
    if (p.sustained) {
      const live = this.beds.get(p);
      if (live && live.live) { live.stop(0.6); this.beds.delete(p); btn.setAttribute('aria-pressed', 'false'); btn.classList.remove('is-live'); }
      else { const h = Packs.startBed(p.pack, p.cue, p.params); if (h.live) { this.beds.set(p, h); btn.setAttribute('aria-pressed', 'true'); btn.classList.add('is-live'); } }
      return;
    }
    const seed = p.seedLock ? p.seed : Packs.nextSeed();
    const r = Packs.fire(p.pack, p.cue, { params: p.params, velocity: p.velocity, seed });
    if (!r) return;
    const bus = Packs.sdkBus();
    if (bus) this.riff.add(bus.ctx.currentTime, { pack: p.pack, cue: p.cue, params: p.params }, p.velocity, seed);
    this.updateRiffCount();
    Stats.bump('padsHit');
    this.jamSend({ t: 'at.hit', pack: p.pack, cue: p.cue, params: p.params || null, vel: p.velocity, seed });
    btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
  }

  stopAllBeds(fade) {
    for (const [p, h] of this.beds) { h.stop(fade); if (p && p.el) { p.el.setAttribute('aria-pressed', 'false'); p.el.classList.remove('is-live'); } }
    this.beds.clear();
    if (this.riffPlaying) { clearTimeout(this.riffPlaying); this.riffPlaying = null; }
  }

  onKey(e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (this.sheet || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') { this.stopAllBeds(0.4); return; }
    const i = padForKey(e.key);
    if (i < 0 || !this.pads[i] || this.pads[i].empty) return;
    e.preventDefault();
    this.hit(this.pads[i]);
  }

  // ── my boards: create / copy / save / delete / share ──────────────────

  async createBoard() {
    const b = Boards.newBoard(`Board ${this.mine.length + 1}`, 16);
    if (!(await Boards.save(b))) { Share.toast('Boards need the launcher store to save', 'error'); return; }
    this.mine = await Boards.list();
    await this.open(b.id);
    this.setCustomizing(true);
    Share.toast('New board — tap a pad to give it a sound', 'success');
  }

  /** A user copy of the current fleet board or kit, in the order shown, hidden pads left out. */
  async copyBoard() {
    let b;
    if (this.isDaily()) {
      b = Boards.newBoard(this.kit.name, 16); b.pads = this.kit.pads.map((p) => (p ? { ...p } : null));
    } else {
      const entry = Packs.get(this.boardId);
      const cues = this.pads.map((p) => entry.pack.cues.find((c) => c.name === p.cue)).filter(Boolean);
      b = Boards.fromPack(entry.desc, { cues }, defaultParams);
    }
    if (!(await Boards.save(b))) { Share.toast('Boards need the launcher store to save', 'error'); return; }
    this.mine = await Boards.list();
    this.open(b.id);
    Share.toast(`Saved "${b.name}" to My boards`, 'success');
  }

  async saveBoard() { if (this.board) await Boards.save(this.board); }

  async resizeBoard(len) {
    const b = this.board; if (!b) return;
    const next = new Array(len).fill(null);
    b.pads.slice(0, len).forEach((p, i) => { next[i] = p; });
    b.pads = next;
    await this.saveBoard();
    this.buildMine();
  }

  async deleteBoard() {
    if (!this.board) return;
    if (!(await Share.confirm(`Delete "${this.board.name}"?`, 'Delete'))) return;
    await Boards.remove(this.board.id);
    this.mine = await Boards.list();
    this.board = null;
    this.open(this.mine[0] ? this.mine[0].id : Packs.list()[0].id);
  }

  async shareBoard() {
    if (!this.board) return;
    const data = packBoard(this.board);
    if (Share.configsAvailable()) {
      const r = await Share.shareConfig('board', data);
      if (r.ok) return;
    }
    const code = Share.encodeCode(data, 1);
    const ok = await Share.copyText(code);
    Share.toast(ok ? 'Board code copied — paste it into Import' : 'Could not copy; use Export file instead', ok ? 'success' : 'error');
  }

  async sendBoard() {
    if (!this.board) return;
    const r = await Share.sendConfig('board', packBoard(this.board));
    Share.toast(r.ok ? (r.sent ? 'Sent' : 'Nobody to send to yet — connect a device from the launcher menu') : 'Could not send', r.ok ? 'info' : 'error');
  }

  async importBoard() {
    const codeIn = el('textarea', { class: 'code-in', rows: 3, placeholder: 'Paste a board or riff code…', 'aria-label': 'code' });
    const dlg = sheet({ title: 'Import', note: 'A board code, a riff code, or a board file someone exported.', body: codeIn, actions: [
      el('button', { class: 'tool', type: 'button', onclick: async () => { const obj = await Share.openJson(); if (obj) { dlg.close(); this.importObject(obj); } } }, 'Open file…'),
      el('button', { class: 'tool', type: 'button', onclick: () => dlg.close() }, 'Cancel'),
      el('button', { class: 'tool tool-primary', type: 'button', onclick: () => { const d = Share.decodeCode(codeIn.value); dlg.close(); if (!d) { Share.toast('That is not a code we understand', 'error'); return; } this.importObject(d.data); } }, 'Import code'),
    ] });
  }

  async importObject(obj) {
    const packs = Packs.list().map((p) => p.id);
    if (obj && Array.isArray(obj.h)) { this.playRiffData(obj); return; }
    try {
      const b = await Boards.importCompact(obj, { packs });
      this.mine = await Boards.list();
      this.open(b.id);
      Share.toast(`Imported "${b.name}"`, 'success');
    } catch (e) { Share.toast(`Could not import: ${e.message}`, 'error'); }
  }

  // ── pad editor (my boards) ────────────────────────────────────────────

  openPadEditor(slot) {
    if (!this.board) return;
    this.closeSheet();
    const b = this.board;
    const cur = b.pads[slot];
    const label = el('input', { class: 'song-name', type: 'text', maxlength: 24, placeholder: 'label (optional)', value: cur && cur.label ? cur.label : '', 'aria-label': 'pad label' });
    const picker = soundPicker({ packs: Packs.list(), picked: cur ? { pack: cur.pack, cue: cur.cue } : null, label: 'sounds', onPick: () => {} });
    const pos = this.allPads.findIndex((p) => p.slot === slot);
    const dlg = sheet({ title: `Pad ${pos + 1}`, note: 'Pick a game, then tap a sound to hear it and choose it.', wide: true, label: `pad ${pos + 1}`,
      body: [picker, el('div', { class: 'row' }, label, panelHelp(PANELS.padEditor.title, `${PANELS.padEditor.body} ${PANELS.picker.body}`))],
      actions: [
        cur ? el('button', { class: 'tool', type: 'button', onclick: () => { b.pads[slot] = null; this.saveBoard(); dlg.close(); this.buildMine(); } }, 'Clear pad') : null,
        el('button', { class: 'tool', type: 'button', onclick: () => dlg.close() }, 'Cancel'),
        el('button', { class: 'tool tool-primary', type: 'button', onclick: () => {
          const picked = picker.value;
          if (!picked) { Share.toast('Pick a sound first', 'info'); return; }
          const keep = cur && cur.pack === picked.pack && cur.cue === picked.cue ? cur : null;
          b.pads[slot] = { pack: picked.pack, cue: picked.cue, params: keep ? keep.params : defaultParams(picked.pack, picked.cue), label: label.value.trim().slice(0, 24) || null, velocity: keep ? keep.velocity : 1, seedLock: keep ? keep.seedLock : false, seed: keep ? keep.seed : 1, ...(cur && cur.hidden ? { hidden: true } : {}) };
          this.saveBoard(); dlg.close(); this.buildMine();
        } }, 'Save pad'),
      ] });
    dlg.addEventListener('close', () => { if (this.sheet === dlg) this.sheet = null; });
    this.sheet = dlg;
  }

  // ── pad sheet (settings) ──────────────────────────────────────────────

  openSheet(p) {
    this.closeSheet();
    if (p.empty) { this.openPadEditor(p.slot); return; }
    const desc = Packs.get(p.pack) && Packs.get(p.pack).desc;
    const body = [];
    const persist = () => { if (this.board && this.board.pads[p.slot]) { Object.assign(this.board.pads[p.slot], { params: p.params, velocity: p.velocity, seedLock: p.seedLock, seed: p.seed }); this.saveBoard(); } };
    const live = () => this.beds.get(p);
    if (p.paramSpec) {
      for (const [k, def] of Object.entries(p.paramSpec)) {
        const set = (v) => { p.params = p.params || {}; p.params[k] = v; persist(); const h = live(); if (h && h.live) h.retune(p.params, 0.8); };
        const help = `The game passes \`${k}\` to this cue per play.`;
        if (Array.isArray(def)) body.push(control({ kind: 'count', name: k, label: k, value: p.params ? p.params[k] : def[3], range: [def[0], def[1], def[2]], help, onChange: set }));
        else if (def.options) body.push(control({ kind: 'choice', name: k, label: k, value: p.params ? p.params[k] : def.options[0], options: def.options, help, onChange: set }));
        else if (def.bool) body.push(control({ kind: 'toggle', name: k, label: k, value: !!(p.params && p.params[k]), help, onChange: set }));
      }
    }
    if (!p.sustained) {
      body.push(control({ kind: 'gain', name: 'velocity', label: 'loudness', value: p.velocity, range: [0.05, 1, 0.01], help: 'How hard this pad hits.', onChange: (v) => { p.velocity = v; persist(); } }));
      body.push(control({ kind: 'toggle', name: 'seedLock', label: 'same every time', value: p.seedLock, help: 'Locks the seed so this pad repeats exactly. Off, every hit is a fresh take — hear what per-play variation buys.', onChange: (v) => { p.seedLock = v; persist(); } }));
    }
    if (!this.board) body.push(el('p', { class: 'sheet-note' }, this.isDaily()
      ? 'Settings here last while the kit is open. Save a copy to keep them.'
      : `${desc ? desc.name : 'This'} is the game's own pack, and it is read-only: settings here last until you leave the board. Save a copy to My boards to keep them.`));
    if (this.board) body.push(el('button', { class: 'tool', type: 'button', onclick: () => { dlg.close(); this.openPadEditor(p.slot); } }, 'Change sound…'));
    const dlg = sheet({ title: p.label || p.cue, note: noteFor(p.pack, p.cue) || (desc ? desc.name : p.pack), label: `${p.cue} settings`, body, actions: [
      el('button', { class: 'tool', type: 'button', onclick: () => this.hit(p) }, p.sustained ? (live() && live().live ? 'Stop' : 'Start') : 'Play'),
      el('button', { class: 'tool tool-primary', type: 'button', onclick: () => this.closeSheet() }, 'Done'),
    ] });
    dlg.querySelector('.sheet-title').append(el('small', {}, ` · ${desc ? desc.name : p.pack}`));
    dlg.addEventListener('close', () => { if (this.sheet === dlg) this.sheet = null; });
    this.sheet = dlg;
  }

  closeSheet() { if (this.sheet) { try { this.sheet.close(); } catch (e) { /* noop */ } this.sheet = null; } }

  // ── riffs ─────────────────────────────────────────────────────────────

  renderRiff() {
    this.riffCount = el('span', { class: 'ctl-hint' }, 'nothing played yet');
    const codeIn = el('input', { class: 'song-name', type: 'text', placeholder: 'paste a riff code', 'aria-label': 'riff code' });
    this.riffCard.replaceChildren(
      el('h3', { class: 'card-h' }, 'Riff', panelHelp(PANELS.riff.title, PANELS.riff.body), this.riffCount),
      el('div', { class: 'row' },
        el('button', { class: 'tool', type: 'button', onclick: () => this.playRiffData(packRiff(this.riff.take())) }, '▶ Replay'),
        el('button', { class: 'tool', type: 'button', onclick: () => this.copyRiff() }, 'Copy riff code'),
        el('button', { class: 'tool', type: 'button', onclick: () => { this.riff.clear(); this.updateRiffCount(); } }, 'Clear'),
        codeIn,
        el('button', { class: 'tool', type: 'button', onclick: () => { const d = Share.decodeCode(codeIn.value); if (!d) { Share.toast('That is not a riff code', 'error'); return; } this.playRiffData(d.data); } }, 'Play code')));
  }

  updateRiffCount() { if (this.riffCount) this.riffCount.textContent = this.riff.length ? `${this.riff.length} hit${this.riff.length === 1 ? '' : 's'} in the last ${this.riff.seconds} s` : 'nothing played yet'; }

  async copyRiff() {
    const hits = this.riff.take();
    if (!hits.length) { Share.toast('Play some pads first', 'info'); return; }
    const code = Share.encodeCode(packRiff(hits), 1);
    const ok = await Share.copyText(code);
    Share.toast(ok ? 'Riff code copied' : 'Could not copy', ok ? 'success' : 'error');
  }

  async playRiffData(data) {
    let hits;
    try { hits = unpackRiff(data, { packs: Packs.list().map((p) => p.id) }); } catch (e) { Share.toast(`Not a playable riff: ${e.message}`, 'error'); return; }
    if (!hits.length) return;
    await Promise.all([...new Set(hits.map((h) => h.pad.pack))].map((id) => Packs.load(id)));
    const bus = Packs.sdkBus(); if (!bus) return;
    const t0 = bus.ctx.currentTime + 0.05;
    for (const h of hits) Packs.fire(h.pad.pack, h.pad.cue, { when: t0 + h.at, params: h.pad.params, velocity: h.velocity, seed: h.seed || undefined });
    Share.toast(`Playing ${hits.length} hits`, 'info', Math.min(4000, riffLength(hits) * 1000));
  }
}

// ── jam: pad hits shared with a linked device ─────────────────────────

BoardsView.prototype.mountJam = function mountJam() {
  const A = window.Arcade;
  const peer = A && A.peer;
  if (!peer || typeof peer.status !== 'function' || peer.status() === 'unavailable') return;
  const sub = (name, fn) => { if (typeof peer[name] === 'function') { const u = peer[name](fn); if (typeof u === 'function') this.unsubs.push(u); } };
  sub('onStatus', () => this.renderJam());
  sub('onPeersChange', (roster) => { this.jamPeers = Array.isArray(roster) ? roster : []; this.renderJam(); });
  sub('onReady', () => this.renderJam());
  sub('onMessage', (payload, fromPeer) => this.jamReceive(payload, fromPeer));
  this.renderJam();
};

BoardsView.prototype.renderJam = function renderJam() {
  const A = window.Arcade; const peer = A && A.peer;
  if (!peer || !this.jamCard) return;
  const status = peer.status();
  this.jamCard.hidden = status === 'unavailable';
  if (this.jamCard.hidden) return;
  const caps = typeof peer.caps === 'function' ? peer.caps() : [];
  const roster = (typeof peer.peers === 'function' ? peer.peers() : this.jamPeers) || [];
  const names = roster.map((p) => (p && p.name ? String(p.name) : 'a device')).slice(0, 6);
  const line = status === 'connected' && names.length ? `Jamming with ${names.join(', ')} — every pad you hit plays there too, same take.`
    : status === 'connected' ? 'Connected. Pad hits will play on the other device too.'
    : status === 'interrupted' ? 'Link interrupted — the launcher is repairing it.'
    : 'Nobody has this open with you yet.';
  this.jamCard.replaceChildren(
    el('h3', { class: 'card-h' }, 'Jam', panelHelp(PANELS.jam.title, PANELS.jam.body), el('span', { class: `jam-dot is-${status}`, 'aria-hidden': 'true' })),
    el('p', { class: 'card-sub' }, line),
    el('div', { class: 'row' },
      caps.includes('peer.invite') && typeof peer.invite === 'function'
        ? el('button', { class: 'tool', type: 'button', onclick: async () => { const n = await peer.invite(); Share.toast(n > 0 ? `Asked ${n} device${n === 1 ? '' : 's'}` : 'Connect a device from the launcher menu first', 'info', 2500); } }, 'Invite a device')
        : el('span', { class: 'ctl-hint' }, 'Pair a device from the launcher\'s Multiplayer menu, then open Audio Tune on both.')));
};

BoardsView.prototype.jamSend = function jamSend(payload) {
  const A = window.Arcade; const peer = A && A.peer;
  if (!peer || typeof peer.send !== 'function') return;
  const st = peer.status();
  if (st !== 'connected' && st !== 'interrupted') return;
  try { peer.send(payload); } catch (e) { /* noop */ }
};

BoardsView.prototype.jamReceive = async function jamReceive(payload, fromPeer) {
  if (!payload || payload.t !== 'at.hit') return;
  const pad = { pack: payload.pack, cue: payload.cue, params: payload.params && typeof payload.params === 'object' ? payload.params : null, velocity: typeof payload.vel === 'number' ? payload.vel : 1, seed: Number.isInteger(payload.seed) ? payload.seed : 1 };
  try { checkPad(pad, { packs: Packs.list().map((p) => p.id) }, 'jam hit'); } catch (e) { return; }
  const entry = await Packs.load(pad.pack);
  if (entry.status !== 'ready') return;
  Packs.fire(pad.pack, pad.cue, { params: pad.params, velocity: pad.velocity, seed: pad.seed });
  if (!this.jamSeen) { this.jamSeen = true; Share.toast('A linked device is playing pads', 'info', 2000); }
  void fromPeer;
};

function bedDefaults(c) {
  if (!c || !c.params) return null;
  return Object.fromEntries(Object.entries(c.params).map(([k, d]) => [k, Array.isArray(d) ? d[3] : d]));
}
