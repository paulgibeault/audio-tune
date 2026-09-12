// Which control a parameter gets, and what its ends mean.
//
// A slider says "a number between two numbers". A control should say what the
// number IS. This table maps every element parameter to a control kind
// (js/controls.js) and, for `character` kinds, names its two poles so the
// gesture is "drag toward the word you want". Pairs (a sweep's from/to, an
// envelope's attack/dur) are declared per element so the two knobs draw as
// one picture.

import { ELEMENTS } from './element-params.js';

// By parameter name — the default meaning across the library.
const BY_NAME = {
  f0: { kind: 'pitch' }, freq: { kind: 'pitch' }, f: { kind: 'pitch' }, f1: { kind: 'pitch' },
  wf0: { kind: 'pitch', label: 'weight pitch' }, bf0: { kind: 'pitch', label: 'body pitch' },
  sf0: { kind: 'pitch' }, sf1: { kind: 'pitch' },
  gain: { kind: 'gain' },
  sub: { kind: 'character', poles: ['no sub', 'full sub'] },
  hp: { kind: 'filter', filter: 'highpass' }, lp: { kind: 'filter', filter: 'lowpass' },
  tone: { kind: 'filter', filter: 'lowpass' }, chest: { kind: 'filter', filter: 'lowpass' },
  Q: { kind: 'character', poles: ['broad', 'resonant'] },
  dur: { kind: 'time' }, attack: { kind: 'time' }, fade: { kind: 'time' },
  step: { kind: 'time', label: 'gap' }, pulse: { kind: 'time', label: 'pulse length' },
  rate: { kind: 'character', poles: ['slow', 'fast'], unit: 'Hz' },
  rate1: { kind: 'character', poles: ['slow', 'fast'], unit: 'Hz', label: 'end rate' },
  drift: { kind: 'character', poles: ['still', 'drifting'], unit: 'Hz' },
  sweep: { kind: 'character', poles: ['still', 'wandering'], unit: 'Hz' },
  detune: { kind: 'character', poles: ['pure', 'beating'], unit: 'cents' },
  crack: { kind: 'character', poles: ['whump', 'snap'] },
  weight: { kind: 'character', poles: ['airy', 'heavy'] },
  bright: { kind: 'character', poles: ['dark', 'bright'] },
  snap: { kind: 'character', poles: ['gentle', 'sharp'] },
  stiffness: { kind: 'character', poles: ['floppy', 'stiff'] },
  rumble: { kind: 'character', poles: ['tight', 'rolling'] },
  skew: { kind: 'character', poles: ['even', 'front-loaded'] },
  ring: { kind: 'character', poles: ['dead', 'ringing'] },
  breathy: { kind: 'character', poles: ['voiced', 'breathy'] },
  rough: { kind: 'character', poles: ['smooth', 'rough'] },
  flutter: { kind: 'character', poles: ['steady', 'fluttering'] },
  damping: { kind: 'character', poles: ['muted', 'sustaining'] },
  size: { kind: 'character', poles: ['small', 'huge'] },
  end: { kind: 'character', poles: ['speeding up', 'slowing down'] },
  jitter: { kind: 'character', poles: ['machined', 'loose'] },
  rise: { kind: 'character', poles: ['flat', 'soaring'] },
  bend: { kind: 'character', poles: ['falls', 'rises'] },
  accel: { kind: 'character', poles: ['even', 'accelerating'] },
  pulses: { kind: 'count' }, grains: { kind: 'count' }, detents: { kind: 'count' },
  count: { kind: 'count' }, flaps: { kind: 'count' },
  partials: { kind: 'partials' },
  type: { kind: 'choice' }, dir: { kind: 'choice' }, kind: { kind: 'choice' },
  seed: { kind: 'dice' },
};

// Element-specific meanings that differ from the default.
const BY_ELEMENT = {
  stream: { f: { kind: 'filter', filter: 'bandpass', label: 'band' } },
  breath: { f: { kind: 'filter', filter: 'bandpass', label: 'band' } },
  creak: { f0: { kind: 'filter', filter: 'bandpass', label: 'band' }, f1: { kind: 'filter', filter: 'bandpass', label: 'end band' } },
  blast: { tone: { kind: 'character', poles: ['no tone', 'tonal'] } },
  shatter: { f0: { kind: 'pitch', label: 'grain pitch' } },
  squelch: { f0: { kind: 'pitch', label: 'grain pitch' } },
  ratchet: { f: { kind: 'pitch', label: 'tooth pitch' } },
};

// Two knobs that draw as one picture.
export const PAIRS = {
  rustle: { sweep: ['f0', 'f1'], envelope: ['attack', 'dur'] },
  droplet: { sweep: ['f0', 'f1'] },
  thump: { sweep: ['f0', 'f1'], envelope: ['attack', 'dur'] },
  flare: { sweep: ['f0', 'f1'], envelope: ['attack', 'dur'] },
  blast: { sweep: ['f0', 'f1'], envelope: ['attack', 'dur'] },
  grunt: { sweep: ['f0', 'f1'], envelope: ['attack', 'dur'] },
  squelch: { sweep: ['sf0', 'sf1'] },
  creak: { envelope: ['attack', 'dur'] },
  breath: { envelope: ['attack', 'dur'] },
  stream: { envelope: ['fade', 'dur'] },
  drone: { envelope: ['fade', 'dur'] },
};

/** The control description for one parameter of one element. */
export function kindOf(element, param) {
  const spec = (BY_ELEMENT[element] && BY_ELEMENT[element][param]) || BY_NAME[param];
  if (spec) return { label: param, ...spec };
  return { kind: 'number', label: param };
}

/** True when this parameter is one half of a pair drawn as a single control. */
export function pairFor(element, param) {
  const pairs = PAIRS[element];
  if (!pairs) return null;
  for (const [kind, [a, b]] of Object.entries(pairs)) {
    if (param === a || param === b) return { kind, a, b, first: param === a };
  }
  return null;
}

/** Every (element, param) with its resolved kind — for tests and the guide. */
export function allKinds() {
  const out = [];
  for (const [el, e] of Object.entries(ELEMENTS)) {
    for (const p of Object.keys(e.params)) out.push({ element: el, param: p, ...kindOf(el, p), pair: pairFor(el, p) });
  }
  return out;
}
