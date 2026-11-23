// world.js — deterministic night city: road grid, districts, docks, airfield, beach,
// solids + spatial grid, road-graph helpers for AI, collision resolution.
import { WW, WH, ROAD_W, LANE, SIDEWALK, clamp, dist, Rng } from './core.js';

export const VX = [];            // vertical road center xs
export const HY = [];            // horizontal road center ys (last = Ocean Drive)
const ROAD_HALF = ROAD_W / 2;
const CITY_X0 = 250, CITY_X1 = 5950;   // road span for horizontals
const CITY_Y0 = 250, CITY_Y1 = 4182;   // road span for verticals (ends at Ocean Drive edge)

export let world = null;

const NEON_TEXTS = ['CLUB OASIS', 'PAWN', '24H DINER', 'LIQUOR', 'CASINO', 'TATTOO', 'NEON', 'MOTEL', 'PALM MOTEL', 'OCEAN VIEW', 'MALIBU', 'VIP', 'GIRLS', 'BAR', 'HOTEL', 'POOLSIDE', 'KARAOKE', 'SUSHI'];
const NEON_COLS = ['#ff3fd4', '#00e5ff', '#ffe14d', '#7dff6b', '#ff5e5e', '#c17bff', '#ffb347'];
const HOUSE_COLS = ['#8a6f5c', '#9c8a72', '#7c8f8a', '#96756f', '#a08f76', '#6f8296', '#8f8f7c', '#7c6f8f'];
const DOWN_COLS = ['#2e3448', '#343a52', '#28304a', '#3a3f58', '#2a3550', '#38415e'];
const ROOF_COLS = ['#22263a', '#262b40', '#20243a', '#2a2f46'];
const BEACH_COLS = ['#e8a7b8', '#9fd8d0', '#f0d9a8', '#c9b8e8', '#a8c8e8', '#e8c8a0'];
const CONT_COLS = ['#b8453c', '#3c7ab8', '#3cb85c', '#b89a3c', '#8a5cb8', '#c47a3c'];

export function buildWorld(seed) {
  const rng = new Rng(seed ^ 0x9e3779b9);
  world = {
    seed, rng,
    blocks: [], buildings: [], solids: [], lamps: [], palms: [], neons: [], trees: [],
    containers: [], cranes: [], piers: [], props: [], pickups: [],
    water: [{ x: 0, y: 4400, w: WW, h: 400 }, { x: 0, y: 0, w: 1820, h: 260 }],
    sand: { x: 0, y: 4182, w: WW, h: 218 },
    park: { x: 2332, y: 2332, w: 736, h: 736 },
    ship: { x: 1180, y: 46, w: 560, h: 140 },
    runway: { x: 4740, y: 826, w: 1420, h: 84 },
    grid: new Map(), gridCell: 320,
    spawns: {},
  };
  for (let k = 0; k < 15; k++) VX.push(300 + 400 * k);
  for (let k = 0; k < 10; k++) HY.push(300 + 400 * k);
  HY.push(4150); // Ocean Drive

  makeBlocks(rng);
  makeDocklands(rng);
  makeAirfield(rng);
  makeBeachfront(rng);
  makeLandmarks(rng);
  makePickups(rng);
  makeLampsAndPalms(rng);
  indexSolids();
  defineSpawns();
  return world;
}

// ---------------------------------------------------------------- blocks & buildings
function blockType(i, j, rng) {
  const bx = VX[i] + 54, by = HY[j] + 54;
  if (bx < 1900 && by < 1154) return 'docks';
  if (bx >= 4732 && by < 1454) return 'airfield';
  if (bx >= 1900 && bx < 2700 && by >= 2300 && by < 3100) return 'park';
  if (j === 9) return 'beach';
  if (i >= 5 && i <= 8 && j >= 3 && j <= 7) return 'downtown';
  return 'residential';
}

