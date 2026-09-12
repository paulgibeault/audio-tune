# Audio Tune — the fleet soundboard (plan, 2026-09)

Status: **IN PROGRESS.** WP1 shipped 2026-09-12 (scaffold, pack loader, ten fleet
boards; 12/12 acceptance; every fleet cue verified audible through the loader).
WP2 shipped 2026-09-12 as the Explore view, reshaped by
[explore-design.md](explore-design.md): a fleet cue becomes a recorded,
editable recipe; every parameter gets a control whose picture is its meaning;
help on every control and a Guide. WP3 shipped 2026-09-12: the Compose
view — lookahead clock against the audio context, tracks bound to fleet cues
played through their own rooms, a velocity step grid, patterns and a chain,
live record, undo, songs autosaved to `Arcade.store`. WP4–WP6 open. Written 2026-09-12 against launcher SDK 3.14.0 and `arcade-audio.js` as of
launcher `main`, with every fleet pack read in full (§2).

Audio Tune is a new Paul's Arcade app (gameId `audio-tune`) that turns the
framework's audio system into an instrument. Three things, in one page:

1. **Explore** — every synthesis element in `arcade-audio.js` with its knobs
   exposed, a room to hear it in, a scope to see it, and "copy as pack code".
2. **Play** — soundboards: grids of pads, each pad a cue from a fleet game's
   shipped pack, pre-populated one board per game, plus your own boards.
3. **Compose** — a step sequencer that turns pads into tracks and tracks into
   songs, with share codes, peer jam sessions and render-to-WAV.

The design stance, in one paragraph: **the soundboard is a live audition.** The
launcher already has an offline audition renderer (`tools/soundpack/`) whose
whole point is that the code it renders is the code the game plays. Audio Tune
is the interactive half of that same idea — it loads each game's real
`js/soundpack.js`, fires cues through the same `(ctx, out, when, params, rnd)`
contract the renderer uses, and adds nothing of its own to the signal path but
a per-pack room. Every sound on the board is *the* sound the game ships,
byte-for-byte the same code. That is what makes it useful (a designer can hear
and tweak the real thing in a browser) and what keeps it honest (nothing here
can drift from the fleet).

---

## 0. Why this is both fun and useful

**Fun.** The fleet has ~95 hand-designed environmental cues — a temple bell, a
koto, piggy zoomies, a bomb fuse, sonar pings, a stone well humming, a fruit
stall — that players only ever hear one game at a time, in gameplay order.
Putting them on one grid, in tempo, with a peer on another phone hitting pads
back at you, is a toy in the best sense. Every play is seeded, so no two hits
are identical; freezing the seed on a pad and hearing it become mechanical is
the kind of thing that makes people *get* why the engine works the way it does.

**Useful.** Today, designing a sound for a game means editing a pack file,
running the headless renderer, opening a WAV, finding a timestamp in
`INDEX.md`, and repeating. The Element Lab collapses that loop to "drag a
slider, tap, listen, copy the snippet". Because the lab runs the exact shipped
element library, what you hear is what a pack built from that snippet would
play. It is also the first place the whole fleet's audio can be heard side by
side — a register plan across *games* rather than within one — and its
Playwright smoke test (§7) becomes a fleet-wide "every pack still loads and
every cue still makes sound" gate the framework does not currently have.

---

## 1. Framework contract this plan builds on (verified)

