// Play — the soundboards. Fleet boards are generated from each pack; my
// boards are yours: any cue from any game on any pad, shared as codes,
// pushed to a linked device, or saved as a file. A riff is the last few
// seconds you played, as a code.

import * as Packs from '../packs.js';
import * as Boards from '../boards-store.js';
import { paramsFor, noteFor, defaultParams } from '../cue-params.js';
import { padForKey, keyForPad } from '../keys.js';
import { PANELS } from '../help.js';
import { control, panelHelp, el } from '../controls.js';
import { packBoard, BOARD_SIZES } from '../validate.js';
import { RiffBuffer, packRiff, unpackRiff, riffLength } from '../riff.js';
import * as Share from '../share.js';
import * as Daily from '../daily.js';
import * as Stats from '../stats.js';
import { checkPad } from '../validate.js';

const LONG_PRESS_MS = 420;

export class BoardsView {
  constructor(root, { prefs }) {
    this.root = root;
    this.prefs = prefs;
    this.boardId = null;          // a pack id (fleet) or a stored board id (mine)
    this.mine = [];               // stored boards
    this.board = null;            // the current user board, if any
    this.pads = [];
    this.beds = new Map();
    this.sheet = null;
    this.editing = false;
    this.riff = new RiffBuffer();
    this.riffPlaying = null;
    this.unsubs = [];
    this.jamPeers = [];
    this.onKey = this.onKey.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  async mount() {
    this.root.replaceChildren();
    this.tabs = el('div', { class: 'packs', role: 'tablist', 'aria-label': 'Boards' });
    this.head = el('div', { class: 'board-head' });
    this.grid = el('div', { class: 'pads', role: 'group', 'aria-label': 'Pads' });
    this.riffCard = el('section', { class: 'card riff-card' });
    this.jamCard = el('section', { class: 'card jam-card', hidden: true });
    this.root.append(this.tabs, this.head, this.grid, this.riffCard, this.jamCard);
    this.mountJam();
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('keyup', this.onKeyUp);
    this.mine = await Boards.list();
    this.renderTabs();
    this.renderRiff();
    const last = this.prefs.get('board');
    const ids = [...Packs.list().map((p) => p.id), ...this.mine.map((b) => b.id)];
    this.open(ids.includes(last) ? last : ids[0]);
  }

  unmount() {
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('keyup', this.onKeyUp);
    this.stopAllBeds(0.3);
    this.closeSheet();
    for (const u of this.unsubs) { try { u(); } catch (e) { /* noop */ } }
    this.unsubs = [];
    Stats.flush();
  }

  isMine() { return !!this.board; }

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
    this.editing = false;
    this.prefs.set('board', id);
    this.board = this.mine.find((b) => b.id === id) || null;
    this.renderTabs();
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
    this.root.style.setProperty('--hue', 300);
    this.head.replaceChildren(
      el('h2', { class: 'board-name' }, kit.name),
      el('p', { class: 'board-place' }, 'Eight pads picked across the fleet — the same eight for everyone today. Play a riff on it and share the code.'),
      el('p', { class: 'board-status' }, 'Loading packs…'));
    this.grid.replaceChildren();
    await Promise.all([...new Set(kit.pads.filter(Boolean).map((p) => p.pack))].map((id) => Packs.load(id)));
    if (this.boardId !== 'daily') return;
    this.head.querySelector('.board-status').remove();
    this.pads = kit.pads.map((p, i) => (p ? this.padModel(i, p, Packs.cue(p.pack, p.cue)) : { index: i, empty: true, fixed: true }));
    this.renderGrid();
    this.head.append(el('div', { class: 'board-tools' },
      el('button', { class: 'tool', type: 'button', onclick: async () => {
        const b = Boards.newBoard(kit.name, 16); b.pads = kit.pads.map((p) => (p ? { ...p } : null));
        if (await Boards.save(b)) { this.mine = await Boards.list(); this.open(b.id); Share.toast('Kit saved to My boards', 'success'); }
      } }, 'Save a copy to My boards'),
      el('span', { class: 'tool-hint' }, 'Hold a pad for its settings.'),
      panelHelp(PANELS.dailyKit.title, PANELS.dailyKit.body)));
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
    const loaded = await Packs.load(desc.id);
    if (this.boardId !== desc.id) return;
    const status = this.head.querySelector('.board-status');
    if (loaded.status !== 'ready') { status.textContent = `Pack unavailable — ${loaded.error || 'unknown error'}`; status.classList.add('is-error'); return; }
    status.remove();
    this.pads = loaded.pack.cues.map((c, i) => this.padModel(i, { pack: desc.id, cue: c.name, params: defaultParams(desc.id, c.name) || bedDefaults(c), velocity: 1, seedLock: false, seed: 1 }, c));
    this.renderGrid();
    this.head.append(el('div', { class: 'board-tools' },
      el('button', { class: 'tool', type: 'button', onclick: () => this.stopAllBeds(0.4) }, 'Stop beds'),
      el('button', { class: 'tool', type: 'button', onclick: () => this.copyFleetBoard(desc, loaded.pack) }, 'Save a copy to My boards'),
      el('span', { class: 'tool-hint' }, 'Tap a pad, or use the keyboard rows. Hold a pad for its settings.'),
      panelHelp(PANELS.fleetBoard.title, PANELS.fleetBoard.body)));
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
    this.pads = b.pads.map((p, i) => p ? this.padModel(i, p, Packs.cue(p.pack, p.cue)) : { index: i, empty: true });
    this.renderGrid();
    const editBtn = el('button', { class: `tool${this.editing ? ' tool-primary' : ''}`, type: 'button', 'aria-pressed': String(this.editing), onclick: () => { this.editing = !this.editing; editBtn.classList.toggle('tool-primary', this.editing); editBtn.setAttribute('aria-pressed', String(this.editing)); this.grid.classList.toggle('is-editing', this.editing); } }, 'Edit pads');
    const size = control({ kind: 'choice', name: 'size', label: 'pads', value: b.pads.length, options: BOARD_SIZES, help: 'How many pads the board has. Growing keeps every pad; shrinking drops the pads past the new size.',
      onChange: (n) => { const len = Number(n); const next = new Array(len).fill(null); b.pads.slice(0, len).forEach((p, i) => { next[i] = p; }); b.pads = next; this.saveBoard(); this.openMine(); } });
    this.head.append(el('div', { class: 'board-tools' },
      editBtn,
      el('button', { class: 'tool', type: 'button', onclick: () => this.stopAllBeds(0.4) }, 'Stop beds'),
      el('button', { class: 'tool', type: 'button', onclick: () => this.shareBoard() }, 'Share'),
      Share.configsAvailable() ? el('button', { class: 'tool', type: 'button', onclick: () => this.sendBoard() }, 'Send to device') : null,
      el('button', { class: 'tool', type: 'button', onclick: () => Share.downloadJson(`${b.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'board'}.audio-tune-board.json`, packBoard(b)) }, 'Export file'),
      el('button', { class: 'tool', type: 'button', onclick: () => this.deleteBoard() }, 'Delete'),
      panelHelp(PANELS.share.title, PANELS.share.body),
    ), el('div', { class: 'row' }, size));
    this.grid.classList.toggle('is-editing', this.editing);
  }

