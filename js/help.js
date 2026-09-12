// Integrated help — text for every control kind, every parameter, every
// panel, and the Guide. Data, so a test can assert nothing is undocumented.

export const KINDS = {
  pitch: {
    title: 'Pitch',
    body: 'Where the sound sits, as a note and in hertz. Drag along the strip for continuous pitch; tap a key to snap to a note. Higher reads smaller and closer; lower reads bigger and further away.',
  },
  sweep: {
    title: 'Pitch sweep',
    body: 'The sound starts at one pitch and glides to another over its length. Drag either end. Up-sweeps read as something shrinking or tightening (a droplet); down-sweeps as something expanding or relaxing (a flame, a thump).',
  },
  time: {
    title: 'Time',
    body: 'How long, in milliseconds. Short times are contact and clicks; long times are bodies and tails. The ruler is the whole range for this parameter.',
  },
  envelope: {
    title: 'Envelope',
    body: 'The shape of loudness over time: a rise (attack), then a decay to silence over the length. Drag the knee to change the attack; drag the end to change the length. A fast attack is a hit; a slow one is a swell.',
  },
  gain: {
    title: 'Level',
    body: 'How loud this layer is, on a decibel scale like a mixer fader. Every 6 dB down is roughly half as loud. The fleet keeps constant gestures very quiet (−30 dB and below) so they register as texture rather than events.',
  },
  filter: {
    title: 'Filter',
    body: 'Which frequencies get through. A lowpass keeps what is below the cutoff (darker, further away); a highpass keeps what is above (thinner, closer); a bandpass keeps a band around a centre. Drag along the frequency axis.',
  },
  character: {
    title: 'Character',
    body: 'A quality with two named ends. Drag toward the word you want. The number is shown for reference, but the words are the meaning.',
  },
  count: {
    title: 'Count',
    body: 'How many of something — pulses, grains, teeth, sheets. Tap a tick or drag across them.',
  },
  partials: {
    title: 'Partials',
    body: 'The overtones of a struck body. Each bar is one partial: its position is the frequency ratio to the fundamental, its height is how loud, its fade is how fast it dies. Real bells and bars are INHARMONIC — ratios that are not whole numbers — and their high partials die first. Drag a bar to change its level; pick a preset to start from a material.',
  },
  choice: {
    title: 'Choice',
    body: 'One of a few options. Waveforms: sine is pure, triangle a touch edgier, square hollow and reedy, sawtooth bright and buzzy.',
  },
  distance: {
    title: 'Distance (send)',
    body: 'How much of this sound goes into the room. Every cue in a pack feeds one shared room, and its send is really a statement about how far away it is: near sounds are mostly dry, far sounds are mostly room.',
  },
  dice: {
    title: 'Take (seed)',
    body: 'Every play draws from a seeded random stream, so no two plays are identical — that variation is most of the difference between a sound and a sound effect. Re-roll to hear another take; lock to keep this one.',
  },
  offset: {
    title: 'Offset',
    body: 'When this layer starts, measured from the cue\'s start. Drag the block on the timeline. A few milliseconds between a contact click and its body is what makes a strike read as one event rather than two.',
  },
  number: {
    title: 'Value',
    body: 'A plain number for this parameter.',
  },
  toggle: { title: 'Flag', body: 'On or off. The game passes flags like these per play — a hard drop, a kicked rotation — and the recipe is recorded with the flag as set here.' },
};