| Surface | What it gives the soundboard |
| --- | --- |
| `Arcade.audio.bus()` | The only correct destination. Creates the managed `AudioContext`; obeys launcher volume + global mute. Returns `{ ctx, dry, send }`. |
| `Arcade.audio.el()` | `window.ArcadeAudioElements` — the element library: 18 gestures, `createBus`, `out`, `rng`, `between`, `cents`, `teardown`, `registerPack`. |
| `E.createBus(ctx, destination, room)` | Builds a room (convolver + high-shelf + compressor) into **any** destination node. This is what lets one page hold ten rooms — one per pack — all chained into the SDK bus. |
| `E.out(bus, send)` | A per-play `GainNode` wired to the bus's dry path and room send. Its `gain` is free for velocity (the SDK itself ramps it in `start().stop()`). |
| Cue contract | `CUES[name](ctx, out, when, params, rnd)` — schedules against an absolute `when`, returns its duration in seconds. `when` is what makes sample-accurate sequencing free. |
| `registerPack({ name, ROOM, SENDS, CUES, … })` | Publishes at `window.ArcadeSoundPack`. **Replaces** — one pack per page by design. The loader captures the handle after each pack script loads (§3.2). |
| `ArcadeAudition.fire()` (`tools/soundpack/lib/audition.js`) | The reference for "fire a pack cue by hand": `CUES[name](ctx, E.out(bus, SENDS[name]), at, params, rnd)`. The soundboard's pad-hit is this function. |
| Spec cues | `Arcade.audio.play(spec, overrides)` — the chiptune engine, permanent (pi-game's deliberate identity; ISSUES.md). No `when` parameter — see §3.4. |
| `Arcade.store.open(name)` | Async IndexedDB KV per app; rides the launcher save bundle (schema v2). Boards, songs and user cues live here. |
| `Arcade.configs.share/send/register` | Share a named config as a code/link or push to a linked device, ≤ 8 KB, launcher-mediated consent. Boards and songs are configs. |
| `Arcade.share.encode/decode` | Versioned base64url JSON, validating decoder. Pad-riff share codes. |
| `Arcade.peer.send/onMessage/invite` | Jam sessions (§4.6). |
| `Arcade.daily.seed()` | Daily kit (§4.7). |
| `Arcade.loop`, `onSuspend/onResume`, `settings.powerSaver()` | Transport stops on suspend; analyser and playhead animation gate on power saver / reduced motion. |
| Sandbox `allow-scripts allow-downloads`, opaque origin | Classic `<script>` and ES-module loads of other apps' files work (Pages sends `ACAO: *`); `<a download>` works for WAV export; never touch storage APIs directly. |

Two framework facts that shape the design more than any other:

- **One room per page in the SDK** (`Arcade.audio.room()` rebuilds a single
  bus). The soundboard needs a room per pack *simultaneously* (a song can
  put a moon-lit bell next to a hecknsic shatter). Resolved in §3.3.
- **A pack's beds are not always in `CUES`.** si-syn and grav-well put beds in
  `CUES` with a `SUSTAINED` map; moon-lit and hecknsic export them as extra
  top-level keys (`ambient`, `insects`, `pulse`, `tension`) with sends living
  in the game's registration module, not in `SENDS`. Resolved in §3.2 and
  §8 (framework follow-up F2).

---

## 2. Fleet inventory — what the pre-populated boards contain

Read from each repo on 2026-09-12. Pack paths are what the soundboard loads
at runtime, root-relative on the shared origin.

| Game (gameId) | Pack | Cues | Beds | Room (dur / decay / wet) | Sound identity |
| --- | --- | --- | --- | --- | --- |
| Moon Lit (`moon-lit`) | `/moon-lit/js/soundpack.js` | 10 | `ambient`, `insects` (`heat`) | 1.9 / 0.38 / 0.60 | a quiet tropical pond at night; paper, rope, bronze, silk |
| Cozy Solitaire (`cozy-solitaire`) | `/cozy-solitaire/js/soundpack.js` | 13 | — | 0.90 / 0.26 / 0.34 | a warm wood-panelled card room; cardstock, felt |
| Sowdoku (`sowduku`) | `/sowduku/js/soundpack.js` | 7 | — | 0.50 / 0.13 / 0.26 | a small farmyard pen after rain; mud and small animals |
| HecknSic (`hecknsic`) | `/hecknsic/js/soundpack.js` | 14 | `pulse` (`intensity`), `tension` (`urgency`) | 1.15 / 0.30 / 0.50 | a dark room with a glass machine in it |
| Si Syndicate (`si-syn`) | `/si-syn/js/soundpack.js` (from `public/`) | 4 | `bench` (`busy`) | 0.9 / 0.28 / 0.55 | a person at a workbench; every sound is hardware |
| P2P Chat (`p2p-chat`) | `/p2p-chat/js/soundpack.js` | 6 | — | 3.4 / 1.60 / 0.95 | sonar; the tail is distance, the only room you are meant to notice |
| shuǐ guǒ tān (`shuiguo`) | `/shuiguo/js/soundpack.js` | 18 | — | 0.9 / 0.30 / 0.50 | a wooden fruit stand at midday; wood and water-in-skin |
| Cardstock (`cardstock`) | `/cardstock/js/soundpack.js` | 8 | — | 1.05 / 0.30 / 0.30 | four players at a plainer, larger table; distance is the design |
| Gravity Well (`grav-well`) | `/grav-well/js/soundpack.js` | 12 | `well-hum` (`depth`) | 3.2 / 1.10 / 0.72 | a stone cistern forty rows deep |
| Pi Game (`pi-game`) | `/pi-game/audio/chiptune-archive.mjs` (ES module, exports `CUES`, `correctFreq`, `comboOverrides`) | 5 spec cues | — | none (spec engine) | a recital under pressure; a metronome tick and an alarm |

Not on the board: **poker-night** (archived, hand-rolled synth into
`ctx.destination`, explicitly not fleet) and **neck-pt** (archived, not on the
origin).

### 2.1 Per-board pad lists

Cue names are the pack's own. Params are what the cue actually reads (the pad
exposes exactly these as controls). Beds become latching pads with a retune
knob for their parameter.

