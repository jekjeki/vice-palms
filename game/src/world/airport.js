// ============================================================
// PALM AIRFIELD — a working general-aviation field laid over the
// north-west blocks of the city grid.
//
// Lit runway 09/27 with thresholds, touch-down zones and
// hold-short bars, a parallel taxiway with connectors, a
// three-stand apron with parked club aircraft and a fuel bowser
// on a real ramp loop, a terminal with lit glass frontage, a
// control tower with a rotating beacon and spinning radar, three
// hangars, a fuel depot, the Conch Cargo yard, windsocks that
// read the wind, a marshaller waving batons on stand 1, a
// perimeter fence with gates at every public-road crossing, and
// a full night-light set: edge lights, green and red thresholds,
// the approach "rabbit" strobe march, PAPI, taxiway teasers and
// apron floods.
//
// The field claims its blocks: generateCity's buildings are
// cleared and the block kind becomes 'airfield' (the HUD bakes
// them as concrete). Collision reads solidsNear() the same way
// the docks do; the chain-link fence is tagged 'fence' so cars
// clip straight through the mesh while people are held by it.
//
// Exports: buildAirport(game), AIR (the field rect), and
// airportCenter() for the sky ring's glow dome.
// ============================================================

import { PITCH, ROAD } from '../config.js';
import { TAU } from '../util.js';

// The field's claimed footprint: fence line to fence line, world
// coordinates. The public roads at grid lines 2..7 and 2..6 wrap it.
export const AIR = Object.freeze({
  x0: 3 * PITCH + ROAD / 2 + 40,   // 1345
  y0: 3 * PITCH + ROAD / 2 + 40,   // 1345
  x1: 7 * PITCH - ROAD / 2 - 40,   // 2855
  y1: 6 * PITCH - ROAD / 2 - 40,   // 2435
});

/** The field's centre — the sky ring aims its glow dome here. */
export function airportCenter() {
  return { x: (AIR.x0 + AIR.x1) / 2, y: (AIR.y0 + AIR.y1) / 2 };
}

const RUNWAY = { x: AIR.x0 + 55, y: 1620, w: (AIR.x1 - AIR.x0) - 110, h: 110 };
const TAXIWAY = { x: RUNWAY.x + 30, y: 1790, w: 920, h: 40 };
const APRON = { x: AIR.x0 + 145, y: 1860, w: 650, h: 340 };
const STANDS = [
  { x: APRON.x + 150, y: APRON.y + 130 },
  { x: APRON.x + 330, y: APRON.y + 130 },
  { x: APRON.x + 510, y: APRON.y + 130 },
];
const TERMINAL = { x: APRON.x + APRON.w + 90, y: 1880, w: 430, h: 320 };
const TOWER = { x: 2160, y: 1360, w: 85, h: 105 };
const HANGARS = [0, 1, 2].map((k) => ({
  x: AIR.x0 + 75 + k * 250, y: AIR.y0 + 10, w: 200, h: 140,
}));
const DEPOT = { x: 2280, y: AIR.y0 + 10, w: 320, h: 145 };
const CARGO = { x: APRON.x, y: APRON.y + APRON.h + 30, w: 410, h: (AIR.y1 - 35) - (APRON.y + APRON.h + 30) };
const RABBIT = [0, 1, 2, 3, 4].map((k) => ({ x: RUNWAY.x - 40 - k * 62, y: RUNWAY.y + RUNWAY.h / 2 }));

// Bowser ramp loop: corners the fuel truck drives between forever.
const BOWSER_LOOP = [
  { x: APRON.x - 60, y: APRON.y + 40 },
  { x: APRON.x - 60, y: APRON.y + APRON.h - 40 },
  { x: APRON.x + APRON.w + 40, y: APRON.y + APRON.h - 40 },
  { x: APRON.x + APRON.w + 40, y: APRON.y + 40 },
];

// Club aircraft: small singles with high wings and city liveries.
function makePlane(x, y, ang, livery) {
  return { x, y, ang, len: 64, wid: 58, livery, propSpin: 0 };
}

