// Vice Palms — deterministic night-city generator.
// A 15x15 grid of blocks between 16 roads per axis. Districts: west beach,
// north docks, one park block, southeast airfield, a downtown tower zone and
// everywhere else residential. Everything is derived from one seed.

import { WORLD, ROADS, ROAD_W, SIDEWALK, DIST, BORDER_MIN, BORDER_MAX } from './config.js';
import { RNG, hashSeed } from './rng.js';
import { clamp, rectOverlap } from './util.js';

const HALF = ROAD_W / 2;

/** Traffic-light state for intersection (ix, iy) on axis (0 = EW, 1 = NS). */
export function lightFor(ix, iy, axis, t) {
  const cycle = (t + ((ix * 3 + iy * 5) % 2) * 8) % 16;
  if (axis === 0) {
    if (cycle < 7) return 'green';
    if (cycle < 8) return 'yellow';
    return 'red';
  }
  if (cycle >= 8 && cycle < 15) return 'green';
  if (cycle >= 15) return 'yellow';
  return 'red';
}

export function buildWorld(seed) {
  const rng = new RNG(hashSeed('vice-palms:' + seed));
  const w = {
    seed,
    size: WORLD,
    ROADS,
    ROAD_W,
    blocks: [],
    solids: [],
    grid: new Map(),          // spatial hash: "cx,cy" -> rect[]
    neons: [],
    palms: [],
    trees: [],
    lamps: [],
    crossings: [],            // traffic-light intersections
    piers: [],
    cranes: [],
    containers: [],
    ship: null,
    hangars: [],
    runway: null,
    fountain: null,
    stage: null,
    spawns: {},
    parkedSpots: [],
    cell: 400,
  };

  // ---------------------------------------------------------------- helpers

  const blockRect = (i, j) => ({
    x: ROADS[i] + HALF,
    y: ROADS[j] + HALF,
    w: ROADS[i + 1] - ROADS[i] - ROAD_W,
    h: ROADS[j + 1] - ROADS[j] - ROAD_W,
  });

  const inAirfield = (i, j) => i >= DIST.airfield[0] && j >= DIST.airfield[1];
  const inDowntown = (i, j) =>
    i >= DIST.downtownMin[0] && i <= DIST.downtownMax[0] &&
    j >= DIST.downtownMin[1] && j <= DIST.downtownMax[1];

  const districtOf = (i, j) => {
    if (i === DIST.beachCols) return 'beach';
    if (j <= DIST.docksRows) return 'docks';
    if (i === DIST.park[0] && j === DIST.park[1]) return 'park';
    if (inAirfield(i, j)) return 'airfield';
    if (inDowntown(i, j)) return 'downtown';
    return 'res';
  };

  const addSolid = (r) => {
    w.solids.push(r);
    const c = w.cell;
    for (let cx = Math.floor(r.x / c); cx <= Math.floor((r.x + r.w) / c); cx++) {
      for (let cy = Math.floor(r.y / c); cy <= Math.floor((r.y + r.h) / c); cy++) {
        const k = cx + ',' + cy;
        let arr = w.grid.get(k);
        if (!arr) { arr = []; w.grid.set(k, arr); }
        arr.push(r);
      }
    }
  };

  // ------------------------------------------------------- world border walls

  // Water on the west edge is impassable; the other edges are the map rim.
  addSolid({ x: -400, y: -400, w: 530, h: WORLD + 800 });                 // west (water line ~130)
  addSolid({ x: WORLD - 130, y: -400, w: 530, h: WORLD + 800 });          // east
  addSolid({ x: -400, y: -400, w: WORLD + 800, h: 530 });                 // north
  addSolid({ x: -400, y: WORLD - 130, w: WORLD + 800, h: 530 });          // south

  // -------------------------------------------------------------- the blocks

  for (let j = 0; j < 15; j++) {
    for (let i = 0; i < 15; i++) {
      const r = blockRect(i, j);
      const district = districtOf(i, j);
      const b = { i, j, district, ...r, buildings: [], ground: district };
      w.blocks.push(b);

      if (district === 'beach') {
        // Sand, palms and lifeguard huts; no towers on the shore.
        for (let k = 0; k < 7; k++) {
          w.palms.push({
            x: rng.range(r.x + 16, r.x + r.w - 16),
            y: rng.range(r.y + 16, r.y + r.h - 16),
            r: rng.range(9, 13),
            sway: rng.angle(),
          });
        }
        if (rng.chance(0.35)) {
          const hut = {
            x: rng.range(r.x + 40, r.x + r.w - 90),
            y: rng.range(r.y + 40, r.y + r.h - 60),
            w: 46, h: 30, ht: 12,
            col: '#4a3b2a', roofCol: '#5f4c34', neon: null, props: 0,
          };
          b.buildings.push(hut);
          addSolid(hut);
        }
        continue;
      }

      if (district === 'park') {
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          w.trees.push({
            x: r.x + r.w / 2 + Math.cos(a) * r.w * 0.36,
            y: r.y + r.h / 2 + Math.sin(a) * r.h * 0.36,
            r: rng.range(12, 17),
          });
        }
        w.trees.push({ x: r.x + 50, y: r.y + 50, r: 14 });
        w.trees.push({ x: r.x + r.w - 50, y: r.y + r.h - 50, r: 14 });
        w.fountain = { x: r.x + r.w / 2, y: r.y + r.h / 2, r: 30 };
        w.stage = { x: r.x + r.w / 2 - 60, y: r.y + 26, w: 120, h: 34, ht: 10 };
        addSolid({ x: w.fountain.x - w.fountain.r, y: w.fountain.y - w.fountain.r, w: w.fountain.r * 2, h: w.fountain.r * 2 });
        addSolid(w.stage);
        continue;
      }

      if (district === 'airfield') {
        // Flat asphalt handled at render time; only hangars + tower are solid.
        continue;
      }

      // docks / downtown / residential get buildings
      const inners = { x: r.x + SIDEWALK, y: r.y + SIDEWALK, w: r.w - SIDEWALK * 2, h: r.h - SIDEWALK * 2 };

      if (district === 'docks') {
        // Warehouse + container stacks.
        if (rng.chance(0.75)) {
          const bw = rng.range(inners.w * 0.45, inners.w * 0.8);
          const bh = rng.range(inners.h * 0.4, inners.h * 0.7);
          const ware = {
            x: inners.x + rng.range(0, inners.w - bw),
            y: inners.y + rng.range(0, inners.h - bh),
            w: bw, h: bh, ht: rng.range(18, 26),
            col: '#26303a', roofCol: '#33404d', neon: rng.chance(0.3) ? { col: rng.pick(['#23e6ff', '#ff9f2d']) } : null,
            props: 2,
          };
          b.buildings.push(ware);
          addSolid(ware);
        }
        const stacks = rng.int(2, 5);
        for (let k = 0; k < stacks; k++) {
          const cw = rng.range(30, 56);
          const ch = rng.range(18, 24);
          const con = {
            x: clamp(inners.x + rng.range(-8, inners.w - cw + 8), r.x + 6, r.x + r.w - cw - 6),
            y: clamp(inners.y + rng.range(-8, inners.h - ch + 8), r.y + 6, r.y + r.h - ch - 6),
            w: cw, h: ch,
            col: rng.pick(['#8f3a3a', '#3a6f8f', '#8f7a3a', '#4a8f4a', '#6a4a8f']),
          };
          w.containers.push(con);
          addSolid(con);
        }
        continue;
      }

      // downtown / residential: 1-4 buildings with alleys between them
      const tall = district === 'downtown';
      const cols = rng.int(1, 2);
      const rows = rng.int(1, 2);
      const gap = 14;
      const cw = (inners.w - gap * (cols - 1)) / cols;
      const chh = (inners.h - gap * (rows - 1)) / rows;
      for (let ci = 0; ci < cols; ci++) {
        for (let cj = 0; cj < rows; cj++) {
          if (cols * rows > 1 && rng.chance(0.12)) continue; // empty lot
          const shrink = rng.range(0, 10);
          const bd = {
            x: inners.x + ci * (cw + gap) + shrink / 2,
            y: inners.y + cj * (chh + gap) + shrink / 2,
            w: Math.max(40, cw - shrink),
            h: Math.max(40, chh - shrink),
            ht: tall ? rng.range(40, 88) : rng.range(14, 30),
            col: rng.pick(['#232a3d', '#2a2340', '#1f2d3a', '#2d2438', '#243044', '#2b2b47', '#1e2a3e']),
            props: rng.int(1, 3),
            seedN: rng.int(0, 9999),
            neon: null,
          };
          bd.roofCol = bd.col.replace(/../, (s) => s); // set below
          const n = parseInt(bd.col.slice(1), 16);
          bd.roofCol = 'rgb(' + Math.min(255, ((n >> 16) & 255) + 26) + ',' + Math.min(255, ((n >> 8) & 255) + 30) + ',' + Math.min(255, (n & 255) + 38) + ')';
          const neonChance = tall ? 0.75 : 0.3;
          if (rng.chance(neonChance)) {
            const col = rng.pick(['#ff2d78', '#23e6ff', '#ff9f2d', '#a8ff2d', '#b06bff', '#ffd12d']);
            const vertical = tall && rng.chance(0.4);
            bd.neon = { col, vertical };
            w.neons.push({
              x: vertical ? bd.x + bd.w * 0.5 - 5 : bd.x + 8,
              y: vertical ? bd.y + 8 : (rng.chance(0.5) ? bd.y + 8 : bd.y + bd.h - 18),
              w: vertical ? 10 : Math.min(bd.w - 24, rng.range(50, 110)),
              h: vertical ? Math.min(bd.h - 24, rng.range(40, 90)) : 10,
              col,
              ht: bd.ht,
            });
          }
          b.buildings.push(bd);
          addSolid(bd);
        }
      }
    }
  }

  // ------------------------------------------------------------- the docks waterfront

  // Piers reach west over the water at the three north road rows.
  for (let j = 0; j <= 2; j++) {
    const py = ROADS[j];
    const pier = { x: 30, y: py - 34, w: 150, h: 68 };
    w.piers.push(pier);
  }
  // Two container cranes on the middle pier.
  w.cranes.push({ x: 95, y: ROADS[1] - 34, h: 96, reach: 120 });
  w.cranes.push({ x: 150, y: ROADS[1] + 10, h: 110, reach: 140 });
  // A cargo ship docked at the middle pier, hull solid.
  w.ship = { x: 8, y: ROADS[1] - 88, w: 170, h: 176 };
  addSolid(w.ship);

  // ------------------------------------------------------------- the airfield

  {
    const ax0 = ROADS[12] + HALF, ay0 = ROADS[11] + HALF;
    const ax1 = ROADS[15] - HALF, ay1 = ROADS[15] - HALF;
    w.runway = { x: ax0 + 40, y: ay0 + 120, w: ax1 - ax0 - 80, h: 64 };
    for (let k = 0; k < 3; k++) {
      const hg = {
        x: ax0 + 60 + k * 260,
        y: ay1 - 120,
        w: 150, h: 76, ht: 24,
        col: '#2b3242', roofCol: '#3a4456', neon: null, props: 1,
      };
      w.hangars.push(hg);
      addSolid(hg);
    }
    const tower = { x: ax0 + 60, y: ay0 + 30, w: 44, h: 44, ht: 52, col: '#31394f', roofCol: '#46536e', neon: { col: '#23e6ff', vertical: false }, props: 0 };
    w.hangars.push(tower); // tower rides the hangar draw list
    addSolid(tower);
  }

  // ------------------------------------------------------------- lamps + lights

  for (let j = 1; j < 15; j++) {
    for (let i = 1; i < 15; i++) {
      w.crossings.push({ x: ROADS[i], y: ROADS[j], i, j });
      if (i % 2 === 0 && j % 2 === 0) {
        w.lamps.push({ x: ROADS[i] + HALF + 10, y: ROADS[j] + HALF + 10 });
      }
    }
  }

  // ------------------------------------------------------------- spawn points

  const corner = (i, j, dx, dy) => ({
    x: ROADS[i] + HALF + 16 + (dx || 0),
    y: ROADS[j] + HALF + 16 + (dy || 0),
  });
  w.spawns = {
    safehouse: corner(2, 8, 40, 40),
    hospital: corner(6, 3, 40, 40),
    police: corner(9, 6, 40, 40),
    dockoffice: corner(3, 1, 60, 60),
    airfieldtower: corner(13, 12, 60, 60),
    parkstage: corner(7, 7, 40, 40),
    taxistand: corner(5, 5, 40, 40),
    wreckyard: corner(11, 8, 40, 40),
    airmail: corner(4, 9, 40, 40),
    spray: corner(10, 5, 40, 40),
    ammu: corner(8, 3, 40, 40),
    rampage1: corner(6, 10, 40, 40),
    rampage2: corner(12, 3, 40, 40),
    intro: { x: ROADS[2] + 22, y: ROADS[8] - 22 },
  };
  w.hospitalPos = { x: ROADS[6] + HALF + 30, y: ROADS[3] + HALF + 30 };
  w.policePos = { x: ROADS[9] + HALF + 30, y: ROADS[6] + HALF + 30 };

  // A few guaranteed parked cars near story locations.
  w.parkedSpots = [
    { x: w.spawns.safehouse.x - 60, y: w.spawns.safehouse.y - 20, type: 'sedan', h: 0 },
    { x: w.spawns.hospital.x - 60, y: w.spawns.hospital.y + 10, type: 'van', h: Math.PI / 2 },
    { x: w.spawns.safehouse.x + 10, y: w.spawns.safehouse.y + 70, type: 'sports', h: Math.PI },
    { x: w.spawns.dockoffice.x - 70, y: w.spawns.dockoffice.y, type: 'truck', h: 0 },
    { x: w.spawns.airfieldtower.x + 60, y: w.spawns.airfieldtower.y + 40, type: 'limo', h: 0 },
    { x: w.spawns.taxistand.x + 60, y: w.spawns.taxistand.y, type: 'taxi', h: Math.PI / 2 },
    { x: w.spawns.wreckyard.x - 60, y: w.spawns.wreckyard.y + 20, type: 'bus', h: 0 },
  ];

  // Curbside parking: civilian cars along the roads, clear of intersections.
  for (let k = 0; k < 44; k++) {
    const axis = rng.chance(0.5) ? 0 : 1;
    const ri = rng.int(1, ROADS.length - 2);
    const along = rng.range(ROADS[0] + 140, ROADS[ROADS.length - 1] - 140);
    let near = false;
    for (const r of ROADS) if (Math.abs(along - r) < HALF + 46) near = true;
    if (near) continue;
    const sideOff = (rng.chance(0.5) ? 1 : -1) * (HALF - 13);
    const spot = axis === 0
      ? { x: along, y: ROADS[ri] + sideOff, type: rng.pick(['sedan', 'sedan', 'taxi', 'van', 'sports']), h: rng.chance(0.5) ? 0 : Math.PI }
      : { x: ROADS[ri] + sideOff, y: along, type: rng.pick(['sedan', 'sedan', 'taxi', 'van', 'bus']), h: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 };
    w.parkedSpots.push(spot);
  }

  // Street furniture: hydrants, benches, bins and bus stops on sidewalk corners.
  w.props = [];
  for (const c of w.crossings) {
    if (c.i % 3 !== 1 || c.j % 3 !== 1) continue;
    const kind = rng.pick(['hydrant', 'bench', 'bin', 'busstop']);
    w.props.push({
      x: c.x + HALF + 12,
      y: c.y + HALF + 12,
      kind,
      h: rng.angle(),
    });
  }

  return w;
}

