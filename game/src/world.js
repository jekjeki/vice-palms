// world.js — deterministic night-coastal city: road grid, districts, buildings,
// docks, airfield, beach, park. Also owns solid collision queries and spawn
// points. No entity logic lives here.

import { CFG } from './config.js';
import { mulberry32, hash2, clamp, pointInRect, circleRectPush, dist } from './util.js';

export const RE = CFG.roadEvery;      // 800
export const RH = CFG.roadHalf;       // 45
const SW = CFG.sidewalk;       // 22

export const DIRS = [
  { dx: 1, dy: 0 },   // 0 east
  { dx: 0, dy: 1 },   // 1 south
  { dx: -1, dy: 0 },  // 2 west
  { dx: 0, dy: -1 },  // 3 north
];

// vertical road i exists at x = i*RE (i: 0..8); horizontal road j at y = j*RE
// but only j: 1..7 (j=0 and j=8 rows fall in the ocean).
export const J_MIN = 1, J_MAX = 7, I_MIN = 0, I_MAX = 8;

export function zoneAt(x, y) {
  if (y < CFG.waterTop || y > CFG.waterBottom) return 'water';
  if (y > CFG.beachTop) return 'beach';
  const p = CFG.park;
  if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) return 'park';
  const a = CFG.airfield;
  if (x >= a.x0 && x < a.x1 && y >= a.y0 && y < a.y1) return 'airfield';
  const d = CFG.docks;
  if (x >= d.x0 && y < d.y1) return 'docks';
  const dt = CFG.downtown;
  if (x >= dt.x0 && x < dt.x1 && y >= dt.y0 && y < dt.y1) return 'downtown';
  return 'residential';
}

export function isWater(x, y) {
  return y < CFG.waterTop || y > CFG.waterBottom;
}

// ---------------------------------------------------------------- world ---
export function buildWorld(seed = 1337) {
  const rng = mulberry32(seed);
  const w = {
    size: CFG.map,
    buildings: [],     // {x0,y0,x1,y1,h,zone,neon,trim,roofId,solid:true}
    props: [],         // {type,x,y,a,extra} — trees, palms, containers, cranes...
    piers: [],         // rects walkable over water
    billboards: [],    // {x,y,text,color,bw} neon ads
    busStops: [],      // {x,y}
    waterBlockedCache: null,
    pickups: [],       // {type,x,y,taken,respawn}
    parkedSpawns: [],  // {x,y,angle,type}
    lamps: [],         // {x,y} street lights (visual pools)
    roadNodes: [],     // [i][j] intersection centers (j 1..7)
    blockBuildings: new Map(),  // 'bi,bj' -> building list (render culling)
    solidsGrid: new Map(),      // 'bi,bj' -> solid rects (collision)
    spawns: {
      start:        { x: 2560, y: 3960 },
      hospital:     { x: 2075, y: 1245 },
      policeStation:{ x: 4475, y: 2845 },
      diner:        { x: 2600, y: 3905 },
      lockup:       { x: 2215, y: 4415 },
      garage:       { x: 3610, y: 1330 },
      docksGate:    { x: 3305, y: 1685 },
      docksYard:    { x: 5200, y: 800 },
      tower:        { x: 3040, y: 1010 },
      airfieldTower:{ x: 700,  y: 2760 },
      airfieldPad:  { x: 950,  y: 2250 },
      beach:        { x: 4030, y: 5900 },
      beachWest:    { x: 4620, y: 5850 },
      pierEnd:      { x: 5450, y: 300 },
    },
  };

  genRoadNodes(w);
  genBlocks(w, rng);
  genDocksWaterfront(w, rng);
  genAirfield(w);
  genPark(w, rng);
  genBeach(w, rng);
  genLamps(w);
  genStreetFurniture(w);
  genPickups(w);
  indexSolids(w);

  return w;
}

// ------------------------------------------------------------ road grid ---
function genRoadNodes(w) {
  for (let i = I_MIN; i <= I_MAX; i++) {
    w.roadNodes[i] = [];
    for (let j = J_MIN; j <= J_MAX; j++) {
      w.roadNodes[i][j] = { x: i * RE, y: j * RE };
    }
  }
}

function nodeValid(i, j) { return i >= I_MIN && i <= I_MAX && j >= J_MIN && j <= J_MAX; }

