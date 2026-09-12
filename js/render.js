// Render to WAV — the launcher's offline audition renderer, in the page.
//
// An OfflineAudioContext runs the same pack buses (E.createBus into the
// destination, as tools/soundpack/render.mjs does), the same cue functions
// and the same scheduler maths, then the result is encoded as 16-bit PCM
// and handed over as a file. Offline rendering does not pass through the
// SDK bus, so it also sidesteps the doubled compressor of plan §3.3.

import * as Packs from './packs.js';
import * as Song from './song.js';
import { stepSeconds, swingOffset } from './scheduler.js';
import { playAt as playSpecAt } from './spec-voice.js';
import { scaleSpec } from './pack-shape.js';

export const SAMPLE_RATE = 48000;

/** Pure: seconds a song needs for `passes` passes of the chain plus the longest room tail. */
export function songSeconds(song, passes, tailSeconds) {
  const stepDur = stepSeconds(song.bpm, song.stepsPerBar);
  return Song.chainLength(song) * passes * stepDur + stepDur * 0.5 + tailSeconds + 0.5;
}

/** Pure: encode float channels into a 16-bit PCM WAV ArrayBuffer. */
export function encodeWav(channels, sampleRate) {
  const n = channels[0].length, ch = channels.length;
  const bytes = 44 + n * ch * 2;
  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, channels[c][i]));
    v.setInt16(o, s < 0 ? s * 32768 : s * 32767, true); o += 2;
  }
  return buf;
}

/** Pure: peak and RMS of a rendered buffer's channels, for the report. */
export function measure(channels) {
  let peak = 0, sum = 0, n = 0;
  for (const d of channels) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; n++; }
  return { peak, rms: n ? Math.sqrt(sum / n) : 0 };
}

function roomTail(packIds) {
  let tail = 1;
  for (const id of packIds) { const e = Packs.get(id); if (e && e.pack && e.pack.room && e.pack.room.dur > tail) tail = e.pack.room.dur; }
  return tail;
}

/** Fire one cue into an offline context through a pack bus map. */
function fireOffline(ctx, buses, E, id, cueName, when, { params, velocity, seed }) {
  const entry = Packs.get(id);
  if (!entry || entry.status !== 'ready') return;
  const c = entry.pack.cues.find((x) => x.name === cueName);
  if (!c) return;
  if (entry.pack.kind === 'spec') {
    const g = ctx.createGain(); g.connect(ctx.destination);
    playSpecAt(ctx, g, when, scaleSpec(c.spec, velocity == null ? 1 : velocity, null));
    return;
  }
  if (c.sustained) return;
  let bus = buses.get(id);
  if (!bus) { bus = E.createBus(ctx, ctx.destination, entry.pack.room); buses.set(id, bus); }
  const o = E.out(bus, c.send);
  o.gain.value = velocity == null ? 1 : velocity;
  try { c.fn(ctx, o, when, params || null, E.rng(Number.isFinite(seed) ? seed : ((when * 1000) | 0) + 7)); } catch (e) { console.warn('[audio-tune] render: cue threw', id, cueName, e); }
}

/** Render a song to channels. Returns { channels, sampleRate, seconds, peak, rms }. */
export async function renderSong(song, { passes = 1, sampleRate = SAMPLE_RATE, onProgress = null } = {}) {
  const E = Packs.available() ? window.ArcadeAudioElements : null;
  if (!E) throw new Error('element library not loaded');
  const packIds = [...new Set(song.tracks.map((t) => t.pad.pack))];
  await Promise.all(packIds.map((id) => Packs.load(id)));
  const seconds = songSeconds(song, passes, roomTail(packIds));
  if (seconds > 600) throw new Error('that render would be over ten minutes — fewer passes?');
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const buses = new Map();
  const stepDur = stepSeconds(song.bpm, song.stepsPerBar);
  const total = Song.chainLength(song) * passes;
  const audible = Song.audibleTracks(song);
  const lead = 0.05;
  for (let n = 0; n < total; n++) {
    const res = Song.resolveStep(song, n);
    const time = lead + n * stepDur + swingOffset(n, song.swing || 0, stepDur);
    for (const t of audible) {
      const row = res.pattern.steps[t.id];
      const vel = row ? row[res.index] : 0;
      if (vel > 0) fireOffline(ctx, buses, E, t.pad.pack, t.pad.cue, time, { params: t.pad.params, velocity: vel * t.gain, seed: t.pad.seedLock ? t.pad.seed : undefined });
    }
    if (onProgress && n % 16 === 0) onProgress(n / total);
  }
  const buffer = await ctx.startRendering();
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  return { channels, sampleRate, seconds, ...measure(channels) };
}

/** Render one cue (a pad) to channels, room tail included. */
export async function renderCue(id, cueName, { params = null, velocity = 1, seed = null, sampleRate = SAMPLE_RATE } = {}) {
  const E = Packs.available() ? window.ArcadeAudioElements : null;
  if (!E) throw new Error('element library not loaded');
  const entry = await Packs.load(id);
  if (entry.status !== 'ready') throw new Error('pack unavailable');
  const seconds = 4 + roomTail([id]);
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  fireOffline(ctx, new Map(), E, id, cueName, 0.05, { params, velocity, seed });
  const buffer = await ctx.startRendering();
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  return { channels, sampleRate, seconds, ...measure(channels) };
}

/** Trim trailing silence (below −72 dBFS) but keep at least `min` seconds. */
export function trimTail(channels, sampleRate, min = 0.5) {
  const thr = Math.pow(10, -72 / 20);
  let last = 0;
  for (const d of channels) for (let i = d.length - 1; i >= 0; i--) { if (Math.abs(d[i]) > thr) { if (i > last) last = i; break; } }
  const end = Math.min(channels[0].length, Math.max(last + Math.round(0.2 * sampleRate), Math.round(min * sampleRate)));
  return channels.map((d) => d.subarray(0, end));
}

/** Hand the viewer a WAV file. */
export function downloadWav(name, channels, sampleRate) {
  const blob = new Blob([encodeWav(channels, sampleRate)], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function wavName(base) { return `${String(base).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'audio-tune'}.wav`; }
