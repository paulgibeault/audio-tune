// The Element Lab's knob schema — one entry per gesture in arcade-audio.js.
//
// The library has no introspection: each element reads `p.x || default`
// dynamically, so the lab cannot ask it what it takes. This table is that
// knowledge, read from the library source on 2026-09-12 (plan follow-up F5
// proposes moving it into the library as `E.schema`). Defaults here are the
// library's own defaults where it has one, and a sensible starting value
// where the library requires the parameter (pluck `freq`, body `f0`).
//
// A param is [min, max, step, default]. `{ options }` is an enumeration;
// `{ bool }` a flag; a param with `optional: true` is omitted from the call
// (and the snippet) while it sits at `off`, because for those the library's
// own "absent" behaviour is the thing being contrasted.
//
// `pitched` names the params keyboard mode transposes. `explicitDur` marks
// the two elements whose signature is (ctx, dest, t, dur, p).

export const ELEMENTS = {
  strike: {
    note: 'Contact click. Every physical event starts with one; its absence is why pure tones sound like they were never touched by anything.',
    seeded: true,
    params: { dur: [0.002, 0.05, 0.001, 0.006], hp: [200, 8000, 10, 2200], gain: [0, 1, 0.01, 0.3] },
  },
  rustle: {
    note: 'Friction and air: noise through a bandpass whose cutoff MOVES. A static filter still sounds synthetic; the sweep is what reads as material.',
    seeded: true, pitched: ['f0', 'f1'],
    params: {
      dur: [0.03, 3, 0.01, 0.3], f0: [80, 8000, 10, 900], f1: [80, 8000, 10, 2400], Q: [0.3, 12, 0.1, 1.6],
      attack: [0, 2, 0.005, 0.1], gain: [0, 1, 0.01, 0.25], lp: { range: [200, 8000, 10], off: 0, optional: true },
    },
  },
  pluck: {
    note: 'Karplus–Strong: a noise burst into a delay line with lowpassed feedback — a genuinely plucked string for almost nothing.',
    seeded: true, pitched: ['freq'],
    params: {
      freq: [40, 2000, 1, 220], dur: [0.1, 4, 0.05, 1.2], damping: [0.9, 0.9999, 0.0005, 0.996],
      tone: [200, 12000, 10, 3200], gain: [0, 1, 0.01, 0.3], bend: { range: [0.5, 1.5, 0.01], off: 1, optional: true },
    },
  },
  creak: {
    note: 'Rope and wood under load. Stick-slip: the surfaces grip, tension builds, they release, repeat — irregularly. That irregular envelope IS the sound.',
    seeded: true, pitched: ['f0'],
    params: {
      dur: [0.05, 3, 0.01, 0.5], f0: [60, 3000, 5, 260], f1: { range: [60, 3000, 5], off: 0, optional: true },
      rate: [2, 60, 0.5, 14], rate1: { range: [2, 60, 0.5], off: 0, optional: true },
      Q: [0.5, 20, 0.1, 7], lp: [200, 6000, 10, 1100], gain: [0, 1, 0.01, 0.3], attack: [0, 1, 0.005, 0.12],
    },
  },
  droplet: {
    note: 'Water. A plink is a fast UPWARD pitch sweep — the cavity left by the impact shrinks as it collapses. Sweeping down sounds nothing like water.',
    seeded: true, pitched: ['f0', 'f1'],
    params: {
      dur: [0.01, 0.4, 0.005, 0.05], f0: [80, 3000, 5, 320], f1: [200, 8000, 10, 1500],
      tone: [300, 10000, 10, 2800], gain: [0, 1, 0.01, 0.2],
    },
  },
  body: {
    note: 'Struck resonant body — bells, chimes, bars. Partials are INHARMONIC and each decays at its own rate, high ones first; every partial is a detuned pair so the stack beats slowly.',
    pitched: ['f0'],
    params: {
      f0: [40, 4000, 1, 330], gain: [0, 1, 0.01, 0.3],
      type: { options: ['sine', 'triangle', 'square', 'sawtooth'] },
      partials: { preset: ['wood', 'glass', 'bell', 'bar'] },
    },
  },
  thump: {
    note: 'Low impact weight — taiko, a body landing, distant thunder. `attack` is the difference between a hit and a swell.',
    seeded: true, pitched: ['f0', 'f1'],
    params: {
      dur: [0.05, 2, 0.01, 0.35], attack: [0.001, 0.3, 0.001, 0.004], f0: [30, 400, 1, 110], f1: [20, 200, 1, 45],
      gain: [0, 1, 0.01, 0.35],
    },
  },
  flare: {
    note: 'Combustion. A ball of hot air resonating LOWER as it expands, so the band sweeps downward; `weight` is the pressure pulse under the flame.',
    seeded: true, pitched: ['f0', 'f1'],
    params: {
      dur: [0.05, 2, 0.01, 0.3], gain: [0, 1, 0.01, 0.12], bright: [0.3, 3, 0.05, 1], f0: [100, 5000, 10, 1450],
      f1: [50, 3000, 10, 700], attack: [0, 0.5, 0.005, 0.06], Q: [0.3, 5, 0.05, 0.9],
      lp: { range: [200, 8000, 10], off: 0, optional: true }, weight: [0, 1, 0.01, 0.3], wf0: [40, 400, 1, 150],
    },
  },
  blast: {
    note: 'Explosion. `crack` is the snap at the very front — the whole difference between a detonation and a fireball. Set it to 0 and raise `attack` for a whump.',
    seeded: true,
    params: {
      size: [0.3, 3, 0.05, 1], gain: [0, 1, 0.01, 0.24], dur: [0.1, 2, 0.01, 0.55], crack: [0, 1, 0.01, 1],
      attack: [0.001, 0.3, 0.001, 0.008], f0: [500, 8000, 10, 2700], f1: [40, 1000, 5, 210], wf0: [40, 300, 1, 130],
      rumble: [0, 2, 0.05, 1], tone: { range: [0, 1, 0.01], off: 0, optional: true }, bf0: [30, 200, 1, 64],
    },
  },
  chirp: {
    note: 'Insect stridulation — a train of 2–5 very short pulses tens of milliseconds apart. The PULSE RATE is what the ear reads as insect; one long note is a whistle.',
    pitched: ['f'],
    params: {
      f: [800, 8000, 10, 3600], pulses: [1, 8, 1, 3], step: [0.01, 0.2, 0.001, 0.04], gain: [0, 1, 0.01, 0.05],
      pulse: [0.004, 0.06, 0.001, 0.016], detune: [0, 40, 1, 9],
    },
  },
  stream: {
    note: 'Sustained filtered noise with a slowly drifting band — running water, wind, the basis of ambient beds.',
    seeded: true, explicitDur: true,
    params: {
      dur: [0.5, 20, 0.1, 4], f: [100, 6000, 10, 900], Q: [0.3, 10, 0.05, 0.9], lp: [200, 8000, 10, 1900],
      rate: [0.01, 2, 0.01, 0.07], sweep: [0, 2000, 10, 300], gain: [0, 1, 0.01, 0.05], fade: [0.05, 5, 0.05, 1.2],
    },
  },
  shatter: {
    note: 'Granular breakage — a burst of grains whose density and brightness fall away. `skew` front-loads the grains; `ring` lets each one ring.',
    seeded: true,
    params: {
      dur: [0.05, 2, 0.01, 0.45], gain: [0, 1, 0.01, 0.2], crack: [0, 1, 0.01, 1], hp: [200, 6000, 10, 1500],
      grains: [4, 200, 1, 42], f0: [300, 10000, 10, 3200], bright: [0.3, 3, 0.05, 1], skew: [0.2, 6, 0.1, 2.2],
      ring: [0, 2, 0.05, 1],
    },
  },
  ratchet: {
    note: 'Decelerating detents of a pawl. `end` is the last interval divided by the first: >1 decelerates (a hand settling a dial), <1 accelerates (a wheel let go).',
    seeded: true,
    params: {
      detents: [2, 24, 1, 5], dur: [0.05, 2, 0.01, 0.35], end: [0.2, 5, 0.05, 1], jitter: [0, 0.5, 0.01, 0.07],
      gain: [0, 1, 0.01, 0.2], f: [100, 4000, 5, 640], hp: [300, 8000, 10, 2600],
    },
  },
  drone: {
    note: 'Sustained tone bed: two oscillators split by `detune` cents beat against each other, and the beat RATE is the whole character — under 1 Hz breathes, 2–4 Hz is unease.',
    seeded: true, explicitDur: true, pitched: ['f'],
    params: {
      dur: [0.5, 30, 0.1, 6], f: [20, 800, 0.5, 55], detune: [0, 60, 0.5, 8], gain: [0, 1, 0.01, 0.05],
      fade: [0.05, 5, 0.05, 1.5], lp: [50, 5000, 5, 500], type: { options: ['sine', 'triangle', 'square', 'sawtooth'] },
      sub: { range: [0, 1, 0.01], off: 0, optional: true }, drift: [0, 2, 0.01, 0.06],
    },
  },
  squelch: {
    note: 'Wet contact — mud, flesh, a boot in a puddle. Grains through a sweeping band, then darkened hard.',
    seeded: true,
    params: {
      dur: [0.03, 1, 0.005, 0.16], gain: [0, 1, 0.01, 0.22], sf0: [80, 3000, 5, 420], sf1: [40, 1500, 5, 140],
      lp: [200, 6000, 10, 1300], grains: [2, 100, 1, 18], f0: [50, 2000, 5, 260], skew: [0.2, 6, 0.1, 2.4],
    },
  },
  breath: {
    note: 'Animal air. The passage opens then relaxes, so the band rises and falls in ONE ARC, and the flow flutters. `dir: in` draws the arc the other way for a sniff.',
    seeded: true,
    params: {
      dur: [0.05, 3, 0.01, 0.35], f: [100, 4000, 5, 500], rise: [0.3, 5, 0.05, 1.7], Q: [0.3, 10, 0.05, 1.3],
      gain: [0, 1, 0.01, 0.2], dir: { options: ['out', 'in'] }, lp: [200, 6000, 10, 1100], attack: [0, 1, 0.01, 0.18],
      flutter: [0, 1, 0.01, 0.45], rate: [0.5, 30, 0.5, 7],
    },
  },
  grunt: {
    note: 'Voiced animal sound: a rough glottal pulse through formants. A grunt sags by default (`f1` below `f0`); `breathy` mixes air in, `chest` darkens.',
    seeded: true, pitched: ['f0', 'f1'],
    params: {
      dur: [0.05, 1.5, 0.005, 0.22], gain: [0, 1, 0.01, 0.2], f0: [40, 400, 1, 95], f1: [30, 400, 1, 76],
      rough: [0, 2, 0.05, 1], chest: [100, 1500, 5, 300], breathy: [0, 1, 0.01, 0.25], attack: [0.001, 0.2, 0.001, 0.018],
    },
  },
  flex: {
    note: 'A thin springy sheet bent and released — paper, cardstock, a flag. `snap` is the release, `stiffness` the material, `count` how many sheets in the run.',
    seeded: true,
    params: {
      dur: [0.01, 0.6, 0.005, 0.07], gain: [0, 1, 0.01, 0.2], snap: [0, 1, 0.01, 0.6], stiffness: [0, 1, 0.01, 0.7],
      f0: [200, 6000, 10, 1400], count: [1, 13, 1, 1], flaps: [1, 20, 1, 5], accel: [0.5, 6, 0.1, 2.2],
      rate: [5, 80, 1, 26], end: [0.2, 5, 0.05, 1],
    },
  },
};