// Per parameter, by name; element-specific text overrides below.
const PARAMS = {
  dur: 'How long the gesture lasts.',
  attack: 'How quickly it reaches full level. Fast is a hit; slow is a swell — for a flame or a wave, a fast attack is heard as a pop in front of the sound.',
  fade: 'How long the bed takes to fade in at the start and out at the end.',
  gain: 'Peak level of this layer.',
  seed: 'Which take of the random stream this layer used. Locked, it repeats exactly.',
  hp: 'Highpass cutoff: everything below this is removed. Higher is thinner and closer; a contact click lives up here.',
  lp: 'Lowpass cutoff: everything above this is removed. Lower is darker, softer, further away. Two stages are cascaded, because one biquad only rolls off gently and lets hiss through.',
  tone: 'Lowpass on the whole gesture: how bright it is allowed to be.',
  Q: 'Resonance of the band: broad passes a wide swath of noise; resonant narrows to a pitched whistle. A narrow band throws away energy, which the library makes up for automatically.',
  f0: 'Starting frequency.',
  f1: 'Ending frequency of the sweep.',
  freq: 'The string\'s pitch.',
  f: 'The centre frequency.',
  wf0: 'Pitch of the low pressure pulse underneath the gesture.',
  bf0: 'Pitch of the tonal body under the blast.',
  sf0: 'Where the wet band starts.',
  sf1: 'Where the wet band ends.',
  rate: 'How many events per second.',
  rate1: 'The rate at the END of the gesture; the stick-slip sweeps from rate to here. A mechanism that settles grips more slowly as it slows.',
  drift: 'How fast the lowpass wanders, so ten seconds of it never reads as a test tone.',
  sweep: 'How far the band wanders around its centre.',
  detune: 'How far the two oscillators are split, in cents. Their beat rate is the whole character: under 1 Hz breathes, 2–4 Hz is unease.',
  sub: 'A sine an octave down for floor weight.',
  crack: 'The snap at the very front. The whole difference between a detonation and a fireball: 0 is a whump, 1 is a gunshot.',
  weight: 'How much low pressure pulse sits under the flame — 0 for a match head, more for something with volume behind it.',
  bright: 'Scales the whole band up or down, so repeated flares in one cluster do not stack into a tone.',
  snap: 'How sharp the release is.',
  stiffness: 'The material. Floppy is paper; stiff is card.',
  rumble: 'How much rolling low tail follows the blast.',
  skew: 'How front-loaded the grains are. Higher piles them at the start.',
  ring: 'How long each grain rings.',
  breathy: 'How much air is mixed into the voice.',
  rough: 'How irregular the glottal pulse is.',
  flutter: 'How much the flow wavers — turbulence. Smooth reads as cloth or wind, never as something alive.',
  damping: 'How much energy each loop of the string keeps. Lower dies fast; higher sustains.',
  size: 'Scales everything — length, depth, band — together.',
  end: 'Last interval over the first: above 1 the detents slow down (a hand settling a dial); below 1 they speed up (a wheel let go).',
  jitter: 'How unevenly the teeth are spaced. Real teeth are not identical, but too much stops reading as machined.',
  rise: 'How far the band climbs in its arc before relaxing.',
  bend: 'Playback-rate glide over the note: below 1 the string sags as tension eases; above 1 it tightens.',
  accel: 'How the sheets speed up through the run.',
  pulses: 'How many pulses in the chirp. The pulse rate, not the pitch, is what the ear reads as insect.',
  grains: 'How many grains in the burst.',
  detents: 'How many teeth the pawl drops over.',
  count: 'How many sheets in the run.',
  flaps: 'How many times the sheet flaps before it settles.',
  step: 'Gap between pulses.',
  pulse: 'Length of each pulse.',
  partials: 'The overtone table — ratio, level, decay per partial.',
  type: 'Oscillator waveform.',
  dir: 'Out is a breath released; in is a sniff — the arc drawn the other way, a long pull that stops short.',
  chest: 'Lowpass on the voice: how much chest it has.',
};

