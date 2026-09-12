/* main.js — Audio Tune boot and view router.
 *
 * SDK contract (GAME_INTEGRATION.md): await Arcade.ready before state; persist
 * only through Arcade.state / Arcade.store; let the SDK apply launcher
 * settings; stop everything sustained on suspend.
 */

import * as Packs from './js/packs.js';
import { BoardsView } from './js/views/boards.js';
import { LabView } from './js/views/lab.js';
import { ComposeView } from './js/views/compose.js';
import * as Recorder from './js/recorder.js';
import * as Boards from './js/boards-store.js';
import * as Song from './js/song.js';
import { toast } from './js/share.js';
import * as Cues from './js/user-cues.js';
import { BODY_PRESETS } from './js/element-params.js';

// The recorder wraps the element library so Explore can read a cue's recipe
// (docs/explore-design.md). Packs capture the library at load, so this must
// run before the first pack loads — i.e. here, at module evaluation.
Recorder.install(window);

const $ = (sel) => document.querySelector(sel);

const prefs = {
  get(key) { const p = Arcade.state.get('prefs'); return p ? p[key] : undefined; },
  set(key, value) {
    const p = Arcade.state.getOrInit('prefs', {});
    p[key] = value;
    Arcade.state.set('prefs', p);
  },
};

const views = {
  play: () => new BoardsView($('#view'), { prefs }),
  explore: () => new LabView($('#view'), { prefs }),
  compose: () => new ComposeView($('#view'), { prefs }),
};

function placeholder(title, text) {
  return {
    mount() {
      const root = $('#view');
      root.replaceChildren();
      const h = document.createElement('h2'); h.className = 'board-name'; h.textContent = title;
      const p = document.createElement('p'); p.className = 'board-place'; p.textContent = text;
      root.append(h, p);
    },
    unmount() {},
  };
}

let current = null;
let currentName = null;

// A read-only handle for the browser console and the smoke test.
window.AudioTune = { get view() { return current; }, get viewName() { return currentName; } };

function show(name) {
  if (!views[name] || name === currentName) return;
  if (current) current.unmount();
  current = views[name]();
  currentName = name;
  current.mount();
  document.querySelectorAll('.tab').forEach((t) => {
    t.setAttribute('aria-selected', String(t.dataset.view === name));
  });
  prefs.set('view', name);
}

function powerSaving() {
  const s = Arcade.settings;
  return s && s.powerSaver ? s.powerSaver() : false;
}

async function boot() {
  await Arcade.ready;
  Arcade.state.getOrInit('prefs', { firstSeen: Date.now() });

  const ctx = $('#context');
  if (!Packs.available()) {
    ctx.hidden = false;
    ctx.textContent = 'The element library did not load, so nothing here can make a sound. Reload from the launcher.';
  }

  try {
    await Packs.loadManifest();
  } catch (err) {
    ctx.hidden = false;
    ctx.textContent = `Could not read the fleet manifest: ${err.message}`;
    return;
  }

  // The user's own sounds are a pack too, so boards and songs can use them
  // before Explore has ever been opened.
  if (Packs.available()) {
    try {
      const { cues, room } = await Cues.list();
      Packs.registerVirtual(Cues.PACK_DESC, Cues.buildPack(cues, room, window.ArcadeAudioElements, BODY_PRESETS));
    } catch (err) { console.warn('[audio-tune] my sounds:', err); }
  }

  // Build the SDK bus on the first gesture anywhere, so the compressor's
  // ~250 ms warm-up is over before the first pad is hit (plan §3.3).
  document.addEventListener('pointerdown', () => Packs.sdkBus(), { capture: true, once: true });

  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => show(t.dataset.view));
  });

  // Configs pushed by a linked device or opened from a link can arrive before
  // a view is mounted, so they land in the stores here and the views re-read.
  if (Arcade.configs && typeof Arcade.configs.register === 'function') {
    Arcade.configs.register('board', async ({ data }) => {
      try {
        const b = await Boards.importCompact(data, { packs: Packs.list().map((p) => p.id) });
        toast(`Board "${b.name}" received — find it under Play`, 'success', 3000);
        if (currentName === 'play') { const n = currentName; currentName = null; show(n); }
      } catch (e) { toast(`A board arrived but was rejected: ${e.message}`, 'error', 3000); }
    });
    Arcade.configs.register('song', async ({ data }) => {
      try {
        const song = Song.expandSong(data);
        Song.validateSong(song, { packs: Packs.list().map((p) => p.id) });
        const store = Arcade.store.open('songs');
        await store.set(song.id, song);
        toast(`Song "${song.name}" received — find it under Compose`, 'success', 3000);
        if (currentName === 'compose') { const n = currentName; currentName = null; show(n); }
      } catch (e) { toast(`A song arrived but was rejected: ${e.message}`, 'error', 3000); }
    });
  }

  Arcade.onSuspend(() => { if (current && current.stopAllBeds) current.stopAllBeds(0.2); });
  Arcade.onSettingsChange(() => {
    if (powerSaving() && current && current.stopAllBeds) current.stopAllBeds(0.5);
  });
  Arcade.onStateReplaced(() => { const n = currentName; currentName = null; show(n || 'play'); });

  const last = prefs.get('view');
  show(views[last] ? last : 'play');
  welcome();
}

// A first-open hint: three lines and a dismiss, once.
function welcome() {
  if (prefs.get('welcomed')) return;
  const card = document.createElement('section');
  card.className = 'card welcome';
  card.setAttribute('role', 'note');
  card.innerHTML = '';
  const h = document.createElement('h2'); h.className = 'card-h'; h.textContent = 'Every sound in the arcade, on one grid';
  const p1 = document.createElement('p'); p1.className = 'card-sub'; p1.textContent = 'Play: tap a pad, or use the keyboard rows. Each board is one game\'s real sound pack. Hold a pad for its settings.';
  const p2 = document.createElement('p'); p2.className = 'card-sub'; p2.textContent = 'Explore: pick any fleet sound and see exactly how it is made, then change any of it. Compose: put sounds on a step grid and make a song.';
  const p3 = document.createElement('p'); p3.className = 'card-sub'; p3.textContent = 'Every control has a ? — and the Guide in Explore explains the whole system in five short pages.';
  const btn = document.createElement('button'); btn.className = 'tool tool-primary'; btn.type = 'button'; btn.textContent = 'Got it';
  btn.addEventListener('click', () => { prefs.set('welcomed', true); card.remove(); });
  card.append(h, p1, p2, p3, btn);
  $('#view').before(card);
}

boot();