// Partial tables for `body`. Ratios are inharmonic on purpose; decays fall
// with frequency, as they do in a struck object.
export const BODY_PRESETS = {
  wood: [
    { ratio: 1.0, gain: 1.0, decay: 0.16 },
    { ratio: 2.7, gain: 0.35, decay: 0.10 },
  ],
  glass: [
    { ratio: 1.0, gain: 1.0, decay: 0.55 },
    { ratio: 2.01, gain: 0.30, decay: 0.38, delay: 0.004 },
    { ratio: 3.4, gain: 0.12, decay: 0.22, delay: 0.008 },
  ],
  bell: [
    { ratio: 0.5, gain: 0.6, decay: 2.6, detune: 2 },
    { ratio: 1.0, gain: 1.0, decay: 2.0, detune: 3 },
    { ratio: 1.19, gain: 0.55, decay: 1.4, detune: 4, delay: 0.01 },
    { ratio: 1.5, gain: 0.4, decay: 1.1, detune: 4 },
    { ratio: 2.0, gain: 0.35, decay: 0.8, detune: 5 },
    { ratio: 3.6, gain: 0.12, decay: 0.3, detune: 6 },
  ],
  bar: [
    { ratio: 1.0, gain: 1.0, decay: 0.9 },
    { ratio: 3.9, gain: 0.25, decay: 0.35 },
    { ratio: 9.2, gain: 0.08, decay: 0.12 },
  ],
};

export const ELEMENT_NAMES = Object.keys(ELEMENTS);
