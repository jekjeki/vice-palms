// world.js — deterministic night-coastal city: grid, blocks, buildings, park,
// NORTH DOCKS (piers, containers, cranes, ship) and PALM AIRFIELD (runway,
// hangars, tower). Also collision solids, traffic lights, landmarks, spawns
// and the minimap underlay.

import { CFG } from './config.js';
import { RNG } from './rng.js';
import { shade } from './util.js';

// ---------------------------------------------------------------- geometry

export const ROAD_V = [500, 1100, 1700, 2300, 2900, 3500, 4100, 4300];
export const ROAD_H = [500, 1100, 1700, 2300, 2900, 3300];
export const ROAD_HALF = CFG.ROAD_HALF;
export const V_SPAN = { min: 440, max: 3360 };   // y extent of vertical roads
export const H_SPAN = { min: 440, max: 4360 };   // x extent of horizontal roads

export const WATER = [
  { x: 0, y: 0, w: CFG.WORLD_W, h: 200 },
  { x: 4480, y: 0, w: CFG.WORLD_W - 4480, h: CFG.WORLD_H },
  { x: 0, y: 3480, w: CFG.WORLD_W, h: CFG.WORLD_H - 3480 },
];

export const SAND = [
  { x: 120, y: 200, w: 4360, h: 200 },
  { x: 4300, y: 200, w: 180, h: 3280 },
  { x: 120, y: 3380, w: 4360, h: 100 },
];

export const PARK = { x: 1794, y: 1194, w: 412, h: 412 };
export const DOCKS = { x: 2900, y: 440, w: 1340, h: 660 };
export const AIRFIELD = { x: 2900, y: 2300, w: 1340, h: 960 };
export const RUNWAY = { x: 2980, y: 2760, w: 1240, h: 200 };

// landmarks (marker anchors + respawns)
export const LANDMARKS = {
  safehouse: { x: 596, y: 2600, name: 'Safehouse' },
  diner: { x: 2600, y: 1400, name: "Rico's Diner" },
  garage: { x: 3200, y: 2000, name: 'Sunrise Garage' },
  hospital: { x: 1400, y: 800, name: 'Palm General Hospital' },
  police: { x: 2600, y: 2600, name: 'VP Metro Police' },
  warehouse: { x: 3600, y: 700, name: 'Rival Warehouse' },
  docksGate: { x: 3300, y: 900, name: 'North Docks' },
  airfieldPkg: { x: 3700, y: 2860, name: 'Palm Airfield' },
  beachLot: { x: 4260, y: 1800, name: 'Ocean Drive Lot' },
  taxiStand: { x: 1150, y: 620, name: 'Taxi Stand' },
  shipDeck: { x: 3560, y: 100, name: 'The Coral Maiden' },
};

// parked cars the world starts with (missions add their own)
export const PARKED = [
  { type: 'sedan', x: 575, y: 2560, ang: 0, color: '#8a3b46' },
  { type: 'sports', x: 3080, y: 2016, ang: Math.PI / 2, color: '#b46bff' },
  { type: 'taxi', x: 1150, y: 560, ang: 0, color: CFG.TAXI_COL },
  { type: 'van', x: 2360, y: 1116, ang: Math.PI, color: '#5a6272' },
  { type: 'sedan', x: 2915, y: 1500, ang: -Math.PI / 2, color: '#2f7a4f' },
  { type: 'buggy', x: 4200, y: 1700, ang: 0, color: '#ffd24a' },
  { type: 'truck', x: 3050, y: 2960, ang: 0, color: '#5a3b8a' },
  { type: 'sedan', x: 2240, y: 2240, ang: Math.PI / 2, color: '#c8a23c' },
];

// ---------------------------------------------------------------- builders

function districtHeight(cx, cy) {
  // downtown = tall towers, elsewhere mid/low
  const d = Math.abs(cx - 2300) + Math.abs(cy - 1200);
  if (d < 1400) return { h: 34, jitter: 16 };
  if (d < 2600) return { h: 20, jitter: 12 };
  return { h: 12, jitter: 8 };
}

function isSpecial(bx, by, bw, bh) {
  const c = { x: bx + bw / 2, y: by + bh / 2 };
  if (rectsContain(DOCKS, c)) return 'docks';
  if (rectsContain(AIRFIELD, c)) return 'airfield';
  if (rectsContain(PARK, c)) return 'park';
  return null;
}