function makeBlocks(rng) {
  for (let i = 0; i < 14; i++) for (let j = 0; j < 9; j++) {
    const x0 = VX[i] + ROAD_HALF, y0 = HY[j] + ROAD_HALF;
    const x1 = VX[i + 1] - ROAD_HALF, y1 = HY[j + 1] - ROAD_HALF;
    const type = blockType(i, j, rng);
    const b = { i, j, x0, y0, x1, y1, type, inner: { x: x0 + SIDEWALK, y: y0 + SIDEWALK, w: x1 - x0 - SIDEWALK * 2, h: y1 - y0 - SIDEWALK * 2 } };
    world.blocks.push(b);
    if (type === 'downtown') downtownBlock(b, rng);
    else if (type === 'residential') residentialBlock(b, rng);
    else if (type === 'beach') beachBlock(b, rng);
    else if (type === 'park') parkBlock(b, rng);
    else if (type === 'docks') docksBlock(b, rng);
    else airfieldBlock(b, rng);
  }
}

function addBuilding(x, y, w, h, c, roof, tall, rng) {
  const bld = { x, y, w, h, c, roof, tall, hsh: (rng.r() * 1e9) | 0 };
  world.buildings.push(bld);
  world.solids.push({ x, y, w, h });
  return bld;
}

function downtownBlock(b, rng) {
  const n = rng.chance(0.55) ? 1 : 2;
  if (n === 1) {
    const m = rng.ri(6, 20);
    const bl = addBuilding(b.inner.x + m, b.inner.y + m, b.inner.w - m * 2, b.inner.h - m * 2, rng.pick(DOWN_COLS), rng.pick(ROOF_COLS), true, rng);
    if (rng.chance(0.4)) addNeon(bl, rng);
    if (rng.chance(0.3)) world.props.push({ k: 'helipad', x: bl.x + bl.w / 2, y: bl.y + bl.h / 2 });
  } else {
    const gap = 26, split = rng.chance(0.5);
    const wA = split ? (b.inner.w - gap) * rng.rf(0.35, 0.65) : b.inner.w;
    const hA = split ? b.inner.h : (b.inner.h - gap) * rng.rf(0.35, 0.65);
    const bl1 = addBuilding(b.inner.x, b.inner.y, wA, hA, rng.pick(DOWN_COLS), rng.pick(ROOF_COLS), true, rng);
    if (rng.chance(0.45)) addNeon(bl1, rng);
    const bx2 = split ? b.inner.x + wA + gap : b.inner.x;
    const by2 = split ? b.inner.y : b.inner.y + hA + gap;
    const bw2 = split ? b.inner.w - wA - gap : wA;
    const bh2 = split ? hA : b.inner.h - hA - gap;
    const bl2 = addBuilding(bx2, by2, bw2, bh2, rng.pick(DOWN_COLS), rng.pick(ROOF_COLS), true, rng);
    if (rng.chance(0.45)) addNeon(bl2, rng);
  }
}

function residentialBlock(b, rng) {
  const cols = rng.ri(2, 3), rows = rng.ri(2, 3);
  const cw = (b.inner.w - (cols - 1) * 18) / cols, ch = (b.inner.h - (rows - 1) * 18) / rows;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    if (rng.chance(0.12)) { // yard with palm
      world.palms.push({ x: b.inner.x + c * (cw + 18) + cw / 2, y: b.inner.y + r * (ch + 18) + ch / 2, s: rng.rf(0.8, 1.2) });
      continue;
    }
    const m = rng.ri(0, 8);
    addBuilding(b.inner.x + c * (cw + 18) + m, b.inner.y + r * (ch + 18) + m, cw - m * 2, ch - m * 2, rng.pick(HOUSE_COLS), rng.pick(ROOF_COLS), false, rng);
  }
}

function beachBlock(b, rng) {
  const rows = rng.ri(2, 3);
  const ch = (b.inner.h - (rows - 1) * 20) / rows;
  for (let r = 0; r < rows; r++) {
    if (rng.chance(0.25)) { // parking lot strip
      world.props.push({ k: 'lot', x: b.inner.x, y: b.inner.y + r * (ch + 20), w: b.inner.w, h: ch });
      for (let c = 0; c < 3; c++) if (rng.chance(0.5)) world.props.push({ k: 'parkslot', x: b.inner.x + 40 + c * 90, y: b.inner.y + r * (ch + 20) + ch / 2 });
      continue;
    }
    const bl = addBuilding(b.inner.x + rng.ri(0, 10), b.inner.y + r * (ch + 20), b.inner.w - rng.ri(0, 20), ch, rng.pick(BEACH_COLS), '#5a4a52', false, rng);
    if (rng.chance(0.7)) addNeon(bl, rng);
  }
}

