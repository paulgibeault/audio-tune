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

  // Build the SDK bus on the first gesture anywhere, so the compressor's
  // ~250 ms warm-up is over before the first pad is hit (plan §3.3).
  document.addEventListener('pointerdown', () => Packs.sdkBus(), { capture: true, once: true });

  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => show(t.dataset.view));
  });

  Arcade.onSuspend(() => { if (current && current.stopAllBeds) current.stopAllBeds(0.2); });
  Arcade.onSettingsChange(() => {
    if (powerSaving() && current && current.stopAllBeds) current.stopAllBeds(0.5);
  });
  Arcade.onStateReplaced(() => { const n = currentName; currentName = null; show(n || 'play'); });

  const last = prefs.get('view');
  show(views[last] ? last : 'play');
}

boot();