// nearest lane point on the grid for a world position (used by traffic spawn)
export function nearestRoadPoint(world, x, y) {
  const i = clamp(Math.round(x / RE), I_MIN, I_MAX);
  const j = clamp(Math.round(y / RE), J_MIN, J_MAX);
  // choose the closer axis
  const dxAxis = Math.abs(y - j * RE);
  const dyAxis = Math.abs(x - i * RE);
  if (dyAxis <= dxAxis) {
    return { x: i * RE + CFG.laneOff, y: clamp(y, J_MIN * RE, J_MAX * RE), dir: 1, axis: 'v', i, j };
  }
  return { x: clamp(x, I_MIN * RE, I_MAX * RE), y: j * RE + CFG.laneOff, dir: 0, axis: 'h', i, j };
}

// ---------------------------------------------------------------- blocks --
// Blocks run between road centerlines: block (bi,bj) covers
// x in [bi*800, (bi+1)*800), y in [bj*800, (bj+1)*800). Only bj: 0..6 land
// blocks above the beach; bj=7 is the beach fringe.
function genBlocks(w, rng) {
  for (let bi = 0; bi < 8; bi++) {
    for (let bj = 0; bj < 8; bj++) {
      const cx = bi * RE + RE / 2;
      const cy = bj * RE + RE / 2;
      const zone = zoneAt(cx, cy);
      if (zone === 'water') continue;
      const list = [];
      w.blockBuildings.set(bi + ',' + bj, list);

      if (zone === 'park') { genParkBlock(w, bi, bj, list, rng); continue; }
      if (zone === 'airfield') { continue; }            // fixed layout below
      if (zone === 'docks') { genDockBlock(w, bi, bj, list, rng); continue; }
      if (zone === 'beach') { genBeachBlock(w, bi, bj, list, rng); continue; }

      // interior area between sidewalks
      const ax0 = bi * RE + RH + SW, ax1 = (bi + 1) * RE - RH - SW;
      const ay0 = bj * RE + RH + SW, ay1 = (bj + 1) * RE - RH - SW;
      if (zone === 'downtown') genDowntownBlock(w, bi, bj, ax0, ay0, ax1, ay1, list, rng);
      else genResiBlock(w, bi, bj, ax0, ay0, ax1, ay1, list, rng);
    }
  }
}

function addBuilding(w, bi, bj, b) {
  b.solid = true;
  w.buildings.push(b);
  const key = bi + ',' + bj;
  if (!w.blockBuildings.has(key)) w.blockBuildings.set(key, []);
  w.blockBuildings.get(key).push(b);
}

function genDowntownBlock(w, bi, bj, ax0, ay0, ax1, ay1, list, rng) {
  const h = hash2(bi, bj);
  const nTowers = 1 + ((h * 2.7) | 0);       // 1-2 towers
  for (let t = 0; t < nTowers; t++) {
    const tw = 190 + rng() * 140;
    const th = 190 + rng() * 140;
    const px = t === 0 ? ax0 + rng() * 90 : ax1 - tw - rng() * 90;
    const py = t === 0 ? ay0 + rng() * 90 : ay1 - th - rng() * 90;
    addBuilding(w, bi, bj, {
      x0: px, y0: py, x1: Math.min(px + tw, ax1), y1: Math.min(py + th, ay1),
      h: 6 + ((rng() * 12) | 0),
      zone: 'downtown',
      neon: rng() < 0.65 ? CFG.neons[(rng() * CFG.neons.length) | 0] : null,
      trim: rng() < 0.4,
    });
  }
  // filler low building
  if (rng() < 0.7) {
    const fw = 90 + rng() * 70, fh = 90 + rng() * 70;
    addBuilding(w, bi, bj, {
      x0: ax0 + (ax1 - ax0 - fw) * rng(), y0: ay0 + (ay1 - ay0 - fh) * rng(),
      x1: 0, y1: 0, // fixed below
      h: 2 + ((rng() * 2) | 0), zone: 'downtown',
      neon: rng() < 0.5 ? CFG.neons[(rng() * CFG.neons.length) | 0] : null,
    });
    const b = list[list.length - 1];
    b.x1 = b.x0 + fw; b.y1 = b.y0 + fh;
  }
}