function parkBlock(b, rng) {
  // grass + path cross + fountain + palms + benches
  world.props.push({ k: 'path', x: b.inner.x, y: b.y0 + (b.y1 - b.y0) / 2, w: b.inner.w, h: 18 });
  world.props.push({ k: 'path', x: b.x0 + (b.x1 - b.x0) / 2, y: b.inner.y, w: 18, h: b.inner.h });
  const fx = b.x0 + (b.x1 - b.x0) / 2, fy = b.y0 + (b.y1 - b.y0) / 2;
  world.props.push({ k: 'fountain', x: fx, y: fy, r: 34 });
  world.solids.push({ x: fx - 34, y: fy - 34, w: 68, h: 68 });
  for (let k = 0; k < 10; k++) {
    const px = b.inner.x + rng.r() * b.inner.w, py = b.inner.y + rng.r() * b.inner.h;
    if (dist(px, py, fx, fy) > 90) world.palms.push({ x: px, y: py, s: rng.rf(0.9, 1.5) });
  }
  for (let k = 0; k < 4; k++) world.props.push({ k: 'bench', x: b.inner.x + rng.r() * b.inner.w, y: b.inner.y + rng.r() * b.inner.h });
}

function docksBlock(b, rng) {
  // container rows + dock office on one block
  const rows = rng.ri(2, 3);
  const ch = Math.min(46, (b.inner.h - (rows - 1) * 30) / rows);
  for (let r = 0; r < rows; r++) {
    const y = b.inner.y + r * (ch + 30);
    const cols = rng.ri(2, 3);
    let x = b.inner.x + rng.ri(0, 20);
    for (let c = 0; c < cols && x + 96 < b.inner.x + b.inner.w; c++) {
      const w = 96, h = ch;
      const col = rng.pick(CONT_COLS);
      world.containers.push({ x, y, w, h, c: col, stack: rng.chance(0.4) ? rng.pick(CONT_COLS) : null });
      world.solids.push({ x, y, w, h });
      x += w + rng.ri(10, 26);
    }
  }
  if (b.i === 2 && b.j === 1) { // dock office
    const bl = addBuilding(b.inner.x + 40, b.inner.y + 20, 180, 120, '#4a5568', '#2a3242', false, rng);
    world.neons.push({ x: bl.x + bl.w / 2, y: bl.y + 16, text: 'DOCKSIDE', c: '#00e5ff', w: 12 });
  }
}

function airfieldBlock(b, rng) {
  // mostly open tarmac; hangars on some blocks
  world.props.push({ k: 'tarmac', x: b.inner.x - SIDEWALK, y: b.inner.y - SIDEWALK, w: b.inner.w + SIDEWALK * 2, h: b.inner.h + SIDEWALK * 2 });
  if (b.j === 1 && (b.i === 11 || b.i === 13)) {
    const hx = b.inner.x + 10, hy = b.inner.y + 30;
    const hang = { x: hx, y: hy, w: 220, h: 130, arch: true };
    world.props.push({ k: 'hangar', ...hang, c: b.i === 11 ? '#5a6472' : '#6a6072' });
    world.solids.push(hang);
    world.neons.push({ x: hx + 110, y: hy + 24, text: b.i === 11 ? 'HANGAR 1' : 'HANGAR 2', c: '#ffe14d', w: 11 });
  } else if (b.j === 2 && b.i === 12) {
    const t = { x: b.inner.x + 90, y: b.inner.y + 40, w: 84, h: 84 };
    world.props.push({ k: 'tower', ...t });
    world.solids.push(t);
  } else if (rng.chance(0.5)) {
    for (let k = 0; k < rng.ri(1, 2); k++) {
      const bx = b.inner.x + rng.r() * (b.inner.w - 120), by = b.inner.y + rng.r() * (b.inner.h - 80);
      world.props.push({ k: 'crate', x: bx, y: by, w: 60, h: 44, c: rng.pick(CONT_COLS) });
      world.solids.push({ x: bx, y: by, w: 60, h: 44 });
    }
  }
}