// ------------------------------------------------------------
export function buildAirport(game) {
  const A = {
    name: 'PALM AIRFIELD',
    AIR, runway: RUNWAY, taxiway: TAXIWAY, apron: APRON, stands: STANDS,
    terminal: TERMINAL, tower: TOWER, hangars: HANGARS, depot: DEPOT, cargo: CARGO,
    rabbit: RABBIT,
    planes: [
      makePlane(STANDS[0].x, STANDS[0].y, Math.PI, { body: '#e8e4da', trim: '#19c6d8', id: 'VP-11' }),
      makePlane(STANDS[1].x, STANDS[1].y, Math.PI, { body: '#f2cf47', trim: '#20242c', id: 'VP-07' }),
      makePlane(STANDS[2].x + 40, STANDS[2].y + 60, -Math.PI / 2, { body: '#c8b48c', trim: '#6f6350', id: 'VP-19' }),
    ],
    bowser: { x: BOWSER_LOOP[0].x, y: BOWSER_LOOP[0].y, t: 0, ang: 0 },
    marshaller: { x: STANDS[0].x + 46, y: STANDS[0].y + 70, arm: 0 },
    windsocks: [
      { x: AIR.x0 + 20, y: TAXIWAY.y - 70, dir: 0, flap: 0 },
      { x: TERMINAL.x + TERMINAL.w - 30, y: TERMINAL.y + TERMINAL.h + 50, dir: 0, flap: 0 },
    ],
    radar: 0,
    beacon: 0,
    strobe: 0,
    strobeT: 0,
    lights: [],
    cargoBoxes: [],
    fuelTanks: [
      { x: DEPOT.x + 30, y: DEPOT.y + 22, w: 110, h: 60 },
      { x: DEPOT.x + 170, y: DEPOT.y + 22, w: 110, h: 60 },
    ],
    papi: { x: RUNWAY.x + 10, y: RUNWAY.y + RUNWAY.h + 18 },
    fenceSegs: [],
    fenceGates: [],
    _time: 0,
  };

  // ---- claim the blocks: clear whatever the city generator built here.
  if (game && game.city && game.city.blocks) {
    for (const block of game.city.blocks) {
      const bx = (block.i + 0.5) * PITCH, by = (block.j + 0.5) * PITCH;
      if (bx < AIR.x0 - 40 || bx > AIR.x1 + 40 || by < AIR.y0 - 40 || by > AIR.y1 + 40) continue;
      block.kind = 'airfield';
      block.buildings.length = 0;
      block.signs.length = 0;
      block.palms.length = 0;
      block.stalls.length = 0;
      block.lamps.length = 0;
    }
  }

  // ---- perimeter fence: four runs with gate gaps at the public roads.
  // The gate gaps sit where the grid's streets meet the fence; cars clip
  // through the mesh anyway (fences are visual to vehicles), so the gaps
  // are as much a courtesy as a feature.
  const F = 12;   // fence thickness
  const gateHalf = 90;
  const crossingsX = [4 * PITCH, 5 * PITCH, 6 * PITCH];
  const crossingsY = [4 * PITCH, 5 * PITCH];
  // North and south runs (horizontal), split around x-crossings.
  for (const fy of [AIR.y0, AIR.y1 - F]) {
    let x = AIR.x0;
    const cuts = crossingsX.map((cx) => [cx - gateHalf, cx + gateHalf]).sort((a, b) => a[0] - b[0]);
    for (const [c0, c1] of cuts) {
      if (c0 > x && x < AIR.x1) A.fenceSegs.push({ x, y: fy, w: Math.min(c0, AIR.x1) - x, h: F, tag: 'fence' });
      A.fenceGates.push({ x: Math.max(x, c0), y: fy, w: Math.max(0, Math.min(c1, AIR.x1) - Math.max(x, c0)), h: F });
      x = Math.max(x, c1);
      if (x >= AIR.x1) break;
    }
    if (x < AIR.x1) A.fenceSegs.push({ x, y: fy, w: AIR.x1 - x, h: F, tag: 'fence' });
  }
  // West and east runs (vertical), split around y-crossings.
  for (const fx of [AIR.x0, AIR.x1 - F]) {
    let y = AIR.y0;
    const cuts = crossingsY.map((cy) => [cy - gateHalf, cy + gateHalf]).sort((a, b) => a[0] - b[0]);
    for (const [c0, c1] of cuts) {
      if (c0 > y && y < AIR.y1) A.fenceSegs.push({ x: fx, y, w: F, h: Math.min(c0, AIR.y1) - y, tag: 'fence' });
      A.fenceGates.push({ x: fx, y: Math.max(y, c0), w: F, h: Math.max(0, Math.min(c1, AIR.y1) - Math.max(y, c0)) });
      y = Math.max(y, c1);
      if (y >= AIR.y1) break;
    }
    if (y < AIR.y1) A.fenceSegs.push({ x: fx, y, w: F, h: AIR.y1 - y, tag: 'fence' });
  }

  // ---- cargo yard: fence + stacked Conch Cargo boxes.
  A.cargoBoxes = [];
  {
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const n = 3 + ((r * 7) % 3);
      for (let k = 0; k < n; k++) {
        A.cargoBoxes.push({
          x: CARGO.x + 24 + k * 78,
          y: CARGO.y + 18 + r * 54,
          w: 58, h: 34,
          c: ['#3b6a8a', '#8a7a3b', '#9a6a3b'][(r + k) % 3],
        });
      }
    }
  }

  // ---- runway lights: edge whites every 60 units, thresholds, PAPI.
  A.lights = [];
  for (let x = RUNWAY.x + 20; x < RUNWAY.x + RUNWAY.w - 10; x += 60) {
    A.lights.push({ x, y: RUNWAY.y - 8, kind: 'edge' });
    A.lights.push({ x, y: RUNWAY.y + RUNWAY.h + 8, kind: 'edge' });
  }
  // Touch-down zone bars.
  for (let k = 0; k < 6; k++) {
    A.lights.push({ x: RUNWAY.x + 60 + k * 40, y: RUNWAY.y + 22, kind: 'tdz' });
    A.lights.push({ x: RUNWAY.x + 60 + k * 40, y: RUNWAY.y + RUNWAY.h - 22, kind: 'tdz' });
  }
  // Thresholds: green at the 09 end (landing west), red at the far end.
  for (let y = RUNWAY.y + 14; y < RUNWAY.y + RUNWAY.h - 8; y += 24) {
    A.lights.push({ x: RUNWAY.x + 6, y, kind: 'thresh-green' });
    A.lights.push({ x: RUNWAY.x + RUNWAY.w - 6, y, kind: 'thresh-red' });
  }
  // Taxiway teasers (blue) along both edges.
  for (let x = TAXIWAY.x + 30; x < TAXIWAY.x + TAXIWAY.w - 20; x += 70) {
    A.lights.push({ x, y: TAXIWAY.y - 6, kind: 'taxi' });
    A.lights.push({ x, y: TAXIWAY.y + TAXIWAY.h + 6, kind: 'taxi' });
  }
  // Apron floods: two masts that pool light over the stands.
  A.apronFloods = [
    { x: APRON.x - 40, y: APRON.y - 20 },
    { x: APRON.x + APRON.w + 40, y: APRON.y + APRON.h + 20 },
  ];

  // ---------------------------------------------------------------- solids
  const solids = [];
  const add = (x, y, w, h, tag) => { if (w > 2 && h > 2) solids.push({ x, y, w, h, tag }); };
  for (const f of A.fenceSegs) add(f.x, f.y, f.w, f.h, 'fence');
  add(TERMINAL.x, TERMINAL.y, TERMINAL.w, TERMINAL.h, 'terminal');
  add(TOWER.x, TOWER.y, TOWER.w, TOWER.h, 'tower');
  for (const h of HANGARS) add(h.x, h.y, h.w, h.h, 'hangar');
  add(DEPOT.x, DEPOT.y, DEPOT.w, DEPOT.h, 'depot');
  add(CARGO.x, CARGO.y, 10, CARGO.h, 'fence');
  add(CARGO.x + CARGO.w - 10, CARGO.y, 10, CARGO.h, 'fence');
  add(CARGO.x, CARGO.y + CARGO.h - 10, CARGO.w, 10, 'fence');
  for (const b of A.cargoBoxes) add(b.x, b.y, b.w, b.h, 'cargo');
  for (const p of A.planes) add(p.x - 30, p.y - 26, 60, 52, 'plane');

  A.solidsNear = function (x, y, out) {
    out.length = 0;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (x < s.x - 60 || x > s.x + s.w + 60 || y < s.y - 60 || y > s.y + s.h + 60) continue;
      out.push(s);
    }
    return out;
  };

  A.inside = function (x, y) {
    return x > AIR.x0 - 40 && x < AIR.x1 + 40 && y > AIR.y0 - 40 && y < AIR.y1 + 40;
  };

  // ---------------------------------------------------------------- update
  A.update = function (dt, time) {
    A._time = time;
    A.radar += dt * 1.25;
    A.beacon = (time * 0.9) % 1;
    // Windsocks read the wind: a slow oscillation with a flutter on top.
    for (const w of A.windsocks) {
      w.dir = Math.sin(time * 0.31) * 0.7 + Math.PI * 0.05;
      w.flap += dt * 6.5;
    }
    // The rabbit marches toward the threshold, one strobe at a time.
    A.strobeT += dt;
    if (A.strobeT > 0.5) { A.strobeT = 0; A.strobe = (A.strobe + 1) % (RABBIT.length + 2); }
    // The marshaller waves batons while the stands are occupied.
    A.marshaller.arm = Math.sin(time * 3.4);
    // The bowser trundles its ramp loop.
    const B = A.bowser;
    B.t += dt * 26;
    const seg = Math.floor(B.t / 100) % BOWSER_LOOP.length;
    const f = (B.t % 100) / 100;
    const a = BOWSER_LOOP[seg], b2 = BOWSER_LOOP[(seg + 1) % BOWSER_LOOP.length];
    B.x = a.x + (b2.x - a.x) * f;
    B.y = a.y + (b2.y - a.y) * f;
    B.ang = Math.atan2(b2.y - a.y, b2.x - a.x);
    for (const p of A.planes) if (p.propSpin) p.propSpin += dt * 9;
  };

  // ---------------------------------------------------------------- minimap
  A.stampAirportMap = function (g, kx, ky, north) {
    const wx = (v) => v * kx;
    const wy = (v) => (v + north) * ky;
    // Field pad: concrete grey inside the fence line.
    g.fillStyle = '#34373f';
    g.fillRect(wx(AIR.x0), wy(AIR.y0), (AIR.x1 - AIR.x0) * kx, (AIR.y1 - AIR.y0) * ky);
    // Runway reads as a bright bar.
    g.fillStyle = '#8d93a8';
    g.fillRect(wx(RUNWAY.x), wy(RUNWAY.y), RUNWAY.w * kx, Math.max(1, RUNWAY.h * ky));
    // Terminal and tower pins.
    g.fillStyle = '#ffd98a';
    g.fillRect(wx(TERMINAL.x), wy(TERMINAL.y), TERMINAL.w * kx, TERMINAL.h * ky);
    g.fillStyle = '#7bffd4';
    g.beginPath();
    g.arc(wx(TOWER.x + TOWER.w / 2), wy(TOWER.y + TOWER.h / 2), 2.6, 0, TAU);
    g.fill();
  };

  return A;
}

/** Standalone stamp for the HUD: delegates to the airport object's own baker. */
export function stampAirportMap(g, airport, kx, ky, north) {
  airport?.stampAirportMap?.(g, kx, ky, north);
}
