// VICE PALMS — the night city: coastal grid, neon strip, beach + Ocean Drive,
// Palm Park, the North Docks (piers, containers, cranes, a cargo ship) and the
// Palm Airfield (runway, hangars, tower). Fully seeded / deterministic.

import { CFG } from './config.js';
import { RNG } from './rng.js';
import { clamp, rectHit } from './util.js';

export const WATER_S = 3140;   // ocean south of the beach sand
export const BOARDWALK_Y = 2975;

const NEON_COLS = ['#ff4fa3', '#3ae7ff', '#ffe36e', '#7dff9e', '#c084ff', '#ff8a5c'];
const BLD_COLS = ['#1b2342', '#222a4e', '#2a1f45', '#182f3c', '#251d33', '#1d2a50', '#301f38', '#16283f'];
const ROOF_COLS = ['#2c3560', '#343e6e', '#3d2c5e', '#254a5a', '#38294f', '#2d3d6e', '#4a2e4c', '#253a58'];
const SIGNS = ['HOTEL ROSA', 'PALMS CLUB', 'EL BANCO', 'MALIBU', 'V-ROCK', 'CAFÉ RIO', 'NOODLES', 'TIKI BAR', 'MOTEL AZUL', 'LAUNDRY', 'PAWN', 'DENTAL', 'KARAOKE', '24H', 'TATTOO', 'RADIO VICE'];

// ---------------------------------------------------------------------------
// world construction

export function buildWorld(seed) {
  const rng = new RNG(seed >>> 0);
  const w = {
    seed,
    W: CFG.WORLD_W, H: CFG.WORLD_H,
    buildings: [],     // {x,y,w,h,col,roof,neon,sign,trim}
    solids: [],        // {x,y,w,h,kind}
    palms: [],         // {x,y,s}
    props: [],         // {x,y,kind} lamps, hydrants, benches, umbrellas
    roadsX: CFG.ROAD_XS.slice(),
    roadsY: CFG.ROAD_YS.slice(),
    lights: [],        // traffic lights at intersections {x,y}
    poi: {},
    piers: [],
    containers: [],
    cranes: [],
    ship: null,
    runway: null,
    parkPond: null,
    staticCanvas: null, // filled by render.js prerender
    miniCanvas: null,
  };

  buildBeach(w, rng);
  buildBlocks(w, rng);
  buildPark(w, rng);
  buildDocks(w, rng);
  buildAirfield(w, rng);
  buildLights(w);
  buildProps(w, rng);
  buildPOI(w);

  // every building becomes a collision solid
  for (const b of w.buildings) w.solids.push({ x: b.x, y: b.y, w: b.w, h: b.h, kind: 'building' });

  return w;
}

function buildBeach(w, rng) {
  // palms + umbrellas on the sand, piers into the ocean
  for (let x = 320; x < CFG.WORLD_W - 400; x += rng.range(150, 260)) {
    const north = rng.chance(0.62);
    const y = north ? rng.range(CFG.BEACH_Y + 24, 2986) : rng.range(3092, 3128);
    w.palms.push({ x, y, s: rng.range(0.9, 1.35) });
    if (rng.chance(0.3)) w.props.push({ x: x + rng.range(-40, 40), y: y + (north ? 14 : -14), kind: 'umbrella', col: rng.pick(NEON_COLS) });
  }
  for (const px of [1120, 2560]) {
    w.piers.push({ x: px - 40, y: WATER_S - 40, w: 80, h: 150 });
  }
  // boardwalk lamps
  for (let x = 200; x < 4000; x += 190) w.props.push({ x, y: BOARDWALK_Y, kind: 'lamp' });
}

function blockRects(w) {
  const R = CFG.ROAD_HALF + CFG.SIDEWALK;
  const out = [];
  const xs = w.roadsX, ys = w.roadsY;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const x0 = xs[i] + R, x1 = xs[i + 1] - R;
      const y0 = ys[j] + R, y1 = ys[j + 1] - R;
      if (x1 - x0 < 60 || y1 - y0 < 60) continue;
      out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, i, j });
    }
  }
  return out;
}