function addNeon(bl, rng) {
  const t = rng.pick(NEON_TEXTS), c = rng.pick(NEON_COLS);
  world.neons.push({ x: bl.x + bl.w / 2, y: bl.y + 14, text: t, c, w: t.length > 8 ? 10 : 13 });
}

function makeDocklands(rng) {
  // piers into the north basin + gantry cranes + moored ship (world.ship)
  for (const px of [520, 1020, 1520]) {
    world.piers.push({ x: px, y: 40, w: 74, h: 230 });
    world.cranes.push({ x: px + 8, y: 246, w: 58, h: 120, arm: rng.ri(90, 140) });
  }
  world.props.push({ k: 'fence', x: 250, y: 282, w: 1560, h: 6, gate: true });
  world.props.push({ k: 'flood', x: 380, y: 300 }, { k: 'flood', x: 900, y: 300 }, { k: 'flood', x: 1420, y: 300 }, { k: 'flood', x: 1760, y: 300 });
  // lighthouse on the east end of the basin
  world.props.push({ k: 'lighthouse', x: 1770, y: 130 });
  // marina: small boats bobbing in the basin
  for (let k = 0; k < 5; k++) world.props.push({ k: 'boat', x: 220 + k * 60, y: 190 + (k % 2) * 26, ph: rng.r() * 6 });
}

function makeLandmarks(rng) {
  // ferris wheel on the beach boardwalk
  world.props.push({ k: 'ferris', x: 4560, y: 4300 });
  // downtown plaza fountain already in park; add stadium in a north-east block
  world.props.push({ k: 'stadium', x: 3940, y: 2680, w: 320, h: 360 });
  world.solids.push({ x: 3940, y: 2680, w: 320, h: 360 });
  // bus stops along Ocean Drive
  for (const bx of [1400, 3200, 5000]) world.props.push({ k: 'busstop', x: bx, y: 4090 });
  // phone booths downtown
  for (const [px, py] of [[2500, 1650], [3300, 2100], [2900, 3050]]) world.props.push({ k: 'booth', x: px, y: py });
  // vending machines near the park corners
  for (const [px, py] of [[2400, 2280], [2980, 3120]]) world.props.push({ k: 'vend', x: px, y: py });
}

// Pickups: classic spinning icons on sidewalks/plazas, respawn after a cooldown.
function makePickups(rng) {
  const spots = [
    [2120, 4000, 'health'], [2830, 3230, 'armor'], [4310, 2000, 'ammo'],
    [1000, 1150, 'cash'], [2690, 2760, 'health'], [5300, 1060, 'ammo'],
    [1500, 3900, 'cash'], [3900, 1150, 'armor'], [4900, 1400, 'smg'],
    [620, 560, 'cash'], [5600, 4060, 'health'], [1900, 2400, 'ammo'],
    [4400, 3300, 'cash'], [3600, 4230, 'armor'], [2950, 1000, 'smg'],
  ];
  for (const [x, y, kind] of spots) world.pickups.push({ x, y, kind, t: 0, live: true, cd: 0 });
}

function makeAirfield(rng) {
  // fence around airfield with road gates, runway markings handled at draw
  const fx0 = 4740, fy0 = 240, fx1 = 6180, fy1 = 1470;
  const seg = (x, y, w, h) => world.props.push({ k: 'fence', x, y, w, h });
  seg(fx0, fy0, VX[12] - ROAD_HALF - fx0, 6); seg(VX[12] + ROAD_HALF, fy0, VX[13] - ROAD_HALF - VX[12] - ROAD_HALF, 6); seg(VX[13] + ROAD_HALF, fy0, fx1 - VX[13] - ROAD_HALF, 6);
  seg(fx0, fy1, VX[12] - ROAD_HALF - fx0, 6); seg(VX[12] + ROAD_HALF, fy1, VX[13] - ROAD_HALF - VX[12] - ROAD_HALF, 6); seg(VX[13] + ROAD_HALF, fy1, fx1 - VX[13] - ROAD_HALF, 6);
  seg(fx0, fy0, 6, fy1 - fy0); seg(fx1, fy0, 6, fy1 - fy0);
  world.props.push({ k: 'beacon', x: 4760, y: 300 });
  world.props.push({ k: 'windsock', x: 5960, y: 1300 });
}

