// Keyboard → pad index. Four QWERTY rows, ten keys each, so a 40-pad board is
// fully playable without touch. Row 0 is the number row (pads 0–9), then
// qwerty, asdf, zxcv. Pure and shared by the board and (later) the sequencer.

const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];

const INDEX = new Map();
ROWS.forEach((row, r) => { [...row].forEach((ch, c) => INDEX.set(ch, r * 10 + c)); });

/** Pad index for a KeyboardEvent.key, or -1. */
export function padForKey(key) {
  if (typeof key !== 'string' || key.length !== 1) return -1;
  const i = INDEX.get(key.toLowerCase());
  return i === undefined ? -1 : i;
}

/** Display label for a pad index, or '' past the mapped range. */
export function keyForPad(i) {
  const r = Math.floor(i / 10), c = i % 10;
  return ROWS[r] ? ROWS[r][c].toUpperCase() : '';
}
