// Riffs — the last few seconds of what you played on a board, as a share
// code. Pure: a ring buffer of hits, compaction, and playback scheduling.

import { RIFF_VERSION, validateRiff } from './validate.js';

export const RIFF_SECONDS = 8;
export const RIFF_MAX = 128;

export class RiffBuffer {
  constructor(seconds = RIFF_SECONDS) { this.seconds = seconds; this.hits = []; }
  /** Record a hit at audio time `t`. */
  add(t, pad, velocity, seed) {
    this.hits.push({ t, pad, velocity, seed });
    const cutoff = t - this.seconds;
    while (this.hits.length && this.hits[0].t < cutoff) this.hits.shift();
    if (this.hits.length > RIFF_MAX) this.hits.shift();
  }
  clear() { this.hits = []; }
  get length() { return this.hits.length; }
  /** Hits re-based so the first is at 0, rounded to ms. */
  take() {
    if (!this.hits.length) return [];
    const t0 = this.hits[0].t;
    return this.hits.map((h) => ({ ...h, at: Math.round((h.t - t0) * 1000) / 1000 }));
  }
}

/** Compact riff payload for Arcade.share.encode. */
export function packRiff(hits) {
  return {
    v: RIFF_VERSION,
    h: hits.map((h) => [h.at, h.pad.pack, h.pad.cue, h.pad.params || 0, +((h.velocity == null ? 1 : h.velocity)).toFixed(2), h.seed == null ? 0 : h.seed]),
  };
}

/** Expand and validate a compact riff. */
export function unpackRiff(c, opts = {}) {
  validateRiff(c, opts);
  return c.h.map(([at, pack, cue, params, vel, seed]) => ({
    at, pad: { pack, cue, params: params && typeof params === 'object' ? params : null }, velocity: vel == null ? 1 : vel, seed: seed || null,
  }));
}

/** Total length of a riff plus a little tail. */
export function riffLength(hits) { return hits.length ? hits[hits.length - 1].at + 0.5 : 0; }
