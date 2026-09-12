// My boards — persistence and the config import path, shared by the Play
// view and the boot-time config handler (an import can arrive before Play
// is mounted).

import { validateBoard, unpackBoard, BOARD_VERSION, BOARD_SIZES } from './validate.js';

let store = null;
export function open() {
  if (store) return store;
  const A = window.Arcade;
  store = (A && A.store && typeof A.store.open === 'function') ? A.store.open('boards') : null;
  return store;
}

let counter = 0;
export function uid() { counter = (counter + 1) % 1e6; return `b${Date.now().toString(36)}${counter.toString(36)}`; }

export function newBoard(name = 'New board', size = 16) {
  return { v: BOARD_VERSION, id: uid(), name, pads: new Array(BOARD_SIZES.includes(size) ? size : 16).fill(null), updated: Date.now() };
}

export async function list() {
  const s = open(); if (!s) return [];
  const out = [];
  try { await s.each((v, k) => { try { validateBoard(v); out.push(v); } catch (e) { console.warn('[audio-tune] stored board rejected', k, e.message); } }); } catch (e) { /* noop */ }
  out.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  return out;
}

export async function save(board) {
  const s = open(); if (!s) return false;
  board.updated = Date.now();
  validateBoard(board);
  try { await s.set(board.id, JSON.parse(JSON.stringify(board))); return true; } catch (e) { console.warn('[audio-tune] board save failed', e); return false; }
}

export async function remove(id) {
  const s = open(); if (!s) return;
  try { await s.del(id); } catch (e) { /* noop */ }
}

/** Import a compact board payload (share code, config push, file). */
export async function importCompact(c, { packs = null } = {}) {
  const board = unpackBoard(c, uid, { packs });
  board.name = board.name.replace(/\s+$/, '');
  await save(board);
  return board;
}

/** A user copy of a fleet board: one pad per cue, in pack order. */
export function fromPack(desc, pack, defaultParamsFor) {
  const cues = pack.cues.filter((c) => !c.sustained);
  const size = BOARD_SIZES.find((n) => n >= cues.length) || 48;
  const b = newBoard(`${desc.name} (mine)`, size);
  cues.slice(0, size).forEach((c, i) => { b.pads[i] = { pack: desc.id, cue: c.name, params: defaultParamsFor(desc.id, c.name), label: null, velocity: 1, seedLock: false, seed: 1 }; });
  return b;
}