**Moon Lit** — `lantern-launch`, `carousel`, `match` (`count` 1–8),
`moonburst`, `drop`, `trellis`, `dead-line-warning`, `menu-click`, `win`,
`game-over`; beds `ambient`, `insects` (`heat` 0–1). Bed sends 0.45 / 0.55
(from `js/sfx.js`).

**Cozy Solitaire** — `place`, `foundation` (`rank` 1–13), `flip`, `lift`,
`run-place` (`count` 2–8), `invalid`, `pass-limit`, `recycle`, `deal`,
`auto-place` (`rank`), `sequence`, `undo`, `win`.

**Sowdoku** — `thud`, `hoof`, `pen`, `oink`, `slip`, `fail`, `star`. No
params, no music by design: "not one note of music in it".

**HecknSic** — `rotate` (`kind` cluster|y|ring), `select` (`tiles`), `match`
(`count` 3–10), `combo` (`depth` 1–12), `starflower`, `blackpearl`,
`grandpoobah`, `bomb-arrive`, `bomb-tick` (`urgency` 0–1), `bomb-explode`,
`over-achiever`, `game-win`, `game-over`, `ui-click`; beds `pulse`
(`intensity`), `tension` (`urgency`). Bed sends 0.30 / 0.35 (from
`js/audio.js`).

**Si Syndicate** — `ui-click`, `test-pass`, `test-fail`, `level-complete`;
bed `bench` (`busy` 0–1, colour only).

**P2P Chat** — `peer-joined`, `peer-left`, `message-received`,
`message-sent`, `transfer-complete`, `error`.

**shuǐ guǒ tān** — stall: `drop` (`level`), `merge` (`level`), `chain`
(`chain` 2–6), `watermelon`, `annihilate`, `warning`, `discover`,
`game-over`, `menu-click`; farm: `water`, `plant`, `harvest` (`level`),
`ripe-chime`, `coin`, `till`, `buy`, `terrace-fanfare`, `pack-up`. Two rows on
the board, matching the pack's own split.

**Cardstock** — `deal` (`seats` 2–8), `play`, `play-far`, `draw`, `shuffle`,
`trick` (`bad` bool), `invalid`, `win`.

**Gravity Well** — `shift`, `turn` (`kicked`), `touch`, `lock` (`hard`),
`tspin` (`mini`), `clear` (`count` 1–4, `combo` 1–12), `quad` (`streak` 1–5),
`singularity`, `hold`, `levelup`, `goal`, `topout`; bed `well-hum` (`depth`
0 / 0.5 / 1).

**Pi Game** — `correct` (`freq` via `correctFreq(digitIndex)`), `combo`
(`freq`, `gain` via `comboOverrides`), `wrong`, `practice-correct`,
`practice-wrong`. Played through the SDK spec engine, dry, exactly as the game
does.

### 2.2 Things the inventory turned up (not blockers; tracked in §8)

- moon-lit's element gate requires `droplet` and `stream`, which its pack no
  longer uses. Over-strict by two.
- hecknsic `grandpoobah` and `over-achiever` build a `collect` array for a
  drone and never tear it down; harmless (the drone fades on its own), dead
  plumbing.
- cozy-solitaire `index.html` and si-syn `index.html` both still describe a
  chiptune fallback that no longer exists.
- cardstock is the only graph-pack game with no `soundpack.config.json` and
  no audition, so it cannot be rendered by `tools/soundpack/render.mjs`.
- poker-night's synth connects to `ctx.destination`, bypassing launcher
  volume and mute — the exact pattern every pack header forbids. Archived, so
  informational.

