// Compose — the step sequencer. Tracks are fleet cues; patterns hold their
// steps; the chain is the song. Timing comes from js/scheduler.js against the
// AudioContext clock; the document is js/song.js. The grid comes first and
// the song's management lives in one menu (docs/ux-pass-2026-09.md).

import * as Packs from '../packs.js';
import * as Song from '../song.js';
import { makeClock, advance, nearestStep, stepSeconds } from '../scheduler.js';
import { CUE_PARAMS, defaultParams } from '../cue-params.js';
import { PANELS } from '../help.js';
import { control, panelHelp, el } from '../controls.js';
import { menu, more, intro, soundPicker, sheet } from '../ui.js';
import * as Share from '../share.js';
import * as Render from '../render.js';
import * as Stats from '../stats.js';

const LOOKAHEAD = 0.12;   // seconds of audio scheduled ahead
const INTERVAL = 25;      // ms between scheduler wakes

export class ComposeView {
  constructor(root, { prefs }) {
    this.root = root;
    this.prefs = prefs;
    this.song = null;
    this.history = new Song.History();
    this.store = null;
    this.songs = [];            // [{ id, name }]
    this.patternId = null;      // pattern being edited
    this.playing = false; this.recording = false; this.metronome = false;
    this.clock = null; this.timer = null; this.pending = []; this.currentAbs = -1; this.currentRes = null;
    this.loop = null; this.saveTimer = null; this.dirty = false;
    this.tapTimes = [];
    this.onKey = this.onKey.bind(this);
  }

  // ── lifecycle ─────────────────────────────────────────────────────────

  async mount() {
    this.root.replaceChildren();
    this.root.style.setProperty('--hue', 40);
    this.songCard = el('section', { class: 'card' });
    this.transportCard = el('section', { class: 'card' });
    this.patternCard = el('section', { class: 'card' });
    this.gridCard = el('section', { class: 'card seq-card' });
    const hello = intro(this.prefs, 'compose', {
      title: 'Put sounds on a grid',
      lines: [
        'Add a sound — any game\'s — and it becomes a row. Tap a cell to place a hit; drag up or down on it for loudness; drag across a row to paint. Play loops it; Space plays and stops.',
        'Tempo and Tap are on the transport; swing and the grid\'s size are under Grid. Patterns are sections; once you have two, the chain puts them in order.',
        'Songs save themselves. Everything else about a song — switching, sharing, rendering to WAV — is in its ⋯ menu.',
      ],
    });
    this.root.append(el('div', { class: 'lab-body' }, ...(hello ? [hello] : []), this.songCard, this.transportCard, this.patternCard, this.gridCard));
    document.addEventListener('keydown', this.onKey);
    this.store = (window.Arcade && Arcade.store && typeof Arcade.store.open === 'function') ? Arcade.store.open('songs') : null;
    await this.loadSongList();
    const wanted = this.prefs.get('song');
    const first = this.songs.find((s) => s.id === wanted) || this.songs[0];
    if (first) await this.loadSong(first.id); else this.setSong(Song.newSong({ name: 'First song' }));
  }

  unmount() {
    document.removeEventListener('keydown', this.onKey);
    this.stop();
    if (this.loop) { this.loop.dispose(); this.loop = null; }
    this.flushSave();
  }

  stopAllBeds() { this.stop(); }

  // ── persistence ───────────────────────────────────────────────────────

  async loadSongList() {
    this.songs = [];
    if (!this.store) return;
    try {
      await this.store.each((v, k) => { if (v && typeof v === 'object') this.songs.push({ id: k, name: String(v.name || k), updated: v.updated || 0 }); });
      this.songs.sort((a, b) => (b.updated || 0) - (a.updated || 0));
    } catch (e) { console.warn('[audio-tune] songs store:', e); }
  }

  async loadSong(id) {
    if (!this.store) return;
    let raw = null;
    try { raw = await this.store.get(id); } catch (e) { raw = null; }
    if (!raw) return;
    try { Song.validateSong(raw); } catch (e) { console.warn('[audio-tune] stored song rejected:', e.message); return; }
    this.setSong(raw);
  }

  setSong(song) {
    this.stop();
    this.song = song;
    this.history = new Song.History();
    this.patternId = song.patterns[0].id;
    this.prefs.set('song', song.id);
    for (const t of song.tracks) Packs.load(t.pad.pack);
    this.renderAll();
  }