function genResiBlock(w, bi, bj, ax0, ay0, ax1, ay1, list, rng) {
  // two rows of shops/houses along the block, alley through the middle
  const rows = [[ay0, ay0 + 240], [ay1 - 240, ay1]];
  for (let r = 0; r < 2; r++) {
    let x = ax0;
    const y0 = rows[r][0], y1 = rows[r][1];
    while (x < ax1 - 60) {
      const bw = 90 + rng() * 110;
      if (x + bw > ax1) break;
      const gap = rng() < 0.25 ? 26 + rng() * 30 : 8 + rng() * 10;
      addBuilding(w, bi, bj, {
        x0: x, y0, x1: x + bw, y1,
        h: 1 + ((rng() * 3) | 0),
        zone: 'residential',
        neon: rng() < 0.18 ? CFG.neons[(rng() * CFG.neons.length) | 0] : null,
        pastel: true,
      });
      x += bw + gap;
    }
  }
  // mid-block garage sometimes
  if (rng() < 0.4) {
    const gw = 120 + rng() * 80;
    const gx = ax0 + (ax1 - ax0 - gw) / 2;
    addBuilding(w, bi, bj, {
      x0: gx, y0: ay0 + 300, x1: gx + gw, y1: ay0 + 300 + 130,
      h: 1, zone: 'residential', neon: null,
    });
  }
}

function genParkBlock(w, bi, bj, list, rng) {
  // trees + benches are props (added in genPark)
}

function genDockBlock(w, bi, bj, list, rng) {
  const ax0 = bi * RE + RH + SW, ax1 = (bi + 1) * RE - RH - SW;
  const ay0 = bj * RE + RH + SW, ay1 = (bj + 1) * RE - RH - SW;
  // warehouse
  addBuilding(w, bi, bj, {
    x0: ax0 + 10, y0: ay0 + 30, x1: ax0 + 320, y1: ay0 + 230,
    h: 2, zone: 'docks', neon: null, dock: true,
  });
  // container stacks
  const contColors = ['#c2453f', '#3f7fc2', '#3fae6e', '#c2a13f', '#8a5cc2'];
  const nCont = 6 + ((rng() * 7) | 0);
  for (let c = 0; c < nCont; c++) {
    const cw = 84, ch = 36;
    const px = ax0 + 20 + rng() * (ax1 - ax0 - cw - 40);
    const py = ay0 + 260 + rng() * (ay1 - ay0 - ch - 280);
    const stack = rng() < 0.3 ? 2 : 1;
    w.props.push({
      type: 'container', x: px + cw / 2, y: py + ch / 2, a: rng() < 0.25 ? Math.PI / 2 : 0,
      w: cw, h: ch, stack, color: contColors[(rng() * contColors.length) | 0], solid: true,
      rect: { x0: px, y0: py, x1: px + cw, y1: py + ch },
    });
  }
  // crane every other block
  if ((bi % 2) === 0) {
    w.props.push({ type: 'crane', x: bi * RE + 400, y: 470, a: 0, solid: false });
  }
}

function genBeachBlock(w, bi, bj, list, rng) {
  // umbrellas + palms
  for (let u = 0; u < 3; u++) {
    if (rng() < 0.6) {
      w.props.push({ type: 'umbrella', x: bi * RE + 120 + rng() * 560, y: 5720 + rng() * 260, a: 0, solid: false });
    }
  }
  for (let p = 0; p < 4; p++) {
    w.props.push({ type: 'palm', x: bi * RE + 60 + rng() * 680, y: 5665 + rng() * 320, a: 0, solid: false, big: true });
  }
}

// --------------------------------------------------- docks waterfront -----
function genDocksWaterfront(w, rng) {
  // piers: walkable platforms over water
  w.piers.push({ x0: 4300, y0: 250, x1: 4700, y1: CFG.waterTop });
  w.piers.push({ x0: 5250, y0: 250, x1: 5650, y1: CFG.waterTop });
  // dock edge fences along y = waterTop for the docks span
  for (let bi = 4; bi < 8; bi++) {
    // a ship silhouette in the water (visual only, north of the piers)
  }
  w.props.push({ type: 'ship', x: 4650, y: 150, a: 0, solid: false });
  w.props.push({ type: 'ship', x: 5900, y: 130, a: 0.06, solid: false });
  // bollards + crates along the quay
  for (let x = 3300; x < 6350; x += 130) {
    if (rng() < 0.25) w.props.push({ type: 'crate', x, y: 330, a: rng() * Math.PI, solid: true, rect: { x0: x - 14, y0: 316, x1: x + 14, y1: 344 } });
  }
}

