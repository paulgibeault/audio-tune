// A synthetic sound pack in the fleet's shape, for the loader tests. Modelled
// on the launcher's tools/fixtures/soundpack-test/pack.js: plain script that
// reads the element library from the global and publishes via registerPack.
// It uses BOTH bed conventions on purpose — one bed inside CUES with a
// SUSTAINED map (si-syn / grav-well) and one exported as a top-level key
// (moon-lit / hecknsic) — so pack-shape.js is tested against each.
(function (global) {
  'use strict';
  const S = global.ArcadeAudioElements;
  if (!S || typeof S.registerPack !== 'function') return;

  const ROOM = { dur: 0.45, decay: 0.15, preDelay: 0.006, wet: 0.22, shelfHz: 2800, shelfDb: -6, seed: 4242 };
  const SENDS = { tick: 0.04, knock: 0.10, hum: 0.30 };
  const SUSTAINED = { hum: true };

  const CUES = {
    tick: function (ctx, o, t, params, r) { S.strike(ctx, o, t, { gain: 0.1 }); return 0.12; },
    knock: function (ctx, o, t, params, r) {
      S.strike(ctx, o, t, { gain: 0.09 });
      S.body(ctx, o, t, { f0: (params && params.f0) || 200, gain: 0.2 });
      return 0.3;
    },
    hum: function (ctx, o, t, params, r) {
      const collect = [];
      S.drone(ctx, o, t, (params && params.dur) || 10, { f: 110, collect });
      return S.teardown(collect);
    },
  };

  // The other convention: a bed as a top-level key, send known only to the app.
  function wind(ctx, o, t, params, r) {
    const collect = [];
    S.stream(ctx, o, t, (params && params.dur) || 10, { f: 800, collect });
    return S.teardown(collect);
  }

  S.registerPack({ name: 'fixture', ROOM, SENDS, SUSTAINED, CUES, wind });
})(typeof window !== 'undefined' ? window : globalThis);