  mutate(fn, { structural = false } = {}) {
    this.history.push(this.song);
    fn(this.song);
    this.song.updated = Date.now();
    this.scheduleSave();
    if (structural) this.renderAll(); else this.renderSongHead();
  }

  scheduleSave() {
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), 600);
    this.renderSaved();
  }

  async flushSave() {
    clearTimeout(this.saveTimer);
    if (!this.dirty || !this.store || !this.song) return;
    try { await this.store.set(this.song.id, Song.serialize(this.song)); this.dirty = false; } catch (e) { console.warn('[audio-tune] save failed:', e); }
    if (this.song.tracks.length) { Stats.bump('songsSaved'); const r = Stats.recordLongestSong(Song.chainLength(this.song)); if (r && r.improved) Share.toast('New longest song!', 'success'); }
    const i = this.songs.findIndex((s) => s.id === this.song.id);
    if (i < 0) this.songs.unshift({ id: this.song.id, name: this.song.name, updated: this.song.updated }); else this.songs[i].name = this.song.name;
    this.renderSaved();
  }

  renderSaved() { const n = this.root.querySelector('.saved'); if (n) n.textContent = this.dirty ? 'saving…' : (this.store ? 'saved' : 'not saved (no store)'); }

  // ── rendering ─────────────────────────────────────────────────────────

  renderAll() { this.renderSongHead(); this.renderTransport(); this.renderPatterns(); this.renderGrid(); }

  renderSongHead() {
    const s = this.song;
    const name = el('input', { class: 'song-name', type: 'text', value: s.name, maxlength: 60, 'aria-label': 'song name',
      onchange: (e) => this.mutate((song) => { song.name = e.target.value.slice(0, 60) || 'Untitled'; }) });
    const undo = el('button', { class: 'tool', type: 'button', disabled: !this.history.canUndo(), onclick: () => { const p = this.history.undo(this.song); if (p) { this.song = p; this.scheduleSave(); this.renderAll(); } } }, '↶ Undo');
    const redo = el('button', { class: 'tool', type: 'button', disabled: !this.history.canRedo(), onclick: () => { const n = this.history.redo(this.song); if (n) { this.song = n; this.scheduleSave(); this.renderAll(); } } }, '↷ Redo');
    const songMenu = menu({ label: 'Song menu', items: () => [
      this.songs.length > 1 ? { label: 'Songs', options: this.songs.map((x) => ({ label: x.name, value: x.id })), value: s.id, onSelect: async (id) => { await this.flushSave(); await this.loadSong(id); } } : null,
      this.songs.length > 1 ? { sep: true } : null,
      { label: 'New song', onSelect: async () => { await this.flushSave(); this.setSong(Song.newSong({ name: `Song ${this.songs.length + 1}` })); this.scheduleSave(); } },
      { label: 'Duplicate', onSelect: async () => { await this.flushSave(); const copy = Song.serialize(this.song); copy.id = Song.uid('s'); copy.name = `${this.song.name} copy`; this.setSong(copy); this.scheduleSave(); } },
      { label: 'Delete this song', danger: true, onSelect: async () => {
        if (!(await Share.confirm(`Delete "${this.song.name}"?`, 'Delete'))) return;
        if (this.store) { try { await this.store.del(this.song.id); } catch (e) { /* noop */ } }
        this.songs = this.songs.filter((x) => x.id !== this.song.id); this.dirty = false;
        if (this.songs[0]) await this.loadSong(this.songs[0].id); else this.setSong(Song.newSong({ name: 'First song' }));
      } },
      { sep: true },
      { label: 'Share as a code', onSelect: () => this.shareSong() },
      Share.configsAvailable() ? { label: 'Send to a device', onSelect: async () => { const r = await Share.sendConfig('song', Song.compactSong(this.song)); Share.toast(r.ok ? (r.sent ? 'Sent' : 'Nobody to send to yet — connect a device from the launcher menu') : 'Could not send', r.ok ? 'info' : 'error'); } } : null,
      { label: 'Export file', onSelect: () => Share.downloadJson(`${this.song.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'song'}.audio-tune-song.json`, Song.compactSong(this.song)) },
      { label: 'Import…', onSelect: () => this.importSong() },
      { sep: true },
      { label: 'Render to WAV', onSelect: () => this.renderWav(1) },
      { label: 'Render ×4 passes', hint: 'the chain four times', onSelect: () => this.renderWav(4) },
    ] });
    this.songCard.replaceChildren(
      el('div', { class: 'song-head' },
        el('h2', { class: 'card-h' }, 'Song', panelHelp(PANELS.songs.title, `${PANELS.songs.body} ${PANELS.songMenu.body}`)),
        name, el('span', { class: 'saved' }), undo, redo, songMenu,
        el('span', { class: 'render-status ctl-hint' })),
    );
    this.renderSaved();
  }

  async renderWav(passes) {
    if (!this.song.tracks.length) { Share.toast('Add a track first', 'info'); return; }
    const status = this.songCard.querySelector('.render-status');
    const say = (m) => { if (status) status.textContent = m; };
    say('Rendering…');
    try {
      const r = await Render.renderSong(this.song, { passes, onProgress: (f) => say(`Rendering… ${Math.round(f * 100)}%`) });
      const ch = Render.trimTail(r.channels, r.sampleRate);
      Render.downloadWav(Render.wavName(`${this.song.name}${passes > 1 ? `-x${passes}` : ''}`), ch, r.sampleRate);
      say(`${(ch[0].length / r.sampleRate).toFixed(1)} s · peak ${r.peak > 0 ? (20 * Math.log10(r.peak)).toFixed(1) : '−∞'} dBFS`);
      Stats.bump('rendersMade');
    } catch (e) { say(''); Share.toast(`Render failed: ${e.message}`, 'error', 3000); }
  }

  async shareSong() {
    const data = Song.compactSong(this.song);
    if (Share.byteLength(data) > 8000) { Share.toast('This song is too big for a code — use Export file', 'info', 2500); return; }
    if (Share.configsAvailable()) { const r = await Share.shareConfig('song', data); if (r.ok) return; }
    const ok = await Share.copyText(Share.encodeCode(data, 1));
    Share.toast(ok ? 'Song code copied — paste it into Import' : 'Could not copy; use Export file', ok ? 'success' : 'error');
  }

  importSong() {
    const codeIn = el('textarea', { class: 'code-in', rows: 3, placeholder: 'Paste a song code…', 'aria-label': 'code' });
    const take = async (obj) => {
      try {
        const song = Song.expandSong(obj);
        Song.validateSong(song, { packs: Packs.list().map((p) => p.id) });
        await this.flushSave();
        this.setSong(song); this.scheduleSave();
        Share.toast(`Imported "${song.name}"`, 'success');
      } catch (e) { Share.toast(`Could not import: ${e.message}`, 'error', 2500); }
    };
    const dlg = sheet({ title: 'Import a song', note: 'A song code, or a song file someone exported.', body: codeIn, actions: [
      el('button', { class: 'tool', type: 'button', onclick: async () => { const obj = await Share.openJson(); if (obj) { dlg.close(); take(obj); } } }, 'Open file…'),
      el('button', { class: 'tool', type: 'button', onclick: () => dlg.close() }, 'Cancel'),
      el('button', { class: 'tool tool-primary', type: 'button', onclick: () => { const d = Share.decodeCode(codeIn.value); dlg.close(); if (!d) { Share.toast('That is not a code we understand', 'error'); return; } take(d.data); } }, 'Import code'),
    ] });
  }

  renderTransport() {
    const s = this.song;
    this.playBtn = el('button', { class: 'tool tool-primary', type: 'button', onclick: () => this.togglePlay() }, this.playing ? '■ Stop' : '▶ Play');
    this.recBtn = el('button', { class: `tool${this.recording ? ' is-rec' : ''}`, type: 'button', 'aria-pressed': String(this.recording), onclick: () => { this.recording = !this.recording; this.renderTransport(); } }, '● Record');
    const metro = el('label', { class: 'control-opt' }, el('input', { type: 'checkbox', checked: this.metronome, onchange: (e) => { this.metronome = e.target.checked; } }), el('span', {}, 'metronome'));
    this.posOut = el('output', { class: 'seq-pos', 'aria-live': 'off' }, '—');
    const tempo = control({ kind: 'character', name: 'bpm', label: 'tempo', value: s.bpm, range: [40, 240, 1], poles: ['slow', 'fast'], unit: 'bpm',
      help: 'Beats per minute. Tap the button in time to set it from a feel; the grid keeps its place when it changes.', onChange: (v) => this.mutate((song) => { song.bpm = v; }) });
    const tap = el('button', { class: 'tool', type: 'button', onclick: () => this.tap(tempo) }, 'Tap');
    const swing = control({ kind: 'character', name: 'swing', label: 'swing', value: s.swing, range: [0, 1, 0.01], poles: ['straight', 'swung'],
      help: 'Delays every other step so the groove leans. Two thirds of the way is close to a triplet shuffle.', onChange: (v) => this.mutate((song) => { song.swing = v; }) });
    const steps = control({ kind: 'choice', name: 'steps', label: 'steps per bar', value: s.stepsPerBar, options: Song.STEP_OPTIONS,
      help: 'How finely the bar is divided. 16 is sixteenth notes; 8 is eighths; 32 is for fast detail.', onChange: (v) => this.mutate((song) => { song.stepsPerBar = Number(v); Song.resizePatterns(song); }, { structural: true }) });
    const bars = control({ kind: 'choice', name: 'bars', label: 'bars', value: s.bars, options: Song.BAR_OPTIONS,
      help: 'How many bars each pattern holds.', onChange: (v) => this.mutate((song) => { song.bars = Number(v); Song.resizePatterns(song); }, { structural: true }) });
    const gridOpen = !!this.prefs.get('gridOpen');
    const grid = more('Grid', [el('div', { class: 'controls seq-controls' }, swing, steps, bars)], { open: gridOpen });
    grid.addEventListener('toggle', () => this.prefs.set('gridOpen', grid.open));
    grid.querySelector('summary').append(' ', el('small', { class: 'ctl-hint' }, `${s.swing > 0 ? `swing ${Math.round(s.swing * 100)}% · ` : ''}${s.stepsPerBar} steps × ${s.bars} bar${s.bars === 1 ? '' : 's'}`), panelHelp(PANELS.gridSettings.title, PANELS.gridSettings.body));
    this.transportCard.replaceChildren(
      el('h2', { class: 'card-h' }, 'Transport', panelHelp(PANELS.transportSeq.title, PANELS.transportSeq.body)),
      el('div', { class: 'transport' }, this.playBtn, this.recBtn, metro, this.posOut),
      el('div', { class: 'controls seq-controls' }, el('div', { class: 'tempo-wrap' }, tempo, tap)),
      grid,
    );
  }

  tap(tempoCtl) {
    const now = performance.now();
    this.tapTimes = this.tapTimes.filter((t) => now - t < 2500);
    this.tapTimes.push(now);
    if (this.tapTimes.length >= 2) {
      const gaps = []; for (let i = 1; i < this.tapTimes.length; i++) gaps.push(this.tapTimes[i] - this.tapTimes[i - 1]);
      const bpm = Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
      const v = Math.max(40, Math.min(240, bpm));
      tempoCtl.set(v);
      this.mutate((song) => { song.bpm = v; });
    }
  }

  renderPatterns() {
    const s = this.song;
    const tabs = el('div', { class: 'pattern-tabs', role: 'tablist', 'aria-label': 'Patterns' },
      ...s.patterns.map((p) => el('button', { class: 'subtab', role: 'tab', type: 'button', 'aria-selected': String(p.id === this.patternId), onclick: () => { this.patternId = p.id; this.renderPatterns(); this.renderGrid(); } }, p.name)),
      el('button', { class: 'tool', type: 'button', onclick: () => this.mutate((song) => { const p = Song.addPattern(song); this.patternId = p.id; }, { structural: true }) }, '+ Pattern'),
      s.patterns.length > 1 ? el('button', { class: 'tool', type: 'button', onclick: () => this.mutate((song) => { Song.removePattern(song, this.patternId); this.patternId = song.patterns[0].id; }, { structural: true }) }, 'Delete pattern') : null,
    );
    this.patternCard.replaceChildren(
      el('h2', { class: 'card-h' }, 'Patterns', panelHelp(PANELS.patterns.title, PANELS.patterns.body)),
      tabs);
    if (s.patterns.length <= 1) {
      this.patternCard.append(el('p', { class: 'card-sub' }, 'One pattern loops. Add a second — a fill, a chorus — and the chain appears here to put them in order.'));
      return;
    }
    const chain = el('div', { class: 'chain', 'aria-label': 'Song chain' });
    s.chain.forEach((c, i) => {
      const p = s.patterns.find((x) => x.id === c.pattern);
      chain.append(el('div', { class: `chain-chip${this.currentRes && this.currentRes.chainPos === i ? ' is-playing' : ''}` },
        el('button', { class: 'chip-move', type: 'button', 'aria-label': 'move earlier', disabled: i === 0, onclick: () => this.mutate((song) => Song.chainMove(song, i, i - 1), { structural: true }) }, '◀'),
        el('span', { class: 'chip-name' }, p ? p.name : '?'),
        el('button', { class: 'chip-rep', type: 'button', 'aria-label': 'fewer repeats', onclick: () => this.mutate((song) => Song.chainRepeat(song, i, c.repeat - 1), { structural: true }) }, '−'),
        el('span', { class: 'chip-count' }, `×${c.repeat}`),
        el('button', { class: 'chip-rep', type: 'button', 'aria-label': 'more repeats', onclick: () => this.mutate((song) => Song.chainRepeat(song, i, c.repeat + 1), { structural: true }) }, '+'),
        el('button', { class: 'chip-move', type: 'button', 'aria-label': 'move later', disabled: i === s.chain.length - 1, onclick: () => this.mutate((song) => Song.chainMove(song, i, i + 1), { structural: true }) }, '▶'),
        el('button', { class: 'chip-x', type: 'button', 'aria-label': 'remove from chain', disabled: s.chain.length <= 1, onclick: () => this.mutate((song) => Song.chainRemove(song, i), { structural: true }) }, '×'),
      ));
    });
    const addSel = el('select', { 'aria-label': 'add pattern to chain', onchange: (e) => { if (e.target.value) { this.mutate((song) => Song.chainAdd(song, e.target.value), { structural: true }); } } },
      el('option', { value: '' }, '+ add to chain…'), ...s.patterns.map((p) => el('option', { value: p.id }, p.name)));
    this.patternCard.append(
      el('h3', { class: 'card-h chain-h' }, 'Chain', panelHelp(PANELS.chain.title, PANELS.chain.body)),
      el('div', { class: 'row' }, chain, addSel),
    );
  }

  pattern() { return this.song.patterns.find((p) => p.id === this.patternId) || this.song.patterns[0]; }

  renderGrid() {
    const s = this.song, p = this.pattern(), len = Song.patternLength(s);
    const grid = el('div', { class: 'seq-grid', style: `--steps:${len}`, role: 'grid', 'aria-label': `pattern ${p.name}` });
    const head = el('div', { class: 'seq-row seq-head', role: 'row' }, el('div', { class: 'seq-rowhead' }, el('span', { class: 'ctl-hint' }, `${s.tracks.length} track${s.tracks.length === 1 ? '' : 's'}`)));
    for (let i = 0; i < len; i++) {
      const beat = i % (s.stepsPerBar / 4) === 0;
      head.append(el('div', { class: `seq-colhead${beat ? ' is-beat' : ''}`, dataset: { step: i }, role: 'columnheader' }, beat ? String(Math.floor(i / (s.stepsPerBar / 4)) + 1) : ''));
    }
    grid.append(head);
    s.tracks.forEach((t, ti) => grid.append(this.renderRow(t, ti, p, len)));
    const add = el('button', { class: 'tool tool-primary', type: 'button', onclick: () => this.addTrackSheet() }, '+ Add a sound');
    this.gridCard.replaceChildren(
      el('div', { class: 'song-head' },
        el('h2', { class: 'card-h' }, s.patterns.length > 1 ? `Pattern ${p.name}` : 'Grid', panelHelp(PANELS.grid.title, PANELS.grid.body)),
        add, panelHelp(PANELS.track.title, PANELS.track.body)),
      s.tracks.length
        ? el('p', { class: 'card-sub' }, 'Tap a cell to place a hit; drag up or down on it for loudness; drag across a row to paint. Tap a track\'s name for its settings. Keys 1–9 play the tracks.')
        : null,
      s.tracks.length ? el('div', { class: 'seq-scroll' }, grid) : el('div', { class: 'seq-empty' }, 'No tracks yet. Add a sound from any game and it becomes a row here.'),
    );
    this.grid = grid;
  }

  renderRow(t, ti, p, len) {
    const s = this.song;
    const row = Song.stepsFor(s, p, t.id);
    const desc = Packs.get(t.pad.pack) && Packs.get(t.pad.pack).desc;
    const hue = desc ? desc.hue : 0;
    const r = el('div', { class: `seq-row${t.mute ? ' is-muted' : ''}${t.solo ? ' is-solo' : ''}`, role: 'row', style: `--hue:${hue}`, dataset: { track: t.id } });
    const head = el('div', { class: 'seq-rowhead' },
      el('button', { class: 'seq-name', type: 'button', title: 'track settings', onclick: () => this.openTrack(t) },
        el('span', { class: 'seq-swatch', 'aria-hidden': 'true' }), el('span', { class: 'seq-key', 'aria-hidden': 'true' }, ti < 9 ? String(ti + 1) : ''), el('span', { class: 'seq-label' }, t.name)),
      el('span', { class: 'seq-meta' }, desc ? desc.name : t.pad.pack),
      el('div', { class: 'seq-ms' },
        el('button', { class: `mini${t.mute ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(t.mute), 'aria-label': 'mute', onclick: () => this.mutate((song) => { const x = song.tracks.find((y) => y.id === t.id); x.mute = !x.mute; }, { structural: true }) }, 'M'),
        el('button', { class: `mini${t.solo ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(t.solo), 'aria-label': 'solo', onclick: () => this.mutate((song) => { const x = song.tracks.find((y) => y.id === t.id); x.solo = !x.solo; }, { structural: true }) }, 'S')));
    r.append(head);
    for (let i = 0; i < len; i++) r.append(this.renderCell(t, p, i, row[i]));
    return r;
  }

  renderCell(t, p, i, vel) {
    const s = this.song;
    const beat = i % (s.stepsPerBar / 4) === 0;
    const cell = el('button', { class: `seq-cell${beat ? ' is-beat' : ''}${vel > 0 ? ' is-on' : ''}`, type: 'button', role: 'gridcell', dataset: { step: i },
      'aria-label': `${t.name} step ${i + 1}${vel > 0 ? `, ${Math.round(vel * 100)}%` : ', off'}`, 'aria-pressed': String(vel > 0) },
      el('span', { class: 'seq-fill', style: `height:${Math.round(vel * 100)}%` }));
    let startY = 0, startVel = vel, moved = false, painting = false;
    cell.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startY = e.clientY; startVel = Song.stepsFor(s, p, t.id)[i]; moved = false; painting = false;
      cell.setPointerCapture(e.pointerId);
    });
    cell.addEventListener('pointermove', (e) => {
      if (!cell.hasPointerCapture(e.pointerId)) return;
      const dy = startY - e.clientY;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const other = under && under.closest && under.closest('.seq-cell');
      if (other && other !== cell && other.parentElement === cell.parentElement) {
        painting = true; moved = true;
        const j = Number(other.dataset.step);
        const cur = Song.stepsFor(s, p, t.id);
        if (cur[j] === 0) { Song.setStep(s, p, t.id, j, startVel > 0 ? startVel : 1); this.updateCell(other, t, cur[j]); this.dirtyStep(); }
        return;
      }
      if (Math.abs(dy) > 6 && !painting) {
        moved = true;
        const v = Math.max(0.1, Math.min(1, (startVel > 0 ? startVel : 0.5) + dy / 80));
        Song.setStep(s, p, t.id, i, v); this.updateCell(cell, t, v);
      }
    });
    cell.addEventListener('pointerup', () => {
      if (!moved) { const v = Song.toggleStep(s, p, t.id, i, 1); this.updateCell(cell, t, v); if (v > 0 && !this.playing) this.fireTrack(t, null, v); }
      this.dirtyStep();
    });
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const v = Song.toggleStep(s, p, t.id, i, 1); this.updateCell(cell, t, v); this.dirtyStep(); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const cur = Song.stepsFor(s, p, t.id)[i] || 0.5; const v = Math.max(0.1, Math.min(1, cur + (e.key === 'ArrowUp' ? 0.1 : -0.1))); Song.setStep(s, p, t.id, i, v); this.updateCell(cell, t, v); this.dirtyStep(); }
    });
    return cell;
  }

  updateCell(cell, t, vel) {
    cell.classList.toggle('is-on', vel > 0);
    cell.setAttribute('aria-pressed', String(vel > 0));
    cell.setAttribute('aria-label', `${t.name} step ${Number(cell.dataset.step) + 1}${vel > 0 ? `, ${Math.round(vel * 100)}%` : ', off'}`);
    cell.querySelector('.seq-fill').style.height = `${Math.round(vel * 100)}%`;
  }

  dirtyStep() { this.song.updated = Date.now(); this.scheduleSave(); }

  /** The shared picker, as a sheet: tap a sound to hear it, Add to make it a row. */
  addTrackSheet() {
    const lastPack = this.prefs.get('trackPack') || (this.song.tracks.length ? this.song.tracks[this.song.tracks.length - 1].pad.pack : '');
    const add = el('button', { class: 'tool tool-primary', type: 'button', disabled: true, onclick: () => {
      const v = picker.value; if (!v) return;
      const entry = Packs.get(v.pack); const cue = entry && entry.pack.cues.find((c) => c.name === v.cue);
      if (!cue) return;
      this.prefs.set('trackPack', v.pack);
      this.mutate((song) => Song.addTrack(song, Song.newTrack({ pack: v.pack, cue: cue.name, params: defaultParams(v.pack, cue.name) })), { structural: true });
      dlg.close();
      Share.toast(`${cue.name} is track ${this.song.tracks.length}`, 'success', 1600);
    } }, 'Add as a track');
    const picker = soundPicker({ packs: Packs.list(), picked: lastPack ? { pack: lastPack, cue: null } : null, filter: (c) => !c.sustained, label: 'sounds to add',
      onPick: () => { add.disabled = false; } });
    const dlg = sheet({ title: 'Add a sound', note: 'A game, then one of its sounds — tap to hear it. Beds are not tracks; everything else is.', body: [picker, panelHelp(PANELS.picker.title, PANELS.picker.body)], wide: true, actions: [
      el('button', { class: 'tool', type: 'button', onclick: () => dlg.close() }, 'Cancel'), add,
    ] });
  }

  openTrack(t) {
    const body = [];
    const name = el('input', { type: 'text', value: t.name, maxlength: 40, 'aria-label': 'track name', class: 'song-name',
      onchange: (e) => this.mutate((song) => { song.tracks.find((x) => x.id === t.id).name = e.target.value.slice(0, 40) || t.pad.cue; }, { structural: true }) });
    body.push(name);
    body.push(control({ kind: 'gain', name: 'gain', label: 'level', value: t.gain, range: [0, 1, 0.01], help: 'This track\'s level, multiplied by each hit\'s own loudness.',
      onChange: (v) => this.mutate((song) => { song.tracks.find((x) => x.id === t.id).gain = v; }) }));
    body.push(control({ kind: 'toggle', name: 'seedLock', label: 'same every hit', value: t.pad.seedLock,
      help: 'Locks the seed so every hit of this track is identical — the drum-machine feel. Off, each hit is a fresh take from the stream, the way the games play.',
      onChange: (v) => this.mutate((song) => { song.tracks.find((x) => x.id === t.id).pad.seedLock = v; }) }));
    const meta = (CUE_PARAMS[t.pad.pack] || {})[t.pad.cue] || {};
    if (meta.params && t.pad.params) {
      for (const [k, spec] of Object.entries(meta.params)) {
        const set = (v) => this.mutate((song) => { const x = song.tracks.find((y) => y.id === t.id); x.pad.params = { ...(x.pad.params || {}), [k]: v }; });
        const help = `The game passes \`${k}\` to this cue per play.`;
        if (Array.isArray(spec)) body.push(control({ kind: 'count', name: k, label: k, value: t.pad.params[k], range: [spec[0], spec[1], spec[2]], help, onChange: set }));
        else if (spec.options) body.push(control({ kind: 'choice', name: k, label: k, value: t.pad.params[k], options: spec.options, help, onChange: set }));
        else if (spec.bool) body.push(control({ kind: 'toggle', name: k, label: k, value: !!t.pad.params[k], help, onChange: set }));
      }
    }
    const dlg = sheet({ title: t.pad.cue, note: `${(Packs.get(t.pad.pack) || { desc: {} }).desc.name || t.pad.pack} · track ${this.song.tracks.indexOf(t) + 1}`, body, actions: [
      el('button', { class: 'tool', type: 'button', onclick: () => this.fireTrack(t, null, 1) }, 'Play'),
      el('button', { class: 'tool', type: 'button', onclick: () => { dlg.close(); this.mutate((song) => Song.removeTrack(song, t.id), { structural: true }); } }, 'Remove track'),
      el('button', { class: 'tool tool-primary', type: 'button', onclick: () => dlg.close() }, 'Done'),
    ] });
  }

  // ── playback ──────────────────────────────────────────────────────────

  cfg() { return { bpm: this.song.bpm, swing: this.song.swing, stepsPerBar: this.song.stepsPerBar }; }

  togglePlay() { if (this.playing) this.stop(); else this.play(); }

  async play() {
    if (this.playing || !this.song) return;
    const bus = Packs.sdkBus(); if (!bus) return;
    await Promise.all(this.song.tracks.map((t) => Packs.load(t.pad.pack)));
    if (this.playing) return;
    this.playing = true;
    this.clock = makeClock(bus.ctx.currentTime + 0.05);
    this.pending = []; this.currentAbs = -1;
    this.timer = setInterval(() => this.tick(), INTERVAL);
    this.tick();
    if (!this.loop && window.Arcade && typeof Arcade.loop === 'function') this.loop = Arcade.loop(() => this.drawPlayhead());
    if (this.loop) this.loop.start();
    this.renderTransport();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer); this.timer = null;
    if (this.loop) this.loop.stop();
    this.pending = []; this.currentRes = null;
    this.root.querySelectorAll('.is-playhead').forEach((n) => n.classList.remove('is-playhead'));
    if (this.posOut) this.posOut.value = '—';
    this.renderTransport();
  }

  tick() {
    const bus = Packs.sdkBus(); if (!bus) return;
    const ctx = bus.ctx;
    const events = advance(this.clock, ctx.currentTime + LOOKAHEAD, this.cfg());
    const audible = Song.audibleTracks(this.song);
    for (const ev of events) {
      const res = Song.resolveStep(this.song, ev.step);
      for (const t of audible) {
        const row = res.pattern.steps[t.id];
        const vel = row ? row[res.index] : 0;
        if (vel > 0) this.fireTrack(t, ev.time, vel);
      }
      if (this.metronome) this.click(ctx, bus, ev.time, res.index === 0, res.index % (this.song.stepsPerBar / 4) === 0);
      this.pending.push({ ...ev, res });
    }
  }

  fireTrack(t, when, vel) {
    const pad = t.pad;
    Packs.fire(pad.pack, pad.cue, { when: when == null ? undefined : when, params: pad.params, velocity: vel * t.gain, seed: pad.seedLock ? pad.seed : undefined });
  }

  click(ctx, bus, when, bar, beat) {
    if (!beat) return;
    const E = Packs.available() ? window.ArcadeAudioElements : null; if (!E) return;
    const o = E.out(bus, 0);
    E.strike(ctx, o, when, { dur: 0.004, hp: bar ? 2400 : 3600, gain: bar ? 0.14 : 0.08, seed: 5 });
    setTimeout(() => { try { o.disconnect(); } catch (e) { /* noop */ } }, (Math.max(0, when - ctx.currentTime) + 0.3) * 1000);
  }

  drawPlayhead() {
    const bus = Packs.sdkBus(); if (!bus) return;
    const now = bus.ctx.currentTime;
    let latest = null;
    while (this.pending.length && this.pending[0].time <= now) latest = this.pending.shift();
    if (!latest) return;
    this.currentAbs = latest.step; this.currentRes = latest.res;
    const s = this.song;
    if (this.posOut) this.posOut.value = `${latest.res.pattern.name} · bar ${Math.floor(latest.res.index / s.stepsPerBar) + 1} · step ${(latest.res.index % s.stepsPerBar) + 1}`;
    this.root.querySelectorAll('.is-playhead').forEach((n) => n.classList.remove('is-playhead'));
    if (latest.res.pattern.id === this.patternId && this.grid) {
      this.grid.querySelectorAll(`[data-step="${latest.res.index}"]`).forEach((n) => n.classList.add('is-playhead'));
    }
    const chips = this.patternCard.querySelectorAll('.chain-chip');
    chips.forEach((c, i) => c.classList.toggle('is-playing', i === latest.res.chainPos));
  }

  // ── keys ──────────────────────────────────────────────────────────────

  onKey(e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || ((t.tagName === 'BUTTON' || t.tagName === 'SUMMARY') && e.key === ' '))) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === ' ') { e.preventDefault(); this.togglePlay(); return; }
    if (e.key === 'Escape') { this.stop(); return; }
    if (e.key === 'r' || e.key === 'R') { this.recording = !this.recording; this.renderTransport(); return; }
    if (/^[1-9]$/.test(e.key)) {
      const track = this.song.tracks[Number(e.key) - 1];
      if (!track) return;
      e.preventDefault();
      this.fireTrack(track, null, 1);
      if (this.playing && this.recording) {
        const bus = Packs.sdkBus();
        const step = nearestStep(this.clock, bus.ctx.currentTime, this.cfg());
        const res = Song.resolveStep(this.song, step);
        Song.setStep(this.song, res.pattern, track.id, res.index, 1);
        this.dirtyStep();
        if (res.pattern.id === this.patternId && this.grid) {
          const cell = this.grid.querySelector(`.seq-row[data-track="${track.id}"] .seq-cell[data-step="${res.index}"]`);
          if (cell) this.updateCell(cell, track, 1);
        }
      }
    }
  }
}
void stepSeconds;
