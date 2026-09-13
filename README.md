# Audio Tune

**▶ [Open it](https://paulgibeault.github.io/audio-tune/)** — every sound in
[Paul's Arcade](https://paulgibeault.github.io/), on one grid.

Audio Tune is a soundboard, a sound-design lab and a step sequencer built on
the arcade framework's own audio system (`arcade-sdk.js` + `arcade-audio.js`).
It loads every fleet game's shipped sound pack live, so each pad is the exact
sound the game plays — the same code, through the same room.

- **Play** — one board per game, generated from its pack; your own boards
  mixing any sound from any game; a daily kit the whole fleet shares; riffs
  as share codes; jam with a linked device. Customize any board — move,
  hide, resize pads — without touching the pack underneath.
- **Explore** — pick a fleet sound and see exactly how it is made: the
  gestures it calls, on a timeline, with every parameter as a control whose
  picture is its meaning — essentials first, the rest under More, grouped
  Pitch · Shape · Tone · Level. Tweak any of it, A/B against the original,
  re-roll the take, copy it as pack code, or save it as a sound of your own.
  The fleet's packs are read-only. Play the library's gestures one at a time,
  or build a sound of your own — it becomes a pad and a track like the rest.
- **Compose** — tracks are fleet sounds; a step grid where a cell's height is
  its loudness; patterns and a chain; live record; songs that save themselves,
  share as codes, and render to WAV.

Help is on every control (the `?`), and the Guide tab in Explore explains the
system in five short pages.

## Design

- [docs/soundboard-plan-2026-09.md](docs/soundboard-plan-2026-09.md) — the
  plan: why, the fleet inventory, decisions, work packages, follow-ups.
- [docs/explore-design.md](docs/explore-design.md) — how a fleet sound becomes
  an editable recipe, and why every parameter gets a control of its own.
- [docs/ux-pass-2026-09.md](docs/ux-pass-2026-09.md) — the UX pass after
  first use: board customization, menus, essentials-then-everything,
  read-only packs and where tweaks go.

## Development

```sh
# from the launcher repo, stage the launcher with this app and the fleet:
./dev.sh ../audio-tune ../moon-lit ../cozy-solitaire ../sow-duku ../hecknsic \
         ../si-syn ../p2p-chat ../shuiguo ../cardstock ../grav-well ../pi-game
# → http://127.0.0.1:4791/audio-tune/

npm test                                  # unit tests + artifact check
node tools/smoke.mjs                      # every fleet pack loads, every cue is audible
npm run acceptance -- http://127.0.0.1:4791/audio-tune/   # from the launcher repo
```

The smoke test is a fleet-wide audio regression gate: it loads every pack
through the app's loader and renders every cue offline, failing on a pack that
throws or a cue that goes silent or clips.

Deploys go through the fleet CI (`.github/workflows/pages.yml`).
