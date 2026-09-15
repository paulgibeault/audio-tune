# Adding sounds and patterns — the second pass

*2026-09-14, after use. Direction: "the method of adding patterns and adding
sounds is cumbersome. The Add as track button also doesn't work."*

## What was wrong

- **Add as a track did nothing.** The shared picker exposed its choice as a
  `value` getter copied through `Object.assign`, which evaluates a getter
  once and copies the result — so `picker.value` was frozen at whatever it
  was when the sheet opened (null for a new song) and Add returned early.
  Save pad on Play read the same frozen value.
- **One sound per visit.** Add closed the sheet, so a four-track kit was
  four trips through the same dialog.
- **The fleet hid behind a scrollbar.** Ten game chips in a 38 rem sheet
  overflowed sideways with no cue; Gravity Well, Pi Game and My sounds
  were off the edge.
- **No way to find a sound.** A hundred cues live in ten packs, and a
  "click" or a "thump" could be in any of them.
- **A new pattern was empty and silent.** + Pattern made a blank B, and
  Play kept looping A until you found the "add to chain…" select. The
  common case — a fill that starts from the groove — meant rebuilding A.
- The Grid card rendered the text "null" under its heading (a null child
  passed to `replaceChildren`).

## The design

**Adding sounds is a tray, not a dialog.** The sheet stays open. Tap a
sound to hear it and read what it is; Add makes it a row and you keep
going; Done closes. The sheet keeps a running line — *Added: match, drop ·
3 tracks* — and a chip that is already in the song wears an *in song*
badge (×2 when it is there twice), so the kit is legible from inside the
picker.

**Search across every game.** A find field at the top of the picker: type
and the game tabs give way to matches from every pack, each chip carrying
its game's name and colour. Matching is by cue name first, then game name,
then the cue's note ("thump", "bell", "water" all work); every word typed
must match. Clear the field, or tap a game, to go back to browsing.

**The picked sound explains itself.** A line under the chips gives the
cue, its note and its game — the same words the Explore recipe head uses.

**Games wrap.** The picker's game row wraps to as many lines as it needs,
in the sheet and in Explore.

**Patterns start from where you are.** *⧉ Duplicate A* copies the current
pattern's steps; *+ Empty* starts blank. Either joins the end of the chain
and opens for editing, so Play hears it at once. The chain's "add to
chain…" select becomes one *+A +B* button per pattern, so *A B A B* is a
few taps.

## Where it lives

- `js/ui.js` `soundPicker`: a real `value` getter, `search`, `badge`,
  `refresh()`, the note line. `js/find-sounds.js` is the pure matcher.
- `js/song.js`: `addPattern` appends to the chain (opt-out for the
  model's own callers); `duplicatePattern`; `MAX_PATTERNS`.
- `js/views/compose.js`: the tray, the pattern tools, the chain buttons.
- Help: `picker`, `patterns`, `chain`, `track` panels say the new words;
  `tests/design.test.js` still holds every panel to it.

## Verified

- `tests/find-sounds.test.js`: ranking, AND-matching, note and game hits.
- `tests/sequencer.test.js`: a new pattern joins the chain; a duplicate
  copies rows without sharing them.
- The browser pass: a fresh song, four tracks added in one visit, a track
  found by search, a fill duplicated from A, Play following the chain.