function inRegion(r, reg) {
  return r.x + r.w > reg.x0 && r.x < reg.x1 && r.y + r.h > reg.y0 && r.y < reg.y1;
}

function buildBlocks(w, rng) {
  const park = { x0: CFG.PARK.x0 - 90, y0: CFG.PARK.y0 - 90, x1: CFG.PARK.x1 + 90, y1: CFG.PARK.y1 + 90 };
  const dock = { x0: CFG.DOCKS.x0 - 90, y0: 0, x1: CFG.DOCKS.x1 + 90, y1: CFG.DOCKS.y1 + 90 };
  const air = { x0: CFG.AIRFIELD.x0 - 90, y0: CFG.AIRFIELD.y0 - 90, x1: CFG.AIRFIELD.x1 + 90, y1: CFG.AIRFIELD.y1 + 90 };

  for (const b of blockRects(w)) {
    // south blocks on the beach side keep low neon strip buildings
    const beachSide = b.y + b.h > CFG.BEACH_Y - 100;
    if (inRegion(b, park) || inRegion(b, dock) || inRegion(b, air)) continue;

    // split block into 1-4 lots
    const lots = [];
    const twoX = b.w > 240 && rng.chance(0.65);
    const twoY = b.h > 240 && rng.chance(0.65);
    const mx = twoX ? rng.range(0.35, 0.65) : 1;
    const my = twoY ? rng.range(0.35, 0.65) : 1;
    const xw = [0, mx].map(t => t * b.w);
    const yh = [0, my].map(t => t * b.h);
    for (let ix = 0; ix < (twoX ? 2 : 1); ix++) {
      for (let iy = 0; iy < (twoY ? 2 : 1); iy++) {
        const lx = b.x + xw[ix];
        const ly = b.y + yh[iy];
        const lw = ix === 0 && twoX ? xw[1] : b.w - xw[ix];
        const lh = iy === 0 && twoY ? yh[1] : b.h - yh[iy];
        lots.push({ x: lx, y: ly, w: lw, h: lh });
      }
    }

    for (const lot of lots) {
      const inset = rng.range(8, 26);
      const bw = lot.w - inset * 2, bh = lot.h - inset * 2;
      if (bw < 40 || bh < 40) continue;
      const bx = lot.x + inset, by = lot.y + inset;
      const col = rng.pick(BLD_COLS), roof = rng.pick(ROOF_COLS);
      const neon = rng.chance(beachSide ? 0.55 : 0.3);
      const sign = neon && rng.chance(0.55) ? rng.pick(SIGNS) : null;
      const bld = {
        x: bx, y: by, w: bw, h: bh, col, roof,
        neon: neon ? rng.pick(NEON_COLS) : null,
        sign,
        trim: rng.chance(0.35),
        beach: beachSide,
      };
      w.buildings.push(bld);
    }
  }
}

function buildPark(w, rng) {
  const P = CFG.PARK;
  w.parkPond = { x: P.x0 + (P.x1 - P.x0) / 2, y: P.y0 + (P.y1 - P.y0) / 2, rx: 78, ry: 58 };
  for (let i = 0; i < 16; i++) {
    const x = rng.range(P.x0 + 20, P.x1 - 20), y = rng.range(P.y0 + 20, P.y1 - 20);
    if (Math.hypot(x - w.parkPond.x, (y - w.parkPond.y) * 1.2) < 110) continue;
    w.palms.push({ x, y, s: rng.range(0.8, 1.2) });
  }
  for (let i = 0; i < 6; i++) {
    w.props.push({ x: rng.range(P.x0 + 30, P.x1 - 30), y: rng.range(P.y0 + 30, P.y1 - 30), kind: 'bench' });
  }
  w.solids.push({ x: P.x0 + 10, y: P.y0 + 10, w: 0, h: 0, kind: 'none' }); // placeholder no-op
}

