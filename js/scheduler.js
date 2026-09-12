// The sequencer clock — pure, so timing is testable under node.
//
// The lookahead pattern ("A Tale of Two Clocks"): a coarse JS timer wakes
// every few tens of milliseconds and schedules every step whose time falls
// inside the next lookahead window, against the AudioContext's own clock.
// Nothing audible is ever fired from a JS timer; the timer only decides what
// to hand to the audio clock next. Graph cues take an absolute `when`, which
// is what makes this sample-accurate for free.

/** Seconds per step in 4/4 at `bpm` with `stepsPerBar` steps to the bar. */
export function stepSeconds(bpm, stepsPerBar) {
  return (60 / bpm) * (4 / stepsPerBar);
}

/**
 * Swing delays every other step. `swing` 0..1 maps to 0..half a step, so
 * 0.66 lands close to a triplet feel and 1 is the hard shuffle.
 */
export function swingOffset(step, swing, stepDur) {
  return step % 2 === 1 ? swing * stepDur * 0.5 : 0;
}

/** A fresh clock, starting at audio time `start`. */
export function makeClock(start) {
  return { nextStep: 0, nextTime: start, start };
}

/**
 * Advance the clock up to `horizon` (audio seconds), returning the steps to
 * schedule: [{ step, time }]. `cfg` is { bpm, swing, stepsPerBar } and may
 * change between calls — the base grid stays continuous (nextTime carries
 * over), and swing is applied per step, never accumulated.
 */
export function advance(clock, horizon, cfg) {
  const out = [];
  const stepDur = stepSeconds(cfg.bpm, cfg.stepsPerBar);
  while (clock.nextTime < horizon) {
    out.push({ step: clock.nextStep, time: clock.nextTime + swingOffset(clock.nextStep, cfg.swing || 0, stepDur) });
    clock.nextStep += 1;
    clock.nextTime += stepDur;
  }
  return out;
}

/**
 * The step nearest to audio time `t` on a clock's grid — what live record
 * quantises a hit to. Swing is ignored here (you played it; we snap the
 * grid, and the grid applies swing on playback).
 */
export function nearestStep(clock, t, cfg) {
  const stepDur = stepSeconds(cfg.bpm, cfg.stepsPerBar);
  // nextTime/nextStep pin the grid; walk back from there
  const n = clock.nextStep + Math.round((t - clock.nextTime) / stepDur);
  return Math.max(0, n);
}
