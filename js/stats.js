// Light records — Arcade.stats counters written in batches (a pad hit is
// far too frequent for a storage write each), and one Arcade.records line.

const pending = {};
let timer = null;

export function bump(key, n = 1) {
  pending[key] = (pending[key] || 0) + n;
  if (!timer) timer = setTimeout(flush, 4000);
}

export function flush() {
  clearTimeout(timer); timer = null;
  const A = window.Arcade;
  const keys = Object.keys(pending);
  if (!keys.length || !A || !A.stats || typeof A.stats.update !== 'function') return;
  const delta = { ...pending };
  for (const k of keys) delete pending[k];
  try {
    A.stats.getOrInit('activity', { padsHit: 0, songsSaved: 0, soundsBuilt: 0, kitsPlayed: 0, riffsShared: 0, rendersMade: 0 });
    A.stats.update('activity', (s) => { const next = { ...s }; for (const [k, v] of Object.entries(delta)) next[k] = (next[k] || 0) + v; return next; });
  } catch (e) { /* stats are a nicety */ }
}

/** The app's one record: the longest song, in steps. */
export function recordLongestSong(steps) {
  const A = window.Arcade;
  if (!A || !A.records || typeof A.records.best !== 'function') return null;
  try {
    return A.records.best('longest_song_steps', { value: steps, direction: 'higher', format: 'integer', label: 'Longest song (steps)' });
  } catch (e) { return null; }
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
