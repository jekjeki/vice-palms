// ============================================================
// NORTH DOCKS — the second district of Vice Palms
// The industrial waterfront north of the street grid: five piers
// reaching into the bay, container yards, warehouses with roll-up
// doors, gantry cranes that actually move, an anchored cargo
// ship, seagulls, oil drums, security fences, sodium harbor
// lamps, rain puddles, a rail spur, a fish market, a lighthouse
// and the ferry slip.
//
// The city grid lives in y >= 0; "north" is -y, so the docks
// apron spans y in [-1400, 0] and the bay opens beyond that.
//
// Public API:
//   buildDocks(seed) -> district handle (solids, draw layers, update)
//   DOCKS_WATER_Y    — the shoreline the painter and collision use
// ============================================================

import { GRID, PITCH, SPAN } from '../config.js';
import { mulberry, remix, rand } from '../rng.js';
import { clamp, hash01, TAU } from '../util.js';

export const DOCKS_WATER_Y = -1400;   // shoreline: land at y >= this, bay beyond
export const DOCKS_NORTH_Y = -4300;   // where the bay meets the open horizon
export const DOCKS_LAND = -1400;

const CONTAINER_COLORS = ['#b3402e', '#2e6bb3', '#2f8f5b', '#c7a23a', '#8a5fb3', '#d96b26', '#9aa0a6'];
const DRUM_COLORS = ['#8a4a2a', '#2e6bb3', '#6d7076', '#c7a23a'];
const WAREHOUSE_WALLS = ['#6d7076', '#5f6a72', '#71675a', '#5a6258'];
const WAREHOUSE_ROOFS = ['#3c4046', '#33393f', '#443c34', '#363e38'];
const DOOR_METAL = '#9aa0a6';

// Pier x positions: every 8th street line reaches the water.
const PIER_XS = [2 * PITCH, 10 * PITCH, 18 * PITCH, 26 * PITCH, 34 * PITCH];
const PIER_LEN = 560;          // how far the piers reach past the shoreline
const PIER_W = 130;