const PARAMS_BY_ELEMENT = {
  strike: { dur: 'Length of the noise burst — 2–5 ms is a click; longer becomes a hiss.' },
  body: { f0: 'The fundamental. Every partial is a ratio of this.', gain: 'Level of the whole stack.', type: 'Waveform of every partial. Sine is the honest choice for a struck body.' },
  stream: { f: 'Centre of the moving band — the pitch of the water or wind.', dur: 'How long the bed runs. Beds schedule their whole life up front.' },
  drone: { f: 'The drone\'s pitch. Low for floor weight; higher becomes a tone.', dur: 'How long the bed runs.' },
  chirp: { f: 'Pitch of the stridulation — real insects sit at 3–5 kHz.' },
  flare: { f0: 'Where the band starts — high, at ignition.', f1: 'Where it ends — lower, as the ball of hot air expands.' },
  thump: { f0: 'Where the thump starts.', f1: 'Where it drops to. The pitch fall is the weight.' },
  droplet: { f0: 'Where the plink starts.', f1: 'Where it ends — HIGHER, as the cavity collapses. Sweeping down sounds nothing like water.' },
  grunt: { f0: 'Pitch at the start of the call.', f1: 'Pitch at the end. A grunt sags by default.' },
  creak: { f0: 'The band the friction sits in.', f1: 'Where the band ends, if it moves.' },
  ratchet: { f: 'Ring of each tooth.' },
  shatter: { f0: 'Centre of the grain cloud.' },
  squelch: { f0: 'Pitch of the grains.' },
};

export function paramHelp(element, param) {
  const specific = PARAMS_BY_ELEMENT[element] && PARAMS_BY_ELEMENT[element][param];
  return specific || PARAMS[param] || '';
}

export const PANELS = {
  fleet: {
    title: 'Fleet sounds',
    body: 'Pick a game, then a cue. What you see is a recipe recorded from the game\'s own sound pack: the gestures it calls, in order, with the values it used. Play runs that same code with your changes; Original plays the untouched take for comparison.',
  },
  timeline: {
    title: 'Timeline',
    body: 'Each block is one gesture at its offset from the cue\'s start; the shaded tail after the last block is the room. Tap a block to jump to its card; drag it to move the layer in time.',
  },
  layer: {
    title: 'Layer',
    body: 'One gesture in the recipe. A dot on a control means you changed it; "varies per play" means the pack draws it from the seeded stream on every play, and re-rolling shows another take.',
  },
  room: {
    title: 'Room',
    body: 'One convolution room; every cue in a pack feeds it, and every element you play in the lab feeds this one. Sharing a room is what lets overlapping sounds fuse into one place instead of stacking into a pile. The impulse response is generated: sparse early reflections, then a tail that decays AND darkens, because real rooms absorb high frequencies first.',
  },
  elements: {
    title: 'Elements',
    body: 'The gestures the packs are built from, one at a time. Each is a physical model — friction, strike, stick-slip, a plucked string\'s decaying loop — not a waveform. Vary draws pitch and seed from the stream, as a pack would; keyboard mode plays pitched gestures on the piano row.',
  },
  scope: {
    title: 'Scope',
    body: 'The waveform (line) and spectrum (bars, low on the left) of everything the app is playing. Under reduced motion or power saver it rests to a peak reading.',
  },
  code: {
    title: 'Pack code',
    body: 'This exact take as a line of a game\'s js/soundpack.js. Values are resolved; parameters marked "varies per play" are the ones to draw from the stream (S.between, S.cents) when you write the real cue. Copy it, paste it into a pack, and the offline renderer will play what you heard here.',
  },
  transport: {
    title: 'Play, Original, Re-roll, Reset',
    body: 'Play runs the recipe with your changes. Original runs the untouched take — tap them in turn to A/B. Re-roll records a new take from a new seed (your changes carry over where the layer still exists). Reset clears your changes.',
  },
};

Object.assign(PANELS, {
  songs: {
    title: 'Songs',
    body: 'Every song saves itself as you work, into this app\'s own store — it rides the launcher\'s save file, so a backup carries your songs. New starts a blank song; Duplicate copies this one; Undo and Redo step through every edit.',
  },
  transportSeq: {
    title: 'Transport',
    body: 'Play runs the song from the top of the chain and loops it; Space toggles it. Record lets you play tracks live with the number keys and drops each hit on the nearest step. The metronome clicks on the beats. Tempo, swing and the grid size can change while it plays — the grid keeps its place.',
  },
  patterns: {
    title: 'Patterns',
    body: 'A pattern is one grid of steps for every track. Songs usually want more than one — a verse and a fill, say. Tabs switch which pattern you are editing; the one playing is shown in the position readout.',
  },
  chain: {
    title: 'Song chain',
    body: 'The order patterns play in, each with a repeat count. Move a chip left or right to reorder, − and + to change its repeats, × to drop it. The chain loops; the chip lighting up is the one playing.',
  },
  grid: {
    title: 'Step grid',
    body: 'Rows are tracks, columns are steps; the numbered columns are beats. A filled cell is a hit, and its height is how loud. Tap to place or clear; drag up or down on a cell for loudness; drag across a row to paint. Arrow keys nudge a focused cell\'s loudness.',
  },
  track: {
    title: 'Track',
    body: 'A track is one fleet sound — any game\'s cue — played through that game\'s own room. Tap its name for level, the game parameters it takes, and "same every hit", which locks the seed so it repeats exactly. M mutes, S solos. Keys 1–9 play the first nine tracks.',
  },
});

