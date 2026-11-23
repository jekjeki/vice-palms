// world.js — the night coastal city of Vice Palms: road grid, downtown towers,
// Flamingo Park, Palm Beach, the North Docks (piers, containers, cranes, ship)
// and Palm Airfield (runway, hangars, tower). Everything is generated from a
// seed, so the city is identical on every machine and every run.

import { CFG, NEON_WORDS, PLACES } from './config.js';
import { RNG, CITY_SEED, mixSeeds } from './rng.js';
import { clamp, circleRectPush, circleRectHit, pointInRect, dist } from './util.js';

// grid codes
export const G = {
  PLAZA: 0, ROAD: 1, BUILDING: 2, WATER: 3, SAND: 4, GRASS: 5,
  RUNWAY: 6, DOCKPAD: 7, PIER: 8, FENCE: 9,
};

const CAR_COLORS = [
  '#c22f4a', '#e0e4ea', '#2d2f36', '#2f6f9e', '#d9a13b', '#5a9e4b',
  '#8b4bd9', '#d96a2b', '#e8e2d4', '#3ec6b8', '#b0467e', '#7a8288',
];

const CONTAINER_COLORS = ['#b54248', '#3f7fae', '#c2903c', '#4d9e57', '#8a5fb0', '#c56a2e', '#5d6a75'];

export class World {
  constructor(seed) {
    this.seed = seed === undefined ? CITY_SEED : seed;
    this.rng = new RNG(mixSeeds(this.seed, 0xC17B));
    this.grid = new Uint8Array(CFG.WT * CFG.HT);
    this.solids = [];          // AABBs that block everything
    this.propSolids = [];      // small round solids (palms, poles)
    this.buildings = [];       // render/collision buildings with style data
    this.props = [];           // decorative + small-solid props
    this.lights = [];          // neon glow sources
    this.roadsV = [];          // {tx, ty0, ty1}
    this.roadsH = [];          // {ty, tx0, tx1}
    this.intersections = [];   // {tx, ty, x, y}
    this.spawns = {};
    this.blockBands = [];      // usable block rects (for spawning)
    this.minimap = null;       // prerendered offscreen canvas
    this.hash = new Map();     // spatial hash of solids
    this.hashCell = 128;
    this.piers = [];
    this.cranes = [];
    this.hangars = [];
    this.fences = [];
    this.pond = { x0: 74 * 32, y0: 106 * 32, x1: 80 * 32, y1: 112 * 32 };
  }