function rectsContain(r, p) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function buildWorld(seed) {
  const rng = new RNG(seed >>> 0);
  const world = {
    seed,
    roadV: ROAD_V,
    roadH: ROAD_H,
    vSpan: V_SPAN,
    hSpan: H_SPAN,
    water: WATER,
    sand: SAND,
    park: PARK,
    docks: DOCKS,
    airfield: AIRFIELD,
    runway: RUNWAY,
    landmarks: LANDMARKS,
    parkedSpawns: PARKED.slice(),
    buildings: [],
    props: [],          // palms, benches, crates (non-solid decoration + small solids)
    solids: [],         // axis-aligned rects blocking cars+peds+player
    piers: [],
    containers: [],
    cranes: [],
    ship: { x: 3320, y: 30, w: 460, h: 130 },
    hangars: [
      { x: 3050, y: 2480, w: 190, h: 130 },
      { x: 3330, y: 2480, w: 190, h: 130 },
    ],
    tower: { x: 3960, y: 2470, w: 64, h: 64 },
    lights: [],
    minimap: null,
  };

  // ---- traffic lights at interior intersections
  for (const vx of ROAD_V) {
    for (const hy of ROAD_H) {
      world.lights.push({ x: vx, y: hy, t: rng.range(0, CFG.LIGHT_CYCLE) });
    }
  }

  // ---- city blocks with buildings
  const inset = CFG.ROAD_HALF + CFG.SIDEWALK + 8;
  for (let i = 0; i < ROAD_V.length - 1; i++) {
    for (let j = 0; j < ROAD_H.length - 1; j++) {
      const bx = ROAD_V[i] + inset;
      const by = ROAD_H[j] + inset;
      const bw = ROAD_V[i + 1] - ROAD_V[i] - inset * 2;
      const bh = ROAD_H[j + 1] - ROAD_H[j] - inset * 2;
      if (bw < 160 || bh < 160) continue;
      const kind = isSpecial(bx, by, bw, bh);
      if (kind === 'park' || kind === 'docks') continue;
      if (kind === 'airfield') continue;
      fillBlock(world, rng, bx, by, bw, bh, ROAD_H[j], ROAD_V[i]);
    }
  }

  // ---- landmark buildings (replace/guarantee key structures)
  placeLandmarkBuildings(world, rng);

  // ---- palms along the beach + streets
  scatterPalms(world, rng);

  // ---- docks
  buildDocks(world, rng);

  // ---- airfield
  buildAirfield(world, rng);

  // ---- park details
  buildPark(world, rng);

  world.minimap = buildMinimap(world);
  return world;
}

function fillBlock(world, rng, bx, by, bw, bh, hy, vx) {
  const dh = districtHeight(bx + bw / 2, by + bh / 2);
  const cols = bw > 460 && rng.chance(0.7) ? 2 : 1;
  const rows = bh > 460 && rng.chance(0.7) ? 2 : 1;
  const cw = bw / cols, ch = bh / rows;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (rng.chance(0.08)) continue; // occasional empty lot
      const pad = rng.range(10, 26);
      const x = bx + c * cw + pad;
      const y = by + r * ch + pad;
      const w = cw - pad * 2 - rng.range(0, 14);
      const h = ch - pad * 2 - rng.range(0, 14);
      if (w < 70 || h < 70) continue;
      const base = rng.pick(['#262733', '#2b2c3a', '#232430', '#2f3040', '#262637']);
      const neon = rng.chance(0.42) ? rng.pick(CFG.NEON) : null;
      const hgt = Math.round(dh.h + rng.range(0, dh.jitter));
      world.buildings.push({
        x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
        z: hgt, base, roof: shade(base, 0.16), neon,
        trim: rng.chance(0.3) ? rng.pick(CFG.NEON) : null,
        ac: rng.chance(0.6),
      });
      world.solids.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    }
  }
}

function placeLandmarkBuildings(world, rng) {
  const put = (x, y, w, h, z, base, roof, neon, trim) => {
    // remove overlapping generic buildings/solids first
    world.buildings = world.buildings.filter((b) => !(x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y));
    world.solids = world.solids.filter((b) => !(x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y));
    world.buildings.push({ x, y, w, h, z, base, roof, neon, trim, ac: true, tag: true });
    world.solids.push({ x, y, w, h });
  };
  put(1300, 700, 200, 150, 10, '#3c3140', '#4a3d50', '#ff2d78', null);        // hospital (palm cross neon)
  put(2500, 2500, 190, 150, 10, '#27304a', '#2f3a5c', '#00e5ff', null);       // police station
  put(2500, 1300, 170, 130, 8, '#3a2b28', '#4a3833', '#ffd24a', null);        // Rico's diner
  put(3100, 1900, 200, 150, 9, '#2b332c', '#374437', '#7cff4f', null);        // Sunrise Garage
  put(700, 2500, 180, 140, 8, '#2f2a38', '#3a3446', '#b46bff', null);         // safehouse
  put(3470, 640, 260, 170, 14, '#33302a', '#413d34', '#ff7a1a', null);        // rival warehouse
}

