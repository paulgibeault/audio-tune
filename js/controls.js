// Controls whose picture is the parameter's meaning (docs/explore-design.md).
//
// Every control is a native <input type="range"> (or <select>) underneath —
// focusable, arrow-key operable, with aria-valuetext carrying the meaningful
// reading — and an SVG drawn over it that you drag. The native input is
// visually hidden, so nothing here is a picture of a control; it is a control
// with a picture.

import { KINDS } from './help.js';

const SVG = 'http://www.w3.org/2000/svg';
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, String(v));
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
};
const svg = (tag, attrs = {}, ...children) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  for (const c of children) if (c != null) n.append(c);
  return n;
};

// ── pure helpers (exported for tests) ─────────────────────────────────

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function snapStep(v, step, min) { return step ? Math.round((v - min) / step) * step + min : v; }
export function toLog(v, min, max) { return Math.log(v / min) / Math.log(max / min); }
export function fromLog(f, min, max) { return min * Math.pow(max / min, f); }
export function noteOf(hz) {
  const n = Math.round(12 * Math.log2(hz / 440)) + 57;   // 57 = A4 index from C0
  const name = NOTE_NAMES[((n % 12) + 12) % 12];
  const oct = Math.floor(n / 12);
  const exact = 440 * Math.pow(2, (n - 57) / 12);
  const off = Math.round(1200 * Math.log2(hz / exact));
  return { name: `${name}${oct}`, cents: off };
}
export function hzOfNote(n) { return 440 * Math.pow(2, (n - 57) / 12); }
export function dB(g) { return g <= 0 ? -Infinity : 20 * Math.log10(g); }
export function fmtHz(v) { return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${Math.round(v)} Hz`; }
export function fmtMs(s) { return s >= 1 ? `${s.toFixed(2)} s` : `${Math.round(s * 1000)} ms`; }
export function fmtNum(v) { return Number.isInteger(v) ? String(v) : String(+v.toFixed(3)); }

/** Biquad magnitude (dB) at frequency f for a cutoff fc and Q, per type. */
export function biquadDb(type, f, fc, Q = 0.707) {
  const w = f / fc, w2 = w * w;
  let mag;
  if (type === 'lowpass') mag = 1 / Math.sqrt((1 - w2) ** 2 + (w / Q) ** 2);
  else if (type === 'highpass') mag = w2 / Math.sqrt((1 - w2) ** 2 + (w / Q) ** 2);
  else mag = (w / Q) / Math.sqrt((1 - w2) ** 2 + (w / Q) ** 2);
  return 20 * Math.log10(Math.max(mag, 1e-6));
}

// ── shared frame: label, help, hidden input, picture ─────────────────

let openHelp = null;
function helpButton(title, body) {
  const pop = el('div', { class: 'help-pop', role: 'dialog', 'aria-label': title, hidden: true },
    el('strong', {}, title), el('p', {}, body));
  const btn = el('button', { class: 'help-btn', type: 'button', 'aria-label': `Help: ${title}`, 'aria-expanded': 'false',
    onclick: (e) => { e.stopPropagation(); toggle(); } }, '?');
  function toggle(force) {
    const show = force == null ? pop.hidden : force;
    if (show && openHelp && openHelp !== pop) openHelp.hidden = true;
    pop.hidden = !show;
    btn.setAttribute('aria-expanded', String(show));
    openHelp = show ? pop : null;
  }
  return { btn, pop };
}
document.addEventListener('click', () => { if (openHelp) { openHelp.hidden = true; openHelp = null; } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openHelp) { openHelp.hidden = true; openHelp = null; } });

function frame(spec, kindKey) {
  const k = KINDS[kindKey] || KINDS.number;
  const help = helpButton(spec.helpTitle || `${spec.label} — ${k.title}`, [spec.help, k.body].filter(Boolean).join(' '));
  const root = el('div', { class: `control control-${kindKey}${spec.varied ? ' is-varied' : ''}`, dataset: { param: spec.name || '' } });
  const head = el('div', { class: 'control-head' },
    el('span', { class: 'control-label' }, spec.label),
    spec.varied ? el('span', { class: 'control-varied', title: 'the pack draws this from the seeded stream on every play' }, 'varies per play') : null,
    el('output', { class: 'control-value' }),
    el('span', { class: 'control-dot', 'aria-hidden': 'true', title: 'changed' }),
    help.btn);
  root.append(head, help.pop);
  return { root, head, out: head.querySelector('.control-value'), setChanged: (c) => root.classList.toggle('is-changed', !!c) };
}

function hiddenRange(name, min, max, step, value, onInput, valuetext) {
  const input = el('input', { class: 'vh', type: 'range', min, max, step, value, 'aria-label': name });
  const sync = () => input.setAttribute('aria-valuetext', valuetext(Number(input.value)));
  input.addEventListener('input', () => { onInput(Number(input.value)); sync(); });
  sync();
  return { input, sync };
}

function drag(node, onPoint) {
  const at = (e) => {
    const r = node.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  };
  node.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    node.setPointerCapture(e.pointerId);
    const p = at(e);
    onPoint(p.x, p.y, 'down');
    const move = (ev) => { const q = at(ev); onPoint(q.x, q.y, 'move'); };
    const up = () => { node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up); onPoint(null, null, 'up'); };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  });
}

// ── kinds ─────────────────────────────────────────────────────────────

/**
 * Build a control. spec: { kind, name, label, value, range:[min,max,step],
 * poles, unit, options, filter, help, varied, onChange(v) }.
 * Returns the element with .set(v) and .value.
 */
export function control(spec) {
  const build = BUILDERS[spec.kind] || BUILDERS.number;
  return build(spec);
}

const BUILDERS = {
  pitch(spec) {
    const [min, max] = spec.range;
    const f = frame(spec, 'pitch');
    let value = spec.value;
    let snap = false;
    const W = 320, H = 44;
    const pic = svg('svg', { class: 'pic pic-pitch', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const keys = svg('g');
    const nLo = Math.ceil(12 * Math.log2(min / 440)) + 57, nHi = Math.floor(12 * Math.log2(max / 440)) + 57;
    const octaves = (nHi - nLo) / 12;
    if (octaves <= 6) {
      for (let n = nLo; n <= nHi; n++) {
        const x0 = toLog(hzOfNote(n - 0.5), min, max) * W, x1 = toLog(hzOfNote(n + 0.5), min, max) * W;
        const black = [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);
        keys.append(svg('rect', { x: clamp(x0, 0, W), y: 6, width: Math.max(0.5, clamp(x1, 0, W) - clamp(x0, 0, W)), height: black ? 18 : 30, class: black ? 'key-b' : 'key-w' }));
        if (n % 12 === 0) keys.append(svg('text', { x: (x0 + x1) / 2, y: H - 2, class: 'pic-tick' }, `C${Math.floor(n / 12)}`));
      }
    } else {
      for (let n = nLo; n <= nHi; n++) if (n % 12 === 0) {
        const x = toLog(hzOfNote(n), min, max) * W;
        keys.append(svg('line', { x1: x, x2: x, y1: 6, y2: 36, class: 'pic-grid' }), svg('text', { x, y: H - 2, class: 'pic-tick' }, `C${Math.floor(n / 12)}`));
      }
    }
    const marker = svg('rect', { y: 2, width: 3, height: 34, rx: 1.5, class: 'pic-marker' });
    pic.append(keys, marker);
    const text = (v) => { const n = noteOf(v); return `${n.name}${n.cents ? (n.cents > 0 ? ' +' : ' ') + n.cents + '¢' : ''} · ${fmtHz(v)}`; };
    const { input, sync } = hiddenRange(spec.label, Math.log(min), Math.log(max), 0.005, Math.log(value), (lv) => set(Math.exp(lv), true), (lv) => text(Math.exp(lv)));
    const snapBox = el('label', { class: 'control-opt' }, el('input', { type: 'checkbox', onchange: (e) => { snap = e.target.checked; } }), el('span', {}, 'snap to notes'));
    function draw() { marker.setAttribute('x', clamp(toLog(value, min, max) * W - 1.5, 0, W - 3)); f.out.value = text(value); }
    function set(v, fire) {
      value = clamp(v, min, max);
      if (snap) { const n = Math.round(12 * Math.log2(value / 440)) + 57; value = clamp(hzOfNote(n), min, max); }
      input.value = Math.log(value); sync(); draw();
      if (fire) spec.onChange(value);
    }
    drag(pic, (x) => { if (x != null) set(fromLog(x, min, max), true); });
    f.root.append(el('div', { class: 'control-body' }, input, pic), snapBox);
    draw();
    return Object.assign(f.root, { set: (v) => set(v, false), get value() { return value; }, setChanged: f.setChanged });
  },

  sweep(spec) {
    // spec.values {from, to}, spec.ranges {from:[..], to:[..]}, spec.dur (s), onChange({from,to})
    const f = frame(spec, 'sweep');
    let { from, to } = spec.values;
    const rf = spec.ranges.from, rt = spec.ranges.to;
    const lo = Math.min(rf[0], rt[0]), hi = Math.max(rf[1], rt[1]);
    const W = 320, H = 80;
    const pic = svg('svg', { class: 'pic pic-sweep', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const grid = svg('g');
    for (const hz of [100, 1000, 10000]) if (hz > lo && hz < hi) {
      const y = H - toLog(hz, lo, hi) * H;
      grid.append(svg('line', { x1: 0, x2: W, y1: y, y2: y, class: 'pic-grid' }), svg('text', { x: 2, y: y - 2, class: 'pic-tick' }, fmtHz(hz)));
    }
    const path = svg('path', { class: 'pic-line' });
    const dFrom = svg('circle', { r: 7, class: 'pic-handle' }), dTo = svg('circle', { r: 7, class: 'pic-handle' });
    pic.append(grid, path, dFrom, dTo);
    const text = () => `${fmtHz(from)} → ${fmtHz(to)}`;
    const a = hiddenRange(`${spec.label} start`, Math.log(rf[0]), Math.log(rf[1]), 0.005, Math.log(from), (lv) => { from = Math.exp(lv); draw(); fire(); }, (lv) => fmtHz(Math.exp(lv)));
    const b = hiddenRange(`${spec.label} end`, Math.log(rt[0]), Math.log(rt[1]), 0.005, Math.log(to), (lv) => { to = Math.exp(lv); draw(); fire(); }, (lv) => fmtHz(Math.exp(lv)));
    function y(v) { return H - clamp(toLog(v, lo, hi), 0, 1) * (H - 10) - 5; }
    function draw() {
      const y0 = y(from), y1 = y(to), x0 = 12, x1 = W - 12;
      const cx = (x0 + x1) / 2;
      path.setAttribute('d', `M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1}`);
      dFrom.setAttribute('cx', x0); dFrom.setAttribute('cy', y0);
      dTo.setAttribute('cx', x1); dTo.setAttribute('cy', y1);
      f.out.value = text();
      a.input.value = Math.log(from); b.input.value = Math.log(to); a.sync(); b.sync();
    }
    function fire() { spec.onChange({ from, to }); }
    let which = null;
    drag(pic, (x, yy, phase) => {
      if (phase === 'down') which = x < 0.5 ? 'from' : 'to';
      if (x == null) { which = null; return; }
      const v = fromLog(1 - yy, lo, hi);
      if (which === 'from') from = clamp(v, rf[0], rf[1]); else to = clamp(v, rt[0], rt[1]);
      draw(); fire();
    });
    f.root.append(el('div', { class: 'control-body' }, a.input, b.input, pic));
    draw();
    return Object.assign(f.root, { set: (v) => { from = v.from; to = v.to; draw(); }, get value() { return { from, to }; }, setChanged: f.setChanged });
  },

  envelope(spec) {
    // spec.values {attack, dur} (attack may be null → fixed), ranges, onChange({attack,dur})
    const f = frame(spec, 'envelope');
    let { attack, dur } = spec.values;
    const ra = spec.ranges.attack, rd = spec.ranges.dur;
    const W = 320, H = 70;
    const pic = svg('svg', { class: 'pic pic-env', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const area = svg('path', { class: 'pic-area' });
    const line = svg('path', { class: 'pic-line' });
    const knee = svg('circle', { r: 6, class: 'pic-handle' }), end = svg('circle', { r: 6, class: 'pic-handle' });
    const ruler = svg('g');
    pic.append(area, line, knee, end, ruler);
    const a = ra ? hiddenRange(`${spec.label} attack`, ra[0], ra[1], ra[2], attack, (v) => { attack = v; draw(); fire(); }, fmtMs) : null;
    const d = hiddenRange(`${spec.label} length`, rd[0], rd[1], rd[2], dur, (v) => { dur = v; draw(); fire(); }, fmtMs);
    function draw() {
      const span = rd[1];
      const xs = (t) => 10 + (t / span) * (W - 20);
      const atk = ra ? Math.min(attack, dur) : Math.min(0.004, dur);
      const pts = [];
      const N = 40;
      for (let i = 0; i <= N; i++) {
        const t = atk + (dur - atk) * (i / N);
        const g = Math.exp(-4 * ((t - atk) / Math.max(dur - atk, 1e-4)));
        pts.push(`${xs(t)},${H - 12 - g * (H - 24)}`);
      }
      const dpath = `M${xs(0)},${H - 12} L${xs(atk)},12 L${pts.join(' L')}`;
      line.setAttribute('d', dpath);
      area.setAttribute('d', `${dpath} L${xs(dur)},${H - 12} Z`);
      knee.setAttribute('cx', xs(atk)); knee.setAttribute('cy', 12);
      end.setAttribute('cx', xs(dur)); end.setAttribute('cy', H - 12);
      knee.style.display = ra ? '' : 'none';
      ruler.replaceChildren();
      const ticks = span >= 2 ? [0, 0.5, 1, 2, 5, 10, 20] : span >= 0.5 ? [0, 0.1, 0.25, 0.5, 1, 2] : [0, 0.01, 0.05, 0.1, 0.2, 0.5];
      for (const t of ticks) if (t <= span) ruler.append(svg('line', { x1: xs(t), x2: xs(t), y1: H - 12, y2: H - 8, class: 'pic-grid' }), svg('text', { x: xs(t), y: H - 1, class: 'pic-tick' }, fmtMs(t)));
      f.out.value = ra ? `${fmtMs(attack)} in · ${fmtMs(dur)} long` : fmtMs(dur);
      if (a) { a.input.value = attack; a.sync(); }
      d.input.value = dur; d.sync();
    }
    function fire() { spec.onChange({ attack, dur }); }
    let which = null;
    drag(pic, (x, yy, phase) => {
      if (phase === 'down') {
        const span = rd[1];
        const tx = clamp((x * W - 10) / (W - 20), 0, 1) * span;
        which = ra && Math.abs(tx - Math.min(attack, dur)) < Math.abs(tx - dur) ? 'attack' : 'dur';
      }
      if (x == null) { which = null; return; }
      const t = clamp((x * W - 10) / (W - 20), 0, 1) * rd[1];
      if (which === 'attack') attack = clamp(snapStep(t, ra[2], ra[0]), ra[0], ra[1]);
      else dur = clamp(snapStep(t, rd[2], rd[0]), rd[0], rd[1]);
      draw(); fire();
    });
    f.root.append(el('div', { class: 'control-body' }, a ? a.input : null, d.input, pic));
    draw();
    return Object.assign(f.root, { set: (v) => { if (v.attack != null) attack = v.attack; if (v.dur != null) dur = v.dur; draw(); }, get value() { return { attack, dur }; }, setChanged: f.setChanged });
  },

  time(spec) {
    const [min, max, step] = spec.range;
    const f = frame(spec, 'time');
    let value = spec.value;
    const W = 320, H = 34;
    const pic = svg('svg', { class: 'pic pic-time', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const bar = svg('rect', { x: 0, y: 8, height: 14, rx: 4, class: 'pic-bar' });
    const track = svg('rect', { x: 0, y: 8, width: W, height: 14, rx: 4, class: 'pic-track' });
    const ruler = svg('g');
    pic.append(track, bar, ruler);
    for (const fr of [0, 0.25, 0.5, 0.75, 1]) ruler.append(svg('text', { x: fr * W, y: H - 1, class: 'pic-tick', 'text-anchor': fr === 0 ? 'start' : fr === 1 ? 'end' : 'middle' }, fmtMs(min + fr * (max - min))));
    const { input, sync } = hiddenRange(spec.label, min, max, step, value, (v) => set(v, true), fmtMs);
    function draw() { bar.setAttribute('width', ((value - min) / (max - min)) * W); f.out.value = fmtMs(value); }
    function set(v, fire) { value = clamp(snapStep(v, step, min), min, max); input.value = value; sync(); draw(); if (fire) spec.onChange(value); }
    drag(pic, (x) => { if (x != null) set(min + x * (max - min), true); });
    f.root.append(el('div', { class: 'control-body' }, input, pic));
    draw();
    return Object.assign(f.root, { set: (v) => set(v, false), get value() { return value; }, setChanged: f.setChanged });
  },

  gain(spec) {
    const [min, max, step] = spec.range;
    const f = frame(spec, 'gain');
    let value = spec.value;
    const W = 320, H = 34;
    const floor = -48;
    const pic = svg('svg', { class: 'pic pic-gain', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const track = svg('rect', { x: 0, y: 8, width: W, height: 14, rx: 4, class: 'pic-track' });
    const bar = svg('rect', { x: 0, y: 8, height: 14, rx: 4, class: 'pic-bar' });
    const ticks = svg('g');
    for (const d of [-40, -30, -20, -12, -6, 0]) {
      const x = ((d - floor) / -floor) * W;
      ticks.append(svg('line', { x1: x, x2: x, y1: 22, y2: 25, class: 'pic-grid' }), svg('text', { x, y: H - 1, class: 'pic-tick', 'text-anchor': d === 0 ? 'end' : 'middle' }, `${d}`));
    }
    pic.append(track, bar, ticks);
    const text = (v) => (v <= 0 ? '−∞ dB' : `${dB(v).toFixed(1)} dB`);
    const { input, sync } = hiddenRange(spec.label, min, max, step, value, (v) => set(v, true), text);
    function draw() { const d = value <= 0 ? floor : clamp(dB(value), floor, 0); bar.setAttribute('width', ((d - floor) / -floor) * W); f.out.value = text(value); }
    function set(v, fire) { value = clamp(snapStep(v, step, min), min, max); input.value = value; sync(); draw(); if (fire) spec.onChange(value); }
    drag(pic, (x) => { if (x == null) return; const d = floor + x * -floor; set(x <= 0.002 ? 0 : Math.pow(10, d / 20), true); });
    f.root.append(el('div', { class: 'control-body' }, input, pic));
    draw();
    return Object.assign(f.root, { set: (v) => set(v, false), get value() { return value; }, setChanged: f.setChanged });
  },

  filter(spec) {
    const [min, max] = spec.range;
    const type = spec.filter || 'lowpass';
    const f = frame(spec, 'filter');
    let value = spec.value;
    const Q = spec.q || (type === 'bandpass' ? 1.2 : 0.707);
    const W = 320, H = 70;
    const pic = svg('svg', { class: 'pic pic-filter', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const grid = svg('g');
    for (const hz of [100, 1000, 10000]) if (hz > min && hz < max) {
      const x = toLog(hz, min, max) * W;
      grid.append(svg('line', { x1: x, x2: x, y1: 4, y2: H - 12, class: 'pic-grid' }), svg('text', { x, y: H - 1, class: 'pic-tick' }, fmtHz(hz)));
    }
    const area = svg('path', { class: 'pic-area' }), line = svg('path', { class: 'pic-line' }), dot = svg('circle', { r: 6, class: 'pic-handle' });
    pic.append(grid, area, line, dot);
    const { input, sync } = hiddenRange(spec.label, Math.log(min), Math.log(max), 0.005, Math.log(value), (lv) => set(Math.exp(lv), true), (lv) => fmtHz(Math.exp(lv)));
    function draw() {
      const pts = [];
      const N = 64;
      for (let i = 0; i <= N; i++) {
        const hz = fromLog(i / N, min, max);
        const db = clamp(biquadDb(type, hz, value, Q), -36, 6);
        pts.push(`${(i / N) * W},${(H - 14) * (1 - (db + 36) / 42) + 4}`);
      }
      line.setAttribute('d', `M${pts.join(' L')}`);
      area.setAttribute('d', `M${pts.join(' L')} L${W},${H - 10} L0,${H - 10} Z`);
      dot.setAttribute('cx', toLog(value, min, max) * W);
      dot.setAttribute('cy', (H - 14) * (1 - (clamp(biquadDb(type, value, value, Q), -36, 6) + 36) / 42) + 4);
      f.out.value = `${type === 'lowpass' ? 'below' : type === 'highpass' ? 'above' : 'around'} ${fmtHz(value)}`;
    }
    function set(v, fire) { value = clamp(v, min, max); input.value = Math.log(value); sync(); draw(); if (fire) spec.onChange(value); }
    drag(pic, (x) => { if (x != null) set(fromLog(x, min, max), true); });
    f.root.append(el('div', { class: 'control-body' }, input, pic));
    draw();
    return Object.assign(f.root, { set: (v) => set(v, false), get value() { return value; }, setChanged: f.setChanged });
  },

  character(spec) {
    const [min, max, step] = spec.range;
    const f = frame(spec, 'character');
    let value = spec.value;
    const [lo, hi] = spec.poles || ['less', 'more'];
    const W = 320, H = 30;
    const pic = svg('svg', { class: 'pic pic-char', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const track = svg('rect', { x: 0, y: 12, width: W, height: 6, rx: 3, class: 'pic-track' });
    const dot = svg('circle', { cy: 15, r: 8, class: 'pic-handle' });
    const mid = spec.center != null ? svg('line', { x1: ((spec.center - min) / (max - min)) * W, x2: ((spec.center - min) / (max - min)) * W, y1: 6, y2: 24, class: 'pic-grid' }) : null;
    pic.append(track, mid, dot);
    const poles = el('div', { class: 'control-poles' }, el('span', { class: 'pole pole-lo' }, lo), el('span', { class: 'pole pole-hi' }, hi));
    const text = (v) => `${fmtNum(v)}${spec.unit ? ' ' + spec.unit : ''} — ${describe(v)}`;
    const describe = (v) => { const fr = (v - min) / (max - min); return fr < 0.2 ? lo : fr > 0.8 ? hi : fr < 0.5 ? `toward ${lo}` : `toward ${hi}`; };
    const { input, sync } = hiddenRange(spec.label, min, max, step, value, (v) => set(v, true), text);
    function draw() {
      const fr = (value - min) / (max - min);
      dot.setAttribute('cx', 8 + fr * (W - 16));
      f.out.value = `${fmtNum(value)}${spec.unit ? ' ' + spec.unit : ''}`;
      poles.querySelector('.pole-lo').classList.toggle('is-near', fr < 0.25);
      poles.querySelector('.pole-hi').classList.toggle('is-near', fr > 0.75);
    }
    function set(v, fire) { value = clamp(snapStep(v, step, min), min, max); input.value = value; sync(); draw(); if (fire) spec.onChange(value); }
    drag(pic, (x) => { if (x != null) set(min + clamp((x * W - 8) / (W - 16), 0, 1) * (max - min), true); });
    f.root.append(el('div', { class: 'control-body' }, input, pic), poles);
    draw();
    return Object.assign(f.root, { set: (v) => set(v, false), get value() { return value; }, setChanged: f.setChanged });
  },

  count(spec) {
    const [min, max] = spec.range;
    const f = frame(spec, 'count');
    let value = Math.round(spec.value);
    const W = 320, H = 30;
    const pic = svg('svg', { class: 'pic pic-count', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const n = Math.min(max, 48);
    const ticks = [];
    for (let i = 0; i < n; i++) {
      const t = svg('rect', { x: 2 + (i / n) * (W - 4), y: 6, width: Math.max(2, (W - 4) / n - 3), height: 18, rx: 2, class: 'pic-tick-box' });
      ticks.push(t); pic.append(t);
    }
    const { input, sync } = hiddenRange(spec.label, min, max, 1, value, (v) => set(v, true), (v) => `${v}`);
    function draw() {
      const shown = max > n ? Math.round((value / max) * n) : value;
      ticks.forEach((t, i) => t.classList.toggle('is-on', i < shown));
      f.out.value = String(value);
    }
    function set(v, fire) { value = clamp(Math.round(v), min, max); input.value = value; sync(); draw(); if (fire) spec.onChange(value); }
    drag(pic, (x) => { if (x != null) set(max > n ? Math.round(x * max) : Math.ceil(x * n), true); });
    f.root.append(el('div', { class: 'control-body' }, input, pic));
    draw();
    return Object.assign(f.root, { set: (v) => set(v, false), get value() { return value; }, setChanged: f.setChanged });
  },

  partials(spec) {
    // spec.value: [{ratio, gain, decay, ...}], spec.presets: {name: list}, onChange(list)
    const f = frame(spec, 'partials');
    let list = spec.value.map((p) => ({ ...p }));
    const W = 320, H = 90;
    const pic = svg('svg', { class: 'pic pic-partials', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const bars = svg('g');
    const base = svg('line', { x1: 0, x2: W, y1: H - 14, y2: H - 14, class: 'pic-grid' });
    pic.append(bars, base);
    const chips = el('div', { class: 'control-chips' });
    for (const name of Object.keys(spec.presets || {})) {
      chips.append(el('button', { class: 'chip', type: 'button', onclick: () => { list = spec.presets[name].map((p) => ({ ...p })); draw(); spec.onChange(list); } }, name));
    }
    // ratios from 1/4 to 16, log-spaced, so sub-fundamental partials (a
    // bell's hum) sit left of the fundamental instead of on top of it
    const xOf = (ratio) => 10 + clamp((Math.log2(ratio) + 2) / 6, 0, 1) * (W - 20);
    const inputs = el('div', { class: 'vh-group' });
    function draw() {
      bars.replaceChildren();
      inputs.replaceChildren();
      const maxDecay = Math.max(...list.map((p) => p.decay), 0.01);
      const crowded = list.length > 6;
      list.forEach((p, i) => {
        const x = xOf(p.ratio), h = clamp(p.gain, 0, 1.2) * (H - 26);
        const g = svg('g', { class: 'partial' });
        g.append(
          svg('rect', { x: x - 5, y: H - 14 - h, width: 10, height: h, rx: 3, class: 'pic-bar', opacity: 0.35 + 0.65 * (p.decay / maxDecay) }),
          (!crowded || i % 2 === 0) ? svg('text', { x, y: H - 3, class: 'pic-tick' }, `×${fmtNum(p.ratio)}`) : null,
        );
        bars.append(g);
        const inp = el('input', { class: 'vh', type: 'range', min: 0, max: 1.2, step: 0.01, value: p.gain, 'aria-label': `partial ${i + 1} (×${fmtNum(p.ratio)}) level` });
        inp.addEventListener('input', () => { list[i].gain = Number(inp.value); draw(); spec.onChange(list); });
        inputs.append(inp);
      });
      f.out.value = `${list.length} partials`;
    }
    let which = -1;
    drag(pic, (x, y, phase) => {
      if (phase === 'down') {
        let best = -1, bd = 1e9;
        list.forEach((p, i) => { const d = Math.abs(xOf(p.ratio) - x * W); if (d < bd) { bd = d; best = i; } });
        which = bd < 18 ? best : -1;
      }
      if (x == null || which < 0) return;
      list[which].gain = clamp((1 - y) * 1.2 - 0.1, 0, 1.2);
      draw(); spec.onChange(list);
    });
    f.root.append(el('div', { class: 'control-body' }, inputs, pic), chips);
    draw();
    return Object.assign(f.root, { set: (v) => { list = v.map((p) => ({ ...p })); draw(); }, get value() { return list; }, setChanged: f.setChanged });
  },

  choice(spec) {
    const f = frame(spec, 'choice');
    let value = spec.value;
    const group = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': spec.label });
    const btns = spec.options.map((o) => el('button', { class: 'seg-btn', type: 'button', role: 'radio', 'aria-checked': String(o === value), dataset: { v: String(o) },
      onclick: () => { value = o; draw(); spec.onChange(value); } }, glyph(o), el('span', {}, String(o))));
    group.append(...btns);
    function draw() { btns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === String(value)))); f.out.value = String(value); }
    f.root.append(el('div', { class: 'control-body' }, group));
    draw();
    return Object.assign(f.root, { set: (v) => { value = v; draw(); }, get value() { return value; }, setChanged: f.setChanged });
  },

  distance(spec) {
    const f = frame(spec, 'distance');
    let value = spec.value;
    const W = 320, H = 40;
    const pic = svg('svg', { class: 'pic pic-dist', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
    const ear = svg('path', { d: 'M10,12 a8,8 0 0 1 12,8 c0,6 -6,6 -6,12', class: 'pic-line' });
    const track = svg('line', { x1: 30, x2: W - 10, y1: 22, y2: 22, class: 'pic-grid' });
    const rings = svg('g');
    for (let i = 1; i <= 4; i++) rings.append(svg('path', { d: `M${18 + i * 5},${22 - i * 5} a${i * 5},${i * 5} 0 0 1 0,${i * 10}`, class: 'pic-grid' }));
    const dot = svg('circle', { cy: 22, r: 8, class: 'pic-handle' });
    pic.append(ear, rings, track, dot);
    const text = (v) => `${Math.round(v * 100)}% room — ${v < 0.15 ? 'in your hand' : v < 0.35 ? 'near' : v < 0.6 ? 'across the room' : 'far away'}`;
    const { input, sync } = hiddenRange(spec.label, 0, 1, 0.01, value, (v) => set(v, true), text);
    function draw() { dot.setAttribute('cx', 30 + value * (W - 40)); dot.setAttribute('r', 9 - value * 4); f.out.value = text(value); }
    function set(v, fire) { value = clamp(v, 0, 1); input.value = value; sync(); draw(); if (fire) spec.onChange(value); }
    drag(pic, (x) => { if (x != null) set(clamp((x * W - 30) / (W - 40), 0, 1), true); });
    f.root.append(el('div', { class: 'control-body' }, input, pic));
    draw();
    return Object.assign(f.root, { set: (v) => set(v, false), get value() { return value; }, setChanged: f.setChanged });
  },

  toggle(spec) {
    const f = frame(spec, 'toggle');
    let value = !!spec.value;
    const box = el('input', { type: 'checkbox', checked: value, 'aria-label': spec.label, onchange: (e) => { value = e.target.checked; draw(); spec.onChange(value); } });
    function draw() { f.out.value = value ? 'on' : 'off'; box.checked = value; }
    f.root.append(el('div', { class: 'control-body' }, el('label', { class: 'switch' }, box, el('span', { class: 'switch-track' }))));
    draw();
    return Object.assign(f.root, { set: (v) => { value = !!v; draw(); }, get value() { return value; }, setChanged: f.setChanged });
  },

  number(spec) {
    const [min, max, step] = spec.range || [0, 1, 0.01];
    const f = frame(spec, 'number');
    let value = spec.value;
    const input = el('input', { class: 'num', type: 'range', min, max, step, value, 'aria-label': spec.label,
      oninput: (e) => { value = Number(e.target.value); draw(); spec.onChange(value); } });
    function draw() { f.out.value = fmtNum(value); }
    f.root.append(el('div', { class: 'control-body' }, input));
    draw();
    return Object.assign(f.root, { set: (v) => { value = v; input.value = v; draw(); }, get value() { return value; }, setChanged: f.setChanged });
  },
};

/** A die button with a lock, for seeds/takes. */
export function dice({ label = 'take', locked = false, onRoll, onLock, help }) {
  const h = helpButton(`${label} — ${KINDS.dice.title}`, [help, KINDS.dice.body].filter(Boolean).join(' '));
  const lock = el('input', { type: 'checkbox', checked: locked, 'aria-label': 'lock this take', onchange: (e) => onLock(e.target.checked) });
  const root = el('div', { class: 'control control-dice' },
    el('div', { class: 'control-head' }, el('span', { class: 'control-label' }, label), el('output', { class: 'control-value' }), h.btn),
    h.pop,
    el('div', { class: 'control-body dice-row' },
      el('button', { class: 'tool', type: 'button', onclick: () => onRoll() }, '⚄ Re-roll'),
      el('label', { class: 'control-opt' }, lock, el('span', {}, 'lock'))));
  root.setTake = (n) => { root.querySelector('.control-value').value = `take #${n}`; };
  return root;
}

function glyph(o) {
  const s = String(o);
  const paths = {
    sine: 'M2,10 C6,0 10,0 14,10 S22,20 26,10',
    triangle: 'M2,16 L8,4 L14,16 L20,4 L26,16',
    square: 'M2,16 L2,4 L10,4 L10,16 L18,16 L18,4 L26,4 L26,16',
    sawtooth: 'M2,16 L10,4 L10,16 L18,4 L18,16 L26,4',
    out: 'M4,10 L22,10 M16,4 L22,10 L16,16',
    in: 'M24,10 L6,10 M12,4 L6,10 L12,16',
  };
  if (!paths[s]) return null;
  return svg('svg', { class: 'glyph', viewBox: '0 0 28 20', 'aria-hidden': 'true' }, svg('path', { d: paths[s], fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
}

/** A `?` for a panel heading. */
export function panelHelp(title, body) {
  const h = helpButton(title, body);
  return el('span', { class: 'panel-help' }, h.btn, h.pop);
}