  padModel(index, p, cueInfo) {
    return {
      index, pack: p.pack, cue: p.cue, sustained: !!(cueInfo && cueInfo.sustained),
      params: p.params ? { ...p.params } : null,
      paramSpec: paramsFor(p.pack, p.cue) || (cueInfo && cueInfo.params) || null,
      seedLock: !!p.seedLock, seed: p.seed || 1, velocity: p.velocity == null ? 1 : p.velocity,
      label: p.label || null, missing: !cueInfo,
    };
  }

  // ── grid ──────────────────────────────────────────────────────────────

  renderGrid() { this.grid.replaceChildren(...this.pads.map((p) => (p.empty ? this.renderEmpty(p) : this.renderPad(p)))); }

  renderEmpty(p) {
    if (p.fixed) return el('div', { class: 'pad is-empty is-fixed', 'aria-hidden': 'true' });
    return el('button', { class: 'pad is-empty', type: 'button', 'aria-label': `empty pad ${p.index + 1} — assign a sound`, onclick: () => this.openPadEditor(p.index) },
      el('span', { class: 'pad-key', 'aria-hidden': 'true' }, keyForPad(p.index)), el('span', { class: 'pad-name' }, '+'));
  }

  renderPad(p) {
    const desc = Packs.get(p.pack) && Packs.get(p.pack).desc;
    const hue = desc ? desc.hue : 0;
    const btn = el('button', {
      class: `pad${p.sustained ? ' is-bed' : ''}${p.paramSpec ? ' has-params' : ''}${p.missing ? ' is-missing' : ''}`,
      type: 'button', dataset: { index: p.index }, style: this.isMine() ? `--hue:${hue}` : null,
      'aria-label': `${p.label || p.cue}${p.sustained ? ' (bed)' : ''} — ${desc ? desc.name : p.pack}${p.missing ? ' (unavailable)' : ''}`,
      'aria-pressed': p.sustained ? 'false' : null,
    },
      el('span', { class: 'pad-key', 'aria-hidden': 'true' }, keyForPad(p.index)),
      el('span', { class: 'pad-name' }, p.label || p.cue),
      el('span', { class: 'pad-meta', 'aria-hidden': 'true' }, this.isMine() && desc ? desc.name : (p.sustained ? '∞ ' : '') + (p.paramSpec ? Object.keys(p.paramSpec).join(' · ') : '')),
    );
    let timer = null, longPressed = false;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    btn.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; longPressed = false; timer = setTimeout(() => { longPressed = true; this.openSheet(p); }, LONG_PRESS_MS); });
    btn.addEventListener('pointerup', cancel); btn.addEventListener('pointerleave', cancel); btn.addEventListener('pointercancel', cancel);
    btn.addEventListener('click', (e) => {
      if (longPressed) { longPressed = false; return; }
      if (e.detail === 0) return;
      if (this.editing) { this.openPadEditor(p.index); return; }
      this.hit(p, btn);
    });
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); this.openSheet(p); });
    p.el = btn;
    return btn;
  }

  hit(p, btn) {
    btn = btn || p.el;
    if (p.missing) return;
    if (p.sustained) {
      const live = this.beds.get(p.index);
      if (live && live.live) { live.stop(0.6); this.beds.delete(p.index); btn.setAttribute('aria-pressed', 'false'); btn.classList.remove('is-live'); }
      else { const h = Packs.startBed(p.pack, p.cue, p.params); if (h.live) { this.beds.set(p.index, h); btn.setAttribute('aria-pressed', 'true'); btn.classList.add('is-live'); } }
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
    for (const [i, h] of this.beds) { h.stop(fade); const p = this.pads[i]; if (p && p.el) { p.el.setAttribute('aria-pressed', 'false'); p.el.classList.remove('is-live'); } }
    this.beds.clear();
    if (this.riffPlaying) { clearTimeout(this.riffPlaying); this.riffPlaying = null; }
  }

  onKey(e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (this.sheet) return;
    if (e.key === 'Escape') { this.stopAllBeds(0.4); return; }
    const i = padForKey(e.key);
    if (i < 0 || !this.pads[i] || this.pads[i].empty) return;
    e.preventDefault();
    this.hit(this.pads[i]);
  }
  onKeyUp() {}

  // ── my boards: create / copy / save / delete / share ──────────────────

  async createBoard() {
    const b = Boards.newBoard(`Board ${this.mine.length + 1}`, 16);
    if (!(await Boards.save(b))) { Share.toast('Boards need the launcher store to save', 'error'); return; }
    this.mine = await Boards.list();
    this.open(b.id);
    this.editing = true;
    Share.toast('New board — tap a pad to give it a sound', 'success');
  }

  async copyFleetBoard(desc, pack) {
    const b = Boards.fromPack(desc, pack, defaultParams);
    if (!(await Boards.save(b))) { Share.toast('Boards need the launcher store to save', 'error'); return; }
    this.mine = await Boards.list();
    this.open(b.id);
    Share.toast(`Saved "${b.name}" to My boards`, 'success');
  }

  async saveBoard() { if (this.board) await Boards.save(this.board); }

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
    const dlg = el('dialog', { class: 'sheet', 'aria-label': 'Import a board' });
    const codeIn = el('textarea', { class: 'code-in', rows: 3, placeholder: 'Paste a board or riff code…', 'aria-label': 'code' });
    const body = el('div', { class: 'sheet-body' },
      el('h3', { class: 'sheet-title' }, 'Import'),
      el('p', { class: 'sheet-note' }, 'A board code, a riff code, or a board file someone exported.'),
      codeIn,
      el('div', { class: 'sheet-actions' },
        el('button', { class: 'tool', type: 'button', onclick: async () => { const obj = await Share.openJson(); if (obj) { dlg.close(); this.importObject(obj); } } }, 'Open file…'),
        el('button', { class: 'tool tool-primary', type: 'button', onclick: () => { const d = Share.decodeCode(codeIn.value); dlg.close(); if (!d) { Share.toast('That is not a code we understand', 'error'); return; } this.importObject(d.data); } }, 'Import code'),
        el('button', { class: 'tool', type: 'button', onclick: () => dlg.close() }, 'Cancel')));
    dlg.append(body);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
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

  openPadEditor(index) {
    if (!this.board) return;
    this.closeSheet();
    const b = this.board;
    const cur = b.pads[index];
    const dlg = el('dialog', { class: 'sheet sheet-wide', 'aria-label': `pad ${index + 1}` });
    const body = el('div', { class: 'sheet-body' });
    const packSel = el('select', { 'aria-label': 'game' }, el('option', { value: '' }, 'Game…'), ...Packs.list().map((p) => el('option', { value: p.id, selected: cur && cur.pack === p.id }, p.name)));
    const cueGrid = el('div', { class: 'cue-grid', role: 'listbox', 'aria-label': 'sounds' });
    const label = el('input', { class: 'song-name', type: 'text', maxlength: 24, placeholder: 'label (optional)', value: cur && cur.label ? cur.label : '', 'aria-label': 'pad label' });
    let picked = cur ? { pack: cur.pack, cue: cur.cue } : null;
    const fillCues = async () => {
      cueGrid.replaceChildren();
      if (!packSel.value) return;
      cueGrid.append(el('span', { class: 'ctl-hint' }, 'Loading…'));
      const entry = await Packs.load(packSel.value);
      cueGrid.replaceChildren();
      if (entry.status !== 'ready') { cueGrid.append(el('span', { class: 'board-status is-error' }, `Pack unavailable — ${entry.error}`)); return; }
      for (const c of entry.pack.cues) {
        const chip = el('button', { class: `cue-chip${picked && picked.pack === entry.desc.id && picked.cue === c.name ? ' is-picked' : ''}`, type: 'button', role: 'option', 'aria-selected': String(!!(picked && picked.pack === entry.desc.id && picked.cue === c.name)), title: noteFor(entry.desc.id, c.name),
          onclick: () => { picked = { pack: entry.desc.id, cue: c.name }; cueGrid.querySelectorAll('.cue-chip').forEach((x) => { x.classList.remove('is-picked'); x.setAttribute('aria-selected', 'false'); }); chip.classList.add('is-picked'); chip.setAttribute('aria-selected', 'true'); if (!c.sustained) Packs.fire(entry.desc.id, c.name, { params: defaultParams(entry.desc.id, c.name) }); } },
          c.name, c.sustained ? el('small', {}, ' ∞') : null);
        cueGrid.append(chip);
      }
    };
    packSel.addEventListener('change', fillCues);
    body.append(
      el('h3', { class: 'sheet-title' }, `Pad ${index + 1}`, el('small', {}, ` · key ${keyForPad(index) || '—'}`), panelHelp(PANELS.padEditor.title, PANELS.padEditor.body)),
      el('div', { class: 'row' }, packSel, label),
      cueGrid,
      el('div', { class: 'sheet-actions' },
        cur ? el('button', { class: 'tool', type: 'button', onclick: () => { b.pads[index] = null; this.saveBoard(); dlg.close(); this.openMine(); } }, 'Clear pad') : null,
        el('button', { class: 'tool', type: 'button', onclick: () => dlg.close() }, 'Cancel'),
        el('button', { class: 'tool tool-primary', type: 'button', onclick: () => {
          if (!picked) { Share.toast('Pick a sound first', 'info'); return; }
          const keep = cur && cur.pack === picked.pack && cur.cue === picked.cue ? cur : null;
          b.pads[index] = { pack: picked.pack, cue: picked.cue, params: keep ? keep.params : defaultParams(picked.pack, picked.cue), label: label.value.trim().slice(0, 24) || null, velocity: keep ? keep.velocity : 1, seedLock: keep ? keep.seedLock : false, seed: keep ? keep.seed : 1 };
          this.saveBoard(); dlg.close(); this.openMine();
        } }, 'Save pad')));
    dlg.append(body);
    dlg.addEventListener('close', () => { if (this.sheet === dlg) this.sheet = null; dlg.remove(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg); this.sheet = dlg; dlg.showModal();
    if (packSel.value) fillCues();
  }

  // ── pad sheet (settings) ──────────────────────────────────────────────

  openSheet(p) {
    this.closeSheet();
    if (p.empty) { this.openPadEditor(p.index); return; }
    const desc = Packs.get(p.pack) && Packs.get(p.pack).desc;
    const dlg = el('dialog', { class: 'sheet', 'aria-label': `${p.cue} settings` });
    const body = el('div', { class: 'sheet-body' });
    body.append(el('h3', { class: 'sheet-title' }, p.label || p.cue, el('small', {}, ` · ${desc ? desc.name : p.pack}`)), el('p', { class: 'sheet-note' }, noteFor(p.pack, p.cue)));
    const persist = () => { if (this.board && this.board.pads[p.index]) { Object.assign(this.board.pads[p.index], { params: p.params, velocity: p.velocity, seedLock: p.seedLock, seed: p.seed }); this.saveBoard(); } };
    const live = () => this.beds.get(p.index);
    if (p.paramSpec) {
      for (const [k, def] of Object.entries(p.paramSpec)) {
        const set = (v) => { p.params = p.params || {}; p.params[k] = v; persist(); const h = live(); if (h && h.live) h.retune(p.params, 0.8); };
        const help = `The game passes \`${k}\` to this cue per play.`;
        if (Array.isArray(def)) body.append(control({ kind: 'count', name: k, label: k, value: p.params ? p.params[k] : def[3], range: [def[0], def[1], def[2]], help, onChange: set }));
        else if (def.options) body.append(control({ kind: 'choice', name: k, label: k, value: p.params ? p.params[k] : def.options[0], options: def.options, help, onChange: set }));
        else if (def.bool) body.append(control({ kind: 'toggle', name: k, label: k, value: !!(p.params && p.params[k]), help, onChange: set }));
      }
    }
    if (!p.sustained) {
      body.append(control({ kind: 'gain', name: 'velocity', label: 'loudness', value: p.velocity, range: [0.05, 1, 0.01], help: 'How hard this pad hits.', onChange: (v) => { p.velocity = v; persist(); } }));
      body.append(control({ kind: 'toggle', name: 'seedLock', label: 'same every time', value: p.seedLock, help: 'Locks the seed so this pad repeats exactly. Off, every hit is a fresh take — hear what per-play variation buys.', onChange: (v) => { p.seedLock = v; persist(); } }));
    }
    if (this.board) body.append(el('button', { class: 'tool', type: 'button', onclick: () => { dlg.close(); this.openPadEditor(p.index); } }, 'Change sound…'));
    body.append(el('div', { class: 'sheet-actions' },
      el('button', { class: 'tool', type: 'button', onclick: () => this.hit(p) }, p.sustained ? (live() && live().live ? 'Stop' : 'Start') : 'Play'),
      el('button', { class: 'tool tool-primary', type: 'button', onclick: () => this.closeSheet() }, 'Done')));
    dlg.append(body);
    dlg.addEventListener('close', () => { if (this.sheet === dlg) this.sheet = null; dlg.remove(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg); this.sheet = dlg; dlg.showModal();
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