function buildDocks(w, rng) {
  const D = CFG.DOCKS;
  // container stacks
  for (let i = 0; i < 14; i++) {
    const cx = rng.range(D.x0 + 60, D.x1 - 140);
    const cy = rng.range(D.y0 + 60, D.y1 - 60);
    if (Math.abs(cx - 3040) < 90 || Math.abs(cx - 3520) < 90 || Math.abs(cx - 4000) < 90) continue;
    const stackW = 96, stackH = 44;
    w.containers.push({ x: cx, y: cy, w: stackW, h: stackH, col: rng.pick(['#b3402e', '#2e6ab3', '#c9a02e', '#3a9a4e', '#8a3ab3']) });
    w.solids.push({ x: cx, y: cy, w: stackW, h: stackH, kind: 'container' });
    if (rng.chance(0.5)) {
      w.containers.push({ x: cx + rng.range(-4, 4), y: cy - 40, w: stackW, h: stackH, col: rng.pick(['#b3402e', '#2e6ab3', '#c9a02e', '#3a9a4e']) });
    }
  }
  // cranes (two)
  for (const cx of [3160, 3810]) {
    w.cranes.push({ x: cx, y: D.y0 + 40, arm: 150, side: rng.sign() });
    w.solids.push({ x: cx - 26, y: D.y0 + 10, w: 52, h: 60, kind: 'crane' });
  }
  // piers into the ocean
  for (const px of [2760, 3260, 3760]) {
    w.piers.push({ x: px - 36, y: 30, w: 72, h: 130 });
  }
  // the cargo ship moored at the middle pier
  w.ship = { x: 3260 - 60, y: -18, w: 120, h: 210 };
  w.solids.push({ x: w.ship.x, y: w.ship.y, w: w.ship.w, h: w.ship.h, kind: 'ship' });
  // dockside lamps
  for (let x = D.x0; x < D.x1; x += 220) w.props.push({ x, y: D.y1 - 30, kind: 'lamp' });
  // warehouse shed
  w.buildings.push({ x: 2560, y: 470, w: 210, h: 110, col: '#20304a', roof: '#33486b', neon: '#7dff9e', sign: 'PALM EXPORT', trim: false, beach: false });
  w.solids.push({ x: 2560, y: 470, w: 210, h: 110, kind: 'building' });
}

function buildAirfield(w, rng) {
  const A = CFG.AIRFIELD;
  w.runway = { x: A.x0 + 40, y: 1900, w: A.x1 - A.x0 - 60, h: 84 };
  // hangars
  for (const hx of [A.x0 + 60, A.x0 + 300]) {
    const hb = { x: hx, y: 2080, w: 170, h: 120, col: '#223146', roof: '#39506e', neon: rng.pick(NEON_COLS), sign: rng.pick(['AIR CARGO', 'HANGAR 2', 'CHARTER']), trim: false, beach: false };
    w.buildings.push(hb);
    w.solids.push({ x: hb.x, y: hb.y, w: hb.w, h: hb.h, kind: 'building' });
  }
  // tower
  const tb = { x: A.x0 + 70, y: 1620, w: 64, h: 64, col: '#2a3450', roof: '#4a5570', neon: '#3ae7ff', sign: 'ATC', trim: true, beach: false };
  w.buildings.push(tb);
  w.solids.push({ x: tb.x, y: tb.y, w: tb.w, h: tb.h, kind: 'building' });
  // perimeter fence posts
  for (let x = A.x0; x < A.x1; x += 120) w.props.push({ x, y: A.y1 - 10, kind: 'fence' });
}

function buildLights(w) {
  for (const x of w.roadsX) {
    for (const y of w.roadsY) {
      if (y >= CFG.BEACH_Y - 100) continue;                 // no signals on Ocean Drive
      if (y <= CFG.DOCKS.y1 && x >= CFG.DOCKS.x0) continue;  // none in the docks
      w.lights.push({ x, y, phase: 0 });
    }
  }
}

