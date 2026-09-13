// Shared chrome (docs/ux-pass-2026-09.md): the `⋯` menu every view keeps
// its management in, the collapsible "More", the first-time card, controls
// grouped by role, and the one sound picker that chooses a sound in
// Explore, assigns a pad, and adds a track.

import { el } from './controls.js';
import { organize } from './organize.js';
import * as Packs from './packs.js';
import { noteFor, defaultParams } from './cue-params.js';

// ── menu ──────────────────────────────────────────────────────────────

let openMenu = null;
function closeMenu() {
  if (!openMenu) return;
  openMenu.pop.hidden = true;
  openMenu.btn.setAttribute('aria-expanded', 'false');
  openMenu = null;
}
document.addEventListener('click', closeMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenu) { const b = openMenu.btn; closeMenu(); b.focus(); } });

/**
 * A `⋯` menu. `items` (or a function returning them) is a list of:
 *   { label, onSelect, disabled?, hint?, danger? }        an action
 *   { label, checked, onSelect(next) }                    a checkbox
 *   { label, options: [{ label, value }], value, onSelect(value) }  a radio group
 *   { sep: true }                                         a separator
 */
export function menu({ label = 'More', icon = '⋯', items, title = null, cls = '' }) {
  const pop = el('div', { class: 'menu-pop', role: 'menu', 'aria-label': label, hidden: true });
  const btn = el('button', {
    class: `tool menu-btn${cls ? ' ' + cls : ''}`, type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': label, title: label,
    onclick: (e) => {
      e.stopPropagation();
      const show = pop.hidden;
      closeMenu();
      if (!show) return;
      fill();
      // anchor to whichever side keeps the menu on screen
      const onLeft = btn.getBoundingClientRect().left < window.innerWidth / 2;
      pop.style.left = onLeft ? '0' : 'auto'; pop.style.right = onLeft ? 'auto' : '0';
      pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); openMenu = { pop, btn };
      const first = pop.querySelector('[role^="menuitem"]:not([disabled])'); if (first) first.focus();
    },
  }, icon);
  const pick = (fn) => (e) => { e.stopPropagation(); closeMenu(); fn(); };
  function fill() {
    pop.replaceChildren();
    if (title) pop.append(el('div', { class: 'menu-title' }, title));
    for (const it of (typeof items === 'function' ? items() : items)) {
      if (!it) continue;
      if (it.sep) { pop.append(el('div', { class: 'menu-sep', role: 'separator' })); continue; }
      if (it.options) {
        pop.append(el('div', { class: 'menu-label' }, it.label));
        for (const o of it.options) {
          pop.append(el('button', { class: 'menu-item', type: 'button', role: 'menuitemradio', 'aria-checked': String(o.value === it.value), onclick: pick(() => it.onSelect(o.value)) },
            el('span', { class: 'menu-check', 'aria-hidden': 'true' }, o.value === it.value ? '●' : ''), o.label));
        }
        continue;
      }
      if ('checked' in it) {
        pop.append(el('button', { class: 'menu-item', type: 'button', role: 'menuitemcheckbox', 'aria-checked': String(!!it.checked), disabled: !!it.disabled, onclick: pick(() => it.onSelect(!it.checked)) },
          el('span', { class: 'menu-check', 'aria-hidden': 'true' }, it.checked ? '✓' : ''), it.label));
        continue;
      }
      pop.append(el('button', { class: `menu-item${it.danger ? ' is-danger' : ''}`, type: 'button', role: 'menuitem', disabled: !!it.disabled, title: it.hint || null, onclick: pick(() => it.onSelect()) },
        el('span', { class: 'menu-check', 'aria-hidden': 'true' }), el('span', {}, it.label), it.hint ? el('small', {}, it.hint) : null));
    }
  }
  pop.addEventListener('click', (e) => e.stopPropagation());
  pop.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const its = [...pop.querySelectorAll('[role^="menuitem"]:not([disabled])')];
    const i = its.indexOf(document.activeElement);
    (e.key === 'ArrowDown' ? (its[i + 1] || its[0]) : (its[i - 1] || its[its.length - 1])).focus();
  });
  return el('span', { class: 'menu' }, btn, pop);
}

// ── disclosure, intro ─────────────────────────────────────────────────

/** A collapsed section: "More (n)". */
export function more(label, children, { open = false, count = null } = {}) {
  return el('details', { class: 'more', open }, el('summary', {}, `${label}${count != null ? ` (${count})` : ''}`), ...children);
}

/** A first-time card for a view: a title, a few lines, Got it. Null once dismissed. */
export function intro(prefs, key, { title, lines }) {
  if (prefs.get(`intro:${key}`)) return null;
  const card = el('section', { class: 'card intro', role: 'note' },
    el('h2', { class: 'card-h' }, title),
    ...lines.map((l) => el('p', { class: 'card-sub' }, l)),
    el('button', { class: 'tool tool-primary', type: 'button', onclick: () => { prefs.set(`intro:${key}`, true); card.remove(); } }, 'Got it'));
  return card;
}

