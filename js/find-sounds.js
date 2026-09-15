// Finding a sound across every game at once — pure, so it is testable.
//
// A sound is { pack, game, cue, note, elements }. Every word typed must
// hit something; a hit on the cue's name outranks the game's name, which
// outranks the gestures it is built from, which outrank the note — so
// "match" lists the two cues called match before the sounds whose notes
// mention matching, and "thump" finds every sound with a thump in it.

export function normQuery(q) { return String(q || '').trim().toLowerCase(); }

function scoreOne(s, term) {
  const name = s.cue.toLowerCase();
  if (name === term) return 6;
  if (name.startsWith(term)) return 5;
  if (name.includes(term)) return 4;
  if ((s.game || '').toLowerCase().includes(term)) return 3;
  if ((s.elements || []).some((e) => e.toLowerCase().startsWith(term))) return 2;
  if ((s.note || '').toLowerCase().includes(term)) return 1;
  return 0;
}

/** Matches for `query`, best first; [] for an empty query. */
export function matchSounds(sounds, query, limit = 60) {
  const q = normQuery(query);
  if (!q) return [];
  const terms = q.split(/\s+/);
  const scored = [];
  for (const s of sounds) {
    let total = 0;
    for (const t of terms) { const k = scoreOne(s, t); if (!k) { total = 0; break; } total += k; }
    if (total) scored.push({ s, total });
  }
  scored.sort((a, b) => b.total - a.total || a.s.cue.localeCompare(b.s.cue) || a.s.game.localeCompare(b.s.game));
  return scored.slice(0, limit).map((x) => x.s);
}