function buildProps(w, rng) {
  // street lamps along roads, hydrants, benches in blocks
  for (let i = 0; i < w.roadsX.length; i++) {
    const x = w.roadsX[i];
    for (let y = 260; y < CFG.BEACH_Y; y += rng.range(260, 380)) {
      w.props.push({ x: x + CFG.ROAD_HALF + 8, y, kind: 'lamp' });
    }
  }
  for (let j = 0; j < w.roadsY.length; j++) {
    const y = w.roadsY[j];
    if (y > CFG.BEACH_Y - 60) continue;
    for (let x = 300; x < 4000; x += rng.range(300, 420)) {
      w.props.push({ x, y: y + CFG.ROAD_HALF + 8, kind: 'lamp' });
    }
  }
  for (let i = 0; i < 40; i++) {
    const x = rng.range(300, 3900), y = rng.range(260, 2800);
    if (isOnRoad(w, x, y)) continue;
    w.props.push({ x, y, kind: rng.chance(0.5) ? 'hydrant' : 'bench' });
  }
}

function buildPOI(w) {
  w.poi = {
    playerStart: { x: 1120, y: 1745 },
    hospital: { x: 660, y: 706 },
    policeStation: { x: 2605, y: 2135 },
    rico: { x: 1660, y: 2995 },
    garage: { x: 1185, y: 2135 },
    docksGate: { x: 3070, y: 640 },
    gangHideout: { x: 3930, y: 620 },
    shipDeck: { x: 3260, y: 140 },
    diner: { x: 2135, y: 1660 },
    taxiRank: { x: 1660, y: 1165 },
    airfieldPad: { x: 3620, y: 1860 },
    bank: { x: 1655, y: 1655 },
    penthouse: { x: 2620, y: 2600 },
  };
}

// ---------------------------------------------------------------------------
// queries

export function isOnRoad(w, x, y) {
  for (const rx of w.roadsX) if (Math.abs(x - rx) <= CFG.ROAD_HALF) return true;
  for (const ry of w.roadsY) if (Math.abs(y - ry) <= CFG.ROAD_HALF) return true;
  return false;
}

export function isWater(x, y) {
  // pier decks are walkable over water
  for (const p of G_world().piers) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return false;
  }
  return y < CFG.WATER_TOP || x > CFG.WATER_RIGHT || y > WATER_S;
}

export function onPiers(x, y) {
  const w = G_world();
  for (const p of w.piers) if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
  return false;
}

export function terrainAt(x, y) {
  if (isWater(x, y)) return 'water';
  const w = G_world();
  if (y > CFG.BEACH_Y) return 'sand';
  const A = CFG.AIRFIELD;
  if (x >= A.x0 && x <= A.x1 && y >= A.y0 && y <= A.y1) {
    const r = w.runway;
    if (r && y >= r.y && y <= r.y + r.h) return 'runway';
    return 'tarmac';
  }
  if (x >= CFG.DOCKS.x0 && x <= CFG.DOCKS.x1 && y >= CFG.DOCKS.y0 && y <= CFG.DOCKS.y1) return 'concrete';
  const P = CFG.PARK;
  if (x >= P.x0 - 20 && x <= P.x1 + 20 && y >= P.y0 - 20 && y <= P.y1 + 20) return 'grass';
  return 'city';
}

// world singleton ref used by query helpers (set by game.js on boot)
let _world = null;
export function setWorld(w) { _world = w; }
function G_world() { return _world; }

export function solidNear(x, y, r) {
  const w = G_world();
  for (const s of w.solids) {
    if (s.w === 0 && s.h === 0) continue;
    if (circleRectSolid(x, y, r, s)) return s;
  }
  return null;
}