function scatterPalms(world, rng) {
  // beach rows
  for (let x = 300; x < 4200; x += rng.range(120, 260)) {
    world.props.push(mkPalm(x, rng.range(240, 380), rng));
    world.props.push(mkPalm(x + rng.range(40, 90), rng.range(3400, 3460), rng));
  }
  // ocean drive (east sand)
  for (let y = 500; y < 3200; y += rng.range(150, 300)) {
    world.props.push(mkPalm(rng.range(4330, 4460), y, rng));
  }
  // a few street palms near corners
  for (const vx of ROAD_V) {
    for (const hy of ROAD_H) {
      if (rng.chance(0.35)) world.props.push(mkPalm(vx + 84, hy + 84, rng));
      if (rng.chance(0.35)) world.props.push(mkPalm(vx - 84, hy - 84, rng));
    }
  }
}

function mkPalm(x, y, rng) {
  return { kind: 'palm', x: Math.round(x), y: Math.round(y), r: 9, s: rng.range(0.85, 1.2), sway: rng.range(0, TAU6()) };
}

function TAU6() { return Math.PI * 2; }

// ---------------------------------------------------------------- districts

function buildDocks(world, rng) {
  world.piers = [
    { x: 3060, y: 120, w: 84, h: 400 },
    { x: 3480, y: 120, w: 84, h: 400 },
    { x: 3900, y: 120, w: 84, h: 400 },
  ];
  // container stacks
  const spots = [
    [2960, 560], [2960, 640], [3040, 560], [3160, 700], [3160, 780],
    [3560, 560], [3560, 860], [3640, 560], [3760, 720], [3760, 800],
    [3860, 560], [4060, 560], [4060, 640], [4140, 560], [4140, 980],
    [2960, 900], [3240, 940], [3980, 900], [4060, 900],
  ];
  for (const [x, y] of spots) {
    const cont = { x, y, w: 84, h: 34, col: rng.pick(['#8a3b46', '#2f5f8a', '#c8a23c', '#2f7a4f', '#b46bff']) };
    world.containers.push(cont);
    world.solids.push({ x, y, w: 84, h: 34 });
    if (rng.chance(0.4)) {
      const c2 = { x: x + 8, y: y - 30, w: 70, h: 28, col: rng.pick(['#c85a2f', '#5a6272', '#8a2f5f']) };
      world.containers.push(c2);
    }
  }
  // cranes at pier roots
  world.cranes = [
    { x: 3040, y: 520, dir: 1 },
    { x: 3940, y: 520, dir: -1 },
  ];
  for (const cr of world.cranes) world.solids.push({ x: cr.x - 20, y: cr.y - 20, w: 40, h: 40 });
  // gate booths
  world.solids.push({ x: 3270, y: 470, w: 26, h: 26 });
  world.solids.push({ x: 3330, y: 470, w: 26, h: 26 });
  world.props.push({ kind: 'gate', x: 3300, y: 470 });
}

function buildAirfield(world, rng) {
  for (const hg of world.hangars) {
    world.solids.push({ x: hg.x, y: hg.y, w: hg.w, h: hg.h });
    hg.col = rng.pick(['#3a3f4c', '#34404a']);
  }
  world.solids.push({ x: world.tower.x, y: world.tower.y, w: world.tower.w, h: world.tower.h });
  // windsock prop
  world.props.push({ kind: 'windsock', x: 4120, y: 2700 });
  // a couple of parked crates
  world.containers.push({ x: 3500, y: 2620, w: 84, h: 34, col: '#8a3b46' });
  world.solids.push({ x: 3500, y: 2620, w: 84, h: 34 });
}