function makeBeachfront(rng) {
  for (let x = 340; x < 5900; x += 150) world.palms.push({ x, y: 4230, s: 1.1 + rng.r() * 0.5 });
  for (let x = 420; x < 5900; x += 170) world.palms.push({ x, y: 4330, s: 1.2 + rng.r() * 0.5 });
  for (let k = 0; k < 14; k++) world.props.push({ k: 'umbrella', x: 300 + rng.r() * 5600, y: 4260 + rng.r() * 120 });
}

function makeLampsAndPalms(rng) {
  for (const vx of VX) for (let y = 340; y < 4100; y += 220) {
    world.lamps.push({ x: vx + ROAD_HALF + 8, y: y + ((y / 220) % 2 ? 110 : 0), side: 1 });
    world.lamps.push({ x: vx - ROAD_HALF - 8, y: y + 220 + ((y / 220) % 2 ? 110 : 0), side: -1 });
  }
  for (const hy of HY) for (let x = 340; x < 5900; x += 230) {
    world.lamps.push({ x: x + ((x / 230) % 2 ? 115 : 0), y: hy + ROAD_HALF + 8, side: 1 });
    world.lamps.push({ x: x + 230 + ((x / 230) % 2 ? 115 : 0), y: hy - ROAD_HALF - 8, side: -1 });
  }
  // palms along park edge & scattered residential
  for (let k = 0; k < 26; k++) {
    const bx = 1980 + rng.r() * 640, by = 4120 - rng.r() * 30;
    world.palms.push({ x: bx, y: by, s: 1 + rng.r() * 0.6 });
  }
}

// ---------------------------------------------------------------- solids grid
function indexSolids() {
  const cs = world.gridCell;
  for (const s of world.solids) {
    const i0 = Math.floor(s.x / cs), j0 = Math.floor(s.y / cs), i1 = Math.floor((s.x + s.w) / cs), j1 = Math.floor((s.y + s.h) / cs);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i + ',' + j;
      if (!world.grid.has(k)) world.grid.set(k, []);
      world.grid.get(k).push(s);
    }
  }
}

let queryStamp = 0;
const stamped = new Map();
export function solidsNear(x, y, r) {
  const cs = world.gridCell, out = [];
  queryStamp++;
  const i0 = Math.floor((x - r) / cs), j0 = Math.floor((y - r) / cs), i1 = Math.floor((x + r) / cs), j1 = Math.floor((y + r) / cs);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const cell = world.grid.get(i + ',' + j);
    if (!cell) continue;
    for (const s of cell) {
      if (s._q === queryStamp) continue;
      s._q = queryStamp; out.push(s);
    }
  }
  return out;
}

export function isWater(x, y) {
  for (const w of world.water) if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  return false;
}
export function isSand(x, y) { const s = world.sand; return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h; }

export function isOnRoad(x, y) {
  if (x < CITY_X0 - ROAD_HALF || x > CITY_X1 + ROAD_HALF || y < CITY_Y0 - ROAD_HALF) return false;
  for (const vx of VX) if (Math.abs(x - vx) <= ROAD_HALF && y <= CITY_Y1 + ROAD_HALF) return true;
  for (const hy of HY) if (Math.abs(y - hy) <= ROAD_HALF && x >= CITY_X0 - ROAD_HALF && x <= CITY_X1 + ROAD_HALF) return true;
  return false;
}

export function zoneAt(x, y) {
  if (y > 4182) return 'Ocean Beach';
  if (x < 1900 && y < 1154) return 'North Docks';
  if (x >= 4732 && y < 1470) return 'Palm Airfield';
  if (x >= 1900 && x < 2700 && y >= 2300 && y < 3100) return 'Palm Park';
  if (x >= 2300 && x < 3900 && y >= 1500 && y < 3100) return 'Downtown';
  return 'Vice Palms';
}

