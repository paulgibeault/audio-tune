// Per-cue knowledge the board cannot read from the packs themselves: which
// parameters a cue reads per play (cue functions read `p.count` etc.
// dynamically), their ranges, and — for the Explore view — which elements the
// cue is built from. This is the soundboard's only per-game knowledge, and it
// is data. Read from every fleet pack on 2026-09-12 (plan §2.1).
//
// A param is [min, max, step, default]. Enumerations are { options: [...] }.
// Booleans are { bool: true }.

export const CUE_PARAMS = {
  'moon-lit': {
    'lantern-launch': { elements: ['rustle'], note: 'A lantern climbing away.' },
    'carousel': { elements: ['creak', 'strike', 'body'], note: 'The launcher wheel turning a quarter revolution.' },
    'match': { params: { count: [1, 8, 1, 3] }, elements: ['flare', 'thump'], note: 'Lanterns catching fire — one flare per lamp in the cluster.' },
    'moonburst': { elements: ['blast', 'flare'], note: 'The banked charge going up. A fireball, not a detonation.' },
    'drop': { elements: ['flare'], note: 'A lantern cut loose.' },
    'trellis': { elements: ['creak', 'strike', 'body'], note: 'Rope and wood taking the load as the trellis descends.' },
    'dead-line-warning': { elements: ['creak', 'body', 'thump'], note: 'The same rope, tighter and higher, with two low tones beating underneath.' },
    'menu-click': { elements: ['strike', 'body'], note: 'Hyoshigi — the hardwood clapper used to mark time in a theatre.' },
    'win': { elements: ['strike', 'body'], note: 'The temple bell.' },
    'game-over': { elements: ['strike', 'pluck'], note: 'Koto — three plucked strings descending.' },
    'ambient': { elements: ['rustle'], note: 'The pond — and it is silent. No sustained layer at all.' },
    'insects': { params: { heat: [0, 1, 0.01, 0] }, elements: ['chirp', 'strike'], note: 'The insects, as a layer of their own.' },
  },
  'cozy-solitaire': {
    'place': { elements: ['strike', 'flex', 'thump'], note: 'The workhorse — deliberately the least characterful thing in the game.' },
    'foundation': { params: { rank: [1, 13, 1, 7] }, elements: ['strike', 'flex', 'thump'], note: 'A card lands HOME, with the rank ringing on top.' },
    'flip': { elements: ['strike', 'flex'], note: 'Same material as a landing, opposite gesture.' },
    'lift': { elements: ['flex'], note: 'One corner peeling off the felt.' },
    'run-place': { params: { count: [2, 8, 1, 4] }, elements: ['flex', 'strike', 'thump'], note: 'A run of cards lands as one.' },
    'invalid': { elements: ['flex', 'thump'], note: 'The one gesture in the game with NO ring in it.' },
    'pass-limit': { elements: ['flex', 'thump'], note: 'A refusal says "not there"; this says "not any more".' },
    'recycle': { elements: ['flex', 'thump'], note: 'A packet gathered, squared and set down.' },
    'deal': { elements: ['flex', 'strike', 'thump'], note: 'The one flourish the pack allows itself: a real riffle.' },
    'auto-place': { params: { rank: [1, 13, 1, 7] }, elements: ['strike', 'flex'], note: 'foundation with the discipline turned all the way up.' },
    'sequence': { elements: ['flex', 'strike', 'thump'], note: 'Thirteen cards leave the column as one; the rank ladder goes off underneath.' },
    'undo': { elements: ['pluck'], note: 'Rewinding is not a card touching felt, it is the game itself moving.' },
    'win': { elements: ['flex', 'pluck', 'thump'], note: 'A music box, and then the deck put away.' },
  },
  'sowduku': {
    'thud': { elements: ['squelch', 'thump', 'rustle'], note: 'A piggy set down in wet mud.' },
    'hoof': { elements: ['squelch'], note: "A hoofprint scratched into the mud: the thud's little sibling." },
    'pen': { elements: ['grunt'], note: '"Uh-huh!" — two quick calls, the second stepped clearly UP.' },
    'oink': { elements: ['pluck', 'grunt', 'squelch', 'thump', 'rustle', 'breath'], note: 'Piggy zoomies. A celebration in three acts, still not one note of music.' },
    'slip': { elements: ['squelch', 'grunt'], note: 'The mud lets go as the piglet backs out, and one rough wheek.' },
    'fail': { elements: ['grunt', 'breath', 'thump', 'rustle'], note: 'The sad trombone, as performed by the piglet.' },
    'star': { elements: ['breath', 'grunt'], note: 'This field is a keeper.' },
  },
  'hecknsic': {
    'rotate': { params: { kind: { options: ['cluster', 'y', 'ring'] } }, elements: ['ratchet', 'strike', 'body'], note: 'Glass tiles, but the AXLE is machined metal.' },
    'select': { params: { tiles: [1, 6, 1, 3] }, elements: ['body'], note: 'Picking a cluster up: three micro-tinks a few hundredths apart.' },
    'match': { params: { count: [3, 10, 1, 3] }, elements: ['shatter', 'body'], note: 'A match clearing — the tiles SHATTER.' },
    'combo': { params: { depth: [1, 12, 1, 2] }, elements: ['shatter', 'body'], note: 'Same fracture, but the LADDER is the message.' },
    'starflower': { elements: ['shatter', 'strike', 'body'], note: 'Six tiles collapsing INWARD into chrome. Formation, not destruction.' },
    'blackpearl': { elements: ['shatter', 'thump', 'body'], note: 'The same convergence, but everything is DOWN.' },
    'grandpoobah': { elements: ['shatter', 'drone', 'thump', 'body'], note: 'The rarest formation: both materials at once.' },
    'bomb-arrive': { elements: ['thump', 'body', 'flare'], note: 'A bomb LANDS: the impact, the fuse catching, and then the dread.' },
    'bomb-tick': { params: { urgency: [0, 1, 0.01, 0.3] }, elements: ['strike', 'body', 'thump'], note: 'The fuse clock — one tick per move while a bomb is on the board.' },
    'bomb-explode': { elements: ['blast', 'shatter'], note: 'A detonation, not a fireball — full crack.' },
    'over-achiever': { elements: ['strike', 'body', 'shatter', 'drone', 'thump'], note: "The game's actual triumph condition, and the biggest cue in the pack." },
    'game-win': { elements: ['strike', 'body'], note: 'Puzzle solved — a small warm resolution.' },
    'game-over': { elements: ['strike', 'body', 'thump'], note: 'Three falling obsidian tolls and a last low breath.' },
    'ui-click': { elements: ['strike', 'body'], note: 'The quietest cue in the pack, nearly dry.' },
    'pulse': { params: { intensity: [0, 1, 0.01, 0.4] }, elements: ['drone', 'thump'], note: "The room's heartbeat. NOT metrical." },
    'tension': { params: { urgency: [0, 1, 0.01, 0.5] }, elements: ['drone', 'strike'], note: 'The bomb layer. Schedules nothing at 0.' },
  },
  'si-syn': {
    'bench': { params: { busy: [0, 1, 0.01, 0.3] }, elements: ['drone', 'stream'], note: 'THE BOARD ENERGISED — up for exactly as long as the program runs.' },
    'ui-click': { elements: ['strike', 'body'], note: 'A RELAY CONTACT CLOSING.' },
    'test-pass': { elements: ['ratchet', 'body'], note: 'THE RAIL LOCKS. Strictly no static.' },
    'test-fail': { elements: ['flare', 'creak', 'thump'], note: 'THE RAIL BROWNS OUT. Static breaks in first, the supply sags underneath.' },
    'level-complete': { elements: ['ratchet', 'strike', 'body', 'drone'], note: 'The whole bank sequencing through, and then a machine that works.' },
  },
  'p2p-chat': {
    'peer-joined': { elements: ['strike', 'body'], note: 'A ping out, and the same note answering from a long way off.' },
    'peer-left': { elements: ['strike', 'body'], note: 'The same ping, then two more, each lower and fainter.' },
    'message-received': { elements: ['droplet'], note: 'A contact right next to you.' },
    'message-sent': { elements: ['droplet'], note: 'The same contact, heading away.' },
    'transfer-complete': { elements: ['strike', 'body'], note: 'A run of returns resolving.' },
    'error': { elements: ['creak', 'thump'], note: 'THE LOCK BREAKS — the voice that has been answering is not there.' },
  },
  'shuiguo': {
    'drop': { params: { level: [1, 11, 1, 3] }, elements: ['strike', 'thump'], note: 'Fruit released.' },
    'merge': { params: { level: [1, 11, 1, 3] }, elements: ['squelch', 'thump', 'body', 'droplet'], note: 'THE sound of the game: two fruits fusing into a bigger one.' },
    'chain': { params: { chain: [2, 6, 1, 2] }, elements: ['droplet'], note: 'Played ON TOP OF the merge cue, never instead of it.' },
    'watermelon': { elements: ['squelch', 'thump', 'body', 'droplet'], note: 'The top of the chain is born.' },
    'annihilate': { elements: ['squelch', 'thump', 'shatter', 'body', 'droplet'], note: 'Two watermelons cancel.' },
    'warning': { elements: ['creak', 'thump'], note: 'ONE creak, on the way in, not a siren.' },
    'discover': { elements: ['body', 'droplet'], note: 'A fruit made for the first time.' },
    'game-over': { elements: ['creak', 'body', 'thump'], note: 'Overfilled — the stall settles. No trombone; the piglet lives next door.' },
    'menu-click': { elements: ['strike', 'thump'], note: 'Every UI tap.' },
    'water': { elements: ['squelch', 'droplet', 'thump'], note: 'Watering a plot.' },
    'plant': { elements: ['strike', 'thump'], note: 'Seed into soil.' },
    'harvest': { params: { level: [1, 11, 1, 3] }, elements: ['squelch', 'thump', 'body'], note: 'Picking fruit.' },
    'ripe-chime': { elements: ['body', 'droplet'], note: 'Entering the farm with something ripe.' },
    'coin': { elements: ['strike', 'body'], note: 'The smallest sound in the pack by a distance.' },
    'till': { elements: ['strike', 'thump', 'creak'], note: 'The total lands.' },
    'buy': { elements: ['strike', 'thump'], note: 'Any shop purchase.' },
    'terrace-fanfare': { elements: ['thump', 'body', 'droplet'], note: 'A terrace bought, or the stream turned on.' },
    'pack-up': { elements: ['strike', 'thump', 'body'], note: 'A run ended on purpose. Deliberately NOT the game-over creak.' },
  },
  'cardstock': {
    'deal': { params: { seats: [2, 8, 1, 3] }, elements: ['flex', 'strike', 'thump'], note: 'The one flourish in the game, and the only cue with a shape rather than a moment.' },
    'play': { elements: ['strike', 'flex', 'thump'], note: 'The workhorse — deliberately the least characterful thing in the game.' },
    'play-far': { elements: ['strike', 'flex', 'thump'], note: 'Identical gesture, across the table. This is space, not timbre.' },
    'draw': { elements: ['flex'], note: 'A slide, not a landing.' },
    'shuffle': { elements: ['flex', 'thump'], note: 'The discard recycled.' },
    'trick': { params: { bad: { bool: true } }, elements: ['flex', 'pluck', 'strike', 'thump'], note: 'ONE bright note over the top that says the trick is closed.' },
    'invalid': { elements: ['flex', 'thump'], note: 'The one gesture in the game with no ring in it at all.' },
    'win': { elements: ['pluck', 'strike', 'flex', 'thump'], note: "The pack's one pitched moment." },
  },
  'grav-well': {
    'shift': { elements: ['strike'], note: 'One column of travel.' },
    'turn': { params: { kicked: { bool: true } }, elements: ['strike', 'body', 'creak'], note: 'The piece pivoting on a corner.' },
    'touch': { elements: ['strike', 'thump', 'body'], note: 'The moment lock delay starts, not the lock itself.' },
    'lock': { params: { hard: { bool: true } }, elements: ['strike', 'thump', 'body', 'rustle'], note: 'Salvage seating on the pile.' },
    'tspin': { params: { mini: { bool: true } }, elements: ['creak'], note: 'A piece twisted into a slot it does not fit through.' },
    'clear': { params: { count: [1, 4, 1, 1], combo: [1, 12, 1, 1] }, elements: ['shatter', 'thump', 'ratchet'], note: 'A row letting go.' },
    'quad': { params: { streak: [1, 5, 1, 1] }, elements: ['blast'], note: 'Fired ON TOP of clear — this is the well answering.' },
    'singularity': { elements: ['rustle', 'shatter', 'thump', 'body'], note: 'The whole cue is clear run backwards.' },
    'hold': { elements: ['ratchet'], note: 'One detent of a pawl dropping into a tooth.' },
    'levelup': { elements: ['body'], note: 'The well opening out under you.' },
    'goal': { elements: ['strike', 'thump', 'body'], note: 'A run ENDING.' },
    'topout': { elements: ['thump'], note: 'One deep thump. The run did not explode, it filled up.' },
    'well-hum': { params: { depth: { options: [0, 0.5, 1] } }, elements: ['drone'], note: 'The air column in the shaft.' },
  },
  'pi-game': {
    'correct': { params: { digit: [0, 120, 1, 0] }, note: 'The metronome tick; pitch rises with the digit index.' },
    'combo': { params: { digit: [0, 120, 1, 20], level: [4, 10, 1, 5] }, note: 'The accent layered on correct past a combo of three.' },
    'wrong': { note: 'The alarm strike that ends the run.' },
    'practice-correct': { note: 'A quieter, shorter tick for practice mode.' },
    'practice-wrong': { note: 'A quieter, shorter alarm for practice mode.' },
  },
};

export function paramsFor(packId, cueName) {
  const p = CUE_PARAMS[packId] && CUE_PARAMS[packId][cueName];
  return p && p.params ? p.params : null;
}

export function noteFor(packId, cueName) {
  const p = CUE_PARAMS[packId] && CUE_PARAMS[packId][cueName];
  return p && p.note ? p.note : '';
}

/** Default parameter values for a cue, or null if it takes none. */
export function defaultParams(packId, cueName) {
  const spec = paramsFor(packId, cueName);
  if (!spec) return null;
  const out = {};
  for (const [k, def] of Object.entries(spec)) {
    if (Array.isArray(def)) out[k] = def[3];
    else if (def.options) out[k] = def.options[0];
    else if (def.bool) out[k] = false;
  }
  return out;
}