// ── grouped controls ──────────────────────────────────────────────────

/**
 * Controls by role — Pitch · Shape · Tone · Level — essentials first and
 * the rest under More, or everything when `expert`. `items` are
 * { kind, name, varied, node }.
 */
export function groupedControls(items, { expert = false } = {}) {
  const { groups, more: rest } = organize(items, { expert });
  const wrap = el('div', { class: 'grouped' });
  const captions = groups.length + rest.length > 1;
  const section = (g) => el('div', { class: `control-group role-${g.role}` },
    captions ? el('div', { class: 'group-h', 'aria-hidden': 'true' }, g.label) : null,
    el('div', { class: 'controls' }, ...g.items.map((it) => it.node)));
  for (const g of groups) wrap.append(section(g));
  if (rest.length) wrap.append(more('More', [el('div', { class: 'grouped' }, ...rest.map(section))], { count: rest.reduce((a, g) => a + g.items.length, 0) }));
  return wrap;
}

// ── sound picker ──────────────────────────────────────────────────────

/**
 * Game chips, then that game's sounds as chips; tap a sound to hear it and
 * pick it. opts: { packs, picked: {pack, cue}|null, onPick(pack, cue,
 * cueInfo), filter(cue) → bool, audition }. Returns the element with
 * .select(pack, cue) and .value.
 */
export function soundPicker({ packs, picked = null, onPick, filter = null, audition = true, label = 'sounds' }) {
  let current = picked ? { ...picked } : null;
  let packId = picked ? picked.pack : '';
  const games = el('div', { class: 'picker-games', role: 'tablist', 'aria-label': 'game' });
  const cues = el('div', { class: 'cue-grid', role: 'listbox', 'aria-label': label });
  const root = el('div', { class: 'picker' }, games, cues);
  const renderGames = () => games.replaceChildren(...packs.map((p) => el('button', {
    class: 'pack-tab', role: 'tab', type: 'button', 'aria-selected': String(p.id === packId), style: `--hue:${p.hue}`,
    onclick: () => { packId = p.id; renderGames(); fillCues(); },
  }, p.name)));
  async function fillCues() {
    cues.replaceChildren();
    if (!packId) { cues.append(el('span', { class: 'ctl-hint' }, 'Pick a game to see its sounds.')); return; }
    cues.append(el('span', { class: 'ctl-hint' }, 'Loading…'));
    const entry = await Packs.load(packId);
    if (entry.desc.id !== packId) return;
    cues.replaceChildren();
    if (entry.status !== 'ready') { cues.append(el('span', { class: 'board-status is-error' }, `Pack unavailable — ${entry.error}`)); return; }
    for (const c of entry.pack.cues) {
      if (filter && !filter(c)) continue;
      const on = !!(current && current.pack === packId && current.cue === c.name);
      cues.append(el('button', {
        class: `cue-chip${on ? ' is-picked' : ''}`, role: 'option', type: 'button', 'aria-selected': String(on), dataset: { cue: c.name },
        title: noteFor(packId, c.name) || c.name, style: `--hue:${entry.desc.hue}`,
        onclick: () => {
          current = { pack: packId, cue: c.name };
          cues.querySelectorAll('.cue-chip').forEach((x) => { const hit = x.dataset.cue === c.name; x.classList.toggle('is-picked', hit); x.setAttribute('aria-selected', String(hit)); });
          if (audition && !c.sustained) Packs.fire(packId, c.name, { params: defaultParams(packId, c.name) });
          onPick(packId, c.name, c);
        },
      }, c.name, c.sustained ? el('small', {}, ' ∞') : null));
    }
    if (!cues.children.length) cues.append(el('span', { class: 'ctl-hint' }, 'Nothing here fits.'));
  }
  renderGames(); fillCues();
  return Object.assign(root, {
    get value() { return current; },
    select(pack, cue) { packId = pack || ''; current = pack && cue ? { pack, cue } : null; renderGames(); fillCues(); },
  });
}

/** A modal sheet with a title, a body and actions; resolves when closed. */
export function sheet({ title, note = null, body, actions, wide = false, label = title }) {
  const dlg = el('dialog', { class: `sheet${wide ? ' sheet-wide' : ''}`, 'aria-label': label });
  dlg.append(el('div', { class: 'sheet-body' },
    el('h3', { class: 'sheet-title' }, title),
    note ? el('p', { class: 'sheet-note' }, note) : null,
    ...(Array.isArray(body) ? body : [body]),
    el('div', { class: 'sheet-actions' }, ...actions)));
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}
