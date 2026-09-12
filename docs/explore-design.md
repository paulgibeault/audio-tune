# Explore — design

*2026-09-12. Reshapes plan §4.2 after the direction: "select one of the fleet's
sounds and see exactly how to recreate it, tweak any parameter; parameters
should be intuitive, not text boxes and sliders; interaction should have
meaning; integrated help on every control."*

## The idea in one line

**A fleet sound is a recipe.** Pick one, and Explore shows the gestures it is
made of — in order, on a timeline, with every parameter as a control whose
shape says what it does — and plays *that exact code* with your changes
applied. Nothing is approximated: the recipe is recorded from the pack's own
cue function, and playing a tweak re-runs that same function with your values
swapped in.

## How a recipe is recorded (js/recorder.js)

Every pack captures the element library once, at load, as `const S =
global.ArcadeAudioElements`. Explore installs a thin recording wrapper on that
global **before any pack loads**, so every pack's cue calls flow through it.
The wrapper forwards every call to the real library untouched; while a session
is open it also notes each element call: which gesture, at what offset from
the cue's start, with which parameters.

- **Take.** Run the cue silently (an `OfflineAudioContext` nobody renders)
  with a fixed seed. The recorded calls, in order, are the recipe: the
  layers. A take is one seed; the same seed always yields the same take.
- **Varied.** Record three takes with three seeds and diff them. A parameter
  that differs between takes is *varied per play* — the pack drew it from the
  seeded stream. The recipe marks those, which is how a designer sees the
  pack's variation ranges without reading the source.
- **Tweak.** Re-run the *original cue function* with the take's seed and an
  override table keyed by call index. The wrapper merges your values into
  each call as it happens. The cue's own structure — intermediate gains,
  loops, conditional layers — stays exactly as shipped, because the cue is
  still the thing running. This is what makes "tweak any parameter" exact
  rather than a reconstruction.
- **Re-roll.** A new seed, a new take. Overrides carry across by call index
  where the layer still exists.
- **Recreate.** Generated pack code for the take: one line per layer, values
  resolved, varied parameters marked, ready to paste into a `js/soundpack.js`.

## Controls — every parameter gets a shape (js/controls.js)

Sliders say "a number between two other numbers". A control should say what
the number *is*. Each parameter kind has one control, and the control's
picture is the parameter's meaning:

| Kind | Parameters | The control | The gesture |
| --- | --- | --- | --- |
| pitch | `f0`, `freq`, `f`, `wf0`, `bf0`, `chest` | A piano strip with the value as a marker, note name + Hz | Drag for continuous pitch; tap a key to snap to a note |
| sweep | `f0→f1`, `sf0→sf1` | Start and end dots on a frequency-vs-time curve | Drag either end; the curve shows the glide |
| envelope | `attack`, `dur`, `fade` | A ramp-hold-decay outline on a millisecond ruler | Drag the knee for attack, the end for length |
| gain | `gain` | A vertical fader with a dB scale | Drag up and down; the scale is what a mixer shows |
| filter | `hp`, `lp`, `tone`, `Q` | An EQ curve with the cutoff as a dot | Drag along the frequency axis; the curve bends where you put it |
| character | `crack`, `weight`, `bright`, `snap`, `stiffness`, `rumble`, `skew`, `ring`, `breathy`, `rough`, `flutter`, `damping`, `size`, `end`, `jitter`, `rise`, `sweep`, `drift`, `detune` | A slider whose two ends are *named* — `whump ↔ snap`, `soft ↔ stiff` | Drag toward the word you want |
| count | `pulses`, `grains`, `detents`, `count`, `flaps`, `rate` | A row of ticks equal to the value | Tap a tick or drag across them |
| partials | `partials` | A bar chart: position = ratio, height = gain, fade = decay | Drag bar tops; preset chips for wood / glass / bell / bar |
| choice | `type`, `dir`, `kind` | A segmented control with glyphs (waveform shapes, in/out arrows) | Tap |
| offset | layer `at` | The layer's block on the recipe timeline | Drag the block |
| distance | send | A listener with the source moving away, near ↔ far | Drag away from the ear |
| dice | seed | A die with a lock | Tap to re-roll; lock to freeze the take |

Every control is a native `<input type="range">` (or select) underneath, so
keyboard and screen-reader users get the real thing, with the picture drawn
over it and `aria-valuetext` carrying the meaningful reading ("A4 · 440 Hz",
"snap", "−12 dB").

## Help — on everything (js/help.js)

Every control has a `?` that opens a short card: what the parameter is, what
you hear at each end, its range, and — for a fleet layer — why *this* pack
set it that way, quoted from the pack's own comments where it has one. Every
panel has a `?` for the panel. And Explore has a Guide: the system in five
short pages (elements → cues → the room → packs; seeds and variation; sends
as distance; from a recipe to a game). Help text is data, and a test asserts
that no parameter in the element schema is without it.

## Layout

Three tabs inside Explore:

1. **Fleet sounds** — game → cue. Then: the timeline (layers as blocks, the
   room tail drawn after), the layer cards (one per gesture, controls
   inside), the room card, and a transport: **Play** (tweaked), **Original**
   (the untouched take, for A/B), **Re-roll**, **Reset**, **Copy as pack
   code**. A changed value shows a small dot until reset.
2. **Elements** — one gesture at a time on the same controls, with the room
   and a keyboard mode for pitched gestures. The playground for a sound that
   does not exist yet.
3. **Guide** — the documentation.

The scope (waveform + spectrum) sits under whichever tab is playing, and
rests to a static meter under reduced motion or power saver.

## Out of scope for this pass

Editing a cue's *structure* (adding or removing layers from a fleet recipe).
The Elements tab is where new structure starts; the Cue Composer (plan WP4)
is where layers are stacked into a new cue.