---

## 3. Decisions

### 3.1 It is a fleet app, scaffolded from the starter template

`./dev.sh new audio-tune` from the launcher repo. Loads
`/sdk/v3/arcade-sdk.js` and the **evergreen** `/arcade-audio.js` (not the
major-pinned copy): the board must always have the newest element library,
because any fleet pack may use the newest gesture. Catalog entry with
`"inDevelopment": true` from the first deploy (§5, WP1). Fleet CI thin caller,
`version_bump: true`, SW from `tools/templates/game-sw.js` scoped to
`/audio-tune/` — the SW must never cache other apps' pack files (they are out
of scope by the template's rule 1, which is exactly right: a pack must always
be the game's current one).

### 3.2 Packs are discovered by a manifest and loaded live

`fleet-packs.json` in this repo:

```json
{
  "v": 1,
  "packs": [
    { "id": "moon-lit", "kind": "graph", "url": "/moon-lit/js/soundpack.js",
      "beds": { "ambient": { "send": 0.45 }, "insects": { "send": 0.55, "params": { "heat": [0, 1] } } } },
    { "id": "hecknsic", "kind": "graph", "url": "/hecknsic/js/soundpack.js",
      "beds": { "pulse": { "send": 0.30, "params": { "intensity": [0, 1] } },
                "tension": { "send": 0.35, "params": { "urgency": [0, 1] } } } },
    { "id": "si-syn",   "kind": "graph", "url": "/si-syn/js/soundpack.js" },
    { "id": "pi-game",  "kind": "spec",  "url": "/pi-game/audio/chiptune-archive.mjs" }
  ]
}
```