// Circle vs solids push-out; returns { x, y, hit, nx, ny }
export function circleSolids(x, y, r) {
  let hit = false, nx = 0, ny = 0;
  for (const s of solidsNear(x, y, r + 4)) {
    const cx = clamp(x, s.x, s.x + s.w), cy = clamp(y, s.y, s.y + s.h);
    const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 < 1e-6) { // deep inside: push along smallest penetration
      const pl = x - s.x, pr = s.x + s.w - x, pt = y - s.y, pb = s.y + s.h - y;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) { x = s.x - r; nx = -1; } else if (m === pr) { x = s.x + s.w + r; nx = 1; }
      else if (m === pt) { y = s.y - r; ny = -1; } else { y = s.y + s.h + r; ny = 1; }
    } else {
      const d = Math.sqrt(d2), push = r - d;
      x += (dx / d) * push; y += (dy / d) * push; nx = dx / d; ny = dy / d;
    }
  }
  return { x, y, hit, nx, ny };
}

// ---------------------------------------------------------------- road graph
export const nodePos = (i, j) => ({ x: VX[i], y: HY[j] });
export function neighbors(i, j) {
  const out = [];
  if (i > 0) out.push([i - 1, j]); if (i < VX.length - 1) out.push([i + 1, j]);
  if (j > 0) out.push([i, j - 1]); if (j < HY.length - 1) out.push([i, j + 1]);
  return out;
}
// Lane offset for travel direction (right-hand traffic).
export function laneOffset(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return { x: 0, y: dy > 0 ? LANE : -LANE };
  return { x: dx > 0 ? -LANE : LANE, y: 0 };
}
// Random road spawn point in a ring around (x,y). Returns {x,y,ang,ni,nj,pi,pj} or null.
export function roadSpawn(rng, x, y, rmin, rmax, avoid = null) {
  for (let t = 0; t < 50; t++) {
    const i = (rng.r() * VX.length) | 0, j = (rng.r() * HY.length) | 0;
    const nbs = neighbors(i, j);
    const [pi, pj] = nbs[(rng.r() * nbs.length) | 0];
    const a = nodePos(i, j), b = nodePos(pi, pj);
    const t01 = rng.r();
    const dx = b.x - a.x, dy = b.y - a.y;
    const lo = laneOffset(dx, dy);
    const px = a.x + dx * t01 + lo.x, py = a.y + dy * t01 + lo.y;
    const d = dist(px, py, x, y);
    if (d < rmin || d > rmax) continue;
    if (avoid && dist(px, py, avoid.x, avoid.y) < 90) continue;
    return { x: px, y: py, ang: Math.atan2(dy, dx), ni: i, nj: j, pi, pj };
  }
  return null;
}
// Nearest road node to a position.
export function nearestNode(x, y) {
  let bi = 0, bj = 0, bd = 1e18;
  for (let i = 0; i < VX.length; i++) { const dx = VX[i] - x, d2 = dx * dx; if (d2 < bd) { bd = d2; bi = i; } }
  bd = 1e18;
  for (let j = 0; j < HY.length; j++) { const dy = HY[j] - y, d2 = dy * dy; if (d2 < bd) { bd = d2; bj = j; } }
  return { i: bi, j: bj };
}
// Direction a road runs at (x,y): {ax:'v'|'h', s:±1} — for roadblocks & cop spawns.
export function roadAxisAt(x, y) {
  let bestV = 1e9, bestH = 1e9;
  for (const vx of VX) bestV = Math.min(bestV, Math.abs(x - vx));
  for (const hy of HY) bestH = Math.min(bestH, Math.abs(y - hy));
  if (bestV <= bestH) return { ax: 'v', s: 1 };
  return { ax: 'h', s: 1 };
}

// Green light for travel axis: phase 0 → NS (vertical) green, phase 1 → EW green.
export function lightGreen(axis) {
  const phase = Math.floor(world.timeRef / 9) % 2;
  return axis === 'v' ? phase === 0 : phase === 1;
}

function defineSpawns() {
  world.spawns = {
    player: { x: 2120, y: 4072 },
    hotel: { x: 2050, y: 4072 },
    hospital: { x: 2830, y: 3170 },
    police: { x: 4310, y: 1930 },
    garage: { x: 2280, y: 1350 },
    beachHouse: { x: 5340, y: 4072 },
    docksGate: { x: 1900 + ROAD_HALF + 40, y: 700 },
    pierOffice: { x: 1620, y: 800 },
    airfield: { x: 5300, y: 1000 },
    plaza: { x: 3060, y: 1930 },
  };
}
