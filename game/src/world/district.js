// ============================================================
// NORTH DOCKS — the second district of Vice Palms.
//
// North of the street grid lies the working harbor: five piers
// on pilings reaching into the bay, three container yards with
// stacked boxes and rolling gantry cranes, warehouses with
// ribbed roll-up doors, a mooring-bollard promenade, a fish
// market on Pier B, oil drums, security fences with one lifting
// gate, sodium lamps and floodlight masts, rain puddles that
// shine when the weather soaks the apron, a rail spur with a
// loaded flatcar, the anchored MV Coral Crown rolling on the
// swell, a rotating lighthouse on the breakwater and the Bay
// Marina island across the water.
//
// The district exports the layout API every importer reads:
//   buildDocks(seed)         — the whole district object
//   DOCKS_NORTH_Y            — world north bound (bay far shore)
//   DOCKS_WATER_Y            — the apron's waterline
// and the object carries: bounds, roads, piers, yards,
// warehouses, island, gangTurf, props, hideouts, heistZones,
// ferryRoute, solidsNear(x, y, out), update(dt, time), plus the
// animation state the painter reads (cranes, ship, gulls, gate,
// lighthouse, puddles, wetness).
// ============================================================

import { PITCH, SPAN } from '../config.js';
import { mulberry, remix } from '../rng.js';
import { clamp, TAU } from '../util.js';

/** The far shore of the bay: nothing exists north of this line. */
export const DOCKS_NORTH_Y = -5200;
/** The apron's waterline: land south of it, bay water north of it. */
export const DOCKS_WATER_Y = -1900;

// Apron banding, south to north. The bands are the district's
// story: industry backs onto the city, the yards hold the
// containers, the shore road runs the length of the harbor, and
// the promenade with its bollards faces the water.
const INDUSTRY_ROAD_Y = -420;    // centerline of the south service road
const SHORE_ROAD_Y = -1435;      // centerline of the coast road
const YARD_SOUTH = -620;         // yards' south edge
const YARD_NORTH = -1380;        // yards' north edge
const PROMENADE_Y = -1480;       // promenade north edge = pier feet
const PIER_TIP = -2600;          // how far the piers reach into the bay
const SHORE_WALL = DOCKS_WATER_Y - 24; // seawall band north face

// Vertical roads carry the grid's rhythm north into the harbor.
const CROSS_ROADS = [2, 8, 14, 20, 26, 32, 38].map((i) => i * PITCH);

// Five piers A–E. Pier B carries the fish market; Pier A the
// heist drop-off; Pier C the skiff the Coral Crown job steals.
const PIER_X = [4 * PITCH, 10 * PITCH + 65, 16 * PITCH, 22 * PITCH, 28 * PITCH];
const PIER_NAMES = ['PIER A', 'PIER B', 'PIER C', 'PIER D', 'PIER E'];
const PIER_HALF = 95;
const GATE_X = 20 * PITCH;       // the lifting security gate's road
const GATE_Y = -1000;            // the barrier line across it
const SLIP_X = GATE_X + 300;     // the ferry slip sits just east of the gate road
const SLIP_Y = DOCKS_WATER_Y + 20;

// Container palette: the yards read as a working import terminal.
const BOX_COLORS = ['#8a3b3b', '#3b6a8a', '#8a7a3b', '#4a8a5c', '#7a4a8a', '#9a6a3b', '#4a6a7a', '#8a5555'];

function rr(gen, lo, hi) { return lo + gen() * (hi - lo); }