// ------------------------------------------------------------
export function buildDocks(seed) {
  const gen = mulberry(remix(seed, 0xd0c5 | 0));
  const d = {
    seed,
    bounds: { x0: 0, y0: DOCKS_WATER_Y, x1: SPAN, y1: 0 },
    waterY: DOCKS_WATER_Y,
    solids: [],
    roads: [],
    yards: [],
    warehouses: [],
    containers: [],
    cranes: [],
    drums: [],
    fences: [],
    lamps: [],
    floods: [],
    puddles: [],
    piers: [],
    gulls: [],
    market: [],
    props: [],
    spawnPoints: [],
    gangTurf: [],
    hideouts: [],
    heistZones: null,
    ferryRoute: null,
    time: 0,
  };

  // ----------------------------------------------------------
  // Roads: the city's vertical lines continue north at a wider
  // spacing, plus three horizontal dock roads and the shore road.
  // ----------------------------------------------------------
  for (let i = 2; i <= 38; i += 4) {
    d.roads.push({ x: i * PITCH - 45, y: DOCKS_WATER_Y, w: 90, h: -DOCKS_WATER_Y, kind: 'v' });
  }
  for (const ry of [-440, -760, -1080]) {
    d.roads.push({ x: 0, y: ry - 45, w: SPAN, h: 90, kind: 'h' });
  }
  d.roads.push({ x: 0, y: DOCKS_WATER_Y - 55, w: SPAN, h: 110, kind: 'h', kindName: 'shore' });

  // ----------------------------------------------------------
  // Piers: wooden decks on pilings reaching into the bay.
  // ----------------------------------------------------------
  const pierNames = ['A', 'B', 'C', 'D', 'E'];
  PIER_XS.forEach((px, i) => {
    const pier = {
      id: i,
      name: `Pier ${pierNames[i]}`,
      x: px, y: DOCKS_WATER_Y - PIER_LEN, w: PIER_W, h: PIER_LEN + 60,
      kind: i % 2 === 0 ? 'wood' : 'concrete',
    };
    d.piers.push(pier);
    d.props.push({ name: pier.name, x: px + PIER_W / 2, y: DOCKS_WATER_Y - PIER_LEN * 0.5, icon: 'pier' });
    // Pilings: dark stubs flanking the deck, drawn under everything.
    for (let py = pier.y + 40; py < DOCKS_WATER_Y; py += 52) {
      d.piers[i]['p' + py] = true; // marker slot (unused data, keeps shape stable)
    }
    // Side rails keep cars and pedestrians off the wet planks' edge, and a
    // head rail stops anyone strolling off the pier tip into the bay.
    d.solids.push({ x: px - 8, y: pier.y, w: 10, h: PIER_LEN + 60, tag: 'rail' });
    d.solids.push({ x: px + PIER_W - 2, y: pier.y, w: 10, h: PIER_LEN + 60, tag: 'rail' });
    d.solids.push({ x: px - 8, y: pier.y - 6, w: PIER_W + 16, h: 10, tag: 'rail' });
  });

  // ----------------------------------------------------------
  // Shore wall: nothing walks off the apron except onto the piers
  // and the ferry slip. Built as thin solid strips between gaps.
  // ----------------------------------------------------------
  const gaps = [];
  for (const px of PIER_XS) gaps.push([px - 6, px + PIER_W + 6]);
  const slipX = PIER_XS[3] + PIER_W / 2 + 220;   // ferry slip east of pier D
  gaps.push([slipX - 70, slipX + 70]);
  let wx = 0;
  const wallRuns = [];
  for (const [g0, g1] of gaps) {
    if (g0 > wx) wallRuns.push([wx, g0]);
    wx = g1;
  }
  if (wx < SPAN) wallRuns.push([wx, SPAN]);
  for (const [a, b] of wallRuns) {
    d.solids.push({ x: a, y: DOCKS_WATER_Y - 26, w: b - a, h: 30, tag: 'seawall' });
  }

  // ----------------------------------------------------------
  // Container yards: three big aprons with stacked colored boxes
  // and a gantry crane each.
  // ----------------------------------------------------------
  const yardDefs = [
    { x0: 4 * PITCH, x1: 8 * PITCH, y0: -1120, y1: -810 },
    { x0: 12 * PITCH, x1: 16 * PITCH, y0: -800, y1: -490 },
    { x0: 28 * PITCH, x1: 32 * PITCH, y0: -1120, y1: -810 },
  ];
  for (const yd of yardDefs) {
    const yard = { ...yd, name: 'Container Yard', stacks: [] };
    for (let cx = yd.x0 + 120; cx < yd.x1 - 200; cx += 190) {
      for (let cy = yd.y0 + 50; cy < yd.y1 - 120; cy += 130) {
        if (gen() < 0.14) continue;
        const rows = 1 + Math.floor(gen() * 3);
        const cols = 2 + Math.floor(gen() * 3);
        const stack = { x: cx, y: cy, cols, rows, cells: [] };
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            stack.cells.push({
              x: cx + c * 130, y: cy + r * 72,
              w: 112, h: 48, color: CONTAINER_COLORS[Math.floor(gen() * CONTAINER_COLORS.length)],
            });
          }
        }
        yard.stacks.push(stack);
        d.containers.push(...stack.cells);
        d.solids.push({ x: cx - 10, y: cy - 10, w: cols * 130 + 10, h: rows * 72 + 10, tag: 'containers' });
      }
    }
    d.yards.push(yard);
    d.props.push({ name: 'Container Yard', x: (yd.x0 + yd.x1) / 2, y: (yd.y0 + yd.y1) / 2, icon: 'yard' });

    // Gantry crane straddling the yard's north edge; its trolley slides.
    const crane = {
      x: (yd.x0 + yd.x1) / 2, y: yd.y0 - 40, span: yd.x1 - yd.x0 + 120,
      trolleyT: gen() * 6, trolleyPos: 0.5, cableDrop: 30,
      legs: yd.x1 - yd.x0 + 120,
    };
    d.cranes.push(crane);
    d.solids.push({ x: crane.x - 60, y: crane.y - 26, w: 120, h: 52, tag: 'crane' });

    // Floodlight masts.
    for (const fx of [yd.x0 + 160, yd.x1 - 160]) {
      d.floods.push({ x: fx, y: yd.y0 + 220 });
      d.solids.push({ x: fx - 9, y: yd.y0 + 211, w: 18, h: 18, tag: 'mast' });
    }

    // Yard fence with gate gaps facing the shore road.
    fenceRect(d, yd.x0 - 30, yd.y0 - 12, yd.x1 - yd.x0 + 60, yd.y1 - yd.y0 + 12, gen);
  }

  // ----------------------------------------------------------
  // Warehouses: long buildings with roll-up doors on the yard side.
  // ----------------------------------------------------------
  const whDefs = [
    { x: 4.5 * PITCH, y: -380, w: 640, h: 210 },
    { x: 12.5 * PITCH, y: -380, w: 560, h: 210 },
    { x: 21.5 * PITCH, y: -690, w: 720, h: 200 },
    { x: 28.5 * PITCH, y: -380, w: 640, h: 210 },
    { x: 31.5 * PITCH, y: -690, w: 520, h: 200 },
    { x: 6.5 * PITCH, y: -1330, w: 480, h: 200 },
    { x: 30.5 * PITCH, y: -1330, w: 460, h: 200 },
  ];
  whDefs.forEach((w, i) => {
    const wh = {
      ...w,
      wall: WAREHOUSE_WALLS[i % WAREHOUSE_WALLS.length],
      roof: WAREHOUSE_ROOFS[i % WAREHOUSE_ROOFS.length],
      doors: [],
      windows: [],
    };
    const nDoors = Math.max(2, Math.floor(w.w / 190));
    for (let k = 0; k < nDoors; k++) {
      const dx = w.x + (w.w / (nDoors + 1)) * (k + 1) - 55;
      wh.doors.push({ x: dx, y: w.y + w.h - 10, w: 110, h: 26 });
    }
    for (let k = 0; k < Math.floor(w.w / 120); k++) {
      wh.windows.push({ x: w.x + 40 + k * 120, y: w.y - 4, w: 26, h: 14, lit: hash01(w.x + k, w.y) < 0.6 });
    }
    d.warehouses.push(wh);
    d.solids.push({ x: w.x, y: w.y, w: w.w, h: w.h, tag: 'warehouse' });
    d.props.push({ name: 'Warehouse', x: w.x + w.w / 2, y: w.y + w.h / 2, icon: 'warehouse' });
    // Drums and pallets along the walls.
    for (let k = 0; k < 4; k++) {
      if (gen() < 0.4) continue;
      const dx = w.x + gen() * w.w;
      const dy = w.y + w.h + 40 + gen() * 60;
      addDrum(d, dx, dy, DRUM_COLORS[Math.floor(gen() * DRUM_COLORS.length)]);
    }
  });

  // ----------------------------------------------------------
  // Harbormaster office and the security gate on the city approach.
  // The gate is at x = 20*PITCH, where a city road continues north.
  // ----------------------------------------------------------
  const office = { x: 20 * PITCH + 190, y: -700, w: 300, h: 170 };
  d.office = office;
  d.solids.push({ ...office, tag: 'office' });
  d.props.push({ name: 'Harbormaster Office', x: office.x + office.w / 2, y: office.y + office.h / 2, icon: 'office' });
  for (let k = 0; k < 5; k++) {
    d.officeWindows = d.officeWindows || [];
    d.officeWindows.push({ x: office.x + 30 + k * 52, y: office.y + office.h - 8, w: 26, h: 16, lit: true });
  }

  const hut = { x: 20 * PITCH + 130, y: -180, w: 90, h: 70 };
  d.hut = hut;
  d.solids.push({ ...hut, tag: 'hut' });
  d.gateBarrier = {
    x: 20 * PITCH - 45, y: -240, w: 220, h: 10,
    liftT: 0, lift: 0, pivotX: 20 * PITCH - 45,
  };

  // ----------------------------------------------------------
  // Loose drums, puddles, seagulls.
  // ----------------------------------------------------------
  for (let k = 0; k < 26; k++) {
    const x = 100 + gen() * (SPAN - 200);
    const y = DOCKS_WATER_Y + 90 + gen() * (-DOCKS_WATER_Y - 220);
    if (nearRoad(x, y, d)) continue;
    addDrum(d, x, y, DRUM_COLORS[Math.floor(gen() * DRUM_COLORS.length)]);
  }
  for (let k = 0; k < 46; k++) {
    d.puddles.push({
      x: 60 + gen() * (SPAN - 120),
      y: DOCKS_WATER_Y + 60 + gen() * (-DOCKS_WATER_Y - 160),
      rx: 14 + gen() * 34, ry: 8 + gen() * 16,
      seed: gen() * 6.28,
    });
  }
  for (let k = 0; k < 16; k++) {
    d.gulls.push({
      cx: pickPierX(gen), cy: DOCKS_WATER_Y - 120 - gen() * 420,
      rx: 90 + gen() * 200, speed: (0.4 + gen() * 0.5) * (gen() < 0.5 ? 1 : -1),
      phase: gen() * TAU, alt: 0,
    });
  }

  // ----------------------------------------------------------
  // Cargo ship at anchor in the bay, gently rolling.
  // ----------------------------------------------------------
  d.ship = {
    x: 6.4 * PITCH, y: DOCKS_WATER_Y - 320, len: 760, wid: 190,
    ang: 0.22, rollT: gen() * 6, containers: [],
  };
  for (let k = 0; k < 9; k++) {
    d.ship.containers.push({
      x: -300 + k * 68, w: 58, h: 26,
      color: CONTAINER_COLORS[Math.floor(gen() * CONTAINER_COLORS.length)],
    });
  }
  d.props.push({ name: 'MV Coral Crown (anchored)', x: d.ship.x, y: d.ship.y, icon: 'ship' });

  // ----------------------------------------------------------
  // Lighthouse on the eastern breakwater.
  // ----------------------------------------------------------
  d.lighthouse = { x: 37.6 * PITCH, y: DOCKS_WATER_Y - 300, r: 46 };
  d.props.push({ name: 'Vice Point Light', x: d.lighthouse.x, y: d.lighthouse.y, icon: 'lighthouse' });
  // Breakwater rocks.
  d.rocks = [];
  for (let k = 0; k < 30; k++) {
    const t = k / 30;
    d.rocks.push({
      x: 36.4 * PITCH + t * 1.6 * PITCH + (gen() - 0.5) * 60,
      y: DOCKS_WATER_Y - 120 - Math.sin(t * 4) * 80 - gen() * 90,
      r: 14 + gen() * 26, rot: gen() * TAU,
    });
  }

  // ----------------------------------------------------------
  // Fish market stalls on Pier B — flavor plus gang turf hook.
  // ----------------------------------------------------------
  for (let k = 0; k < 5; k++) {
    const sx = PIER_XS[1] + 14 + k * 24;
    const sy = DOCKS_WATER_Y - 140 - (k % 2) * 130;
    d.market.push({ x: sx, y: sy, w: 34, h: 46, color: k % 2 ? '#b3402e' : '#2f8f5b', seed: gen() * 100 });
    d.solids.push({ x: sx - 17, y: sy - 23, w: 34, h: 46, tag: 'stall' });
  }
  d.props.push({ name: 'Gullwing Fish Market', x: PIER_XS[1] + PIER_W / 2, y: DOCKS_WATER_Y - 240, icon: 'market' });

  // Rail spur into yard three, with a loaded flatcar.
  d.rail = { x: 34.2 * PITCH, y0: -1260, y1: -300 };
  d.flatcar = { x: 34.2 * PITCH - 60, y: -960, w: 130, h: 60 };
  d.solids.push({ ...d.flatcar, tag: 'flatcar' });
  d.props.push({ name: 'Rail Spur 3', x: d.rail.x, y: -900, icon: 'rail' });

  // ----------------------------------------------------------
  // Harbor lamps: sodium poles along the roads and pier lips.
  // ----------------------------------------------------------
  for (let i = 2; i <= 38; i += 4) {
    for (const ry of [-440, -760, -1080]) {
      d.lamps.push({ x: i * PITCH + 64, y: ry + 64 });
      if (i < 38) d.lamps.push({ x: (i + 2) * PITCH - 64, y: ry - 64 });
    }
  }
  for (const px of PIER_XS) {
    d.lamps.push({ x: px + 10, y: DOCKS_WATER_Y - 200 });
    d.lamps.push({ x: px + PIER_W - 10, y: DOCKS_WATER_Y - 400 });
  }

  // ----------------------------------------------------------
  // Gang turf: The Tides west of the centre line, The Cinders east.
  // Hideouts sit at opposite ends of the shore road.
  // ----------------------------------------------------------
  d.gangTurf = [
    { gang: 'tides', name: 'The Tides', color: '#ff5533', x0: 0, x1: SPAN / 2, y0: DOCKS_WATER_Y, y1: 0 },
    { gang: 'cinders', name: 'The Cinders', color: '#33aaff', x0: SPAN / 2, x1: SPAN, y0: DOCKS_WATER_Y, y1: 0 },
  ];
  d.hideouts = [
    { gang: 'tides', name: 'Tides Boathouse', x: PIER_XS[0] + PIER_W + 60, y: DOCKS_WATER_Y - 90, r: 46 },
    { gang: 'cinders', name: 'Cinder Yard Locker', x: PIER_XS[4] + PIER_W - 40, y: DOCKS_WATER_Y - 90, r: 46 },
  ];

  // ----------------------------------------------------------
  // Heist zones (systems/heists.js reads these).
  // ----------------------------------------------------------
  d.heistZones = {
    scout: { x: office.x + office.w / 2, y: office.y + office.h + 80, r: 150, label: 'Harbormaster Office' },
    boat: { x: PIER_XS[2] + PIER_W / 2, y: DOCKS_WATER_Y - PIER_LEN + 120, r: 80, label: 'Pier C skiff' },
    chase: {
      pts: [
        { x: 14 * PITCH, y: -1080 },
        { x: 6 * PITCH, y: -760 },
        { x: 12 * PITCH, y: -440 },
        { x: PIER_XS[0] + PIER_W / 2, y: -1300 },
      ],
    },
    dropoff: { x: PIER_XS[0] + PIER_W / 2, y: -1500, r: 80, label: 'Pier A drop-off' },
  };

  // ----------------------------------------------------------
  // Ferry: the slip pontoon east of pier D and the island landing.
  // ----------------------------------------------------------
  const slip = { x: slipX, y: DOCKS_WATER_Y - 120 };
  d.ferrySlip = slip;
  d.ferryRoute = {
    slip,
    landing: { x: 15 * PITCH, y: -2860 },
    waypoints: [
      { x: slip.x, y: slip.y - 160 },
      { x: slip.x - 700, y: -2380 },
      { x: 18 * PITCH, y: -2760 },
      { x: 15.6 * PITCH, y: -2860 },
    ],
  };
  d.island = {
    x: 15 * PITCH, y: -2900, rx: 520, ry: 300,
    dock: { x: 15.6 * PITCH, y: -2860 },
  };
  d.props.push({ name: 'Bay Marina Landing', x: d.island.dock.x, y: d.island.dock.y, icon: 'ferry' });
  // The pontoon connects the seawall gap to deep water.
  d.solids.push({ x: slip.x - 70, y: DOCKS_WATER_Y - 170, w: 140, h: 130, tag: 'pontoon' });

  // ----------------------------------------------------------
  // Spawn points.
  // ----------------------------------------------------------
  d.spawnPoints.push({ x: 20 * PITCH, y: -120, name: 'North Docks Gate' });
  d.spawnPoints.push({ x: PIER_XS[1] + PIER_W / 2, y: DOCKS_WATER_Y - 80, name: 'Pier B Landing' });
  d.spawnPoints.push({ x: 14 * PITCH, y: -420, name: 'Yard Two' });

  // ----------------------------------------------------------
  // Spatial index for collision: solids bucketed by y band.
  // ----------------------------------------------------------
  const BAND = 600;
  const bands = new Map();
  for (const s of d.solids) {
    const b0 = Math.floor(s.y / BAND);
    const b1 = Math.floor((s.y + s.h) / BAND);
    for (let b = b0; b <= b1; b++) {
      if (!bands.has(b)) bands.set(b, []);
      bands.get(b).push(s);
    }
  }
  d._bands = bands;
  d._bandSize = BAND;

  /** Solids near a point, gathered into `out` (which is cleared first). */
  d.solidsNear = function (x, y, out) {
    out.length = 0;
    const b0 = Math.floor((y - 200) / BAND);
    const b1 = Math.floor((y + 200) / BAND);
    for (let b = b0; b <= b1; b++) {
      const list = bands.get(b);
      if (!list) continue;
      for (const s of list) {
        if (x + 60 < s.x || x - 60 > s.x + s.w) continue;
        if (out.includes(s)) continue;
        out.push(s);
      }
    }
    return out;
  };

  // ----------------------------------------------------------
  // Animated state: crane trolleys, gulls, ship roll, gate barrier.
  // ----------------------------------------------------------
  d.update = function (dt, t) {
    d.time = t;
    for (const c of d.cranes) {
      c.trolleyT += dt * 0.22;
      c.trolleyPos = 0.5 + Math.sin(c.trolleyT) * 0.42;
      c.cableDrop = 44 + Math.sin(c.trolleyT * 1.7) * 30;
    }
    for (const g of d.gulls) {
      g.phase += dt * g.speed;
      g.alt = Math.sin(t * 0.9 + g.phase * 2) * 6;
    }
    d.ship.rollT += dt;
    d.ship.roll = Math.sin(d.ship.rollT * 0.5) * 0.016;
    d.ship.drift = Math.sin(d.ship.rollT * 0.23) * 12;
    // The gate arm lifts for anything the game reports as close to the line.
    const gate = d.gateBarrier;
    if (gate) {
      const want = d._gateProbe ? d._gateProbe() : 0;
      gate.lift += (want - gate.lift) * Math.min(1, dt * 3);
    }
  };

  return d;
}