function buildPark(world, rng) {
  // pond (solid for cars/peds)
  world.pond = { x: 1930, y: 1330, w: 200, h: 150 };
  world.solids.push(world.pond);
  for (let i = 0; i < 8; i++) {
    world.props.push(mkPalm(rng.range(PARK.x + 30, PARK.x + PARK.w - 30), rng.range(PARK.y + 30, PARK.y + PARK.h - 30), rng));
  }
  for (let i = 0; i < 5; i++) {
    world.props.push({ kind: 'bench', x: rng.range(PARK.x + 40, PARK.x + PARK.w - 40), y: rng.range(PARK.y + 40, PARK.y + PARK.h - 40) });
  }
}

// ---------------------------------------------------------------- minimap

function buildMinimap(world) {
  const scale = 0.13;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(CFG.WORLD_W * scale);
  cv.height = Math.ceil(CFG.WORLD_H * scale);
  const c = cv.getContext('2d');
  c.fillStyle = '#20242c';
  c.fillRect(0, 0, cv.width, cv.height);
  // sand + water
  c.fillStyle = '#5a4c30';
  for (const s of world.sand) c.fillRect(s.x * scale, s.y * scale, s.w * scale, s.h * scale);
  c.fillStyle = '#123a5e';
  for (const w of world.water) c.fillRect(w.x * scale, w.y * scale, w.w * scale, w.h * scale);
  // park
  c.fillStyle = '#1c4a2e';
  c.fillRect(world.park.x * scale, world.park.y * scale, world.park.w * scale, world.park.h * scale);
  // roads
  c.strokeStyle = '#4a4c56';
  c.lineWidth = Math.max(1.4, CFG.ROAD_HALF * 2 * scale);
  c.beginPath();
  for (const vx of world.roadV) {
    c.moveTo(vx * scale, world.vSpan.min * scale);
    c.lineTo(vx * scale, world.vSpan.max * scale);
  }
  for (const hy of world.roadH) {
    c.moveTo(world.hSpan.min * scale, hy * scale);
    c.lineTo(world.hSpan.max * scale, hy * scale);
  }
  c.stroke();
  // runway
  c.fillStyle = '#3a3d46';
  c.fillRect(world.runway.x * scale, world.runway.y * scale, world.runway.w * scale, world.runway.h * scale);
  // buildings
  c.fillStyle = '#171821';
  for (const b of world.buildings) c.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
  for (const b of world.hangars) c.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
  c.fillRect(world.tower.x * scale, world.tower.y * scale, world.tower.w * scale, world.tower.h * scale);
  c.fillStyle = '#41352a';
  for (const ct of world.containers) c.fillRect(ct.x * scale, ct.y * scale, ct.w * scale, ct.h * scale);
  return { canvas: cv, scale };
}

// ---------------------------------------------------------------- queries

export function isWater(x, y) {
  for (const w of WATER) {
    if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  }
  return false;
}

export function isWaterPoint(x, y) {
  return isWater(x, y);
}

export function isOnRoad(x, y) {
  if (y >= V_SPAN.min - 10 && y <= V_SPAN.max + 10) {
    for (const vx of ROAD_V) if (Math.abs(x - vx) <= CFG.ROAD_HALF + 2) return true;
  }
  if (x >= H_SPAN.min - 10 && x <= H_SPAN.max + 10) {
    for (const hy of ROAD_H) if (Math.abs(y - hy) <= CFG.ROAD_HALF + 2) return true;
  }
  return false;
}

/** dir: 0=E 1=S 2=W 3=N */
export function dirVec(dir) {
  return [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }][dir & 3];
}

/** lateral lane offset keeping right-hand traffic */
export function laneShift(dir) {
  return [{ x: 0, y: CFG.LANE_OFF }, { x: -CFG.LANE_OFF, y: 0 }, { x: 0, y: -CFG.LANE_OFF }, { x: CFG.LANE_OFF, y: 0 }][dir & 3];
}

/** next intersection ahead in dir from (x,y); null when none. */
export function nextIntersection(x, y, dir) {
  if (dir === 0) {
    for (const vx of ROAD_V) if (vx > x + CFG.ROAD_HALF + 4) return { x: vx, y: snapRoadH(y) };
    return null;
  }
  if (dir === 2) {
    for (let i = ROAD_V.length - 1; i >= 0; i--) if (ROAD_V[i] < x - CFG.ROAD_HALF - 4) return { x: ROAD_V[i], y: snapRoadH(y) };
    return null;
  }
  if (dir === 1) {
    for (const hy of ROAD_H) if (hy > y + CFG.ROAD_HALF + 4) return { x: snapRoadV(x), y: hy };
    return null;
  }
  for (let i = ROAD_H.length - 1; i >= 0; i--) if (ROAD_H[i] < y - CFG.ROAD_HALF - 4) return { x: snapRoadV(x), y: ROAD_H[i] };
  return null;
}