Loader (`js/packs.js`): for each graph pack, inject a classic `<script>`,
await `load`, read `window.ArcadeSoundPack`, verify `name === id`, stash it
in a registry keyed by id. Packs that use the `SUSTAINED` convention need no
`beds` entry (the loader reads `SUSTAINED` + `SENDS`); the manifest carries
`beds` only for the two packs that export beds outside `CUES`. Pack loads are
lazy (a board's pack loads when the board is first opened) and failures are
per-pack: a 404 or a pack that bails (its `if (!S) return` guard) shows a
"pack unavailable" board, never a broken app. Spec packs are `import()`ed as
ES modules.

Params metadata (`params` ranges in the manifest, plus a per-cue table in
`js/cue-params.js` mirroring §2.1) is the one thing the board cannot read
from the packs themselves — cue functions read `p.count` etc. dynamically.
That table is the board's only per-game knowledge, and it is data, not code.

Alternative considered: reading `/catalog.json` and adding a `soundpack`
field per game so discovery needs no list here. Cleaner long-term; it is a
launcher change and this plan keeps the launcher untouched for v1. Filed as
follow-up F1 (§8).

### 3.3 One room per pack, chained into the SDK bus

For each loaded pack: `packBus = E.createBus(ctx, sdkBus.dry, pack.ROOM)`,
built lazily on first play. A pad hit is then literally
`ArcadeAudition.fire`:

```js
const o = E.out(packBus, sendFor(pack, cue));   // the cue's declared distance
o.gain.value = pad.velocity;                     // 0..1, sequencer velocity
const dur = pack.CUES[cue](ctx, o, when, params, E.rng(seed));
```

The SDK's own room is neutralised once at boot —
`Arcade.audio.room({ wet: 0, shelfDb: 0 })` — so the only room a cue meets is
its pack's. What remains doubled is the SDK bus's compressor (−14 dB, 2.5:1),
which cannot be disabled. This is the one deliberate deviation from the game's
signal path; WP1 measures it (render a board hit and the game's audition of
the same cue through `OfflineAudioContext`, compare with `wavdiff.mjs`) and if
it is audible, follow-up F4 adds a `plain` option to `createBus`.

Rejected: registering only the active board's cues with `Arcade.audio.graph()`
and calling `Arcade.audio.room(pack.ROOM)` on board switch. Bit-identical to
the game, but it makes a song that spans packs impossible, and cross-pack
songs are a headline feature.

Cost: one `ConvolverNode` per loaded pack (IRs of 0.5–3.4 s stereo), ten at
most. Fine on a phone; built lazily so a player who only opens one board pays
for one.

### 3.4 Spec cues need a schedulable voice

`Arcade.audio.play()` has no `when`. For pads this does not matter (it plays
now, exactly as pi-game does). For the sequencer it does. `js/spec-voice.js`
implements the documented spec format — one oscillator or noise burst,
linear attack/release, `freq → toFreq` glide, array sequencing with `delay`
— against an explicit `when` and destination, ~60 lines. Unit-tested against
the format's documented clamps. Follow-up F3 proposes upstreaming it into
`arcade-audio.js` as `E.spec` so the SDK and the board share one voice; until
then the board's copy is the only duplicate of SDK behaviour in this app,
and it is a duplicate of a format the framework has declared permanent.

### 3.5 The app has no UI sounds of its own

Every other fleet app ships a pack; this one deliberately does not. The pads
*are* the sound, and any transport click or save chime would pollute what the
player is listening to. The metronome is an ordinary track (a `strike` from
the lab) the player can mute. Consequence: no `soundpack.config.json`, no
audition, and A3 (launcher owns volume, no in-app slider) is satisfied
trivially. Per-pad velocity and per-track gain are *design* parameters of the
song, not a volume control, and stay.

### 3.6 Storage and sharing

| Data | Where | Why |
| --- | --- | --- |
| Boards, songs, user cues | `Arcade.store.open('boards' \| 'songs' \| 'cues')` | Structured, can outgrow localStorage; rides the save bundle for free (schema v2). |
| Prefs (last board, bpm, lab state) | `Arcade.state` | Small, sync, exportable. |
| Rendered WAVs | not stored — handed to the player via `<a download>` | `allow-downloads` is granted for exactly this; `Arcade.files` would bloat the save bundle. |
| Share a board / song | `Arcade.configs.share('board' \| 'song', data)` | ≤ 8 KB after compaction (§4.5); launcher-mediated consent, deep link works cold. |
| Share a riff (a few bars) | `Arcade.share.encode(data, { v: 1 })` | Tiny, no launcher round trip. |

All inbound data is hostile: `js/validate.js` schema-checks every field
(pack ids against the manifest, cue names against the loaded pack, params
against `cue-params.js` ranges, string lengths) and every player-authored
string renders through `textContent`. This is the p2p-chat lesson applied
before the fact.

---

## 4. Features

### 4.1 Boards (Play)

- **Fleet boards** — one per game in §2, generated from the pack at load time
  (cue order from the pack, colour from a per-board palette, beds as latching
  pads). Read-only, "Duplicate to my boards" to customise.
- **My boards** — create, rename, reorder, delete; 16 / 32 / 64 pads; pads
  can mix packs (each pad routes through its own pack's room).
- **Pad** = `{ pack, cue, params, seed, velocity, label, colour, key }`.
  Tap plays. Long-press opens the pad sheet: sliders for the cue's params
  (e.g. moon-lit `match` count, grav-well `clear` count + combo), velocity,
  **seed lock** (off = a fresh seeded stream per play, exactly like the SDK's
  `audioSeed++`; on = the same stream every time, so you can hear what
  per-play variation buys), and a key binding.
- **Beds** latch on/off with a knob that calls the cue again with the new
  parameter and crossfades, mirroring `handle.retune()` (the board has its own
  handle since beds bypass `Arcade.audio.start`; `E.teardown` on the pack's
  returned function does the stop).
- **Keyboard** — QWERTY rows map to pad rows; the board is fully operable
  without touch. Pads are `<button>`s with `aria-label="<cue> — <game>"`.
- **Choke / stop all** — one control that tears down every live bed and
  cancels nothing else (one-shots finish naturally, as in the games).

### 4.2 Element Lab (Explore)

- One panel per element in `ArcadeAudioElements` (18 today, read from the
  library at runtime so a new gesture appears without an app change; its knobs
  come from `js/element-params.js`, a schema table of each element's
  parameters with ranges and defaults — the library has no introspection; F5
  proposes adding it). Sliders, a seed field, a "vary" toggle, a play button,
  hold-to-repeat.
- **Room** panel: the pack rooms from §2 as presets plus free knobs (`dur`,
  `decay`, `preDelay`, `wet`, `shelfHz`, `shelfDb`, `seed`), and a per-play
  `send`. Rebuilds a lab bus on change.
- **Scope**: an `AnalyserNode` on the lab bus drawing waveform + spectrum
  through `Arcade.loop`; off under power saver / reduced motion (static peak
  meter instead).
- **Keyboard mode** for pitched elements (`body`, `pluck`, `droplet`, `drone`,
  `thump`): QWERTY → 12 semitones around the current `f0`. This is a real
  instrument and the most fun thing in the lab.
- **Copy as pack code**: emits the exact `S.<element>(ctx, o, t, {...})` line
  for the current knobs, ready to paste into a game's `js/soundpack.js`.
- **Cue Composer**: stack elements with time offsets and per-layer params
  into a user cue; save it (`store 'cues'`); it becomes a pad. Export the
  whole cue as a pack-format function. Pitch and balance variation ranges per
  layer (`E.cents`, `E.between`) are first-class so composed cues vary per
  play like the fleet's do.
- **Fleet cue viewer**: pick any fleet cue, see its declared send, its
  elements (from a static table in `cue-params.js` — no source parsing in
  the browser), play it dry / in its room / in any other pack's room. This is
  the "hear the register plan across games" tool.

### 4.3 Sequencer (Compose)

- **Transport**: bpm 40–240, swing, pattern length 8 / 16 / 32 steps, play /
  stop / loop, count-in with the metronome track.
- **Scheduler** (`js/scheduler.js`, pure, unit-tested): lookahead pattern —
  a 25 ms timer schedules every step whose `when` falls in the next 120 ms,
  computing `when` from the transport origin in `ctx.currentTime`. Graph
  cues take `when` directly; spec cues go through `spec-voice.js`. No
  `setTimeout` ever fires a sound. Transport stops on `Arcade.onSuspend`,
  does not auto-resume, and the playhead UI runs on `Arcade.loop` so it
  parks with the frame.
- **Tracks**: each bound to a pad (so a track inherits pack, cue, params);
  per-step on/off, velocity, optional param override (a `match` track can
  ramp `count` across the bar); mute / solo; per-track seed lock.
- **Live record**: play pads while the transport runs; hits quantise to the
  grid (toggle) into a new or existing track.
- **Patterns → song**: named patterns, an arrangement chain with repeat
  counts; song = tempo + patterns + chain.
- **Undo/redo** on the song document (immutable snapshots, capped).

### 4.4 Render to WAV

An `OfflineAudioContext` at 48 kHz runs the same pack buses and the same
scheduler against the song's total length plus the longest room tail, then
encodes 16-bit PCM WAV and hands it over via `<a download>`. This is
`tools/soundpack/render.mjs` in the page: same elements, same rooms, same
seeds — a rendered song plays back what the transport played. Offline
rendering does not need the SDK bus, so it also sidesteps the compressor
doubling of §3.3, which is worth a note in the export dialog.

### 4.5 Share and import

- **Share a board / song** — compact to `{ v, kind, name, bpm, tracks: [[padRef, stepsBitmask, velocities]] }`;
  `Arcade.configs.share('song', data)` → code + deep link, or
  `Arcade.configs.send('song', data)` straight to a linked device. Songs
  over 8 KB export as a JSON file instead (`<a download>`) and import via
  `Arcade.ui.openFile`.
- **Share a riff** — the last 1–2 bars you played on a board, as an
  `Arcade.share` code you can paste anywhere.
- **Import** — `Arcade.configs.register('board' | 'song', …)` validated
  through `validate.js`; imports land in My boards / My songs, never replace.

### 4.6 Jam (P2P)

When `Arcade.peer.status()` is `connected` and a peer has this app open
(`onReady`), pad hits broadcast `{ t: 'hit', pack, cue, params, seed,
velocity, at }` and the remote plays the same seeded stream, so both devices
hear the same sound. `Arcade.peer.invite()` from the board offers the app to
linked devices that do not have it open; with the cap absent the button says
to connect a device from the launcher menu. Clock: jam is loosely
synchronised (remote hits play on arrival); a shared transport is out of
scope for v1 (§9). Peer names render through `Arcade.html.escape`.

### 4.7 Daily kit and light records

`Arcade.daily.seed('kit')` picks eight pads across the fleet — the same eight
for everyone today. "Daily kit" is a board, and a riff shared from it carries
the date. `Arcade.stats` tracks pads hit, songs saved, kits played;
`Arcade.records.best('longest_song_steps', …)` is the only record, so the
launcher Records sheet has one honest line for this app. No leaderboards.

### 4.8 Settings and hygiene (fleet standard)

Theme, font scale via CSS variables; reduced motion disables playhead
animation and the scope; power saver kills beds and the analyser and pins the
UI to dirty-flag redraws; handedness flips the transport rail; suspend stops
the transport and tears down beds; `onStateReplaced` reloads the store views.
Standalone at `/audio-tune/` works identically (packs are root-relative on the
same origin).

---

## 5. Work packages

Sequenced so each one ships something playable and the next builds on it. All
in this repo unless marked. Branch per package; PR description cites this
plan.

### WP1 — Scaffold, pack loader, fleet boards *(the playable core)*

- `./dev.sh new audio-tune`; catalog entry (`inDevelopment: true`); icon;
  fleet CI thin caller; SW from the template.
- `js/packs.js` (manifest loader, registry, per-pack bus, `fire()`),
  `fleet-packs.json`, `js/cue-params.js` (§2.1 as data), `js/spec-voice.js`.
- Boards view with the ten fleet boards, pad sheet (params, seed lock,
  velocity), beds, keyboard, choke.
- **Measure §3.3**: Playwright script renders one cue per pack through the
  board's path and through the game's audition path; `wavdiff.mjs` reports.
  Record the numbers in this doc.
- Verify: `npm test` (loader registry, spec-voice, validate); acceptance
  harness (§7); manual — every pad on every board sounds; launcher mute
  silences instantly; suspend tears down beds; pack 404 degrades to a
  labelled empty board.

### WP2 — Element Lab

- `js/element-params.js`, lab view, room presets/knobs, analyser scope,
  keyboard mode, copy-as-code.
- Verify: unit tests on the schema table (every exported element has an
  entry; every entry's defaults produce sound in a Playwright offline
  render); manual — copied snippet pasted into a scratch pack renders
  identically via `tools/soundpack/render.mjs`.

### WP3 — Sequencer and songs

- `js/scheduler.js` (pure), transport, tracks, live record, patterns/chain,
  undo; `store 'songs'`.
- Verify: scheduler unit tests (step → `when` math, swing, lookahead window
  boundaries, tempo change mid-bar); Playwright offline render of a fixture
  song asserts onset times to ±1 ms; manual — transport stops on suspend.

### WP4 — My boards, Cue Composer, validation, share/import

- Board CRUD, duplicate-from-fleet, `store 'boards' | 'cues'`, composer,
  `validate.js`, `Arcade.configs` share/send/register, riff codes, file
  export/import, `onStateReplaced`.
- Verify: validator unit tests with hostile fixtures (unknown pack, cue
  outside pack, params out of range, `__proto__`, oversized strings); save
  export → import round-trips boards/songs (acceptance item); XSS string
  renders inert.

### WP5 — Render to WAV, Jam, Daily kit, records

- `js/render.js` (OfflineAudioContext + WAV encoder), export dialog; peer
  hit protocol + invite; daily kit board; stats/records.
- Verify: rendered fixture song equals the WP3 offline assertion; two-device
  smoke via `dev.sh` + launcher Multiplayer (hits arrive, escape peer names);
  Records sheet shows one line.

### WP6 — Polish and promotion

- Power saver / reduced motion / handedness audit; keyboard-only pass;
  onboarding hint on first open; drop `inDevelopment`.
- Verify: full §13 acceptance green; ear pass by the plan owner across all
  ten boards.

Rough size: WP1 is the largest (loader, buses, ten boards, measurement) and
WP3 the most exacting (timing). WP2 and WP4 are mostly UI over pure modules.

---

## 6. Repo layout

```
audio-tune/
  index.html            SDK + evergreen arcade-audio.js + Arcade.init
  main.js               boot, view router (Play / Explore / Compose)
  style.css
  manifest.json  sw.js  icon.svg  icon.png
  fleet-packs.json      §3.2 manifest
  js/
    packs.js            loader, registry, per-pack rooms, fire()
    cue-params.js       §2.1 as data (params, ranges, element lists)
    element-params.js   element knob schema
    spec-voice.js       schedulable spec-cue voice (§3.4)
    scheduler.js        pure lookahead scheduler
    song.js             song document, undo, compaction
    validate.js         hostile-input schemas
    render.js           OfflineAudioContext → WAV
    views/              boards.js  lab.js  composer.js  sequencer.js
  tests/                node --test for every pure module
  tools/
    smoke.mjs           Playwright: every pack loads, every cue renders audibly
  docs/
    soundboard-plan-2026-09.md   this file
```

---

## 7. Testing

- **Unit (`node --test`)**: scheduler, spec-voice envelope math, validate,
  song compaction/expansion round-trip, manifest/registry logic with the
  launcher's synthetic pack (`tools/fixtures/soundpack-test/pack.js`) as the
  fixture — so the loader is tested against a pack that is not any game's.
- **Smoke (`tools/smoke.mjs`, Playwright, opt-in in fleet CI)**: stage the
  launcher plus every fleet repo with `dev.sh`, open `/audio-tune/`, and for
  each manifest pack assert it registered, then render every cue and bed
  through an `OfflineAudioContext` and assert peak > −40 dBFS and < −1 dBFS
  (the same thresholds `analyze.mjs` uses). **This is a fleet-wide audio
  regression test that does not exist today** — a pack that starts throwing
  or a cue that goes silent fails here even if its own game has no audio
  test.
- **Acceptance**: `npm run acceptance -- http://127.0.0.1:4791/audio-tune/`
  from the launcher repo, every WP.
- **Ears**: the plan owner, per WP6. Automated checks catch silent, clipping
  and wrong-timing; they cannot tell whether a board is fun to play.

---

## 8. Framework follow-ups (none required for v1)

Filed 2026-09-12; every row is tracked in the repo it addresses.

| # | Where | What | Why | Issue |
| --- | --- | --- | --- | --- |
| F1 | launcher `catalog.json` | optional `soundpack` URL per game | retires `fleet-packs.json`; discovery from the authoritative list | [launcher#158](https://github.com/paulgibeault/paulgibeault.github.io/issues/158) |
| F2 | moon-lit, hecknsic packs | move `ambient`/`insects`/`pulse`/`tension` into `CUES` + `SUSTAINED`, sends into `SENDS` | one bed convention fleet-wide (si-syn and grav-well already do this); retires the manifest's `beds` override | [moon-lit#43](https://github.com/paulgibeault/moon-lit/issues/43), [hecknsic#70](https://github.com/paulgibeault/hecknsic/issues/70) |
| F3 | `arcade-audio.js` | `E.spec(ctx, dest, when, spec)` — the spec voice as an element | one implementation for SDK `play()` and the board's scheduler | [launcher#159](https://github.com/paulgibeault/paulgibeault.github.io/issues/159) |
| F4 | `arcade-audio.js` `createBus` | `plain: true` to skip shelf + compressor | only if WP1's measurement says the doubled compressor is audible | [launcher#160](https://github.com/paulgibeault/paulgibeault.github.io/issues/160) |
| F5 | `arcade-audio.js` | `E.schema` — param names/ranges/defaults per element | retires `element-params.js`; also useful to `analyze.mjs` | [launcher#161](https://github.com/paulgibeault/paulgibeault.github.io/issues/161) |
| F6 | cardstock | `soundpack.config.json` + audition | the one pack the offline renderer cannot reach | [cardstock#187](https://github.com/paulgibeault/cardstock/issues/187) |
| F7 | moon-lit `js/sfx.js` | drop `droplet`, `stream` from the gate | over-strict by two | [moon-lit#44](https://github.com/paulgibeault/moon-lit/issues/44) |
| F8 | hecknsic `js/soundpack.js` | remove dead `collect` in `grandpoobah`, `over-achiever` | plumbing that does nothing | [hecknsic#71](https://github.com/paulgibeault/hecknsic/issues/71) |
| F9 | cozy-solitaire, si-syn `index.html` | delete the stale "falls back to chiptune" comments | there is no fallback, by fleet policy | [cozy-solitaire#28](https://github.com/paulgibeault/cozy-solitaire/issues/28), [si-syn#34](https://github.com/paulgibeault/si-syn/issues/34) |

---

## 9. Out of scope (explicitly)

- Sample or file-based audio, microphone input, MIDI. The fleet is synthesis
  only and this app is a window onto that.
- A shared, clock-synchronised transport across peers. Jam is loose.
- Editing a game's pack from the board and pushing it to the game. The lab
  emits snippets; the game's repo is where they land.
- Any change to what a game's cue *sounds* like. If the lab makes a cue
  sound wrong in its own room, that is a finding for the game, not something
  the board patches around.
- Music theory tooling beyond keyboard mode (no piano roll, no scales/chords
  helper). If keyboard mode is loved, that is a v2 question.
- poker-night and neck-pt.