// ------------------------------------------------------------
function addDrum(d, x, y, color) {
  d.drums.push({ x, y, color, r: 9 });
  d.solids.push({ x: x - 9, y: y - 9, w: 18, h: 18, tag: 'drum' });
}

function fenceRect(d, x, y, w, h, gen) {
  // Three runs: north, west, east — the yard stays open onto the road that
  // skirts its south edge (gate traffic rolls straight in off the street).
  const seg = [];
  seg.push({ x, y, w, h: 8 });
  seg.push({ x, y, w: 8, h });
  seg.push({ x: x + w * 0.55, y, w: 8, h: h * 0.45 });
  seg.push({ x: x + w * 0.55, y: y + h * 0.65, w: 8, h: h * 0.35 });
  for (const s of seg) {
    d.fences.push(s);
    d.solids.push({ ...s, tag: 'fence' });
  }
}

function nearRoad(x, y, d) {
  for (const r of d.roads) {
    if (x > r.x - 40 && x < r.x + r.w + 40 && y > r.y - 40 && y < r.y + r.h + 40) return true;
  }
  return false;
}

function pickPierX(gen) {
  return PIER_XS[Math.floor(gen() * PIER_XS.length)] + gen() * PIER_W;
}

// ============================================================
// DRAW LAYERS — called from the Painter with the camera transform
// already applied. Everything is culled to the view rect.
// ============================================================