// ------------------------------------------------------------------ queries

/** Every solid rect that could touch a circle at (x, y, r). */
export function solidsNear(world, x, y) {
  const c = world.cell;
  const out = [];
  for (let cx = Math.floor((x - 80) / c); cx <= Math.floor((x + 80) / c); cx++) {
    for (let cy = Math.floor((y - 80) / c); cy <= Math.floor((y + 80) / c); cy++) {
      const arr = world.grid.get(cx + ',' + cy);
      if (arr) for (const r of arr) if (!out.includes(r)) out.push(r);
    }
  }
  return out;
}

/**
 * Push a circle out of every solid it overlaps.
 * Returns { x, y, hit, nx, ny } — the corrected position and summed normal.
 */
export function circleResolve(world, x, y, r) {
  let hit = false, nx = 0, ny = 0;
  const rects = solidsNear(world, x, y);
  for (const s of rects) {
    const cx = clamp(x, s.x, s.x + s.w);
    const cy = clamp(y, s.y, s.y + s.h);
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const p = r - d;
      x += (dx / d) * p;
      y += (dy / d) * p;
      nx += dx / d;
      ny += dy / d;
    } else {
      const l = x - s.x, rt = s.x + s.w - x, tp = y - s.y, bt = s.y + s.h - y;
      const m = Math.min(l, rt, tp, bt);
      if (m === l) { x = s.x - r; nx -= 1; }
      else if (m === rt) { x = s.x + s.w + r; nx += 1; }
      else if (m === tp) { y = s.y - r; ny -= 1; }
      else { y = s.y + s.h + r; ny += 1; }
    }
  }
  return { x, y, hit, nx, ny };
}

