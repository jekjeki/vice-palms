// ---------------------------------------------------------------------------
// world.js — the static city of Vice Palms. Built once from a fixed seed:
// road grid with trimmed park gap, uptown blocks, docks with piers/containers/
// cranes/ship, Palm Airfield with runway/hangars/tower, beach and park.
// Exposes solids for physics, a node graph for traffic AI, sight-blocking for
// the police, spawn helpers and a pre-rendered minimap base.
// ---------------------------------------------------------------------------

import { CFG } from './config.js';
import { RNG } from './rng.js';
import { clamp, dist2, segDist2 } from './util.js';

const RW = CFG.ROAD_W;
const HRW = RW / 2;

const NEON_WORDS = [
  'VICE', 'PALMS', 'OCEAN', 'MIRAGE', 'STARLITE', 'TIKI', 'EL RIO', 'GATOR',
  'CUBAN', 'BINGO', 'LOANS', 'MOTEL', 'CLUB NEON', 'DINER', 'CASINO', '24-7',
  'RAMEN', 'HOTEL', 'ROXY', 'FLAMINGO', 'MAMBA', 'PIERCED', 'KRAKEN', 'ZODIAC',
];

export const world = {
  built: false,
  seed: 1337,

  // geometry ---------------------------------------------------------------
  solids: [],        // {x, y, x2, y2, w, h, tag, tall}
  circles: [],       // {x, y, r, tag}           trees, poles, tower
  water: [],         // rects the player may wade but vehicles/peds cannot enter
  piers: [],         // walkable decks carved out of water
  zones: [],         // painted ground: {x0, y0, x1, y1, kind}
  buildings: [],     // {x, y, w, h, ht, wall, roof, neon}
  containers: [],    // dock props with collision
  cranes: [],        // {x, y, flip, hue}
  ship: null,        // big hull rect at the north pier
  lamps: [],         // street light positions
  palms: [],         // decorative palm trees (also in circles as solids)
  hydrants: [],      // tiny sidewalk props
  billboards: [],    // glowing roof panels
  acUnits: [],       // rooftop clutter
  bollards: [],      // dock mooring posts
  umbrellas: [],     // beach umbrellas + towels
  beds: [],          // park flowerbeds
  edgeLights: [],    // runway edge lights
  taxiRanks: [],     // rank shelters
  gulls: [],         // seagulls wheeling over the piers
  streetNames: new Map(), // road id → name
  site: null,        // the construction site (crane + cones + footings)
  parkingLots: [],   // painted stalls; the sim parks cars in some
  boardwalk: null,   // beach boardwalk strip
  busStops: [],      // shelters with signs
  nodes: [],         // traffic graph nodes {i, x, y, edges[], lights}
  roadRects: [],     // axis-aligned asphalt rectangles for point tests
  segRects: [],      // same list, tagged with axis/road for convenience

  // places -----------------------------------------------------------------
  spawn: { x: 840, y: 3350, angle: -Math.PI / 2 },
  hospital: { x: 2840, y: 3520 },
  policeHQ: { x: 1240, y: 1920 },
  downtown: { x: 2040, y: 2680 },

  minimap: null,     // offscreen canvas built by buildMinimap()

  // ------------------------------------------------------------------ build
  build(seed = 1337) {
    this.seed = seed;
    const rng = new RNG(seed);
    this.solids.length = 0;
    this.circles.length = 0;
    this.water.length = 0;
    this.piers.length = 0;
    this.zones.length = 0;
    this.buildings.length = 0;
    this.containers.length = 0;
    this.cranes.length = 0;
    this.lamps.length = 0;
    this.palms.length = 0;
    this.nodes.length = 0;
    this.roadRects.length = 0;
    this.segRects.length = 0;

    this._buildWater();
    this._buildRoads();
    this._buildGraph();
    this._buildCityBlocks(rng);
    this._buildUptown(rng);
    this._buildPark(rng);
    this._buildDocks(rng);
    this._buildAirfield(rng);
    this._buildBeach(rng);
    this._buildLamps();
    this._buildDetail(rng);
    this._edgeWalls();
    this.built = true;
    this.buildMinimap();
    this._buildDistricts();
    return this;
  },

  // named neighbourhoods — the HUD greets you when you cross the line
  districts: [],
  _buildDistricts() {
    this.districts = [
      { name: 'NORTH DOCKS', x0: 140, y0: 140, x1: 2440, y1: 760 },
      { name: 'PALM AIRFIELD', x0: 2460, y0: 140, x1: 3820, y1: 760 },
      { name: 'OCEAN DRIVE', x0: 3620, y0: 760, x1: 4096, y1: 4096 },
      { name: 'SOUTH BEACH', x0: 0, y0: 3925, x1: 3620, y1: 4096 },
      { name: 'MEMORIAL PARK', x0: 2085, y0: 1925, x1: 2795, y1: 2635 },
      { name: 'DOWNTOWN', x0: 1440, y0: 1440, x1: 3040, y1: 3920 },
      { name: 'LITTLE HAVANA', x0: 0, y0: 1440, x1: 1440, y1: 3920 },
      { name: 'THE HEIGHTS', x0: 3040, y0: 1440, x1: 3620, y1: 3920 },
      { name: 'UPTOWN', x0: 0, y0: 760, x1: 4096, y1: 1440 },
    ];
  },

  districtAt(x, y) {
    for (const d of this.districts) {
      if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
    }
    return 'VICE PALMS';
  },

  _addSolid(x, y, w, h, tag = 'bld', tall = true) {
    this.solids.push({ x, y, x2: x + w, y2: y + h, w, h, tag, tall });
  },

  _buildWater() {
    const W = CFG.WORLD;
    // north sea: full width down to WATER_N, but the docks strip is a giant
    // boardwalk so only the stretch east of the docks + the far west is open
    // water; piers are carved out separately.
    this.water.push({ x: 0, y: 0, x2: W, y2: CFG.WATER_N, tag: 'sea' });
    this.water.push({ x: CFG.WATER_E, y: 0, x2: W, y2: W, tag: 'sea' });
    this.zones.push({ x0: 0, y0: 0, x1: W, y1: CFG.WATER_N + 40, kind: 'water' });
    this.zones.push({ x0: CFG.WATER_E - 40, y0: 0, x1: W, y1: W, kind: 'water' });
  },

  _road(x0, y0, x1, y1, axis, road) {
    const r = { x: x0, y: y0, x2: x1, y2: y1, w: x1 - x0, h: y1 - y0, axis, road };
    this.roadRects.push(r);
    this.segRects.push(r);
    return r;
  },

  _buildRoads() {
    const V = CFG.CITY_VX, H = CFG.CITY_HY, C = CFG.CONNECTORS;
    const park = CFG.PARK;
    // harbour highway (full span)
    this._road(CFG.HARBOR_X0, CFG.HARBOR_Y - HRW, CFG.HARBOR_X1, CFG.HARBOR_Y + HRW, 'h', 'h805');
    // connectors run from the coast road into the grid; 440/1240/2040/2840/3640
    for (const x of C) this._road(x - HRW, CFG.HARBOR_Y + HRW, x + HRW, H[0] - HRW, 'v', 'c' + x);
    // city verticals; x=2440 is trimmed by the park
    for (const x of V) {
      if (x === 2440) {
        this._road(x - HRW, H[0] - HRW, x + HRW, park.y0, 'v', 'v2440a');
        this._road(x - HRW, park.y1, x + HRW, H[H.length - 1] + HRW, 'v', 'v2440b');
      } else {
        this._road(x - HRW, H[0] - HRW, x + HRW, H[H.length - 1] + HRW, 'v', 'v' + x);
      }
    }
    // city horizontals; y=2280 is trimmed by the park
    for (const y of H) {
      if (y === 2280) {
        this._road(V[0] - HRW, y - HRW, park.x0, y + HRW, 'h', 'h2280a');
        this._road(park.x1, y - HRW, V[V.length - 1] + HRW, y + HRW, 'h', 'h2280b');
      } else {
        this._road(V[0] - HRW, y - HRW, V[V.length - 1] + HRW, y + HRW, 'h', 'h' + y);
      }
    }
  },

  // every crossing of a vertical and horizontal road becomes a graph node;
  // consecutive nodes along each road segment are linked.
  _buildGraph() {
    const segs = this.segRects;
    const vSegs = segs.filter((s) => s.axis === 'v');
    const hSegs = segs.filter((s) => s.axis === 'h');
    const key = (x, y) => x + ':' + y;
    const nodeMap = new Map();
    const nodeAt = (x, y) => {
      const k = key(x, y);
      let n = nodeMap.get(k);
      if (!n) {
        n = { i: this.nodes.length, x, y, edges: [], lights: false };
        nodeMap.set(k, n);
        this.nodes.push(n);
      }
      return n;
    };
    for (const v of vSegs) {
      const crossings = [];
      for (const h of hSegs) {
        if (v.x < h.x2 && v.x2 > h.x && h.y < v.y2 && h.y2 > v.y) {
          crossings.push({ x: (Math.max(v.x, h.x) + Math.min(v.x2, h.x2)) / 2, y: (Math.max(v.y, h.y) + Math.min(v.y2, h.y2)) / 2, h });
        }
      }
      crossings.sort((a, b) => a.y - b.y);
      let prev = null;
      for (const c of crossings) {
        const n = nodeAt(Math.round((v.x + v.x2) / 2), Math.round(c.y));
        if (prev && prev !== n) this._link(prev, n, v);
        prev = n;
      }
    }
    for (const h of hSegs) {
      const crossings = [];
      for (const v of vSegs) {
        if (v.x < h.x2 && v.x2 > h.x && h.y < v.y2 && h.y2 > v.y) {
          crossings.push({ x: (Math.max(v.x, h.x) + Math.min(v.x2, h.x2)) / 2, y: (Math.max(v.y, h.y) + Math.min(v.y2, h.y2)) / 2 });
        }
      }
      crossings.sort((a, b) => a.x - b.x);
      let prev = null;
      for (const c of crossings) {
        const n = nodeAt(Math.round(c.x), Math.round((h.y + h.y2) / 2));
        if (prev && prev !== n) this._link(prev, n, h);
        prev = n;
      }
    }
    // traffic lights at real city crossroads (3+ approaches), not dead ends
    for (const n of this.nodes) {
      n.lights = n.edges.length >= 3 && n.y > 1300 && n.x > 300;
    }
    this.nodeMap = nodeMap;
  },

  _link(a, b, seg) {
    a.edges.push({ to: b, seg });
    b.edges.push({ to: a, seg });
  },

  // interior of a city block: between road edges, sidewalk margin applied
  _blockRect(x0, y0, x1, y1, inset) {
    const bx = x0 + HRW + inset, by = y0 + HRW + inset;
    const bw = x1 - HRW - inset - bx, bh = y1 - HRW - inset - by;
    return bw > 60 && bh > 60 ? { x: bx, y: by, w: bw, h: bh } : null;
  },

  _placeBuildings(rng, bx, by, bw, bh, opts = {}) {
    const htBase = opts.ht || 60;
    const pattern = opts.pattern !== undefined ? opts.pattern : rng.int(0, 4);
    const list = [];
    const mk = (x, y, w, h) => {
      const dc = dist2(x + w / 2, y + h / 2, this.downtown.x, this.downtown.y);
      const boost = Math.max(0, 1 - dc / 2600);
      const ht = clamp(htBase * rng.range(0.8, 1.5) + boost * 95, 40, 168);
      list.push({ x, y, w, h, ht });
    };
    if (pattern === 0) {
      mk(bx + 8, by + 8, bw - 16, bh - 16);
    } else if (pattern === 1) {
      if (bw >= bh) {
        const gap = 30, w1 = bw * rng.range(0.35, 0.62);
        mk(bx + 8, by + 8, w1 - 8, bh - 16);
        mk(bx + w1 + gap, by + 8, bw - w1 - gap - 8, bh - 16);
      } else {
        const gap = 30, h1 = bh * rng.range(0.35, 0.62);
        mk(bx + 8, by + 8, bw - 16, h1 - 8);
        mk(bx + 8, by + h1 + gap, bw - 16, bh - h1 - gap - 8);
      }
    } else if (pattern === 2) {
      const gap = 26, w1 = bw * rng.range(0.4, 0.6), h1 = bh * rng.range(0.4, 0.6);
      mk(bx + 8, by + 8, w1 - 8, h1 - 8);
      mk(bx + w1 + gap, by + 8, bw - w1 - gap - 8, bh - 16);
      mk(bx + 8, by + h1 + gap, w1 - 8, bh - h1 - gap - 8);
    } else {
      // courtyard of four
      const gap = 46, w1 = bw / 2 - gap / 2, h1 = bh / 2 - gap / 2;
      mk(bx + 8, by + 8, w1, h1);
      mk(bx + bw - w1 - 8, by + 8, w1, h1);
      mk(bx + 8, by + bh - h1 - 8, w1, h1);
      mk(bx + bw - w1 - 8, by + bh - h1 - 8, w1, h1);
    }
    for (const b of list) {
      const pal = rng.chance(0.3) ? CFG.COL.roof2 : CFG.COL.roof;
      const bld = {
        x: b.x, y: b.y, w: b.w, h: b.h, ht: b.ht,
        wall: CFG.COL.buildingWall, roof: pal,
        neon: null,
      };
      if (b.ht > 62 && rng.chance(0.38)) {
        bld.neon = {
          text: rng.pick(NEON_WORDS),
          color: rng.pick(CFG.COL.neon),
          x: b.x + b.w / 2,
          y: b.y + b.h - 8,
        };
      }
      this.buildings.push(bld);
      this._addSolid(b.x, b.y, b.w, b.h, 'bld', true);
    }
  },

  _buildCityBlocks(rng) {
    const V = CFG.CITY_VX, H = CFG.CITY_HY;
    const park = CFG.PARK;
    this.zones.push({ x0: V[0] - HRW, y0: H[0] - HRW, x1: V[V.length - 1] + HRW, y1: H[H.length - 1] + HRW, kind: 'concrete' });
    // two of the blocks are municipal parking lots instead of towers
    const lots = [{ i: 2, j: 1 }, { i: 5, j: 4 }];
    for (const { i, j } of lots) this._buildParkingLot(V[i], H[j], V[i + 1], H[j + 1]);
    for (let i = 0; i < V.length - 1; i++) {
      for (let j = 0; j < H.length - 1; j++) {
        if (lots.some((l) => l.i === i && l.j === j)) continue;
        const b = this._blockRect(V[i], H[j], V[i + 1], H[j + 1], CFG.SIDEWALK);
        if (!b) continue;
        // skip everything the park swallowed
        if (b.x < park.x1 && b.x + b.w > park.x0 && b.y < park.y1 && b.y + b.h > park.y0) continue;
        this._placeBuildings(rng, b.x, b.y, b.w, b.h, { ht: 58 });
        if (rng.chance(0.35)) { // back-alley dumpster
          const dx = b.x + rng.range(10, b.w - 40), dy = b.y + rng.range(10, b.h - 30);
          this._addSolid(dx, dy, 30, 18, 'dump', false);
          this.containers.push({ x: dx, y: dy, w: 30, h: 18, hue: rng.pick(['#2e6e4e', '#6e2e3d', '#3d5a7a']), alley: true });
        }
      }
    }
  },

  /** a parking lot block: rows of painted stalls the sim can occupy */
  _buildParkingLot(x0, y0, x1, y1) {
    const inset = CFG.SIDEWALK + 14;
    const bx = x0 + HRW + inset, by = y0 + HRW + inset;
    const bw = x1 - HRW - inset - bx, bh = y1 - HRW - inset - by;
    if (bw < 120 || bh < 120) return;
    const lot = { x: bx, y: by, w: bw, h: bh, stalls: [], kind: 'lot' };
    const stallW = 46, stallH = 74;
    const cols = Math.floor((bw - 40) / (stallW + 6));
    const rows = Math.floor((bh - 40) / (stallH + 30));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sx = bx + 26 + c * (stallW + 6);
        const sy = by + 24 + r * (stallH + 30);
        lot.stalls.push({ x: sx + stallW / 2, y: sy + stallH / 2, w: stallW, h: stallH, angle: 0, row: r });
      }
    }
    this.zones.push({ x0: bx, y0: by, x1: bx + bw, y1: by + bh, kind: 'lot' });
    this.parkingLots.push(lot);
  },

  _buildUptown(rng) {
    // strip between the coast road and the city grid, bounded by connectors
    const C = CFG.CONNECTORS;
    const y0 = CFG.HARBOR_Y + HRW + 40, y1 = CFG.CITY_HY[0] - HRW - CFG.SIDEWALK;
    this.zones.push({ x0: C[0] - HRW, y0: y0 - 40, x1: C[C.length - 1] + HRW, y1: y1 + 40, kind: 'dirt' });
    for (let i = 0; i < C.length - 1; i++) {
      const b = this._blockRect(C[i], y0 - 40, C[i + 1], y1 + 40, CFG.SIDEWALK);
      if (!b) continue;
      this._placeBuildings(rng, b.x, b.y, b.w, b.h, { ht: 44, pattern: rng.int(0, 3) });
    }
  },

  _buildPark(rng) {
    const p = CFG.PARK;
    this.zones.push({ x0: p.x0 - 30, y0: p.y0 - 30, x1: p.x1 + 30, y1: p.y1 + 30, kind: 'grass' });
    // pond with a rim
    const pond = CFG.POND;
    this.circles.push({ x: pond.x, y: pond.y, r: pond.r + 8, tag: 'pond' });
    // diagonal paths
    this.zones.push({ x0: p.x0, y0: (p.y0 + p.y1) / 2 - 12, x1: p.x1, y1: (p.y0 + p.y1) / 2 + 12, kind: 'path' });
    this.zones.push({ x0: (p.x0 + p.x1) / 2 - 12, y0: p.y0, x1: (p.x0 + p.x1) / 2 + 12, y1: p.y1, kind: 'path' });
    // fountain in the paths' crossing
    this.circles.push({ x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2, r: 22, tag: 'fountain' });
    // trees in a loose scatter, keeping clear of paths and pond
    let tries = 0;
    let placed = 0;
    while (placed < 34 && tries < 300) {
      tries++;
      const x = rng.range(p.x0 + 30, p.x1 - 30), y = rng.range(p.y0 + 30, p.y1 - 30);
      if (dist2(x, y, pond.x, pond.y) < (pond.r + 40) ** 2) continue;
      if (Math.abs(y - (p.y0 + p.y1) / 2) < 30 || Math.abs(x - (p.x0 + p.x1) / 2) < 30) continue;
      const r = rng.range(11, 17);
      this.circles.push({ x, y, r, tag: 'tree' });
      this.palms.push({ x, y, r, kind: 'oak' });
      placed++;
    }
    // benches
    for (let i = 0; i < 6; i++) {
      const x = rng.range(p.x0 + 40, p.x1 - 60), y = rng.range(p.y0 + 40, p.y1 - 60);
      if (dist2(x, y, pond.x, pond.y) < (pond.r + 50) ** 2) continue;
      this._addSolid(x, y, 26, 10, 'bench', false);
    }
  },

  _buildDocks(rng) {
    const d = CFG.DOCKS;
    this.zones.push({ x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1, kind: 'concrete' });
    // harbor fence along the waterline gap between piers (with two gates)
    for (let x = 820; x < 1540; x += 20) {
      if (Math.abs(x - 1180) < 40) continue; // gate
      this._addSolid(x, 165, 10, 14, 'fence', false);
    }
    for (let x = 1700; x < 2280; x += 20) {
      if (Math.abs(x - 1980) < 40) continue;
      this._addSolid(x, 165, 10, 14, 'fence', false);
    }
    // two piers reaching into the sea
    const pier1 = { x: 700, y: 20, w: 90, h: CFG.WATER_N - 20 + 30 };
    const pier2 = { x: 1560, y: 20, w: 90, h: CFG.WATER_N - 20 + 30 };
    this.piers.push(pier1, pier2);
    // cargo ship moored along the first pier (hull is solid)
    this.ship = { x: pier1.x + 110, y: -20, w: 190, h: 300, bridge: 46 };
    this._addSolid(this.ship.x, this.ship.y, this.ship.w, this.ship.h, 'ship', true);
    // cranes at each pier foot
    this.cranes.push({ x: pier1.x - 60, y: CFG.WATER_N + 40, flip: false, hue: '#c2782e' });
    this.cranes.push({ x: pier2.x + 110, y: CFG.WATER_N + 40, flip: true, hue: '#2e7ac2' });
    this._addSolid(pier1.x - 74, CFG.WATER_N + 30, 44, 44, 'crane', true);
    this._addSolid(pier2.x + 96, CFG.WATER_N + 30, 44, 44, 'crane', true);
    // container yard: rows of stacked boxes with alleys
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const y = 260 + r * 70;
      let x = 240;
      while (x < 1380) {
        const w = rng.pick([62, 62, 90]);
        if (rng.chance(0.82)) {
          const hue = rng.pick(['#7a3d2e', '#2e6e5a', '#8a6a2e', '#3d4a7a', '#5a2e6e', '#6e2e3d']);
          this._addSolid(x, y, w, 30, 'cont', false);
          this.containers.push({ x, y, w, h: 30, hue, stack: rng.int(1, 4) });
        }
        x += w + rng.range(26, 70);
      }
    }
    // warehouses along the south edge of the docks
    for (let i = 0; i < 3; i++) {
      const x = 250 + i * 640, y = 580;
      this._addSolid(x, y, 260, 105, 'wh', true);
      this.buildings.push({ x, y, w: 260, h: 105, ht: 52, wall: CFG.COL.buildingWall, roof: '#3a4250', neon: i === 1 ? { text: 'DOCKS', color: '#3fd9ff', x: x + 130, y: y + 92 } : null, flat: true });
    }
    // pier bait-and-tackle shacks at the foot of each pier
    this.buildings.push({ x: 820, y: 175, w: 80, h: 54, ht: 34, wall: CFG.COL.buildingWall, roof: '#4e4335', neon: { text: 'BAIT', color: '#8bff5e', x: 860, y: 222 }, flat: true });
    this._addSolid(820, 175, 80, 54, 'shack', true);
    this.buildings.push({ x: 1680, y: 175, w: 80, h: 54, ht: 34, wall: CFG.COL.buildingWall, roof: '#4e4335', neon: { text: 'TACKLE', color: '#ffd23e', x: 1720, y: 222 }, flat: true });
    this._addSolid(1680, 175, 80, 54, 'shack', true);
  },

  _buildAirfield(rng) {
    const a = CFG.AIRFIELD;
    this.zones.push({ x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, kind: 'dirt' });
    const rw = CFG.RUNWAY;
    this.zones.push({ x0: rw.x0, y0: rw.y0, x1: rw.x1, y1: rw.y1, kind: 'runway' });
    // hangars
    for (let i = 0; i < 3; i++) {
      const x = 2600 + i * 330, y = 180;
      this._addSolid(x, y, 220, 120, 'hangar', true);
      this.buildings.push({ x, y, w: 220, h: 120, ht: 58, wall: CFG.COL.buildingWall, roof: '#39424f', neon: i === 0 ? { text: 'PALM AIR', color: '#8bff5e', x: x + 110, y: y + 108 } : null, flat: true, arch: true });
    }
    // tower
    this.circles.push({ x: 3640, y: 260, r: 26, tag: 'tower' });
    this.buildings.push({ x: 3606, y: 320, w: 68, h: 54, ht: 120, wall: CFG.COL.buildingWall, roof: '#414a5c', neon: { text: 'ATC', color: '#ff5e5e', x: 3640, y: 366 }, flat: true });
    // crates and fuel drums
    for (let i = 0; i < 8; i++) {
      const x = rng.range(2560, 3700), y = rng.range(600, 680);
      this._addSolid(x, y, 34, 34, 'crate', false);
      this.containers.push({ x, y, w: 34, h: 34, hue: '#7a6a3d', alley: true });
    }
  },

  _buildBeach(rng) {
    // north sand in front of the docks and east sand strip
    this.zones.push({ x0: 0, y0: CFG.WATER_N, x1: CFG.WATER_E, y1: CFG.SAND_N1, kind: 'sand' });
    this.zones.push({ x0: CFG.SAND_E0, y0: 0, x1: CFG.WATER_E, y1: CFG.WORLD, kind: 'sand' });
    // the boardwalk: planked strip along the north beach
    this.boardwalk = { x: 2400, y: CFG.SAND_N1, w: 1220, h: 60 };
    this.zones.push({ x0: this.boardwalk.x, y0: this.boardwalk.y, x1: this.boardwalk.x + this.boardwalk.w, y1: this.boardwalk.y + this.boardwalk.h, kind: 'boardwalk' });
    // palms scattered on both beaches
    let placed = 0, tries = 0;
    while (placed < 26 && tries < 200) {
      tries++;
      const north = rng.chance(0.5);
      const x = north ? rng.range(60, 2400) : rng.range(CFG.SAND_E0 + 30, CFG.WATER_E - 30);
      const y = north ? rng.range(CFG.WATER_N + 24, CFG.SAND_N1 - 10) : rng.range(240, 3900);
      if (this.solidHit(x, y, 30)) continue;
      if (this.nearRoad(x, y, 70)) continue;
      const r = rng.range(12, 16);
      this.circles.push({ x, y, r, tag: 'palm' });
      this.palms.push({ x, y, r, kind: 'palm' });
      placed++;
    }
    // south beach strip below the last road
    this.zones.push({ x0: 0, y0: CFG.CITY_HY[CFG.CITY_HY.length - 1] + HRW, x1: CFG.SAND_E0, y1: CFG.WORLD, kind: 'sand' });
    for (let i = 0; i < 10; i++) {
      const x = rng.range(300, 3400), y = rng.range(3990, 4060);
      if (this.solidHit(x, y, 30)) continue;
      const r = rng.range(12, 16);
      this.circles.push({ x, y, r, tag: 'palm' });
      this.palms.push({ x, y, r, kind: 'palm' });
    }
  },

  _buildLamps() {
    for (const s of this.segRects) {
      if (s.axis === 'v') {
        for (let y = s.y + 130; y < s.y2 - 60; y += 300) {
          this.lamps.push({ x: s.x - HRW - 10, y, side: -1 });
          this.lamps.push({ x: s.x2 + HRW + 10, y: y + 150, side: 1 });
        }
      } else {
        for (let x = s.x + 130; x < s.x2 - 60; x += 300) {
          this.lamps.push({ x, y: s.y - HRW - 10, side: -1 });
          this.lamps.push({ x: x + 150, y: s.y2 + HRW + 10, side: 1 });
        }
      }
    }
  },

  _buildDetail(rng) {
    // rooftop clutter + glowing billboards on bigger roofs
    for (const b of this.buildings) {
      if (b.w > 90 && b.h > 90 && rng.chance(0.55)) {
        const n = rng.int(1, 3);
        for (let i = 0; i < n; i++) {
          this.acUnits.push({
            x: b.x + rng.range(12, b.w - 22),
            y: b.y + rng.range(12, b.h - 22),
            w: rng.range(12, 20),
          });
        }
      }
      if (b.w > 120 && b.h > 70 && rng.chance(0.4)) {
        this.billboards.push({
          x: b.x + b.w / 2,
          y: b.y + 26,
          w: Math.min(b.w - 40, 120),
          text: rng.pick(['PALM FM 101.3', 'EL BANCO', 'BEACH OPEN 24H', 'V-ICE COLA', 'GATOR GYM', 'CRUZ AUTO']),
          hue: rng.pick(CFG.COL.neon),
        });
      }
    }
    // hydrants beside sidewalks (visual only, they are family)
    for (const s of this.segRects) {
      if (!s.axis && s.axis !== 'v' && s.axis !== 'h') continue;
      const n = 2 + Math.floor(rng.next() * 3);
      for (let i = 0; i < n; i++) {
        if (s.axis === 'v') {
          this.hydrants.push({ x: s.x - HRW - 12, y: rng.range(s.y + 60, s.y2 - 60) });
        } else {
          this.hydrants.push({ x: rng.range(s.x + 60, s.x2 - 60), y: s.y - HRW - 12 });
        }
      }
    }
    // dock bollards along the waterline
    for (let x = 260; x < 2300; x += 130) {
      this.bollards.push({ x, y: CFG.WATER_N + 18 });
    }
    // beach umbrellas + towels
    for (let i = 0; i < 14; i++) {
      const east = rng.chance(0.5);
      const x = east ? rng.range(CFG.SAND_E0 + 40, CFG.WATER_E - 60) : rng.range(2400, 3600);
      const y = east ? rng.range(240, 3900) : rng.range(CFG.SAND_N1 + 60, 320);
      if (this.solidHit(x, y, 20) || this.nearRoad(x, y, 60)) continue;
      this.umbrellas.push({
        x, y, r: rng.range(16, 24),
        hue: rng.pick(['#ff4d9d', '#3fd9ff', '#ffd23e', '#ff8a3d']),
        towel: rng.chance(0.7),
        towelRot: rng.range(-0.4, 0.4),
      });
    }
    // park flowerbeds
    const p = CFG.PARK;
    for (let i = 0; i < 8; i++) {
      const x = rng.range(p.x0 + 60, p.x1 - 60);
      const y = rng.range(p.y0 + 60, p.y1 - 60);
      if (dist2(x, y, CFG.POND.x, CFG.POND.y) < (CFG.POND.r + 60) ** 2) continue;
      this.beds.push({ x, y, w: rng.range(26, 44), hue: rng.pick(['#e86a8a', '#e8c85e', '#c07be8', '#8ab0e8']) });
    }
    // runway edge lights
    for (let x = CFG.RUNWAY.x0; x <= CFG.RUNWAY.x1; x += 80) {
      this.edgeLights.push({ x, y: CFG.RUNWAY.y0 - 6 });
      this.edgeLights.push({ x, y: CFG.RUNWAY.y1 + 6 });
    }
    // taxi ranks at three corners
    for (const [x, y, a] of [[1240, 1545, 0], [3240, 3545, 0], [440, 3460, Math.PI / 2]]) {
      this.taxiRanks.push({ x, y, angle: a });
    }
    // seagulls wheeling over the piers and the beach
    for (let i = 0; i < 9; i++) {
      this.gulls.push({
        cx: rng.pick([745, 1610, 3400, 1800]),
        cy: rng.pick([90, 90, 200, 300]),
        r: rng.range(60, 190),
        w: rng.range(0.3, 0.8) * (rng.chance(0.5) ? 1 : -1),
        ph: rng.range(0, 6.3),
        bob: rng.range(3, 9),
      });
    }
    // street names on the main roads (HUD reads these)
    const names = [
      ['h805', 'HARBOR FWY'], ['h1480', 'FLAMINGO RD'], ['h1880', 'PALM ST'],
      ['h2280', 'MIRAGE AVE'], ['h2680', 'FLAMINGO RD'], ['h3080', 'OCEAN AVE'],
      ['h3480', 'MERIDIAN ST'], ['h3880', 'SOUTH BEACH RD'],
      ['v440', '1ST ST'], ['v840', '3RD ST'], ['v1240', 'STARLITE BLVD'],
      ['v1640', '5TH ST'], ['v2040', 'ROXANNE AVE'], ['v2440', '7TH ST'],
      ['v2840', 'MERCY AVE'], ['v3240', '9TH ST'], ['v3640', 'COAST HWY'],
    ];
    for (const [id, name] of names) this.streetNames.set(id, name);
    // a fenced construction site in a downtown block corner
    const sx = 3260, sy = 1960;
    this.site = {
      x: sx, y: sy, w: 300, h: 240,
      footings: [], coneX: [], craneX: sx + 40, craneY: sy + 40,
    };
    for (let i = 0; i < 4; i++) {
      this.site.footings.push({ x: sx + 40 + (i % 2) * 150, y: sy + 60 + Math.floor(i / 2) * 110, r: 22 });
      this._addSolid(sx + 28 + (i % 2) * 150, sy + 48 + Math.floor(i / 2) * 110, 44, 44, 'foot', false);
    }
    for (let i = 0; i < 6; i++) {
      this.site.coneX.push({ x: sx - 20 + i * 55, y: sy + this.site.h + 20 });
    }
  },

  _edgeWalls() {
    const W = CFG.WORLD;
    this._addSolid(-40, 0, 180, W, 'wall', true);       // west
    this._addSolid(-40, W - 120, W, 160, 'wall', true); // south
  },

  // ---------------------------------------------------------------- queries
  /** is a point on asphalt? */
  isRoad(x, y) {
    for (const r of this.roadRects) {
      if (x >= r.x && x <= r.x2 && y >= r.y && y <= r.y2) return true;
    }
    return false;
  },

  nearRoad(x, y, pad = 0) {
    for (const r of this.roadRects) {
      if (x >= r.x - pad && x <= r.x2 + pad && y >= r.y - pad && y <= r.y2 + pad) return true;
    }
    return false;
  },

  isWater(x, y) {
    if (y < CFG.WATER_N || x > CFG.WATER_E) {
      // piers override
      for (const p of this.piers) {
        if (x >= p.x - 6 && x <= p.x + p.w + 6 && y >= p.y - 6 && y <= p.y + p.h + 6) return false;
      }
      return true;
    }
    return false;
  },

  solidHit(x, y, pad = 0) {
    for (const s of this.solids) {
      if (x >= s.x - pad && x <= s.x2 + pad && y >= s.y - pad && y <= s.y2 + pad) return s;
    }
    for (const c of this.circles) {
      if (dist2(x, y, c.x, c.y) <= (c.r + pad) * (c.r + pad)) return c;
    }
    return null;
  },

  /**
   * Resolve a circle against solids + water. Returns the corrected position
   * or null if nothing was hit. `opts.water` treats sea as solid (cars, peds).
   */
  collide(x, y, r, opts = {}) {
    let hit = false;
    let nx = x, ny = y;
    for (const s of this.solids) {
      const p = this._pushCircleRect(nx, ny, r, s);
      if (p) { nx += p.x; ny += p.y; hit = true; }
    }
    for (const c of this.circles) {
      const dx = nx - c.x, dy = ny - c.y;
      const d2 = dx * dx + dy * dy;
      const rr = r + c.r;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = c.x + (dx / d) * rr;
        ny = c.y + (dy / d) * rr;
        hit = true;
      }
    }
    if (opts.water !== false && this.isWater(nx, ny) && !this.onPier(nx, ny)) {
      // block at the shoreline: push back toward the given fallback heading
      if (ny < CFG.WATER_N) { ny = CFG.WATER_N + r; hit = true; }
      if (nx > CFG.WATER_E) { nx = CFG.WATER_E - r; hit = true; }
    }
    nx = clamp(nx, 24, CFG.WORLD - 24);
    ny = clamp(ny, 24, CFG.WORLD - 24);
    return hit ? { x: nx, y: ny } : null;
  },

  onPier(x, y) {
    for (const p of this.piers) {
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
    }
    return false;
  },

  _pushCircleRect(cx, cy, r, rect) {
    if (cx + r <= rect.x || cx - r >= rect.x2 || cy + r <= rect.y || cy - r >= rect.y2) return null;
    const left = cx - (rect.x - r);
    const right = (rect.x2 + r) - cx;
    const top = cy - (rect.y - r);
    const bottom = (rect.y2 + r) - cy;
    const m = Math.min(left, right, top, bottom);
    if (m <= 0) return null;
    if (m === left) return { x: -left, y: 0 };
    if (m === right) return { x: right, y: 0 };
    if (m === top) return { x: 0, y: -top };
    return { x: 0, y: bottom };
  },

  /** true when a wall/building blocks sight between two points */
  sightBlocked(x0, y0, x1, y1, step = 30) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      for (const s of this.solids) {
        if (!s.tall) continue;
        if (x >= s.x && x <= s.x2 && y >= s.y && y <= s.y2) return true;
      }
    }
    return false;
  },

  /** snap to the nearest point on any road centreline */
  nearestRoadPoint(x, y) {
    let best = null, bestD = Infinity;
    for (const r of this.roadRects) {
      const cx = clamp(x, r.x, r.x2), cy = clamp(y, r.y, r.y2);
      const d = dist2(x, y, cx, cy);
      if (d < bestD) { bestD = d; best = { x: cx, y: cy, seg: r }; }
    }
    return best;
  },

  /** random point on a sidewalk band beside any road */
  randomSidewalkPoint(rng) {
    for (let t = 0; t < 40; t++) {
      const seg = rng.pick(this.segRects);
      const off = HRW + CFG.SIDEWALK * 0.5;
      let x, y;
      if (seg.axis === 'v') {
        x = seg.x - off + rng.range(0, off * 2);
        y = rng.range(seg.y + 20, seg.y2 - 20);
      } else {
        x = rng.range(seg.x + 20, seg.x2 - 20);
        y = seg.y - off + rng.range(0, off * 2);
      }
      if (!this.solidHit(x, y, 4) && !this.isRoad(x, y)) return { x, y };
    }
    return { x: this.spawn.x + 60, y: this.spawn.y + 60 };
  },

  randomGraphNode(rng) {
    return rng.pick(this.nodes);
  },

  // ---------------------------------------------------------------- lights
  /** 'go' | 'stop' for a travelling axis at a lighted node */
  lightState(n, axis, time) {
    if (!n.lights) return 'go';
    const cyc = time % 19;
    const ns = axis === 'v';
    if (cyc < 8) return ns ? 'go' : 'stop';
    if (cyc < 9.5) return 'stop';                    // all red
    if (cyc < 17.5) return ns ? 'stop' : 'go';
    return 'stop';                                    // all red
  },

  // ---------------------------------------------------------------- minimap
  buildMinimap() {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    const k = S / CFG.WORLD;
    g.fillStyle = '#10141c';
    g.fillRect(0, 0, S, S);
    // zones
    for (const z of this.zones) {
      g.fillStyle = z.kind === 'water' ? '#0c2233'
        : z.kind === 'sand' ? '#6e6248'
        : z.kind === 'grass' ? '#24402c'
        : z.kind === 'path' ? '#4a4438'
        : z.kind === 'dirt' ? '#2a2a24'
        : z.kind === 'runway' ? '#2e3238'
        : '#20242c';
      g.fillRect(z.x0 * k, z.y0 * k, (z.x1 - z.x0) * k, (z.y1 - z.y0) * k);
    }
    // roads
    g.fillStyle = '#4d5666';
    for (const r of this.roadRects) g.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
    // buildings (raised blocks)
    g.fillStyle = '#68707e';
    for (const b of this.buildings) g.fillRect(b.x * k, b.y * k, b.w * k, b.h * k);
    // piers + ship
    g.fillStyle = '#5c5648';
    for (const p of this.piers) g.fillRect(p.x * k, p.y * k, p.w * k, p.h * k);
    if (this.ship) {
      g.fillStyle = '#7a8496';
      g.fillRect(this.ship.x * k, this.ship.y * k, this.ship.w * k, this.ship.h * k);
    }
    this.minimap = cv;
    this.minimapScale = k;
  },
};