// ------------------------------------------------------------
// buildDocks — everything the district is, derived from the seed.
// ------------------------------------------------------------
export function buildDocks(seed) {
  const gen = mulberry(remix(seed, 0x5d0c));
  const D = {
    seed,
    name: 'NORTH DOCKS',
    bounds: { x0: 0, x1: SPAN, y0: DOCKS_WATER_Y, y1: 0 },
    roads: [],
    piers: [],
    yards: [],
    warehouses: [],
    island: null,
    gangTurf: [],
    props: [],
    hideouts: [],
    heistZones: {},
    ferryRoute: null,
    // Painter-facing scenery, all regenerated per seed.
    containers: [],
    cranes: [],
    lamps: [],
    floods: [],
    drums: [],
    stalls: [],
    bollards: [],
    fences: [],
    gulls: [],
    railSpur: null,
    flatcar: null,
    ship: null,
    lighthouse: null,
    breakwater: [],
    gate: null,
    office: null,
    puddles: [],
    // Live animation state, ticked by update().
    _wetness: 0,
    _gateProbe: null,
  };

  // ---------------------------------------------------------------- roads
  D.roads.push({ kind: 'h', x: 0, y: SHORE_ROAD_Y - 45, w: SPAN, h: 90 });
  D.roads.push({ kind: 'h', x: 0, y: INDUSTRY_ROAD_Y - 45, w: SPAN, h: 90 });
  for (const cx of CROSS_ROADS) {
    D.roads.push({ kind: 'v', x: cx, y: DOCKS_WATER_Y, w: 0, h: -DOCKS_WATER_Y });
  }

  // ---------------------------------------------------------------- piers
  for (let i = 0; i < PIER_X.length; i++) {
    const cx = PIER_X[i];
    D.piers.push({ name: PIER_NAMES[i], x: cx - PIER_HALF, y: PIER_TIP, w: PIER_HALF * 2, h: PROMENADE_Y - PIER_TIP });
    // Bollard pairs march down each pier; mooring ropes implied.
    for (let by = PIER_TIP + 90; by < PROMENADE_Y - 60; by += 130) {
      D.bollards.push({ x: cx - PIER_HALF + 16, y: by });
      D.bollards.push({ x: cx + PIER_HALF - 16, y: by });
    }
    // Pier lamps on alternate bollard rows.
    if (i % 2 === 0) D.lamps.push({ x: cx, y: PIER_TIP + 160, kind: 'pier' }, { x: cx, y: PROMENADE_Y - 220, kind: 'pier' });
  }

  // ---------------------------------------------------------------- yards
  const yardSpans = [
    { x0: CROSS_ROADS[0] + 90, x1: CROSS_ROADS[1] - 90 },   // west yard
    { x0: CROSS_ROADS[2] + 90, x1: CROSS_ROADS[3] - 90 },   // central yard
    { x0: CROSS_ROADS[3] + 90, x1: CROSS_ROADS[4] - 90 },   // east yard
  ];
  const yardNames = ['WEST YARD', 'CENTRAL YARD', 'EAST YARD'];
  for (let i = 0; i < yardSpans.length; i++) {
    const s = yardSpans[i];
    D.yards.push({ name: yardNames[i], x0: s.x0, y0: YARD_NORTH, x1: s.x1, y1: YARD_SOUTH });
    // Perimeter fence: four thin lines, the gate gap cut later.
    D.fences.push({ x: s.x0, y: YARD_NORTH, w: s.x1 - s.x0, h: 10 });
    D.fences.push({ x: s.x0, y: YARD_SOUTH - 10, w: s.x1 - s.x0, h: 10 });
    D.fences.push({ x: s.x0, y: YARD_NORTH, w: 10, h: YARD_SOUTH - YARD_NORTH });
    D.fences.push({ x: s.x1 - 10, y: YARD_NORTH, w: 10, h: YARD_SOUTH - YARD_NORTH });
    // A yard gate on the road-facing side so trucks (and Rico) can roll in.
    const gateCx = (s.x0 + s.x1) / 2;
    D.fences.push({ x: gateCx - 140, y: YARD_SOUTH - 10, w: 280, h: 10, gap: true });
    // Container rows: long stacks of colored boxes with alleys between.
    const rows = 3 + (gen() * 3 | 0);
    for (let r = 0; r < rows; r++) {
      const ry = YARD_NORTH + 60 + r * ((YARD_SOUTH - YARD_NORTH - 120) / rows);
      const stackW = 58, stackD = 26;
      const n = Math.floor((s.x1 - s.x0 - 200) / (stackW + 34));
      for (let k = 0; k < n; k++) {
        if (gen() < 0.12) continue;   // Alleys: gaps where the forklifts work.
        const bx = s.x0 + 90 + k * (stackW + 34);
        const tall = gen() < 0.35 ? 3 : gen() < 0.7 ? 2 : 1;
        const stack = [];
        for (let lvl = 0; lvl < tall; lvl++) {
          stack.push({
            x: bx, y: ry, w: stackW, h: stackD,
            color: BOX_COLORS[(gen() * BOX_COLORS.length) | 0],
          });
        }
        D.containers.push(stack);
      }
    }
    // Rolling gantry cranes on rails along the yard's water side.
    const craneCount = 1 + (i === 1 ? 1 : 0);
    for (let k = 0; k < craneCount; k++) {
      D.cranes.push({
        x: s.x0 + 180 + k * Math.max(700, (s.x1 - s.x0) / (craneCount + 1)),
        y: YARD_NORTH - 40,
        rail: { x0: s.x0 + 60, x1: s.x1 - 60 },
        boom: rr(gen, 0.4, 1.1),
        speed: 0.14 + gen() * 0.1,
      });
    }
    // Sodium lamps line the yard alleys; floodlight masts the corners.
    for (let k = 0; k < 4; k++) {
      D.lamps.push({ x: s.x0 + 140 + k * ((s.x1 - s.x0 - 280) / 3), y: YARD_NORTH + 110, kind: 'sodium' });
    }
    D.floods.push({ x: s.x0 + 30, y: YARD_NORTH - 10 }, { x: s.x1 - 30, y: YARD_SOUTH + 10 });
    // Oil drums clustered by the yard gates.
    for (let k = 0; k < 5; k++) {
      D.drums.push({ x: gateCx + rr(gen, -160, 160), y: YARD_SOUTH + 40 + rr(gen, -30, 60), c: gen() < 0.5 ? '#8a4a3b' : '#3b5a4a' });
    }
    D.props.push({ icon: 'yard', x: (s.x0 + s.x1) / 2, y: YARD_NORTH + 90 });
  }

  // ---------------------------------------------------------------- warehouses
  // Warehouses back onto the city between the industry road and the yards,
  // with two more rows tucked between cross roads. Ribbed doors face south.
  const WH_COLS = ['#4a4e56', '#3f434c', '#524754', '#46504a', '#54503f'];
  for (const cx of CROSS_ROADS.slice(0, 6)) {
    if (cx === CROSS_ROADS[3]) continue;      // the gate road keeps its yard frontage
    const wx = cx + 140;
    const ww = rr(gen, 320, 470), wh = rr(gen, 200, 280);
    D.warehouses.push({ x: wx, y: -320 - wh, w: ww, h: wh, door: true, col: WH_COLS[(gen() * WH_COLS.length) | 0] });
    if (gen() < 0.6) {
      const w2w = rr(gen, 260, 420), w2h = rr(gen, 170, 240);
      D.warehouses.push({ x: wx + ww + 90, y: -320 - w2h, w: w2w, h: w2h, door: gen() < 0.7, col: WH_COLS[(gen() * WH_COLS.length) | 0] });
    }
  }
  D.warehouses.push({ x: 1900, y: YARD_NORTH - 320, w: 420, h: 260, door: true, col: WH_COLS[2] });
  D.props.push({ icon: 'warehouse', x: 2000, y: YARD_NORTH - 200 });
  D.props.push({ icon: 'warehouse', x: 9700, y: -480 });

  // ---------------------------------------------------------------- landmarks
  // Harbormaster office: the heist's first stop.
  D.office = { x: 8620, y: -800, w: 200, h: 150 };
  D.warehouses.push({ ...D.office, col: '#5a5348', office: true });
  D.props.push({ icon: 'office', x: D.office.x + 100, y: D.office.y + 80 });

  // MV Coral Crown at anchor, rolling on the swell. She lies moored against
  // the quay just east of Pier B — the boat that should not be there.
  D.ship = { x: 4650, y: -1980, len: 560, wid: 120, roll: 0, bob: 0 };
  D.props.push({ icon: 'ship', x: D.ship.x, y: D.ship.y });

  // Lighthouse on the western breakwater.
  D.lighthouse = { x: 300, y: -2260, beam: 0 };
  D.breakwater.push({ x: 150, y: -2200, w: 320, h: 130 });
  D.props.push({ icon: 'lighthouse', x: D.lighthouse.x, y: D.lighthouse.y });

  // Fish market on Pier B's foot: stalls with awnings.
  const mb = 4265;
  for (let k = 0; k < 4; k++) {
    D.stalls.push({ x: mb - 60 + (k % 2) * 120, y: -1620 - Math.floor(k / 2) * 90, c: k % 2 ? '#c94a4a' : '#3a7ac9' });
  }
  D.props.push({ icon: 'market', x: mb, y: -1600 });

  // Rail spur along the promenade with a loaded flatcar.
  D.railSpur = { y: -1512, x0: 700, x1: 13800 };
  D.flatcar = { x: rr(gen, 3600, 9200), y: -1512, boxes: 2 + (gen() * 3 | 0) };
  D.props.push({ icon: 'rail', x: D.flatcar.x, y: -1512 });

  D.props.push({ icon: 'ferry', x: SLIP_X, y: SLIP_Y });

  // ---------------------------------------------------------------- island
  D.island = { x: 9800, y: -3400, rx: 780, ry: 460, name: 'BAY MARINA' };

  // ---------------------------------------------------------------- turf + hideouts
  D.gangTurf.push({ gang: 'tides', x0: 0, x1: SPAN / 2, y0: DOCKS_WATER_Y, y1: 0 });
  D.gangTurf.push({ gang: 'cinders', x0: SPAN / 2, x1: SPAN, y0: DOCKS_WATER_Y, y1: 0 });
  D.hideouts.push({ name: 'Tides Boathouse', gang: 'tides', x: 2200, y: -1720 });
  D.hideouts.push({ name: 'Cinder Yard Locker', gang: 'cinders', x: 10600, y: -1000 });

  // ---------------------------------------------------------------- gate
  // One barrier line across the gate road, flanked by fence runs, with a
  // striped arm that lifts for whatever the probe waves through.
  D.gate = {
    x: GATE_X - 56, y: GATE_Y - 14, w: 112, h: 28,
    arm: { x: GATE_X - 60, y: GATE_Y - 6, w: 120, h: 12 },
    open: false,
  };
  D.fences.push({ x: 8310, y: GATE_Y - 6, w: GATE_X - 60 - 8310, h: 12 });
  D.fences.push({ x: GATE_X + 60, y: GATE_Y - 6, w: 10830 - (GATE_X + 60), h: 12 });

  // ---------------------------------------------------------------- heist zones
  D.heistZones = {
    scout: { x: D.office.x + 100, y: D.office.y + 70, r: 95 },
    boat: { x: PIER_X[2], y: PIER_TIP + 210, r: 90 },
    steal: { x: PIER_X[2], y: PIER_TIP + 210, r: 90 },
    chase: {
      pts: [
        { x: 2200, y: SHORE_ROAD_Y },
        { x: 5000, y: SHORE_ROAD_Y },
        { x: 8100, y: SHORE_ROAD_Y },
        { x: 11300, y: SHORE_ROAD_Y },
        { x: 14400, y: SHORE_ROAD_Y },
      ],
    },
    dropoff: { x: PIER_X[0], y: PIER_TIP + 260, r: 100 },
  };

  // ---------------------------------------------------------------- ferry route
  D.ferryRoute = {
    slip: { x: SLIP_X, y: SLIP_Y },
    landing: { x: D.island.x, y: D.island.y + D.island.ry - 90 },
    waypoints: [
      { x: SLIP_X, y: DOCKS_WATER_Y - 420 },
      { x: SLIP_X + 260, y: -2900 },
      { x: 9300, y: -3300 },
      { x: D.island.x, y: D.island.y + D.island.ry - 60 },
    ],
  };

  // ---------------------------------------------------------------- promenade + lamps
  for (let x = 260; x < SPAN - 260; x += 210) {
    if (PIER_X.some((c) => Math.abs(x - c) < PIER_HALF + 60)) continue;
    D.bollards.push({ x, y: PROMENADE_Y - 30 });
  }
  for (let x = 500; x < SPAN - 500; x += 640) {
    D.lamps.push({ x, y: PROMENADE_Y + 60, kind: 'sodium' });
  }
  for (let x = 900; x < SPAN - 900; x += 1900) {
    D.floods.push({ x, y: DOCKS_WATER_Y + 60, kind: 'mast' });
  }

  // Rain puddles: seeded ellipses on the apron that shine when wet.
  for (let k = 0; k < 90; k++) {
    D.puddles.push({
      x: rr(gen, 120, SPAN - 120),
      y: rr(gen, DOCKS_WATER_Y + 120, -260),
      rx: rr(gen, 26, 90),
      ry: rr(gen, 10, 26),
      a: rr(gen, 0, TAU),
    });
  }

  // Gulls wheeling over the yards and the water.
  for (let k = 0; k < 9; k++) {
    D.gulls.push({
      cx: rr(gen, 600, SPAN - 600),
      cy: rr(gen, DOCKS_WATER_Y + 200, -800),
      r: rr(gen, 60, 220),
      spd: rr(gen, 0.25, 0.7) * (gen() < 0.5 ? 1 : -1),
      phase: rr(gen, 0, TAU),
      flap: rr(gen, 0, TAU),
    });
  }

  // ---------------------------------------------------------------- solids
  // Static solid list: seawall with pier and slip gaps, pier rails,
  // warehouse walls, yard fences, container stacks, the office, the
  // breakwater, the far-shore wall, the east wall, the market stalls,
  // crane legs, drums, and the closed gate barrier.
  const solids = [];
  const addSolid = (x, y, w, h, tag) => { if (w > 0 && h > 0) solids.push({ x, y, w, h, tag }); };

  // Seawall: segments along the waterline, gaps where the piers land
  // and at the ferry slip. The bay is not walkable water.
  {
    const gaps = PIER_X.map((c) => [c - PIER_HALF - 8, c + PIER_HALF + 8]);
    gaps.push([SLIP_X - 110, SLIP_X + 110]);
    gaps.sort((a, b) => a[0] - b[0]);
    let x = 0;
    for (const [g0, g1] of gaps) {
      if (g0 > x) addSolid(x, SHORE_WALL, g0 - x, 24, 'seawall');
      x = Math.max(x, g1);
    }
    if (x < SPAN) addSolid(x, SHORE_WALL, SPAN - x, 24, 'seawall');
  }
  // East wall keeps the bay's east edge honest; the far shore closes the north.
  addSolid(SPAN - 20, DOCKS_WATER_Y, 40, -DOCKS_WATER_Y, 'seawall');
  addSolid(-400, DOCKS_NORTH_Y, SPAN + 800, 40, 'farshore');
  addSolid(-40, DOCKS_NORTH_Y, 40, -DOCKS_NORTH_Y, 'seawall');

  // Pier rails: thin lines down both long edges of every pier.
  for (const p of D.piers) {
    addSolid(p.x, p.y, 10, p.h, 'rail');
    addSolid(p.x + p.w - 10, p.y, 10, p.h, 'rail');
  }
  // Pier head bollard blocks.
  for (const p of D.piers) addSolid(p.x, p.y, p.w, 14, 'rail');

  for (const w of D.warehouses) addSolid(w.x, w.y, w.w, w.h, 'warehouse');
  for (const f of D.fences) { if (!f.gap) addSolid(f.x, f.y, f.w, f.h, 'fence'); }
  for (const row of D.containers) {
    const base = row[0];
    addSolid(base.x, base.y - 6, base.w, base.h + 12, 'container');
  }
  for (const c of D.cranes) {
    addSolid(c.x - 26, c.y - 20, 20, 44, 'crane');
    addSolid(c.x + 6, c.y - 20, 20, 44, 'crane');
  }
  for (const s of D.stalls) addSolid(s.x - 34, s.y - 22, 68, 40, 'stall');
  for (const bw of D.breakwater) addSolid(bw.x, bw.y, bw.w, bw.h, 'rock');
  for (const d of D.drums) addSolid(d.x - 9, d.y - 9, 18, 18, 'drum');
  addSolid(D.flatcar.x - 90, D.flatcar.y - 14, 180, 26, 'railcar');

  // The gate barrier is solid only while closed; update() recomputes it.
  const gateIndex = solids.length;
  solids.push({ ...D.gate, tag: 'gate' });

  // The open gate is remembered as a hole in the list, rebuilt on toggle.
  let gateOpen = false;
  function setGate(open) {
    if (open === gateOpen) return;
    gateOpen = open;
    D.gate.open = open;
    if (open) solids.splice(gateIndex, 1);
    else solids.splice(gateIndex, 0, { ...D.gate, tag: 'gate' });
  }

  D.solidsNear = function (x, y, out) {
    out.length = 0;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (x < s.x - 90 || x > s.x + s.w + 90 || y < s.y - 90 || y > s.y + s.h + 90) continue;
      out.push(s);
    }
    return out;
  };
  D._solidCount = () => solids.length;

  // ---------------------------------------------------------------- update
  D.update = function (dt, time) {
    // The gate answers its probe every step: near and on the apron → lift.
    setGate(!!(D._gateProbe && D._gateProbe()));
    // Cranes slew on their rails and swing their booms.
    for (const c of D.cranes) {
      c.boom += c.speed * dt;
      if (c.boom > 2.4 || c.boom < 0.35) c.speed *= -1;
      c.slide = clamp((c.slide ?? 0) + Math.sin(time * 0.11 + c.boom * 3) * dt * 26, c.rail.x0, c.rail.x1);
    }
    // The Coral Crown rolls on the swell and breathes on its moorings.
    D.ship.roll = Math.sin(time * 0.62) * 0.035 + Math.sin(time * 0.27 + 1.7) * 0.02;
    D.ship.bob = Math.sin(time * 0.8) * 5;
    // Gulls wheel and flap.
    for (const g of D.gulls) {
      g.phase += g.spd * dt;
      g.flap += dt * 7;
      g.x = g.cx + Math.cos(g.phase) * g.r;
      g.y = g.cy + Math.sin(g.phase) * g.r * 0.42;
    }
    // Lighthouse beam sweeps the bay.
    D.lighthouse.beam = (time * 0.55) % TAU;
    // Puddle shimmer phase (painter reads it for the wet sheen).
    D._puddlePhase = time * 1.6;
  };

  return D;
}