  idx(tx, ty) { return ty * CFG.WT + tx; }
  set(tx, ty, code) {
    if (tx >= 0 && ty >= 0 && tx < CFG.WT && ty < CFG.HT) this.grid[this.idx(tx, ty)] = code;
  }
  at(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= CFG.WT || ty >= CFG.HT) return G.WATER;
    return this.grid[this.idx(tx, ty)];
  }
  codeAt(px, py) {
    return this.at(Math.floor(px / CFG.T), Math.floor(py / CFG.T));
  }
  isRoadPx(px, py) { return this.codeAt(px, py) === G.ROAD; }
  isWaterPx(px, py) { return this.codeAt(px, py) === G.WATER; }

  // ---------------------------------------------------------------- build

  build() {
    const rng = this.rng;
    rng.reseed(mixSeeds(this.seed, 101));
    this.fillCityBase();
    this.carveRoads();
    this.buildDocks(rng);
    this.buildAirfield(rng);
    this.buildPark(rng);
    this.buildBeach(rng);
    this.buildCityBlocks(rng);
    this.buildBoundary();
    this.buildLandmarks();
    this.collectRoadData();
    this.hashSolids();
    this.pickSpawns();
    this.prerenderMinimap();
    return this;
  }

  /** Ground fill for the whole map before districts punch holes. */
  fillCityBase() {
    const { WT, HT } = CFG;
    for (let ty = 0; ty < HT; ty++) {
      for (let tx = 0; tx < WT; tx++) {
        this.grid[this.idx(tx, ty)] = G.PLAZA;
      }
    }
  }

  /** Stamp the two-tile road lattice everywhere. */
  carveRoads() {
    const { WT, HT, ROAD_A, ROAD_B, SUPER } = CFG;
    for (let s = 0; s * SUPER < WT; s++) {
      for (let ty = 0; ty < HT; ty++) {
        this.set(s * SUPER + ROAD_A, ty, G.ROAD);
        this.set(s * SUPER + ROAD_A + 1, ty, G.ROAD);
        this.set(s * SUPER + ROAD_B, ty, G.ROAD);
        this.set(s * SUPER + ROAD_B + 1, ty, G.ROAD);
      }
    }
    for (let s = 0; s * SUPER < HT; s++) {
      for (let tx = 0; tx < WT; tx++) {
        this.set(tx, s * SUPER + ROAD_A, G.ROAD);
        this.set(tx, s * SUPER + ROAD_A + 1, G.ROAD);
        this.set(tx, s * SUPER + ROAD_B, G.ROAD);
        this.set(tx, s * SUPER + ROAD_B + 1, G.ROAD);
      }
    }
  }

  // ------------------------------------------------------------- districts

  buildDocks(rng) {
    const D = CFG.DOCKS;
    const t = CFG.T;
    // water to the north
    for (let ty = D.y0; ty < 8; ty++)
      for (let tx = D.x0; tx < D.x1; tx++) this.set(tx, ty, G.WATER);
    // piers: pads over the water at every road column pair, planked
    for (let s = 0; s * CFG.SUPER < D.x1; s++) {
      const tx0 = s * CFG.SUPER + CFG.ROAD_A;
      for (let ty = 4; ty < 8; ty++)
        for (let dx = 0; dx < 2; dx++) this.set(tx0 + dx, ty, G.PIER);
      this.piers.push({ tx: tx0, ty0: 4, ty1: 8 });
      // bollards at the pier ends
      this.propSolids.push({ x: (tx0 + 0.5) * t, y: 4.4 * t, r: 5, kind: 'bollard' });
      this.propSolids.push({ x: (tx0 + 1.5) * t, y: 4.4 * t, r: 5, kind: 'bollard' });
    }
    // dock apron rows 8..19
    for (let ty = 8; ty < 20; ty++)
      for (let tx = D.x0; tx < D.x1; tx++) {
        if (this.at(tx, ty) === G.ROAD) continue;
        this.set(tx, ty, G.DOCKPAD);
      }
    // container stacks in the yard (rows 8..15), leaving lanes
    for (let i = 0; i < 46; i++) {
      const tx = rng.int(D.x0 + 2, D.x1 - 4);
      const ty = rng.int(8, 14);
      if (this.at(tx, ty) !== G.DOCKPAD || this.at(tx + 1, ty) !== G.DOCKPAD) continue;
      const c = rng.pick(CONTAINER_COLORS);
      const stack = rng.int(1, 3);
      const x0 = tx * t, y0 = ty * t;
      this.solids.push({ x0, y0, x1: x0 + 2 * t, y1: y0 + t, kind: 'container', color: c, stack });
      this.set(tx, ty, G.BUILDING); this.set(tx + 1, ty, G.BUILDING);
    }
    // warehouses along the south edge of the yard
    for (let bx = 0; bx < D.x1 - 8; bx += 10) {
      if (rng.chance(0.25)) continue;
      const x0 = (bx + 1) * t, y0 = 16 * t;
      const w = 7 * t, h = 2.6 * t;
      this.buildings.push({ x0, y0, x1: x0 + w, y1: y0 + h, h: 26, style: 'warehouse', seed: rng.int(0, 1e9) });
      for (let ty = 16; ty < 19; ty++)
        for (let tx = bx + 1; tx < bx + 8; tx++) this.set(tx, ty, G.BUILDING);
    }
    // a couple of old salts lounging near the pier ends
    for (let i = 0; i < 6; i++) {
      const pier = this.piers[i % this.piers.length];
      if (!pier) break;
      const px = (pier.tx + 0.5 + rng.int(0, 1)) * t;
      const py = (pier.ty0 + rng.int(1, 3) + 0.5) * t;
      this.props.push({ type: 'bollard', x: px, y: py, r: 3, variant: rng.int(0, 2) });
    }
    // two gantry cranes standing over the piers
    this.cranes.push({ x: 22.5 * t, y: 8 * t, span: 5 * t, dir: 1 });
    this.cranes.push({ x: 70.5 * t, y: 8 * t, span: 5 * t, dir: 1 });
    for (const cr of this.cranes) {
      this.solids.push({ x0: cr.x - 10, y0: cr.y - 10, x1: cr.x + 10, y1: cr.y + 34, kind: 'crane' });
    }
    // the cargo ship moored along the north water
    this.solids.push({ x0: 10 * t, y0: 0.4 * t, x1: 40 * t, y1: 3.6 * t, kind: 'ship' });
  }

  buildAirfield(rng) {
    const A = CFG.AIRFIELD;
    const t = CFG.T;
    for (let ty = A.y0; ty < A.y1; ty++)
      for (let tx = A.x0; tx < A.x1; tx++) this.set(tx, ty, G.RUNWAY);
    // runway band (slightly different tone, drawn from the code)
    for (let ty = 84; ty < 96; ty++)
      for (let tx = A.x0 + 2; tx < A.x1; tx++) this.set(tx, ty, G.RUNWAY);
    // hangars
    const hangarXs = [132, 142, 152];
    for (const hx of hangarXs) {
      const b = { x0: hx * t, y0: 66 * t, x1: (hx + 8) * t, y1: 74 * t, h: 30, style: 'hangar', seed: rng.int(0, 1e9) };
      this.hangars.push(b);
      this.buildings.push(b);
      for (let ty = 66; ty < 74; ty++)
        for (let tx = hx; tx < hx + 8; tx++) this.set(tx, ty, G.BUILDING);
    }
    // control tower
    const tw = { x0: 146 * t, y0: 78 * t, x1: 150 * t, y1: 82 * t, h: 64, style: 'tower', seed: 77 };
    this.buildings.push(tw);
    for (let ty = 78; ty < 82; ty++)
      for (let tx = 146; tx < 150; tx++) this.set(tx, ty, G.BUILDING);
    // perimeter fence: west, north, east + gate gap on the west at the road rows
    const fence = (x0, y0, x1, y1) => {
      this.solids.push({ x0, y0, x1, y1, kind: 'fence' });
      this.fences.push({ x0, y0, x1, y1 });
    };
    fence(A.x0 * t, A.y0 * t, (A.x0 + 1.2) * t, 102 * t);          // west up to gate
    fence(A.x0 * t, 104 * t, (A.x0 + 1.2) * t, A.y1 * t);          // west past gate
    fence(A.x0 * t, A.y0 * t, A.x1 * t, (A.y0 + 1) * t);           // north
    fence((A.x1 - 1) * t, A.y0 * t, A.x1 * t, A.y1 * t);           // east
    fence(A.x0 * t, (A.y1 - 1) * t, (132 - 1) * t, A.y1 * t);      // south-west run
    fence(134 * t, (A.y1 - 1) * t, A.x1 * t, A.y1 * t);            // south-east run
    // a small cargo plane parked by the hangars (drawn prop, solid core)
    this.props.push({ type: 'plane', x: 140 * t, y: 77 * t, r: 60, solid: false, ang: 0 });
  }

  buildPark(rng) {
    const P = CFG.PARK;
    const t = CFG.T;
    for (let ty = P.y0; ty < P.y1; ty++)
      for (let tx = P.x0; tx < P.x1; tx++) {
        if (this.at(tx, ty) === G.ROAD) continue;
        this.set(tx, ty, G.GRASS);
      }
    // pond
    for (let ty = 106; ty < 112; ty++)
      for (let tx = 74; tx < 80; tx++) this.set(tx, ty, G.WATER);
    // paths
    for (let tx = 72; tx < 92; tx++) { this.set(tx, 105, G.PLAZA); this.set(tx, 117, G.PLAZA); }
    for (let ty = 104; ty < 118; ty++) { this.set(72, ty, G.PLAZA); this.set(91, ty, G.PLAZA); }
    this.set(80, 110, G.PLAZA); this.set(81, 110, G.PLAZA);
    // trees in loose rows
    for (let i = 0; i < 40; i++) {
      const tx = rng.int(P.x0 + 1, P.x1 - 2);
      const ty = rng.int(P.y0 + 1, P.y1 - 2);
      const code = this.at(tx, ty);
      if (code !== G.GRASS) continue;
      this.propSolids.push({ x: (tx + 0.5) * t, y: (ty + 0.5) * t, r: 7, kind: 'tree' });
      this.props.push({ type: 'tree', x: (tx + 0.5) * t, y: (ty + 0.5) * t, r: 26, variant: rng.int(0, 2) });
    }
    // fountain plaza at the core
    this.props.push({ type: 'fountain', x: 84 * t, y: 110 * t, r: 24, solid: false });
    this.propSolids.push({ x: 84 * t, y: 110 * t, r: 12, kind: 'fountain' });
  }

  buildBeach(rng) {
    const t = CFG.T;
    for (let ty = CFG.BEACH.y0; ty < CFG.WATER_S.y1; ty++) {
      for (let tx = 0; tx < CFG.WT; tx++) {
        if (this.at(tx, ty) === G.ROAD) continue;
        this.set(tx, ty, ty < CFG.WATER_S.y0 ? G.SAND : G.WATER);
      }
    }
    // palms along the sand
    for (let i = 0; i < 34; i++) {
      const tx = rng.int(1, CFG.WT - 2);
      const ty = rng.int(CFG.BEACH.y0 + 1, CFG.WATER_S.y0 - 1);
      if (this.at(tx, ty) !== G.SAND) continue;
      this.propSolids.push({ x: (tx + 0.5) * t, y: (ty + 0.5) * t, r: 6, kind: 'palm' });
      this.props.push({ type: 'palm', x: (tx + 0.5) * t, y: (ty + 0.5) * t, r: 30, variant: rng.int(0, 3) });
    }
    // umbrellas and towels
    for (let i = 0; i < 16; i++) {
      const tx = rng.int(2, CFG.WT - 3);
      const ty = rng.int(CFG.BEACH.y0 + 2, CFG.WATER_S.y0 - 2);
      if (this.at(tx, ty) !== G.SAND) continue;
      this.props.push({ type: rng.chance(0.5) ? 'umbrella' : 'towel', x: (tx + 0.5) * t, y: (ty + 0.5) * t, r: 14, variant: rng.int(0, 5) });
    }
  }

  /** Buildings fill every ordinary city block between the roads. */
  buildCityBlocks(rng) {
    const { WT, HT, SUPER } = CFG;
    const inDocks = (tx, ty) => ty < CFG.DOCKS.y1 && tx < CFG.DOCKS.x1;
    const inAir = (tx, ty) => tx >= CFG.AIRFIELD.x0 && ty >= CFG.AIRFIELD.y0 && ty < CFG.AIRFIELD.y1;
    const inPark = (tx, ty) => tx >= CFG.PARK.x0 && tx < CFG.PARK.x1 && ty >= CFG.PARK.y0 && ty < CFG.PARK.y1;
    const inBeach = (ty) => ty >= CFG.BEACH.y0;

    for (let sy = 0; sy * SUPER < HT; sy++) {
      for (let sx = 0; sx * SUPER < WT; sx++) {
        for (const band of [[0, 5], [8, 13]]) {
          const x0 = sx * SUPER + band[0], x1 = sx * SUPER + band[1];
          for (const rband of [[0, 5], [8, 13]]) {
            const y0 = sy * SUPER + rband[0], y1 = sy * SUPER + rband[1];
            if (x1 >= WT || y1 >= HT) continue;
            if (inDocks(x0, y0) || inAir(x0, y0) || inPark(x0, y0) || inBeach(y0)) continue;
            this.blockBands.push({ x0: x0 * CFG.T, y0: y0 * CFG.T, x1: (x1 + 1) * CFG.T, y1: (y1 + 1) * CFG.T });
            this.fillBlock(x0, y0, x1, y1, rng);
          }
        }
      }
    }
  }

  /** One 6x6-tile block: 1-3 buildings with alleys, maybe a lot parking lot. */
  fillBlock(btx0, bty0, btx1, bty1, rng) {
    const t = CFG.T;
    const px0 = btx0 * t, py0 = bty0 * t, px1 = (btx1 + 1) * t, py1 = (bty1 + 1) * t;
    // some blocks stay open: parking lots and plazas
    if (rng.chance(0.14)) {
      this.props.push({ type: 'parkinglot', x0: px0, y0: py0, x1: px1, y1: py1 });
      return;
    }
    const cx = (px0 + px1) / 2, cy = (py0 + py1) / 2;
    const downtown = cx > 42 * t && cx < 118 * t && cy > 36 * t && cy < 106 * t;
    const beachfront = cy > 118 * t && cy < 143 * t;
    const inset = 10;
    const usable = { x0: px0 + inset, y0: py0 + inset, x1: px1 - inset, y1: py1 - inset };
    const layout = rng.weighted([
      { item: 'single', w: 3 },
      { item: 'twin', w: 4 },
      { item: 'triple', w: 3 },
    ]);
    const makeB = (bx0, by0, bx1, by1) => {
      let h;
      if (downtown) h = rng.range(44, 118);
      else if (beachfront) h = rng.range(52, 96);
      else h = rng.range(18, 52);
      const style = rng.weighted([
        { item: 'deco', w: 4 },
        { item: 'glass', w: 3 },
        { item: 'brick', w: 3 },
        { item: 'hotel', w: beachfront ? 4 : 1 },
      ]);
      const b = {
        x0: bx0, y0: by0, x1: bx1, y1: by1,
        h: Math.round(h), style, seed: rng.int(0, 1e9),
        neon: null, sign: null,
      };
      if (rng.chance(style === 'hotel' ? 0.85 : 0.24)) {
        b.neon = {
          color: rng.pick([CFG.NIGHT.neonPink, CFG.NIGHT.neonCyan, CFG.NIGHT.neonPurple, CFG.NIGHT.neonGreen, CFG.NIGHT.neonOrange]),
          side: rng.pick(['n', 's', 'w', 'e']),
        };
        this.lights.push({ x: (bx0 + bx1) / 2, y: (by0 + by1) / 2, color: b.neon.color, r: 90 });
      }
      if (style === 'hotel' || (style === 'deco' && rng.chance(0.4))) {
        b.sign = rng.pick(NEON_WORDS);
      }
      this.buildings.push(b);
      for (let ty = Math.floor(by0 / t); ty < Math.ceil(by1 / t); ty++)
        for (let tx = Math.floor(bx0 / t); tx < Math.ceil(bx1 / t); tx++)
          this.set(tx, ty, G.BUILDING);
    };
    const w = usable.x1 - usable.x0, h = usable.y1 - usable.y0;
    if (layout === 'single') {
      makeB(usable.x0, usable.y0, usable.x1, usable.y1);
    } else if (layout === 'twin') {
      if (rng.chance(0.5)) {
        const split = usable.x0 + w * rng.range(0.4, 0.6);
        makeB(usable.x0, usable.y0, split - 6, usable.y1);
        makeB(split + 6, usable.y0, usable.x1, usable.y1);
      } else {
        const split = usable.y0 + h * rng.range(0.4, 0.6);
        makeB(usable.x0, usable.y0, usable.x1, split - 6);
        makeB(usable.x0, split + 6, usable.x1, usable.y1);
      }
    } else {
      const g = 7;
      const a = usable.x0 + w * 0.36, b2 = usable.x0 + w * 0.64;
      makeB(usable.x0, usable.y0, a - g / 2, usable.y0 + h * 0.62);
      makeB(a + g / 2, usable.y0, b2 - g / 2, usable.y1);
      makeB(b2 + g / 2, usable.y0 + h * 0.3, usable.x1, usable.y1);
    }
    // street furniture on the sidewalk edges
    this.decorateBlock(btx0, bty0, btx1, bty1, rng);
  }

  /** Street lights, hydrants, dumpsters around a block's rim. */
  decorateBlock(btx0, bty0, btx1, bty1, rng) {
    const t = CFG.T;
    const corners = [
      [btx0, bty0], [btx1, bty0], [btx0, bty1], [btx1, bty1],
    ];
    for (const [tx, ty] of corners) {
      const px = (tx + 0.5) * t, py = (ty + 0.5) * t;
      if (rng.chance(0.5)) {
        this.propSolids.push({ x: px, y: py, r: 3.5, kind: 'streetlight' });
        this.props.push({ type: 'streetlight', x: px, y: py, r: 4 });
        if (rng.chance(0.5)) {
          this.lights.push({ x: px, y: py, color: '#ffb35c', r: 70, kind: 'street' });
        }
      } else if (rng.chance(0.4)) {
        this.props.push({ type: 'hydrant', x: px, y: py, r: 4 });
        this.propSolids.push({ x: px, y: py, r: 5, kind: 'hydrant', primed: true });
      }
    }
    if (rng.chance(0.3)) {
      const dx = (btx0 + rng.int(1, 4) + 0.5) * t;
      const dy = (bty0 + 0.3) * t;
      this.props.push({ type: 'dumpster', x: dx, y: dy, r: 8 });
      this.propSolids.push({ x: dx, y: dy, r: 8, kind: 'dumpster' });
    }
    // bus bench on a road-facing edge
    if (rng.chance(0.28)) {
      const bx = (btx0 + rng.int(1, 4) + 0.5) * t;
      const by = (bty1 + 0.6) * t;
      this.props.push({ type: 'bench', x: bx, y: by });
    }
    // hot dog cart, rare and beloved
    if (rng.chance(0.12)) {
      const hx = (btx1 - 0.6) * t;
      const hy = (bty0 + rng.int(1, 4) + 0.5) * t;
      this.props.push({ type: 'hotdog', x: hx, y: hy });
      this.propSolids.push({ x: hx, y: hy, r: 7, kind: 'hotdog' });
    }
  }

  buildBoundary() {
    const W = CFG.W, H = CFG.H;
    this.solids.push({ x0: -40, y0: -40, x1: W + 40, y1: 0, kind: 'boundary' });
    this.solids.push({ x0: -40, y0: H, x1: W + 40, y1: H + 40, kind: 'boundary' });
    this.solids.push({ x0: -40, y0: -40, x1: 0, y1: H + 40, kind: 'boundary' });
    this.solids.push({ x0: W, y0: -40, x1: W + 40, y1: H + 40, kind: 'boundary' });
  }

  /** Two bespoke landmarks: the Coral Tower penthouse and Rico's Garage. */
  buildLandmarks() {
    const t = CFG.T;
    // The Coral Tower: a round tower plaza near the penthouse spawn
    const cx = PLACES.penthouse.x, cy = PLACES.penthouse.y + 64;
    this.props.push({ type: 'coraltower', x: cx, y: cy, r: 46 });
    this.propSolids.push({ x: cx, y: cy, r: 38, kind: 'coraltower' });
    // Rico's Garage front: roll door + painted sign by the garage spawn
    const gx = PLACES.garage.x, gy = PLACES.garage.y;
    this.props.push({ type: 'garagefront', x: gx, y: gy - 40, r: 40 });
    this.solids.push({ x0: gx - 34, y0: gy - 48, x1: gx + 34, y1: gy - 30, kind: 'garagedoor' });
  }

  /** Road corridors + intersections from the stamped lattice. */
  collectRoadData() {
    const { WT, HT } = CFG;
    // vertical corridors: contiguous road columns
    for (let tx = 0; tx < WT; tx++) {
      if (this.at(tx, 80) !== G.ROAD) continue;
      let ty0 = 0;
      for (let ty = 0; ty < HT; ty++) {
        const road = this.at(tx, ty) === G.ROAD;
        const prevRoad = ty > 0 ? this.at(tx, ty - 1) === G.ROAD : false;
        if (road && !prevRoad) ty0 = ty;
        if (!road && prevRoad) this.roadsV.push({ tx, ty0, ty1: ty });
      }
      if (this.at(tx, HT - 1) === G.ROAD) this.roadsV.push({ tx, ty0, ty1: HT });
    }
    for (let ty = 0; ty < HT; ty++) {
      if (this.at(80, ty) !== G.ROAD) continue;
      let tx0 = 0;
      for (let tx = 0; tx < WT; tx++) {
        const road = this.at(tx, ty) === G.ROAD;
        const prevRoad = tx > 0 ? this.at(tx - 1, ty) === G.ROAD : false;
        if (road && !prevRoad) tx0 = tx;
        if (!road && prevRoad) this.roadsH.push({ ty, tx0, tx1: tx });
      }
      if (this.at(WT - 1, ty) === G.ROAD) this.roadsH.push({ ty, tx0, tx1: WT });
    }
    // intersections: where a vertical pair meets a horizontal pair
    const seen = new Set();
    for (const v of this.roadsV) {
      for (const h of this.roadsH) {
        if (h.tx0 <= v.tx && v.tx < h.tx1 && v.ty0 <= h.ty && h.ty < v.ty1) {
          const key = `${v.tx}:${h.ty}`;
          if (seen.has(key)) continue;
          seen.add(key);
          this.intersections.push({
            tx: v.tx, ty: h.ty,
            x: (v.tx + 1) * CFG.T,
            y: (h.ty + 1) * CFG.T,
          });
          // a signal post on each of two opposite corners
          const ix = (v.tx + 1) * CFG.T, iy = (h.ty + 1) * CFG.T;
          if (h.tx0 < v.tx && v.ty0 < h.ty) {
            this.props.push({ type: 'trafficlight', x: ix + 22, y: iy - 22, ix: v.tx + 1, iy: h.ty + 1, axis: 'ns' });
            this.props.push({ type: 'trafficlight', x: ix - 22, y: iy + 22, ix: v.tx + 1, iy: h.ty + 1, axis: 'ew' });
          }
        }
      }
    }
  }

  hashSolids() {
    this.hash.clear();
    const c = this.hashCell;
    for (const s of this.solids) {
      const gx0 = Math.floor(s.x0 / c), gx1 = Math.floor(s.x1 / c);
      const gy0 = Math.floor(s.y0 / c), gy1 = Math.floor(s.y1 / c);
      for (let gx = gx0; gx <= gx1; gx++)
        for (let gy = gy0; gy <= gy1; gy++) {
          const key = gx + ':' + gy;
          let arr = this.hash.get(key);
          if (!arr) { arr = []; this.hash.set(key, arr); }
          arr.push(s);
        }
    }
    // intersection tile set for crosswalk painting
    this.intersectionSet = new Set();
    for (const ix of this.intersections) {
      for (let dx = -1; dx <= 2; dx++) {
        for (let dy = -1; dy <= 2; dy++) {
          this.intersectionSet.add(`${ix.tx + dx}:${ix.ty + dy}`);
        }
      }
    }
  }

  /** Solid rects near a point (deduped, may share objects). */
  solidsNear(px, py, r, out) {
    out.length = 0;
    const c = this.hashCell;
    const gx0 = Math.floor((px - r) / c), gx1 = Math.floor((px + r) / c);
    const gy0 = Math.floor((py - r) / c), gy1 = Math.floor((py + r) / c);
    const seen = new Set();
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gy = gy0; gy <= gy1; gy++) {
        const arr = this.hash.get(gx + ':' + gy);
        if (!arr) continue;
        for (const s of arr) {
          if (seen.has(s)) continue;
          seen.add(s);
          out.push(s);
        }
      }
    return out;
  }

  // ------------------------------------------------------------ collision

  /**
   * Move a circle from (px,py) toward (nx,ny) and resolve against solids,
   * round props and water. Returns the corrected position.
   */
  collideCircle(px, py, nx, ny, r) {
    let x = nx, y = ny;
    const near = [];
    this.solidsNear(x, y, r + 12, near);
    const push = { px: 0, py: 0, depth: 0 };
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const s of near) {
        if (!circleRectHit(x, y, r, s)) continue;
        if (circleRectPush(x, y, r, s, push)) {
          x += push.px; y += push.py;
          moved = true;
        }
      }
      if (!moved) break;
    }
    // round props
    for (const p of this.propSolids) {
      const dx = x - p.x, dy = y - p.y;
      const rr = r + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x = p.x + (dx / d) * rr;
        y = p.y + (dy / d) * rr;
      }
    }
    // water blocks walkers and cars alike
    if (this.isWaterPx(x, y)) {
      x = px; y = py;
      if (this.isWaterPx(x, y)) {
        // both blocked: step back toward the last dry spot
        x = (px + nx) / 2; y = (py + ny) / 2;
      }
    }
    x = clamp(x, r, CFG.W - r);
    y = clamp(y, r, CFG.H - r);
    return { x, y };
  }

  /** Straight-line clearance check used by AI and bullets. */
  lineClear(ax, ay, bx, by) {
    const steps = Math.ceil(dist(ax, ay, bx, by) / 24);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const code = this.codeAt(x, y);
      if (code === G.BUILDING || code === G.WATER) return false;
    }
    return true;
  }

  // ------------------------------------------------------------- spawning

  pickSpawns() {
    for (const [key, p] of Object.entries(PLACES)) {
      this.spawns[key] = { x: p.x, y: p.y, label: p.label };
    }
    // nudge any spawn that landed inside something solid
    for (const s of Object.values(this.spawns)) {
      const near = [];
      this.solidsNear(s.x, s.y, 64, near);
      for (let i = 0; i < 24 && near.some((r) => circleRectHit(s.x, s.y, 12, r)); i++) {
        s.y += 24;
        this.solidsNear(s.x, s.y, 64, near);
      }
    }
  }

  /**
   * A random road lane point near (cx, cy) within `radius`, with a travel
   * direction that keeps to the right-hand lane.
   */
  randomLaneSpawn(rng, cx, cy, radius) {
    for (let i = 0; i < 40; i++) {
      const ang = rng.angle();
      const d = rng.range(120, radius);
      const x = clamp(cx + Math.cos(ang) * d, 64, CFG.W - 64);
      const y = clamp(cy + Math.sin(ang) * d, 64, CFG.H - 64);
      const tx = Math.floor(x / CFG.T), ty = Math.floor(y / CFG.T);
      // vertical road: columns tx..tx+1 both road
      if (this.at(tx, ty) === G.ROAD && this.at(tx + 1, ty) === G.ROAD && this.at(tx - 1, ty) === G.ROAD) {
        const centerX = (tx + 1) * CFG.T;
        const south = rng.chance(0.5);
        return { x: south ? centerX - 16 : centerX + 16, y, dir: south ? 1 : 3 };
      }
      if (this.at(tx, ty) === G.ROAD && this.at(tx, ty + 1) === G.ROAD && this.at(tx, ty - 1) === G.ROAD) {
        const centerY = (ty + 1) * CFG.T;
        const east = rng.chance(0.5);
        return { x, y: east ? centerY + 16 : centerY - 16, dir: east ? 0 : 2 };
      }
    }
    return null;
  }

  /** Lane world position for a corridor position and direction. */
  lanePos(x, y, dir) {
    const t = CFG.T;
    if (dir === 0 || dir === 2) { // horizontal movement, snap to lane y
      const ty = Math.floor(y / t);
      if (this.at(Math.floor(x / t), ty) === G.ROAD && this.at(Math.floor(x / t), ty + 1) === G.ROAD) {
        const centerY = (ty + 1) * t;
        return { x, y: dir === 0 ? centerY + 16 : centerY - 16 };
      }
      return { x, y };
    }
    const tx = Math.floor(x / t);
    if (this.at(tx, Math.floor(y / t)) === G.ROAD && this.at(tx + 1, Math.floor(y / t)) === G.ROAD) {
      const centerX = (tx + 1) * t;
      return { x: dir === 1 ? centerX - 16 : centerX + 16, y };
    }
    return { x, y };
  }

  /** Traffic light: true when north-south traffic may go at time t. */
  lightNS(ix, iy, t) {
    const phase = Math.floor(t / CFG.LIGHT_PERIOD) + Math.floor(ix / (CFG.SUPER * CFG.T)) + Math.floor(iy / (CFG.SUPER * CFG.T));
    return (phase & 1) === 0;
  }

  /** Display region name for the HUD. */
  regionName(px, py) {
    const tx = px / CFG.T, ty = py / CFG.T;
    if (pointInRect(tx, ty, { x0: CFG.DOCKS.x0, y0: CFG.DOCKS.y0, x1: CFG.DOCKS.x1, y1: CFG.DOCKS.y1 })) return 'NORTH DOCKS';
    if (pointInRect(tx, ty, { x0: CFG.AIRFIELD.x0, y0: CFG.AIRFIELD.y0, x1: CFG.AIRFIELD.x1, y1: CFG.AIRFIELD.y1 })) return 'PALM AIRFIELD';
    if (pointInRect(tx, ty, { x0: CFG.PARK.x0, y0: CFG.PARK.y0, x1: CFG.PARK.x1, y1: CFG.PARK.y1 })) return 'FLAMINGO PARK';
    if (ty >= CFG.BEACH.y0) return 'PALM BEACH';
    if (ty > 118) return 'OCEAN DRIVE';
    if (tx > 118) return 'EAST VICE';
    if (tx < 42) return 'WEST VICE';
    if (ty < 40) return 'LITTLE HAVANA';
    return 'DOWNTOWN';
  }

  // -------------------------------------------------------------- minimap

  prerenderMinimap() {
    const scale = 2; // 2px per tile
    const cv = document.createElement('canvas');
    cv.width = CFG.WT * scale;
    cv.height = CFG.HT * scale;
    const c = cv.getContext('2d');
    const colors = {
      [G.PLAZA]: '#20242e', [G.ROAD]: '#3c4250', [G.BUILDING]: '#14161c',
      [G.WATER]: '#12365c', [G.SAND]: '#6d5c3a', [G.GRASS]: '#1d4a2c',
      [G.RUNWAY]: '#2a2e36', [G.DOCKPAD]: '#2a2e36', [G.PIER]: '#3a3026',
      [G.FENCE]: '#444',
    };
    for (let ty = 0; ty < CFG.HT; ty++) {
      for (let tx = 0; tx < CFG.WT; tx++) {
        c.fillStyle = colors[this.at(tx, ty)] || '#20242e';
        c.fillRect(tx * scale, ty * scale, scale, scale);
      }
    }
    this.minimap = cv;
  }
}