// -------------------------------------------------------------- airfield --
function genAirfield(w) {
  // runway: long horizontal strip crossing the grid road (painted under it)
  w.props.push({ type: 'runway', x: 800, y: 2400, a: 0, solid: false,
    rect: { x0: 60, y0: 2350, x1: 1580, y1: 2450 } });
  // taxiway
  w.props.push({ type: 'taxiway', x: 820, y: 2600, a: 0, solid: false,
    rect: { x0: 100, y0: 2560, x1: 1400, y1: 2620 } });
  // hangars
  addBuilding(w, 0, 3, { x0: 120, y0: 2680, x1: 520, y1: 2890, h: 2, zone: 'airfield', neon: null, hangar: true });
  addBuilding(w, 1, 2, { x0: 900, y0: 1800, x1: 1300, y1: 2010, h: 2, zone: 'airfield', neon: null, hangar: true });
  // control tower (small, tall)
  addBuilding(w, 0, 3, { x0: 640, y0: 2700, x1: 760, y1: 2820, h: 9, zone: 'airfield', neon: CFG.colors.neonGreen, tower: true });
  // parked planes (props)
  w.props.push({ type: 'plane', x: 400, y: 2400, a: 0, solid: true, rect: { x0: 300, y0: 2340, x1: 500, y1: 2460 } });
  w.props.push({ type: 'plane', x: 1100, y: 2400, a: 0, solid: true, rect: { x0: 1000, y0: 2340, x1: 1200, y1: 2460 } });
  w.props.push({ type: 'plane', x: 700, y: 2600, a: Math.PI / 2, solid: true, rect: { x0: 640, y0: 2500, x1: 760, y1: 2700 } });
  // windsock
  w.props.push({ type: 'windsock', x: 1500, y: 2330, a: 0, solid: false });
}