Object.assign(PANELS, {
  fleetBoard: {
    title: 'Fleet board',
    body: 'One pad per sound in this game\'s pack, in the pack\'s own order, played through the game\'s room. Hold a pad for its settings — the parameters the game passes, loudness, and a seed lock. "Save a copy" makes an editable board of it under My boards.',
  },
  myBoards: {
    title: 'My boards',
    body: 'Your own boards: any sound from any game on any pad, each played through its own game\'s room. Turn on Edit pads and tap a pad to give it a sound; hold a pad for its settings. Boards save themselves and ride the launcher\'s save file.',
  },
  padEditor: {
    title: 'Pad',
    body: 'Pick a game, then tap a sound to hear it and select it. A label replaces the cue name on the pad. Sounds marked ∞ are beds: they latch on and off.',
  },
  share: {
    title: 'Share',
    body: 'Share makes a code and a link (through the launcher when framed; a code on the clipboard otherwise). Send pushes the board straight to a device linked in the launcher — both sides are asked first. Export saves a file you can send any other way; Import takes a code or a file. Everything imported is checked field by field before it is kept.',
  },
  riff: {
    title: 'Riff',
    body: 'The last eight seconds of pads you hit, with their timing, loudness and seeds. Replay it, or copy it as a short code someone else can paste to hear exactly what you played — same sounds, same takes.',
  },
});

Object.assign(PANELS, {
  mySounds: {
    title: 'My sounds',
    body: 'Sounds you build here become a pack of their own. Every one is a pad on any board and a track in any song, played through the My sounds room, and its code pastes straight into a game\'s js/soundpack.js.',
  },
  composer: {
    title: 'Build a sound',
    body: 'A sound is a few gestures at offsets — a strike a few milliseconds before a body is a knock; a squelch under a thump is a piggy in mud. Each layer has the gesture\'s own controls plus how much it may vary per play. The name is the cue name: lowercase, digits, dashes.',
  },
});

Object.assign(PANELS, {
  render: {
    title: 'Render WAV',
    body: 'Renders the song offline — same packs, same rooms, same code — and hands you a 48 kHz stereo WAV. ×4 passes loops the chain four times. Offline rendering skips the launcher\'s master compressor, so the file is the cleanest version of what you hear here.',
  },
  dailyKit: {
    title: 'Daily kit',
    body: 'Eight pads picked across the fleet from today\'s seed — everyone sees the same kit on the same day, and it changes at your local midnight. Play a riff and share the code; save a copy if you want to keep it.',
  },
  jam: {
    title: 'Jam',
    body: 'When another device has Audio Tune open with you (paired through the launcher\'s Multiplayer menu), every pad you hit is sent over with its seed, so both devices hear the same take. Hits arrive on their own time; a shared clock for the sequencer is not part of this.',
  },
});