function circleRectSolid(cx, cy, r, s) {
  const nx = clamp(cx, s.x, s.x + s.w), ny = clamp(cy, s.y, s.y + s.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// push a circle out of every solid it overlaps; returns hit normal info
export function resolveCircleSolids(ent, r) {
  const w = G_world();
  let hit = null;
  for (const s of w.solids) {
    if (s.w === 0 && s.h === 0) continue;
    const nx = clamp(ent.x, s.x, s.x + s.w), ny = clamp(ent.y, s.y, s.y + s.h);
    const dx = ent.x - nx, dy = ent.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      let d = Math.sqrt(d2);
      if (d < 0.0001) {
        // center inside solid: push out along the shallowest axis
        const l = ent.x - s.x, rr = s.x + s.w - ent.x, t = ent.y - s.y, b = s.y + s.h - ent.y;
        const m = Math.min(l, rr, t, b);
        if (m === l) ent.x = s.x - r; else if (m === rr) ent.x = s.x + s.w + r;
        else if (m === t) ent.y = s.y - r; else ent.y = s.y + s.h + r;
        hit = { nx: 0, ny: 0, s };
        continue;
      }
      const push = r - d;
      ent.x += (dx / d) * push;
      ent.y += (dy / d) * push;
      if (!hit) hit = { nx: dx / d, ny: dy / d, s };
    }
  }
  return hit;
}

// road helpers for spawning / roadblocks -------------------------------

export function randomRoadPoint(rng, w, opts = {}) {
  for (let tries = 0; tries < 24; tries++) {
    let x, y;
    if (rng.chance(0.5)) {
      x = rng.pick(w.roadsX) + (rng.chance(0.5) ? -1 : 1) * CFG.LANE_OFF;
      y = rng.range(200, CFG.BEACH_Y - 60);
    } else {
      y = rng.pick(w.roadsY) + (rng.chance(0.5) ? -1 : 1) * CFG.LANE_OFF;
      x = rng.range(200, 4050);
    }
    if (opts.near) {
      const d = Math.hypot(x - opts.near.x, y - opts.near.y);
      if (d < (opts.min || 400) || d > (opts.max || 900)) continue;
    }
    if (terrainAt(x, y) === 'water') continue;
    return { x, y };
  }
  return { x: opts.near ? opts.near.x : 1120, y: opts.near ? opts.near.y : 1745 };
}

// point on the road ahead of an entity (for roadblocks / spawn-ahead)
export function roadAhead(w, x, y, ang, dist) {
  // snap to the nearest road line the entity is traveling along
  let bestAxis = null, bestCoord = 0, bestDist = 1e9;
  for (const rx of w.roadsX) {
    const d = Math.abs(x - rx);
    if (d < bestDist) { bestDist = d; bestAxis = 'v'; bestCoord = rx; }
  }
  for (const ry of w.roadsY) {
    const d = Math.abs(y - ry);
    if (d < bestDist) { bestDist = d; bestAxis = 'h'; bestCoord = ry; }
  }
  const horizontalMotion = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang));
  let px, py;
  if (bestAxis === 'v' && !horizontalMotion) {
    py = y + Math.sign(Math.sin(ang) || 1) * dist;
    px = bestCoord;
  } else {
    px = x + Math.sign(Math.cos(ang) || 1) * dist;
    py = bestAxis === 'h' ? bestCoord : y;
  }
  px = clamp(px, 120, CFG.WORLD_W - 120);
  py = clamp(py, 150, CFG.BEACH_Y + 60);
  return { x: px, y: py, axis: bestAxis, coord: bestCoord };
}

// nearest road centerline point (cops returning to pursuit etc.)
export function nearestRoadPoint(w, x, y) {
  let bx = x, by = y, bd = 1e9;
  for (const rx of w.roadsX) {
    const d = Math.abs(x - rx);
    if (d < bd) { bd = d; bx = rx; by = y; }
  }
  for (const ry of w.roadsY) {
    const d = Math.abs(y - ry);
    if (d < bd) { bd = d; bx = x; by = ry; }
  }
  return { x: bx, y: by };
}

// light phase: 0 = NS green, 1 = EW green (global cycle)
export function lightPhase() {
  return Math.floor(G_time() / CFG.LIGHT_CYCLE) % 2;
}

let _t0 = 0;
export function setTimeRef(t0) { _t0 = t0; }
function G_time() { return (typeof G_state_time === 'function' ? G_state_time() : 0) + _t0; }
function G_state_time() { return 0; }

// real phase pulled from state lazily to avoid an import cycle at module init
export function phaseNow(t) { return Math.floor(t / CFG.LIGHT_CYCLE) % 2; }