/** True when the point sits on asphalt (roads only, not lots). */
export function isRoad(world, x, y) {
  for (const r of ROADS) {
    if (Math.abs(x - r) <= HALF) return true;
    if (Math.abs(y - r) <= HALF) return true;
  }
  return false;
}

/** True in open water (west of the shore line). */
export function isWater(world, x, y) {
  return x < 130;
}

/** Snap a point to the closest road lane center. Returns { x, y, axis, dir }. */
export function nearestRoadPoint(world, x, y) {
  let bestD = Infinity, bestI = -1, bestAxis = 0;
  for (let i = 0; i < ROADS.length; i++) {
    const dx = Math.abs(x - ROADS[i]);
    if (dx < bestD) { bestD = dx; bestI = i; bestAxis = 1; }
    const dy = Math.abs(y - ROADS[i]);
    if (dy < bestD) { bestD = dy; bestI = i; bestAxis = 0; }
  }
  if (bestAxis === 1) return { x: ROADS[bestI], y, axis: 1, i: bestI };
  return { x, y: ROADS[bestI], axis: 0, i: bestI };
}

/** Adapt a bare () => float into the RNG surface randRoadPoint expects. */
function asRng(r) {
  if (r && typeof r.next === 'function') return r;
  const f = typeof r === 'function' ? r : Math.random;
  return {
    next: f,
    range: (a, b) => a + f() * (b - a),
    chance: (p) => f() < p,
    int: (a, b) => a + ((f() * (b - a + 1)) | 0),
    pick: (arr) => arr[(f() * arr.length) | 0],
    angle: () => f() * Math.PI * 2,
  };
}