function snapRoadH(y) {
  let best = ROAD_H[0], bd = Math.abs(y - best);
  for (const hy of ROAD_H) {
    const d = Math.abs(y - hy);
    if (d < bd) { bd = d; best = hy; }
  }
  return best;
}

function snapRoadV(x) {
  let best = ROAD_V[0], bd = Math.abs(x - best);
  for (const vx of ROAD_V) {
    const d = Math.abs(x - vx);
    if (d < bd) { bd = d; best = vx; }
  }
  return best;
}

/** can a dir continue past intersection (ix,iy)? */
export function dirExists(dir, ix, iy) {
  if (dir === 0) return ix < ROAD_V[ROAD_V.length - 1] - 4;
  if (dir === 2) return ix > ROAD_V[0] + 4;
  if (dir === 1) return iy < ROAD_H[ROAD_H.length - 1] - 4;
  return iy > ROAD_H[0] + 4;
}

/** random point on a lane, biased to stay near `near` when given. */
export function randomLanePoint(rng, near, maxD) {
  for (let tries = 0; tries < 40; tries++) {
    const vertical = rng.chance(0.5);
    let dir, x, y;
    if (vertical) {
      const vx = rng.pick(ROAD_V);
      dir = rng.chance(0.5) ? 1 : 3;
      y = rng.range(V_SPAN.min + 80, V_SPAN.max - 80);
      x = vx + laneShift(dir).x;
    } else {
      const hy = rng.pick(ROAD_H);
      dir = rng.chance(0.5) ? 0 : 2;
      x = rng.range(H_SPAN.min + 80, H_SPAN.max - 80);
      y = hy + laneShift(dir).y;
    }
    if (near && maxD && Math.hypot(x - near.x, y - near.y) > maxD) continue;
    return { x, y, dir };
  }
  return { x: 2300 + CFG.LANE_OFF, y: 1100, dir: 1 };
}

/** random sidewalk point (for peds) inside the city, avoiding solids. */
export function randomSidewalkPoint(rng, solids) {
  for (let tries = 0; tries < 50; tries++) {
    const vertical = rng.chance(0.5);
    let x, y;
    if (vertical) {
      const vx = rng.pick(ROAD_V);
      const side = rng.chance(0.5) ? 1 : -1;
      x = vx + side * (CFG.ROAD_HALF + rng.range(4, CFG.SIDEWALK - 2));
      y = rng.range(V_SPAN.min + 60, V_SPAN.max - 60);
    } else {
      const hy = rng.pick(ROAD_H);
      const side = rng.chance(0.5) ? 1 : -1;
      y = hy + side * (CFG.ROAD_HALF + rng.range(4, CFG.SIDEWALK - 2));
      x = rng.range(H_SPAN.min + 60, H_SPAN.max - 60);
    }
    if (isWater(x, y)) continue;
    let bad = false;
    for (const s of solids) {
      if (x > s.x - 6 && x < s.x + s.w + 6 && y > s.y - 6 && y < s.y + s.h + 6) { bad = true; break; }
    }
    if (bad) continue;
    return { x, y };
  }
  return { x: 2360, y: 1160 };
}

/** is there a traffic light at (x,y) and is `dir` red right now? */
export function lightRed(world, ix, iy, dir, time) {
  for (const l of world.lights) {
    if (l.x === ix && l.y === iy) {
      const phase = Math.floor((l.t + time) / CFG.LIGHT_CYCLE) % 2;
      // phase 0: N-S green (dirs 1,3); phase 1: E-W green (dirs 0,2)
      const dirNS = dir === 1 || dir === 3;
      const frac = ((l.t + time) % CFG.LIGHT_CYCLE) / CFG.LIGHT_CYCLE;
      const amber = frac > 1 - CFG.LIGHT_AMBER / CFG.LIGHT_CYCLE;
      const green = dirNS ? phase === 0 : phase === 1;
      return !green || amber;
    }
  }
  return false;
}

export function buildSpawns(world) {
  return {
    playerStart: { x: 575, y: 2440 },
    hospital: { x: 1430, y: 880 },
    police: { x: 2600, y: 2680 },
    safehouse: { x: 640, y: 2600 },
  };
}
