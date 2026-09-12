// A schedulable spec-cue voice (plan §3.4).
//
// The SDK's Arcade.audio.play(spec) plays a spec cue NOW; it has no `when`.
// The sequencer needs pi-game's chiptune cues on the grid, so this renders the
// documented spec format against an explicit start time and destination:
//   { type: 'sine'|'square'|'sawtooth'|'triangle'|'noise', freq, toFreq?, dur,
//     gain, attack?, release?, delay? }  or an array of those (a sequence:
//   voice i starts `delay` after the previous voice's START, or after its
//   duration when delay is absent; all-delay:0 is a chord; max 32 voices).
// Clamps match the SDK's. Follow-up F3 proposes moving this into the library.

const MAX_VOICES = 32;
let noiseBuf = null;

function clamp(v, lo, hi, dflt) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;
}

/** Pure: the start offset and duration of each voice in a spec. */
export function layout(spec) {
  const list = (Array.isArray(spec) ? spec : [spec]).slice(0, MAX_VOICES);
  const out = [];
  let at = 0, prevDur = 0;
  list.forEach((s, i) => {
    const dur = clamp(s.dur, 0.001, 30, 0.15);
    if (i > 0) at += typeof s.delay === 'number' && Number.isFinite(s.delay) ? Math.max(0, s.delay) : prevDur;
    out.push({ at, dur });
    prevDur = dur;
  });
  return out;
}

export function totalDuration(spec) {
  return layout(spec).reduce((m, v) => Math.max(m, v.at + v.dur), 0);
}

function noise(ctx) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const n = Math.floor(ctx.sampleRate * 1);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 22222;
  for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
  noiseBuf = buf;
  return buf;
}

/** Schedule one spec (or sequence) into `dest` starting at `when`. Returns the total duration. */
export function playAt(ctx, dest, when, spec) {
  const list = (Array.isArray(spec) ? spec : [spec]).slice(0, MAX_VOICES);
  const lay = layout(spec);
  list.forEach((s, i) => {
    const t = when + lay[i].at;
    const dur = lay[i].dur;
    const peak = clamp(s.gain, 0, 1, 0.3);
    if (peak <= 0) return;
    const attack = clamp(s.attack, 0, dur, Math.min(0.005, dur / 4));
    const release = clamp(s.release, 0, dur, Math.min(0.05, dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, Math.max(t + attack, t + dur - release));
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(dest);
    let src;
    if (s.type === 'noise') {
      src = ctx.createBufferSource(); src.buffer = noise(ctx); src.loop = true;
    } else {
      src = ctx.createOscillator();
      src.type = ['sine', 'square', 'sawtooth', 'triangle'].includes(s.type) ? s.type : 'sine';
      const f0 = clamp(s.freq, 1, 20000, 440);
      src.frequency.setValueAtTime(f0, t);
      if (typeof s.toFreq === 'number') src.frequency.exponentialRampToValueAtTime(clamp(s.toFreq, 1, 20000, f0), t + dur);
    }
    src.connect(g);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) { /* noop */ } };
  });
  return totalDuration(spec);
}