export const GUIDE = [
  {
    id: 'elements', title: 'Elements, cues, rooms, packs',
    body: [
      'Every sound in Paul\'s Arcade is synthesised live from a small library of ELEMENTS — physical gestures rather than waveforms: a contact strike, friction through a moving filter, a plucked string, a stick-slip creak, a water droplet, an inharmonic struck body, a low thump, combustion, a blast, an insect chirp, a stream, granular shatter, a ratchet, a drone, wet squelch, animal breath and grunt, and a flexing sheet.',
      'A CUE is a few elements layered and offset in time — a strike a few milliseconds before a body is a knock; a squelch under a thump is a piggy in mud. A game\'s cues live in its sound pack, one file, and every cue feeds ONE shared ROOM, which is why its sounds belong to one place.',
      'Explore loads those same packs and plays those same functions. What you hear here is what the game plays.',
    ],
  },
  {
    id: 'variation', title: 'Seeds and variation',
    body: [
      'Nothing here repeats identically. Every play draws pitch, timing and balance from a seeded random stream, and a new seed is drawn per play. Byte-identical repetition is the thing the ear reads as "chiptune"; a little variation is most of the difference between a sound and a sound effect.',
      'A TAKE is one seed. Lock it and the sound repeats exactly — try it on a pad to hear the difference. Re-roll and the recipe shows you which values moved: those are the parameters the pack varies.',
    ],
  },
  {
    id: 'distance', title: 'Sends are distance',
    body: [
      'Each cue declares how much of itself goes into the room — its SEND. That number is really a statement about distance: a menu click at 0.1 is in your hand; a temple bell at 0.55 is across the water. Two cues at different sends, sharing one room, read as two things at different distances in the same place.',
      'The room\'s own settings — length, decay, pre-delay, how dark the tail gets — are the place itself. A pond is long and dark; a card room is short and warm; sonar is almost all tail, because the tail IS the point.',
    ],
  },
  {
    id: 'recipe', title: 'From a recipe to a game',
    body: [
      'Pick a fleet sound, tweak it until it is yours, and copy the pack code. It is a cue function in the fleet\'s exact shape: paste it into a game\'s js/soundpack.js, register it, and the launcher\'s offline renderer (tools/soundpack/) will render an audition of it with the same element library you just heard.',
      'Where the code says "varies per play", replace the literal with a draw from the stream — S.between(r, lo, hi) for a range, f0 * S.cents(r, 15) for a pitch — so your cue varies the way the fleet\'s do.',
    ],
  },
  {
    id: 'build', title: 'Building a sound',
    body: [
      'Explore › My sounds is where a sound that does not exist yet gets made. Add gestures as layers, set each one\'s offset on the timeline, and shape it with the same controls the fleet recipes use. Give every layer a little variation — a few cents of pitch, a little level — so no two plays are identical, the way the fleet\'s cues work.',
      'A saved sound is a cue in the My sounds pack: pick "My sounds" as the game when you assign a pad or add a track. Copy as pack code gives you the same cue in the fleet\'s shape; drop it into a game\'s js/soundpack.js and it will play there and render in the offline audition.',
    ],
  },
  {
    id: 'compose', title: 'Composing',
    body: [
      'Compose turns pads into tracks and tracks into songs. Add a sound from any game; it becomes a row in the step grid, played through its game\'s room. Tap cells to place hits, drag on them for loudness. Every track can lock its seed for a drum-machine repeat or leave it free so each hit is a fresh take, the way the games play.',
      'Patterns are grids; the chain is the song — patterns in order with repeat counts, looping. Tempo and swing are live. Record and play the number keys in time and hits land on the nearest step.',
      'Timing is sample-accurate: a scheduler looks a fraction of a second ahead and hands every hit to the audio clock with an exact start time. Nothing audible is fired from a JavaScript timer.',
    ],
  },
  {
    id: 'keys', title: 'Keyboard',
    body: [
      'Play: four rows of ten keys fire the board\'s pads — 1–0, Q–P, A–;, Z–/. Escape stops every bed. On a board of yours, Edit pads then tap a pad to change its sound.',
      'Explore: Space plays the current element or recipe. With keyboard mode on, the piano row — A W S E D F T G Y H U J K O L P ; — plays C4 up chromatically; Z and X shift the octave.',
      'Compose: Space plays and stops, R toggles record, 1–9 play the first nine tracks (and record them when recording), Escape stops.',
      'Every control is a real slider or menu underneath its picture: Tab to it, then use the arrow keys.',
    ],
  },
];
