#!/usr/bin/env node
// Fleet audio smoke — every pack loads, every cue makes sound.
//
// Opens the staged app in headless Chromium, loads every pack in the
// manifest through the app's own loader, then renders every one-shot cue
// (and a few seconds of every bed) through an OfflineAudioContext and
// asserts each is audible and not clipping — the thresholds analyze.mjs
// uses. A pack that starts throwing, or a cue that goes silent, fails here
// even if its own game has no audio test. That gate did not exist before.
//
//   ./dev.sh ../audio-tune ../moon-lit … ../pi-game     (from the launcher repo)
//   node tools/smoke.mjs --base http://127.0.0.1:4791
//
// Playwright is borrowed from the launcher checkout (it is a devDependency
// there); pass --playwright <dir> to point elsewhere.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = flag('base', 'http://127.0.0.1:4791');
const PW_DIR = flag('playwright', path.resolve(HERE, '..', '..', 'paulgibeault.github.io'));

let chromium;
try { ({ chromium } = createRequire(path.join(PW_DIR, 'package.json'))('playwright')); }
catch (e) { console.error(`smoke: playwright not found under ${PW_DIR} (npm install there, or --playwright <dir>)`); process.exit(2); }

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  page error:', e.message));
await page.goto(`${BASE}/audio-tune/`, { waitUntil: 'networkidle' });

const report = await page.evaluate(async () => {
  const P = await import('./js/packs.js');
  const SV = await import('./js/spec-voice.js');
  const { scaleSpec } = await import('./js/pack-shape.js');
  const { paramsFor } = await import('./js/cue-params.js');
  const E = window.ArcadeAudioElements;
  await P.loadManifest();
  const out = { packs: [], cues: [] };
  for (const d of P.list()) {
    if (d.id === 'mine') continue;
    const entry = await P.load(d.id);
    out.packs.push({ id: d.id, status: entry.status, error: entry.error || null, cues: entry.pack ? entry.pack.cues.length : 0 });
    if (entry.status !== 'ready') continue;
    for (const c of entry.pack.cues) {
      const seconds = c.sustained ? 7 : 3 + ((entry.pack.room && entry.pack.room.dur) || 1);
      const ctx = new OfflineAudioContext(1, Math.ceil(seconds * 48000), 48000);
      let err = null;
      try {
        if (entry.pack.kind === 'spec') {
          const g = ctx.createGain(); g.connect(ctx.destination);
          SV.playAt(ctx, g, 0.05, scaleSpec(c.spec, 1, null));
        } else {
          const bus = E.createBus(ctx, ctx.destination, entry.pack.room);
          const o = E.out(bus, c.send);
          // beds at their LOUDEST setting (a bed at heat 0 is quiet by design);
          // one-shots at the game's defaults
          const spec = paramsFor(d.id, c.name) || c.params || null;
          const params = spec ? Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, Array.isArray(v) ? (c.sustained ? v[1] : v[3]) : (v.options ? v.options[v.options.length - 1] : v.bool ? false : v)])) : null;
          const r = c.fn(ctx, o, 0.05, c.sustained ? { ...(params || {}), dur: 6 } : params, E.rng(11));
          if (c.sustained && typeof r === 'function') r(6.2);
        }
      } catch (e) { err = e.message; }
      let peak = 0;
      if (!err) { const buf = await ctx.startRendering(); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
      out.cues.push({ pack: d.id, cue: c.name, sustained: !!c.sustained, peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, err });
    }
  }
  return out;
});
await browser.close();

// Silent by design: the pack says so in its own comments.
const EXPECT_SILENT = new Set(['moon-lit/ambient']);

let fail = 0;
for (const p of report.packs) {
  const ok = p.status === 'ready';
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} pack ${p.id}: ${p.status}${p.error ? ' — ' + p.error : ''} (${p.cues} cues)`);
}
for (const c of report.cues) {
  const expectSilent = EXPECT_SILENT.has(`${c.pack}/${c.cue}`);
  const inaudible = c.peakDb < -40 && !expectSilent, hot = c.peakDb > -1.0;
  const bad = !!c.err || inaudible || hot;
  if (bad) fail++;
  const db = Number.isFinite(c.peakDb) ? `${c.peakDb.toFixed(1)} dBFS` : 'silent';
  console.log(`${bad ? '✗' : '✓'} ${c.pack}/${c.cue}${c.sustained ? ' (bed)' : ''}: ${c.err ? 'threw — ' + c.err : db}${inaudible ? ' — inaudible' : ''}${hot ? ' — too hot' : ''}${expectSilent ? ' — silent by design' : ''}`);
}
console.log(`\n${report.cues.length} cues across ${report.packs.length} packs; ${fail} problem${fail === 1 ? '' : 's'}`);
process.exit(fail ? 1 : 0);