/** A random lane point on the grid, optionally biased near (nx, ny). */
export function randRoadPoint(world, rng, nx, ny, minD, maxD) {
  const rr = asRng(rng);
  for (let tries = 0; tries < 24; tries++) {
    const axis = rr.chance(0.5) ? 0 : 1;
    const i = rr.int(0, ROADS.length - 1);
    const along = rr.range(ROADS[0], ROADS[ROADS.length - 1]);
    const dir = rr.chance(0.5) ? 1 : -1;
    let x, y;
    if (axis === 0) {
      y = ROADS[i] + (dir > 0 ? 22 : -22);
      x = along;
    } else {
      x = ROADS[i] + (dir > 0 ? -22 : 22);
      y = along;
    }
    if (nx === undefined) return { x, y, axis, dir, i };
    const d = Math.sqrt((x - nx) * (x - nx) + (y - ny) * (y - ny));
    if (d >= (minD || 0) && d <= (maxD || Infinity)) return { x, y, axis, dir, i };
  }
  const i = rr.int(1, ROADS.length - 2);
  return { x: ROADS[i], y: ROADS[i], axis: 0, dir: 1, i };
}

/** Walkable check for foot spawns: not inside a solid, not in water. */
export function footFree(world, x, y) {
  if (isWater(world, x, y)) return false;
  const r = circleResolve(world, x, y, 10);
  return !r.hit;
}