// ------------------------------------------------------------------ park --
function genPark(w, rng) {
  const p = CFG.park;
  // pond
  w.props.push({ type: 'pond', x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 + 60, a: 0, solid: false,
    rx: 210, ry: 130 });
  // palm + tree rows, benches, fountains
  for (let i = 0; i < 26; i++) {
    const px = p.x0 + 60 + rng() * (p.x1 - p.x0 - 120);
    const py = p.y0 + 60 + rng() * (p.y1 - p.y0 - 120);
    const dpond = dist(px, py, (p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2 + 60);
    if (dpond < 260) continue;
    w.props.push({ type: rng() < 0.5 ? 'palm' : 'tree', x: px, y: py, a: rng() * Math.PI, solid: false, big: true });
  }
  for (let i = 0; i < 6; i++) {
    w.props.push({ type: 'bench', x: p.x0 + 100 + (i % 3) * 260, y: i < 3 ? p.y0 + 120 : p.y1 - 120, a: 0, solid: false });
  }
  w.props.push({ type: 'fountain', x: p.x0 + 400, y: p.y0 + 700, a: 0, solid: true, rect: { x0: p.x0 + 360, y0: p.y0 + 660, x1: p.x0 + 440, y1: p.y0 + 740 } });
}

// ----------------------------------------------------------------- beach --
function genBeach(w, rng) {
  // palms along the boardwalk
  for (let x = 60; x < 6340; x += 170) {
    if (rng() < 0.7) w.props.push({ type: 'palm', x, y: 5630, a: 0, solid: false, big: true });
  }
  // lifeguard huts
  for (let i = 0; i < 3; i++) {
    const x = 1400 + i * 1900;
    w.props.push({ type: 'hut', x, y: 5980, a: 0, solid: true, rect: { x0: x - 40, y0: 5950, x1: x + 40, y1: 6010 } });
  }
}

// ----------------------------------------------------------------- lamps --
function genLamps(w) {
  for (let i = I_MIN; i <= I_MAX; i++) {
    for (let j = J_MIN; j <= J_MAX; j++) {
      w.lamps.push({ x: i * RE - RH - 6, y: j * RE - RH - 6 });
      w.lamps.push({ x: i * RE + RH + 6, y: j * RE + RH + 6 });
    }
  }
}

// ------------------------------------------------------------ billboards --
// Neon advertising billboards along the facades, plus bus stops, phone
// booths and dumpsters for street furniture.
const ADS = [
  { text: 'OASIS MOTEL', color: '#f05ec8' },
  { text: 'PALMS FM 88.3', color: '#37e0f0' },
  { text: 'VICE COLA', color: '#f5c04a' },
  { text: 'SUNSET BANK', color: '#4ae88a' },
  { text: 'GATOR GYM', color: '#ff5560' },
  { text: 'MALIBU CLUB', color: '#a06bf5' },
];

function genStreetFurniture(w) {
  const rng = mulberry32(9182);
  let ad = 0;
  for (let bi = 0; bi < 8; bi++) {
    for (let bj = 0; bj < 7; bj++) {
      const cx = bi * RE + RE / 2, cy = bj * RE + RE / 2;
      const zone = zoneAt(cx, cy);
      const wantAd = zone === 'downtown' ? rng() < 0.55 : zone === 'residential' ? rng() < 0.18 : false;
      if (wantAd) {
        const bb = ADS[ad % ADS.length];
        w.billboards.push({
          x: bi * RE + 400 + (rng() - 0.5) * 300,
          y: bj * RE + (rng() < 0.5 ? RH + 11 : RE - RH - 11),
          text: bb.text,
          color: bb.color,
          bw: 150 + rng() * 60,
        });
        ad++;
      }
      if (rng() < 0.16) {
        w.busStops.push({
          x: bi * RE + (rng() < 0.5 ? RH + 14 : RE - RH - 14),
          y: bj * RE + 120 + rng() * 560,
        });
      }
      if (rng() < 0.12) {
        const px = bi * RE + RH + 12;
        const py = bj * RE + 100 + rng() * 600;
        w.props.push({ type: 'phonebooth', x: px, y: py, a: 0, solid: true, rect: { x0: px - 8, y0: py - 14, x1: px + 8, y1: py + 14 } });
      }
      if (rng() < 0.2) {
        const dx = bi * RE + 200 + rng() * 400;
        const dy = bj * RE + 120 + rng() * 560;
        w.props.push({ type: 'dumpster', x: dx, y: dy, a: rng() < 0.5 ? 0 : Math.PI / 2, solid: true, rect: { x0: dx - 26, y0: dy - 14, x1: dx + 26, y1: dy + 14 } });
      }
    }
  }
}

// --------------------------------------------------------------- pickups --
function genPickups(w) {
  const P = [
    ['health', 2075, 1300], ['armor', 4475, 2900], ['ammo', 2560, 3860],
    ['cash', 3610, 1390], ['cash', 5300, 1700], ['ammo', 1100, 2300],
    ['health', 600, 5750], ['armor', 3050, 3850], ['cash', 5450, 300],
    ['ammo', 4900, 1200], ['health', 5200, 4300], ['cash', 1300, 4700],
    ['armor', 5900, 3300], ['cash', 2400, 5400], ['ammo', 6100, 5500],
    // heavy hardware hides in the docks and behind the airfield hangars
    ['shotgun', 4850, 1450], ['smg', 6100, 1000], ['shotgun', 1450, 3050],
    ['smg', 2620, 1250], ['shotgun', 5750, 5950], ['armor', 700, 3000],
    ['smg', 4300, 290], ['health', 3450, 5550], ['cash', 900, 4400],
  ];
  for (const [type, x, y] of P) w.pickups.push({ type, x, y, taken: 0, respawn: 0 });
}

// ---------------------------------------------------- solid indexing ------
function indexSolids(w) {
  for (const b of w.buildings) indexRect(w, b, b.x0, b.y0, b.x1, b.y1);
  for (const p of w.props) {
    if (p.solid && p.rect) indexRect(w, p, p.rect.x0, p.rect.y0, p.rect.x1, p.rect.y1);
  }
}

function indexRect(w, obj, x0, y0, x1, y1) {
  const bi0 = Math.floor(x0 / RE), bi1 = Math.floor(x1 / RE);
  const bj0 = Math.floor(y0 / RE), bj1 = Math.floor(y1 / RE);
  for (let bi = bi0; bi <= bi1; bi++) {
    for (let bj = bj0; bj <= bj1; bj++) {
      const key = bi + ',' + bj;
      let arr = w.solidsGrid.get(key);
      if (!arr) { arr = []; w.solidsGrid.set(key, arr); }
      arr.push(obj);
    }
  }
}

// solids overlapping a circle (building rects + solid props)
export function solidsNear(w, x, y, r) {
  const out = [];
  const bi0 = Math.floor((x - r) / RE), bi1 = Math.floor((x + r) / RE);
  const bj0 = Math.floor((y - r) / RE), bj1 = Math.floor((y + r) / RE);
  for (let bi = bi0; bi <= bi1; bi++) {
    for (let bj = bj0; bj <= bj1; bj++) {
      const arr = w.solidsGrid.get(bi + ',' + bj);
      if (arr) for (const s of arr) out.push(s);
    }
  }
  return out;
}

export function buildingAt(w, x, y) {
  for (const s of solidsNear(w, x, y, 2)) {
    if (s.x0 !== undefined && x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1) return s;
  }
  return null;
}

function onPier(w, x, y) {
  for (const p of w.piers) {
    if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) return true;
  }
  return false;
}