/** Ground and water pass: bay, apron, roads, yards, rails, puddles. */
export function drawDocksBase(ctx, d, view) {
  const { x0, x1, y0, y1 } = view;
  const wet = d._wetness ?? 0;

  // Bay water north of the shoreline: moonlit steel with a swell.
  if (y0 < DOCKS_WATER_Y) {
    const wy0 = Math.max(y0, DOCKS_NORTH_Y);
    const wy1 = Math.min(y1, DOCKS_WATER_Y);
    const g = ctx.createLinearGradient(0, wy0, 0, wy1);
    g.addColorStop(0, '#12304a');
    g.addColorStop(1, '#1c4a6a');
    ctx.fillStyle = g;
    ctx.fillRect(Math.max(x0, -200), wy0, Math.min(x1, SPAN + 200) - Math.max(x0, -200), wy1 - wy0);
    // Slow swell lines, animated off d.time.
    ctx.strokeStyle = 'rgba(120,190,235,0.18)';
    ctx.lineWidth = 2;
    const t = d.time;
    for (let wy = Math.floor(Math.max(y0, DOCKS_NORTH_Y) / 90) * 90; wy < Math.min(y1, DOCKS_WATER_Y); wy += 90) {
      ctx.beginPath();
      for (let wx = Math.max(x0, -200); wx < Math.min(x1, SPAN + 200); wx += 30) {
        const yo = Math.sin(wx * 0.017 + wy * 0.12 + t * 1.2) * 4;
        wx <= Math.max(x0, -200) + 30 ? ctx.moveTo(wx, wy + yo) : ctx.lineTo(wx, wy + yo);
      }
      ctx.stroke();
    }
    // Island landing (the far shore the ferry sails to).
    const isl = d.island;
    if (isl && isl.x + isl.rx > x0 && isl.x - isl.rx < x1 && isl.y + isl.ry > y0 && isl.y - isl.ry < y1) {
      ctx.fillStyle = '#8a744c';
      ctx.beginPath();
      ctx.ellipse(isl.x, isl.y, isl.rx, isl.ry, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#23262e';
      ctx.beginPath();
      ctx.ellipse(isl.x, isl.y + 10, isl.rx * 0.8, isl.ry * 0.74, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = LIGHT_PAINT;
      ctx.fillRect(isl.dock.x - 6, isl.dock.y - 30, 12, 60);
      ctx.fillStyle = '#8d93a8';
      ctx.fillRect(isl.dock.x - 90, isl.dock.y + 26, 180, 10);
      ctx.fillStyle = '#27c2a0';
      ctx.fillRect(isl.dock.x - 40, isl.dock.y - 52, 80, 22);
      ctx.fillStyle = '#0c0e16';
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BAY MARINA', isl.dock.x, isl.dock.y - 37);
    }
  }

  // Dock apron: worn, oil-stained concrete that still reads under the
  // night's ambient multiply.
  if (y1 > DOCKS_WATER_Y) {
    const ay0 = Math.max(y0, DOCKS_WATER_Y);
    ctx.fillStyle = '#383c44';
    ctx.fillRect(Math.max(x0, 0), ay0, Math.min(x1, SPAN) - Math.max(x0, 0), Math.min(y1, 0) - ay0);
    // Oil stains and patched concrete, deterministic.
    ctx.fillStyle = 'rgba(8,10,14,0.28)';
    for (let wx = Math.floor(Math.max(x0, 0) / 260) * 260; wx < Math.min(x1, SPAN); wx += 260) {
      for (let wy = Math.floor(ay0 / 260) * 260; wy < Math.min(y1, 0); wy += 260) {
        if (hash01(wx * 0.7, wy * 1.3) < 0.42) {
          ctx.beginPath();
          ctx.ellipse(wx + 130, wy + 130, 40 + hash01(wx, wy) * 60, 22 + hash01(wy, wx) * 30, hash01(wx + wy, 3) * 3, 0, TAU);
          ctx.fill();
        }
      }
    }
    // Wet sheen when the weather has soaked the district.
    if (wet > 0.05) {
      ctx.fillStyle = `rgba(120,170,220,${(wet * 0.1).toFixed(3)})`;
      ctx.fillRect(Math.max(x0, 0), ay0, Math.min(x1, SPAN) - Math.max(x0, 0), Math.min(y1, 0) - ay0);
    }
  }

  // Roads.
  for (const r of d.roads) {
    if (r.x + r.w < x0 || r.x > x1 || r.y + r.h < y0 || r.y > y1) continue;
    ctx.fillStyle = '#40444d';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // Dashed centre lines.
    ctx.strokeStyle = 'rgba(201,195,154,0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 34]);
    ctx.beginPath();
    if (r.kind === 'v') {
      const a = Math.max(r.y, y0), b = Math.min(r.y + r.h, y1);
      ctx.moveTo(r.x + r.w / 2, a);
      ctx.lineTo(r.x + r.w / 2, b);
    } else {
      const a = Math.max(r.x, x0), b = Math.min(r.x + r.w, x1);
      ctx.moveTo(a, r.y + r.h / 2);
      ctx.lineTo(b, r.y + r.h / 2);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Yard aprons: worn concrete with painted lane corners.
  for (const yd of d.yards) {
    if (yd.x1 < x0 || yd.x0 > x1 || yd.y1 < y0 || yd.y0 > y1) continue;
    ctx.fillStyle = '#41454e';
    ctx.fillRect(yd.x0, yd.y0, yd.x1 - yd.x0, yd.y1 - yd.y0);
    ctx.strokeStyle = 'rgba(255,217,119,0.22)';
    ctx.lineWidth = 4;
    ctx.strokeRect(yd.x0 + 30, yd.y0 + 30, yd.x1 - yd.x0 - 60, yd.y1 - yd.y0 - 60);
  }

  // Rail spur.
  const rail = d.rail;
  if (rail && rail.y1 > y0 && rail.y0 < y1) {
    ctx.fillStyle = '#3a2e24';
    ctx.fillRect(rail.x - 60, rail.y0, 120, rail.y1 - rail.y0);
    ctx.strokeStyle = '#6b4a2e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(rail.x - 34, Math.max(rail.y0, y0));
    ctx.lineTo(rail.x - 34, Math.min(rail.y1, y1));
    ctx.moveTo(rail.x + 34, Math.max(rail.y0, y0));
    ctx.lineTo(rail.x + 34, Math.min(rail.y1, y1));
    ctx.stroke();
    ctx.strokeStyle = '#4a382a';
    ctx.lineWidth = 8;
    for (let wy = Math.floor(Math.max(rail.y0, y0) / 60) * 60; wy < Math.min(rail.y1, y1); wy += 60) {
      ctx.beginPath();
      ctx.moveTo(rail.x - 56, wy);
      ctx.lineTo(rail.x + 56, wy);
      ctx.stroke();
    }
  }

  // Puddles: still mirrors that catch the sodium light when wet.
  for (const p of d.puddles) {
    if (p.x < x0 - 80 || p.x > x1 + 80 || p.y < y0 - 40 || p.y > y1 + 40) continue;
    ctx.fillStyle = `rgba(16,28,40,${0.5 + wet * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, TAU);
    ctx.fill();
    if (wet > 0.2) {
      ctx.fillStyle = `rgba(255,184,77,${(wet * 0.16 * (0.5 + 0.5 * Math.sin(p.seed + d.time))).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx * 0.6, p.ry * 0.5, 0, 0, TAU);
      ctx.fill();
    }
  }
}

/** Y-sorted pass: piers, fences, containers, warehouses, drums, stalls, cranes, ship. */
export function drawDocksActors(ctx, d, view) {
  const { x0, x1, y0, y1 } = view;
  const items = [];
  const vis = (x, y, m = 400) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;

  for (const p of d.piers) if (vis(p.x, p.y + p.h)) items.push({ z: DOCKS_WATER_Y + 1, kind: 'pier', o: p });
  for (const r of d.rocks) if (vis(r.x, r.y)) items.push({ z: r.y, kind: 'rock', o: r });
  for (const w of d.warehouses) if (vis(w.x + w.w / 2, w.y + w.h)) items.push({ z: w.y + w.h, kind: 'wh', o: w });
  for (const c of d.containers) if (vis(c.x, c.y + c.h)) items.push({ z: c.y + c.h, kind: 'cont', o: c });
  for (const f of d.fences) if (vis(f.x, f.y)) items.push({ z: f.y + f.h, kind: 'fence', o: f });
  for (const dr of d.drums) if (vis(dr.x, dr.y)) items.push({ z: dr.y, kind: 'drum', o: dr });
  for (const s of d.market) if (vis(s.x, s.y + s.h)) items.push({ z: s.y + s.h, kind: 'stall', o: s });
  for (const l of d.lamps) if (vis(l.x, l.y)) items.push({ z: l.y, kind: 'lamp', o: l });
  for (const fl of d.floods) if (vis(fl.x, fl.y)) items.push({ z: fl.y, kind: 'flood', o: fl });
  if (d.office && vis(d.office.x, d.office.y + d.office.h)) items.push({ z: d.office.y + d.office.h, kind: 'office', o: d.office });
  if (d.hut && vis(d.hut.x, d.hut.y + d.hut.h)) items.push({ z: d.hut.y + d.hut.h, kind: 'hut', o: d.hut });
  if (d.flatcar && vis(d.flatcar.x, d.flatcar.y)) items.push({ z: d.flatcar.y + d.flatcar.h, kind: 'flatcar', o: d.flatcar });
  if (d.gateBarrier && vis(d.gateBarrier.x, d.gateBarrier.y)) items.push({ z: d.gateBarrier.y, kind: 'gate', o: d.gateBarrier });
  if (d.ship && vis(d.ship.x, d.ship.y, 900)) items.push({ z: d.ship.y + d.ship.wid / 2, kind: 'ship', o: d.ship });
  if (d.lighthouse && vis(d.lighthouse.x, d.lighthouse.y, 600)) items.push({ z: d.lighthouse.y, kind: 'lh', o: d.lighthouse });
  for (const c of d.cranes) if (vis(c.x, c.y, 900)) items.push({ z: c.y + 40, kind: 'crane', o: c });

  items.sort((a, b) => a.z - b.z);
  for (const it of items) DRAW[it.kind](ctx, it.o, d);
}

const LIGHT_PAINT = '#c9c39a';

const DRAW = {
  pier(ctx, p, d) {
    // Pilings first, deck second.
    ctx.fillStyle = '#3a2c1c';
    for (let wy = p.y + 20; wy < DOCKS_WATER_Y; wy += 52) {
      ctx.fillRect(p.x - 4, wy, 10, 26);
      ctx.fillRect(p.x + p.w - 6, wy, 10, 26);
    }
    ctx.fillStyle = p.kind === 'wood' ? '#5c4228' : '#4a4e56';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // Planks or slab joints.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (p.kind === 'wood') {
      for (let wy = p.y + 22; wy < p.y + p.h; wy += 22) {
        ctx.moveTo(p.x, wy);
        ctx.lineTo(p.x + p.w, wy);
      }
    } else {
      for (let wx = p.x + 40; wx < p.x + p.w; wx += 40) {
        ctx.moveTo(wx, p.y);
        ctx.lineTo(wx, p.y + p.h);
      }
    }
    ctx.stroke();
    // Mooring bollards.
    ctx.fillStyle = '#2c2018';
    for (let wy = p.y + 60; wy < DOCKS_WATER_Y - 40; wy += 130) {
      ctx.beginPath(); ctx.arc(p.x + 12, wy, 6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + p.w - 12, wy, 6, 0, TAU); ctx.fill();
    }
  },

  rock(ctx, r) {
    ctx.fillStyle = '#3a3e44';
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.rot);
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU;
      const rr = r.r * (0.7 + hash01(r.x + k, r.y) * 0.5);
      k === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(10,20,30,0.4)';
    ctx.beginPath(); ctx.arc(-r.r * 0.2, r.r * 0.2, r.r * 0.5, 0, TAU); ctx.fill();
    ctx.restore();
  },

  wh(ctx, w) {
    // Wall with a lit window band, roof slab pushed north, roll-up doors south.
    ctx.fillStyle = w.wall;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    // Window slots along the south wall.
    for (const win of w.windows) {
      ctx.fillStyle = '#0f1220';
      ctx.fillRect(win.x, win.y, win.w, win.h);
      if (win.lit) {
        ctx.fillStyle = '#ffce8c';
        ctx.fillRect(win.x + 1, win.y + 1, win.w - 2, win.h - 2);
      }
    }
    // Roof pushed north-west, parapet trim.
    ctx.fillStyle = w.roof;
    ctx.fillRect(w.x - 18, w.y - 18, w.w + 18, w.h + 18);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 2;
    ctx.strokeRect(w.x - 18, w.y - 18, w.w + 18, w.h + 18);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(w.x - 18, w.y - 18, w.w + 18, 4);
    // Roll-up doors on the south face with rib lines.
    for (const door of w.doors) {
      ctx.fillStyle = DOOR_METAL;
      ctx.fillRect(door.x, door.y, door.w, door.h + 12);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let ry = door.y + 5; ry < door.y + door.h + 10; ry += 6) {
        ctx.moveTo(door.x + 2, ry);
        ctx.lineTo(door.x + door.w - 2, ry);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,217,119,0.5)';
      ctx.fillRect(door.x + door.w / 2 - 14, door.y + door.h + 2, 28, 4);
    }
  },

  cont(ctx, c) {
    // Corrugated box: body, rib shading, door caps on the short ends.
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let ry = c.y + 6; ry < c.y + c.h - 4; ry += 10) {
      ctx.fillRect(c.x + 3, ry, c.w - 6, 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(c.x, c.y, c.w, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(c.x + c.w - 8, c.y, 8, c.h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(c.x, c.y + c.h - 5, c.w, 5);
  },

  fence(ctx, f) {
    ctx.fillStyle = 'rgba(155,163,170,0.5)';
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.strokeStyle = 'rgba(10,12,16,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(f.x, f.y, f.w, f.h);
  },

  drum(ctx, dr) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(dr.x + 3, dr.y + 4, dr.r, dr.r * 0.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = dr.color;
    ctx.beginPath(); ctx.arc(dr.x, dr.y, dr.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(dr.x, dr.y, dr.r * 0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.arc(dr.x - dr.r * 0.3, dr.y - dr.r * 0.3, dr.r * 0.3, 0, TAU); ctx.fill();
  },

  stall(ctx, s) {
    ctx.fillStyle = '#5c4228';
    ctx.fillRect(s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x - s.w / 2 - 4, s.y - s.h / 2 - 10, s.w + 8, 14);
    ctx.fillStyle = '#dfe9f2';
    ctx.fillRect(s.x - s.w / 2 + 4, s.y - 6, s.w - 8, 8);
    ctx.fillStyle = '#9adfff';
    ctx.fillRect(s.x - 6, s.y + 4, 12, 6);
  },

  lamp(ctx, l) {
    ctx.strokeStyle = '#20232c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(l.x, l.y - 34);
    ctx.lineTo(l.x + 12, l.y - 34);
    ctx.stroke();
    ctx.fillStyle = '#ffb84d';
    ctx.beginPath(); ctx.arc(l.x + 14, l.y - 32, 4.4, 0, TAU); ctx.fill();
  },

  flood(ctx, f) {
    ctx.fillStyle = '#2a2d36';
    ctx.fillRect(f.x - 5, f.y - 4, 10, 60);
    ctx.fillStyle = '#12141d';
    ctx.fillRect(f.x - 16, f.y - 22, 32, 12);
    ctx.fillStyle = '#dfe9ff';
    ctx.fillRect(f.x - 12, f.y - 19, 24, 6);
  },

  office(ctx, o, d) {
    ctx.fillStyle = '#6d7076';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = '#3c4046';
    ctx.fillRect(o.x - 10, o.y - 10, o.w + 10, o.h + 10);
    for (const win of d.officeWindows ?? []) {
      ctx.fillStyle = '#0f1220';
      ctx.fillRect(win.x, win.y, win.w, win.h);
      ctx.fillStyle = '#9adfff';
      ctx.fillRect(win.x + 1, win.y + 1, win.w - 2, win.h - 2);
    }
    ctx.fillStyle = '#27c2a0';
    ctx.fillRect(o.x + o.w - 74, o.y + o.h - 30, 62, 18);
    ctx.fillStyle = '#0c0e16';
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HARBORMASTER', o.x + o.w - 43, o.y + o.h - 17);
  },

  hut(ctx, h) {
    ctx.fillStyle = '#9aa0a6';
    ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.fillStyle = '#c7a23a';
    ctx.fillRect(h.x - 6, h.y - 6, h.w + 6, h.h + 6);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillRect(h.x + h.w - 34, h.y + 12, 24, 18);
  },

  gate(ctx, g, d) {
    // The arm rises around its west pivot when the probe says traffic is coming.
    const lift = g.lift ?? 0;
    ctx.save();
    ctx.translate(g.pivotX, g.y + 5);
    ctx.rotate(-lift * (Math.PI / 2.1));
    ctx.fillStyle = '#b3402e';
    ctx.fillRect(0, -5, g.w, 10);
    ctx.fillStyle = '#e8e4da';
    for (let k = 1; k < 6; k++) ctx.fillRect(k * 34, -5, 17, 10);
    ctx.restore();
    ctx.fillStyle = '#2a2d36';
    ctx.fillRect(g.pivotX - 8, g.y - 14, 16, 26);
  },

  flatcar(ctx, f) {
    ctx.fillStyle = '#4a382a';
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = '#2e6bb3';
    ctx.fillRect(f.x + 8, f.y - 26, f.w - 16, 30);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(f.x + 8, f.y - 22 + k * 8);
      ctx.lineTo(f.x + f.w - 8, f.y - 22 + k * 8);
      ctx.stroke();
    }
  },

  ship(ctx, s, d) {
    const roll = s.roll ?? 0;
    ctx.save();
    ctx.translate(s.x + (s.drift ?? 0), s.y);
    ctx.rotate(s.ang + roll);
    // Wake rings.
    ctx.strokeStyle = 'rgba(150,200,235,0.1)';
    ctx.lineWidth = 3;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, s.len / 2 + 30 * k, s.wid / 2 + 22 * k, 0, 0, TAU);
      ctx.stroke();
    }
    // Hull with a light deck line so it reads against the water.
    ctx.fillStyle = '#3a6a92';
    ctx.beginPath();
    ctx.moveTo(-s.len / 2, -s.wid / 2);
    ctx.lineTo(s.len / 2 - 60, -s.wid / 2);
    ctx.lineTo(s.len / 2, -s.wid * 0.2);
    ctx.lineTo(s.len / 2, s.wid * 0.2);
    ctx.lineTo(s.len / 2 - 60, s.wid / 2);
    ctx.lineTo(-s.len / 2, s.wid / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,20,30,0.5)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#5f3520';
    ctx.fillRect(-s.len / 2, s.wid / 2 - 14, s.len - 50, 8);
    // Deck and cargo.
    ctx.fillStyle = '#687582';
    ctx.fillRect(-s.len / 2 + 24, -s.wid / 2 + 18, s.len - 130, s.wid - 36);
    for (const c of s.containers) {
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, -s.wid / 2 + 34, c.w, s.wid - 74);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(c.x, -s.wid / 2 + 34, c.w, 6);
      ctx.strokeStyle = 'rgba(10,16,24,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x, -s.wid / 2 + 34, c.w, s.wid - 74);
    }
    // Superstructure aft.
    ctx.fillStyle = '#d9dde1';
    ctx.fillRect(-s.len / 2 + 20, -s.wid / 2 + 26, 120, s.wid - 52);
    ctx.fillStyle = '#182838';
    ctx.fillRect(-s.len / 2 + 30, -s.wid / 2 + 40, 100, 26);
    // Funnel.
    ctx.fillStyle = '#b3402e';
    ctx.fillRect(-s.len / 2 + 250, -22, 34, 44);
    ctx.restore();
  },

  lh(ctx, l, d) {
    // Tapered tower with banded stripes, gallery, lamp room, cap.
    ctx.save();
    ctx.translate(l.x, l.y);
    for (let k = 0; k < 4; k++) {
      const rr = l.r * (1 - k * 0.16);
      ctx.fillStyle = k % 2 === 0 ? '#e8e4da' : '#b3402e';
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.fill();
      ctx.translate(0, -l.r * 0.72);
    }
    ctx.fillStyle = '#12141d';
    ctx.beginPath(); ctx.arc(0, 0, l.r * 0.62, 0, TAU); ctx.fill();
    const on = Math.sin(d.time * 1.6) > -0.2;
    ctx.fillStyle = on ? '#fff3c4' : '#6b6549';
    ctx.beginPath(); ctx.arc(0, 0, l.r * 0.44, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b3402e';
    ctx.beginPath();
    ctx.moveTo(-l.r * 0.75, -l.r * 0.62);
    ctx.lineTo(l.r * 0.75, -l.r * 0.62);
    ctx.lineTo(0, -l.r * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Keeper's cottage.
    ctx.fillStyle = '#6d7076';
    ctx.fillRect(l.x - l.r - 60, l.y + 20, 80, 60);
    ctx.fillStyle = '#3c4046';
    ctx.fillRect(l.x - l.r - 68, l.y + 12, 96, 16);
  },

  crane(ctx, c) {
    // Legs, portal beams, boom across the yard, sliding trolley and cable.
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = '#8a6d1e';
    ctx.fillRect(-c.span / 2, -30, 26, 74);
    ctx.fillRect(c.span / 2 - 26, -30, 26, 74);
    ctx.fillStyle = '#c7a23a';
    ctx.fillRect(-c.span / 2, -38, c.span, 16);
    // Boom reaching north over the water with lattice hints.
    ctx.fillStyle = '#c7a23a';
    ctx.fillRect(-13, -30 - 300, 26, 300);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const yy = -50 - k * 32;
      ctx.moveTo(-13, yy);
      ctx.lineTo(13, yy - 16);
    }
    ctx.stroke();
    // Machinery house.
    ctx.fillStyle = '#8a6d1e';
    ctx.fillRect(-46, -70, 92, 42);
    ctx.fillStyle = '#12141d';
    ctx.fillRect(-46, -70, 92, 10);
    // Trolley rides the boom; the cable and spreader hang from it.
    const tx = (c.trolleyPos - 0.5) * (c.span - 80);
    ctx.fillStyle = '#8a6d1e';
    ctx.fillRect(tx - 16, -320, 32, 20);
    ctx.strokeStyle = '#12141d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, -300);
    ctx.lineTo(tx, -300 + c.cableDrop);
    ctx.stroke();
    ctx.fillStyle = '#5f3520';
    ctx.fillRect(tx - 26, -300 + c.cableDrop, 52, 10);
    ctx.restore();
  },
};

// ============================================================
// GLOW PASS — sodium lamp pools, floodlight sweeps, lighthouse
// beam, ship lamp, neon-ish accents. Called by the Painter.
// ============================================================
export function drawDocksGlow(ctx, d, view) {
  const { x0, x1, y0, y1 } = view;
  const lampSprite = glowSprite(ctx);
  for (const l of d.lamps) {
    if (l.x < x0 - 120 || l.x > x1 + 120 || l.y < y0 - 120 || l.y > y1 + 120) continue;
    ctx.drawImage(lampSprite, l.x - 72, l.y - 44);
    // Vertical sheen on the wet apron.
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.translate(l.x, l.y + 40);
    ctx.scale(0.4, 2.0);
    ctx.drawImage(lampSprite, -72, -72);
    ctx.restore();
  }
  for (const f of d.floods) {
    if (f.x < x0 - 200 || f.x > x1 + 200 || f.y < y0 - 200 || f.y > y1 + 200) continue;
    const g = ctx.createRadialGradient(f.x, f.y - 10, 6, f.x, f.y - 10, 170);
    g.addColorStop(0, 'rgba(223,233,255,0.3)');
    g.addColorStop(1, 'rgba(223,233,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y - 10, 170, 0, TAU); ctx.fill();
  }
  // Lighthouse: rotating beam pair when the lamp is on.
  const l = d.lighthouse;
  if (l && l.x > x0 - 700 && l.x < x1 + 700 && l.y > y0 - 700 && l.y < y1 + 700) {
    const on = Math.sin(d.time * 1.6) > -0.2;
    if (on) {
      const a = d.time * 0.7;
      for (const side of [0, Math.PI]) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.translate(l.x, l.y - l.r * 2.6);
        ctx.rotate(a + side);
        const beam = ctx.createLinearGradient(0, 0, 420, 0);
        beam.addColorStop(0, 'rgba(255,243,196,0.8)');
        beam.addColorStop(1, 'rgba(255,243,196,0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(420, -60);
        ctx.lineTo(420, 60);
        ctx.lineTo(0, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      const gl = ctx.createRadialGradient(l.x, l.y - l.r * 2.6, 2, l.x, l.y - l.r * 2.6, 60);
      gl.addColorStop(0, 'rgba(255,243,196,0.7)');
      gl.addColorStop(1, 'rgba(255,243,196,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(l.x, l.y - l.r * 2.6, 60, 0, TAU); ctx.fill();
    }
  }
  // Ship mast light: an anchor blink far out in the bay.
  const s = d.ship;
  if (s && Math.floor(d.time * 0.9) % 3 === 0) {
    const mx = s.x + Math.cos(s.ang) * s.len * 0.42, my = s.y + Math.sin(s.ang) * s.len * 0.42;
    const g = ctx.createRadialGradient(mx, my, 2, mx, my, 26);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, my, 26, 0, TAU); ctx.fill();
  }
}

let _glowSprite = null;
function glowSprite(ctx) {
  if (_glowSprite) return _glowSprite;
  const c = document.createElement('canvas');
  c.width = 144; c.height = 144;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(72, 72, 4, 72, 72, 70);
  rg.addColorStop(0, 'rgba(255,184,77,0.44)');
  rg.addColorStop(0.5, 'rgba(255,170,60,0.15)');
  rg.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 144, 144);
  _glowSprite = c;
  return c;
}

/** Seagulls ride above everything: drawn last in world space. */
export function drawDocksSky(ctx, d, view) {
  const { x0, x1, y0, y1 } = view;
  for (const g of d.gulls) {
    const gx = g.cx + Math.cos(g.phase) * g.rx;
    const gy = g.cy + Math.sin(g.phase) * g.rx * 0.5 + g.alt;
    if (gx < x0 - 40 || gx > x1 + 40 || gy < y0 - 40 || gy > y1 + 40) continue;
    const flap = Math.sin(d.time * 7 + g.phase * 3) * 4;
    ctx.strokeStyle = '#dfe4ee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx - 7, gy - flap * 0.4);
    ctx.quadraticCurveTo(gx - 3, gy - flap, gx, gy);
    ctx.quadraticCurveTo(gx + 3, gy - flap, gx + 7, gy - flap * 0.4);
    ctx.stroke();
  }
}

/** Rain puddle wetness hook used by weather.js through the district. */
export function setDocksWetness(d, wet) {
  d._wetness = wet;
}

/** Draw one district actor by kind — the Painter's y-sort dispatch. */
export function drawDockItem(ctx, kind, o, d) {
  const fn = DRAW[kind];
  if (fn) fn(ctx, o, d);
}

/** Collect district actors inside a view rect as y-sort items for the Painter. */
export function dockSortItems(d, view) {
  const { x0, x1, y0, y1 } = view;
  const items = [];
  const vis = (x, y, m = 400) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
  for (const p of d.piers) if (vis(p.x, p.y + p.h)) items.push({ z: DOCKS_WATER_Y + 1, kind: 'pier', o: p });
  for (const r of d.rocks) if (vis(r.x, r.y)) items.push({ z: r.y, kind: 'rock', o: r });
  for (const w of d.warehouses) if (vis(w.x + w.w / 2, w.y + w.h)) items.push({ z: w.y + w.h, kind: 'wh', o: w });
  for (const c of d.containers) if (vis(c.x, c.y + c.h)) items.push({ z: c.y + c.h, kind: 'cont', o: c });
  for (const f of d.fences) if (vis(f.x, f.y)) items.push({ z: f.y + f.h, kind: 'fence', o: f });
  for (const dr of d.drums) if (vis(dr.x, dr.y)) items.push({ z: dr.y, kind: 'drum', o: dr });
  for (const s of d.market) if (vis(s.x, s.y + s.h)) items.push({ z: s.y + s.h, kind: 'stall', o: s });
  for (const l of d.lamps) if (vis(l.x, l.y)) items.push({ z: l.y, kind: 'lamp', o: l });
  for (const fl of d.floods) if (vis(fl.x, fl.y)) items.push({ z: fl.y, kind: 'flood', o: fl });
  if (d.office && vis(d.office.x, d.office.y + d.office.h)) items.push({ z: d.office.y + d.office.h, kind: 'office', o: d.office });
  if (d.hut && vis(d.hut.x, d.hut.y + d.hut.h)) items.push({ z: d.hut.y + d.hut.h, kind: 'hut', o: d.hut });
  if (d.flatcar && vis(d.flatcar.x, d.flatcar.y)) items.push({ z: d.flatcar.y + d.flatcar.h, kind: 'flatcar', o: d.flatcar });
  if (d.gateBarrier && vis(d.gateBarrier.x, d.gateBarrier.y)) items.push({ z: d.gateBarrier.y, kind: 'gate', o: d.gateBarrier });
  if (d.ship && vis(d.ship.x, d.ship.y, 900)) items.push({ z: d.ship.y + d.ship.wid / 2, kind: 'ship', o: d.ship });
  if (d.lighthouse && vis(d.lighthouse.x, d.lighthouse.y, 600)) items.push({ z: d.lighthouse.y, kind: 'lh', o: d.lighthouse });
  for (const c of d.cranes) if (vis(c.x, c.y, 900)) items.push({ z: c.y + 40, kind: 'crane', o: c });
  return items;
}
