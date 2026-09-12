// The pure maths under the controls: pitch ↔ note, log axes, dB, biquad
// curves. The DOM half is exercised in the browser smoke.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// controls.js touches `document` at import time for the help-popover
// dismissal; give it a minimal stand-in.
globalThis.document = { addEventListener() {}, createElement() { return {}; }, createElementNS() { return {}; } };
const C = await import('../js/controls.js');

test('noteOf / hzOfNote round-trip and name notes', () => {
  assert.deepEqual(C.noteOf(440), { name: 'A4', cents: 0 });
  assert.deepEqual(C.noteOf(261.63).name, 'C4');
  assert.equal(C.noteOf(466.16).name, 'A#4');
  assert.equal(C.noteOf(55).name, 'A1');
  assert.ok(Math.abs(C.hzOfNote(57) - 440) < 1e-9);
  assert.ok(Math.abs(C.hzOfNote(48) - 261.6256) < 0.01, 'C4');
  const c = C.noteOf(452);
  assert.equal(c.name, 'A4');
  assert.ok(c.cents > 40 && c.cents < 50, `${c.cents} cents sharp`);
});

test('log axis maps ends to 0 and 1 and inverts', () => {
  assert.equal(C.toLog(20, 20, 20000), 0);
  assert.equal(C.toLog(20000, 20, 20000), 1);
  assert.ok(Math.abs(C.fromLog(C.toLog(632, 20, 20000), 20, 20000) - 632) < 1e-6);
  assert.ok(Math.abs(C.toLog(632.456, 20, 20000) - 0.5) < 1e-3, 'geometric midpoint is halfway');
});

test('dB and formatting', () => {
  assert.equal(C.dB(1), 0);
  assert.ok(Math.abs(C.dB(0.5) + 6.02) < 0.01);
  assert.equal(C.dB(0), -Infinity);
  assert.equal(C.fmtHz(440), '440 Hz');
  assert.equal(C.fmtHz(2400), '2.40 kHz');
  assert.equal(C.fmtHz(12000), '12.0 kHz');
  assert.equal(C.fmtMs(0.006), '6 ms');
  assert.equal(C.fmtMs(1.9), '1.90 s');
  assert.equal(C.snapStep(0.123, 0.05, 0), 0.1);
  assert.equal(C.snapStep(7, 1, 2), 7);
});

test('biquad curves: lowpass falls above cutoff, highpass below, bandpass peaks at centre', () => {
  assert.ok(Math.abs(C.biquadDb('lowpass', 100, 1000)) < 0.1);
  assert.ok(C.biquadDb('lowpass', 4000, 1000) < -20);
  assert.ok(C.biquadDb('highpass', 100, 1000) < -30);
  assert.ok(Math.abs(C.biquadDb('highpass', 10000, 1000)) < 0.2);
  const peak = C.biquadDb('bandpass', 1000, 1000, 2);
  assert.ok(peak > C.biquadDb('bandpass', 400, 1000, 2) && peak > C.biquadDb('bandpass', 2500, 1000, 2));
});