// water that blocks movement (ocean minus piers)
export function waterBlocked(w, x, y) {
  if (!isWater(x, y)) return false;
  return !onPier(w, x, y);
}

// on-road check: distance to nearest road centerline on both axes
export function roadInfo(w, x, y) {
  const i = Math.round(x / RE);
  const j = Math.round(y / RE);
  const dx = Math.abs(x - i * RE);
  const dy = Math.abs(y - j * RE);
  const onV = i >= I_MIN && i <= I_MAX && dx <= RH && y >= CFG.waterTop && y <= CFG.waterBottom;
  const onH = j >= J_MIN && j <= J_MAX && dy <= RH && x >= -RH && x <= CFG.map + RH;
  return { on: onV || onH, onV, onH, i, j, dx, dy };
}

// random point on a legal road lane
export function randomRoadPoint(w, rng) {
  for (let tries = 0; tries < 40; tries++) {
    const vertical = rng() < 0.5;
    if (vertical) {
      const i = I_MIN + ((rng() * (I_MAX - I_MIN + 1)) | 0);
      const j = J_MIN + ((rng() * (J_MAX - J_MIN + 1)) | 0);
      const dir = rng() < 0.5 ? 1 : 3;    // S or N
      const x = i * RE + (dir === 1 ? -CFG.laneOff : CFG.laneOff);
      const y = j * RE + rng() * RE;
      if (y < CFG.waterTop + 120 || y > CFG.beachTop) continue;
      if (zoneAt(x, y) === 'park') continue;
      return { x, y, dir, axis: 'v' };
    } else {
      const j = J_MIN + ((rng() * (J_MAX - J_MIN + 1)) | 0);
      const dir = rng() < 0.5 ? 0 : 2;    // E or W
      const y = j * RE + (dir === 0 ? CFG.laneOff : -CFG.laneOff);
      const x = rng() * CFG.map;
      if (y < CFG.waterTop + 120) continue;
      return { x, y, dir, axis: 'h' };
    }
  }
  return { x: 3200, y: 2400 + CFG.laneOff, dir: 0, axis: 'h' };
}

// road point roughly `aheadDist` in front of a heading (for roadblocks)
export function roadPointAhead(w, x, y, ang, aheadDist, rng) {
  const tx = x + Math.cos(ang) * aheadDist;
  const ty = y + Math.sin(ang) * aheadDist;
  return nearestRoadPoint(w, tx, ty);
}

// resolve a circle against nearby solids; returns true if pushed
export function resolveCircleSolids(w, ent, r) {
  let pushed = false;
  const list = solidsNear(w, ent.x, ent.y, r + 8);
  for (const s of list) {
    if (s.x0 === undefined) continue;
    const push = circleRectPush(ent.x, ent.y, r, s);
    if (push) {
      ent.x += push.x; ent.y += push.y;
      pushed = true;
    }
  }
  // water blocks land units
  if (waterBlocked(w, ent.x, ent.y)) {
    // step back toward map center until on land
    for (let step = 0; step < 30; step++) {
      ent.y -= 14;
      if (!waterBlocked(w, ent.x, ent.y)) break;
    }
    pushed = true;
  }
  // hard map bounds
  const m = 20;
  if (ent.x < m) { ent.x = m; pushed = true; }
  if (ent.x > w.size - m) { ent.x = w.size - m; pushed = true; }
  return pushed;
}

export { nodeValid };
