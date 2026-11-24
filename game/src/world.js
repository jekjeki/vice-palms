// world.js — the map of Vice Palms: road grid, districts, buildings, beach,
// Palm Park, the North Docks (containers, cranes, ship, piers) and the
// Palm Airfield. Deterministic from a seed. Also owns static collision and
// the lane graph traffic drives on.

import { CFG, roadX, roadY, DIRS, NEON, COLORS } from './config.js';
import { RNG, clamp, hash2, circleRect, pointInRect } from './util.js';

const B = () => CFG.B, RW = () => CFG.RW, SW = () => CFG.SW;

// block pitch math: block (bx,by) interior between roads
function blockRect(bx, by) {
  const x = roadX(bx) + RW() / 2;
  const y = roadY(by) + RW() / 2;
  const w = B() - RW();
  return { x, y, w, h: w };
}

export class World {
  constructor(seed) {
    this.seed = seed;
    this.rng = new RNG(seed ^ 0x5f3759df);
    this.solids = [];        // {x,y,w,h,kind} axis-aligned colliders
    this.circles = [];       // {x,y,r,kind} palm trees, lamps
    this.bldgs = [];         // drawable buildings {x,y,w,h,ht,c,neon,kind}
    this.decors = [];        // non-colliding drawables {kind,x,y,...}
    this.waterRects = [];    // drowned blocks in the docks (bridges cross them)
    this.piers = [];         // plank walkways {x,y,w,h}
    this.runways = [];       // flat drawable strips {x,y,w,h}
    this.lights = new Map(); // "i,j" -> phase offset
    this.spawns = {};        // safehouse / hospital / pd
    this.grid = new Map();   // spatial hash of solids
    this.gsize = 320;
    this.pondRect = null;

    this.layout();
    this.hashSolids();
    this.buildMinimap();
  }

  // ------------------------------------------------------------- districts
  districtOf(bx, by) {
    const { PARK, DOCKS, AIRFIELD, DOWNTOWN } = CFG;
    if (inB(bx, by, PARK)) return 'park';
    if (inB(bx, by, DOCKS)) return 'docks';
    if (inB(bx, by, AIRFIELD)) return 'airfield';
    if (inB(bx, by, DOWNTOWN)) return 'downtown';
    if (by === CFG.ROWS - 1) return 'beach';
    if (by >= CFG.ROWS - 3) return 'com';       // beachfront commerce
    if (bx <= 2 || bx >= CFG.COLS - 3) return 'resi';
    return this.rng.chance(0.5) ? 'resi' : 'com';
  }

  // ------------------------------------------------------------- generation
  layout() {
    const rng = this.rng;
    const cols = CFG.COLS, rows = CFG.ROWS;

    // traffic light phase per intersection (skip none — simple and readable)
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        this.lights.set(i + ',' + j, ((i * 3 + j * 5) % 4) * 2.5);
      }
    }

    // drowned dock blocks (cols 12-16, rows 0-1) become the harbor basin
    const wb = blockRect(12, 0);
    const wbEnd = blockRect(16, 1);
    this.waterRects.push({
      x: wb.x, y: wb.y,
      w: wbEnd.x + wbEnd.w - wb.x,
      h: wbEnd.y + wbEnd.h - wb.y,
    });

    // piers jutting south from the quay road into the basin
    for (let p = 0; p < 3; p++) {
      const px = roadX(12) + RW() / 2 + 40 + p * 240;
      this.piers.push({ x: px, y: wb.y + 120, w: 64, h: 210 });
      this.piers.push({ x: px, y: wb.y + 120, w: 150, h: 56 });
    }

    for (let by = 0; by < rows; by++) {
      for (let bx = 0; bx < cols; bx++) {
        if (bx >= 12 && by <= 1) continue;        // harbor water
        const d = this.districtOf(bx, by);
        const r = blockRect(bx, by);
        switch (d) {
          case 'downtown': this.blockDowntown(r, bx, by); break;
          case 'resi': this.blockResi(r, bx, by); break;
          case 'com': this.blockCom(r, bx, by); break;
          case 'park': this.blockPark(r, bx, by); break;
          case 'beach': this.blockBeach(r, bx, by); break;
          case 'docks': this.blockDocks(r, bx, by); break;
          case 'airfield': this.blockAirfield(r, bx, by); break;
        }
        // street furniture: palms + lamps on sidewalk corners
        if (rng.chance(0.55)) {
          this.circles.push({ x: r.x + 8, y: r.y + 8, r: 6, kind: 'lamp' });
        }
        if (rng.chance(0.35)) {
          this.circles.push({ x: r.x + r.w - 8, y: r.y + r.h - 8, r: 7, kind: 'palm' });
        }
      }
    }

    // beach strip between last road and the ocean
    const beachTop = CFG.BEACH_Y;
    const nPalms = 26;
    for (let p = 0; p < nPalms; p++) {
      this.circles.push({
        x: rng.range(60, CFG.W - 60),
        y: rng.range(beachTop + 24, CFG.WATER_Y - 60),
        r: rng.range(6, 9), kind: 'palm',
      });
    }
    // lifeguard huts on the sand (small solids)
    for (let hI = 0; hI < 4; hI++) {
      const hx = 300 + hI * 1050 + rng.range(-60, 60);
      this.solids.push({ x: hx, y: beachTop + 90, w: 46, h: 40, kind: 'hut' });
      this.bldgs.push({ x: hx, y: beachTop + 90, w: 46, h: 40, ht: 22, c: '#c46a4a', neon: null, kind: 'hut' });
    }

    // bus stops along main streets (shelters)
    this.busStops = [];
    for (let k = 0; k < 6; k++) {
      const i = 2 + k * 2;
      if (i > CFG.COLS) break;
      this.busStops.push({
        x: roadX(i) + CFG.RW / 2 + 14,
        y: roadY(4 + (k % 3) * 3) + 10,
        w: 26, h: 12,
      });
    }

    // fuel station: pump island (small solids) + kiosk — shoot the pumps, regret it
    const fs = blockRect(5, 4);
    this.fuelPumps = { x: fs.x + fs.w / 2, y: fs.y + fs.h / 2, boom: 0 };
    this.solids.push({ x: fs.x + fs.w / 2 - 30, y: fs.y + fs.h / 2 - 10, w: 20, h: 12, kind: 'pump' });
    this.solids.push({ x: fs.x + fs.w / 2 + 12, y: fs.y + fs.h / 2 - 10, w: 20, h: 12, kind: 'pump' });
    this.bldgs.push({ x: fs.x + 18, y: fs.y + 14, w: 66, h: 44, ht: 26, c: '#3a4148', neon: '#ffb200', kind: 'shop' });
    this.decors.push({ kind: 'gas', x: fs.x + fs.w / 2, y: fs.y + fs.h / 2 });

    // park fountain (a circular solid in Palm Park)
    const pk = CFG.PARK;
    const fc = blockRect(pk.bx, pk.by);
    this.fountain = { x: fc.x + fc.w / 2, y: fc.y + fc.h / 2, r: 26 };
    this.circles.push({ x: this.fountain.x, y: this.fountain.y, r: 26, kind: 'fountain' });

    // street props: lots, boats, road lamps, hydrants, umbrellas
    this.props();

    // special spawn buildings — identified by kind for HUD + missions
    const safe = blockRect(9, 9);
    this.spawns.safe = { x: safe.x + safe.w / 2, y: safe.y + safe.h / 2 };
    const hosp = blockRect(3, 8);
    this.spawns.hospital = { x: hosp.x + hosp.w / 2, y: hosp.y + hosp.h / 2 };
    const pd = blockRect(11, 6);
    this.spawns.pd = { x: pd.x + pd.w / 2, y: pd.y + pd.h / 2 };
  }

  addBldg(x, y, w, h, ht, c, neon, kind = 'bldg') {
    this.solids.push({ x, y, w, h, kind });
    this.bldgs.push({ x, y, w, h, ht, c, neon, kind });
  }

  blockDowntown(r, bx, by) {
    const rng = this.rng;
    // one big tower + one mid slab, plaza between
    const tw = rng.range(90, 130), th = rng.range(90, 130);
    const tx = r.x + rng.range(8, r.w - tw - 8);
    const ty = r.y + rng.range(8, r.h - th - 8);
    const neon = rng.chance(0.8) ? rng.pick(NEON) : null;
    this.addBldg(tx, ty, tw, th, rng.range(70, 150), rng.pick(['#1a1b2e', '#202138', '#232440']), neon, 'tower');
    const sw = rng.range(60, 90), sh = rng.range(50, 80);
    const sx = r.x + rng.range(8, Math.max(9, r.w - sw - 8));
    const sy = r.y + rng.range(8, Math.max(9, r.h - sh - 8));
    if (Math.abs(sx - tx) > 40 || Math.abs(sy - ty) > 40) {
      this.addBldg(sx, sy, sw, sh, rng.range(36, 66), '#262744', rng.chance(0.5) ? rng.pick(NEON) : null, 'tower');
    }
  }

  blockResi(r, bx, by) {
    const rng = this.rng;
    const n = rng.int(2, 4);
    for (let k = 0; k < n; k++) {
      const w = rng.range(46, 72), h = rng.range(40, 62);
      const x = r.x + 10 + (k % 2) * (r.w / 2 - 10) + rng.range(0, 12);
      const y = r.y + 10 + Math.floor(k / 2) * (r.h / 2 - 6) + rng.range(0, 10);
      this.addBldg(Math.min(x, r.x + r.w - w - 6), Math.min(y, r.y + r.h - h - 6),
        w, h, rng.range(18, 34), rng.pick(['#3a3350', '#41405c', '#33404f', '#4a3b52']),
        rng.chance(0.15) ? rng.pick(NEON) : null, 'house');
    }
    if (rng.chance(0.4)) {
      this.circles.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, r: 8, kind: 'palm' });
    }
  }

  blockCom(r, bx, by) {
    const rng = this.rng;
    // strip mall along one edge + big box behind
    const w = r.w - 20, h = rng.range(46, 60);
    const neonA = rng.pick(NEON), neonB = rng.pick(NEON);
    this.addBldg(r.x + 10, r.y + 10, w, h, rng.range(24, 40), '#2c2440', neonA, 'shop');
    const bw = rng.range(70, 110), bh = rng.range(50, 70);
    this.addBldg(r.x + rng.range(10, r.w - bw - 10), r.y + h + 26, bw, bh,
      rng.range(26, 44), '#252136', rng.chance(0.7) ? neonB : null, 'shop');
    // neon sign decor
    this.decors.push({ kind: 'sign', x: r.x + 10 + rng.range(10, w - 30), y: r.y + 4, c: neonA, t: rng.pick(['HOTEL', 'CLUB', 'DINER', 'PALMS', '24HR', 'MOTEL', 'LIQUOR', 'TATTOO']) });
  }

  blockPark(r, bx, by) {
    const rng = this.rng;
    if (!this.pondRect && bx === CFG.PARK.bx && by === CFG.PARK.by) {
      this.pondRect = { x: r.x + r.w * 0.55, y: r.y + r.h * 0.55, w: 66, h: 52 };
    }
    for (let p = 0; p < 7; p++) {
      this.circles.push({
        x: rng.range(r.x + 14, r.x + r.w - 14),
        y: rng.range(r.y + 14, r.y + r.h - 14),
        r: rng.range(7, 10), kind: 'palm',
      });
    }
    this.decors.push({ kind: 'path', x: r.x, y: r.y + r.h / 2 - 6, w: r.w, h: 12 });
    this.decors.push({ kind: 'path', x: r.x + r.w / 2 - 6, y: r.y, w: 12, h: r.h });
  }

  blockBeach(r, bx, by) {
    const rng = this.rng;
    // boardwalk shops only on the north half; sand takes over visually below
    if (rng.chance(0.7)) {
      const w = rng.range(60, 90), h = 40;
      this.addBldg(r.x + rng.range(10, r.w - w - 10), r.y + 8, w, h, rng.range(20, 30),
        '#4a3b52', rng.pick(NEON), 'shop');
    }
    for (let p = 0; p < 3; p++) {
      this.circles.push({
        x: rng.range(r.x + 12, r.x + r.w - 12),
        y: rng.range(r.y + 60, r.y + r.h - 12),
        r: rng.range(7, 10), kind: 'palm',
      });
    }
  }

  blockDocks(r, bx, by) {
    const rng = this.rng;
    const roll = rng.f();
    if (roll < 0.45) {
      // container yard — rows of stacks
      for (let row = 0; row < 3; row++) {
        for (let k = 0; k < 3; k++) {
          if (rng.chance(0.18)) continue;
          const cw = 56, ch = 24;
          const x = r.x + 12 + k * 62;
          const y = r.y + 14 + row * 56;
          if (x + cw > r.x + r.w - 6 || y + ch > r.y + r.h - 6) continue;
          this.solids.push({ x, y, w: cw, h: ch, kind: 'cont' });
          this.bldgs.push({
            x, y, w: cw, h: ch, ht: rng.range(14, 26),
            c: rng.pick(['#8a3a2e', '#2e6f8a', '#8a7a2e', '#3a6f46', '#6f3a6a']),
            neon: null, kind: 'cont',
          });
        }
      }
    } else if (roll < 0.8) {
      // warehouse
      const w = r.w - 26, h = r.h - 30;
      this.addBldg(r.x + 13, r.y + 15, w, h, rng.range(30, 44), '#33343e',
        rng.chance(0.3) ? '#ffb200' : null, 'ware');
    } else {
      // crane pad: small control cabin solid + crane decor
      this.addBldg(r.x + r.w / 2 - 14, r.y + r.h / 2 - 12, 28, 24, 20, '#3d4050', null, 'cabin');
      this.decors.push({ kind: 'crane', x: r.x + r.w / 2, y: r.y + r.h / 2, dir: rng.chance(0.5) ? 0 : 1 });
    }
  }

  blockAirfield(r, bx, by) {
    const rng = this.rng;
    const mid = by === Math.floor((CFG.AIRFIELD.by + CFG.AIRFIELD.bh / 2));
    if (mid) {
      // runway strip — flat, drivable, drawn as decor
      this.runways.push({ x: r.x - 4, y: r.y + r.h / 2 - 34, w: r.w + 8, h: 68 });
      return;
    }
    const roll = rng.f();
    if (roll < 0.5) {
      // hangar: wide low arch
      const w = rng.range(90, 130), h = rng.range(56, 72);
      this.addBldg(r.x + rng.range(8, r.w - w - 8), r.y + rng.range(8, r.h - h - 8),
        w, h, rng.range(26, 36), '#3a3d4a', null, 'hangar');
    } else if (roll < 0.68) {
      // control tower
      this.addBldg(r.x + r.w / 2 - 20, r.y + r.h / 2 - 20, 40, 40, 96, '#2c2f3c', '#00e5ff', 'tower');
    } else {
      // apron with parked prop plane (decor + small solid fuselage)
      this.solids.push({ x: r.x + 30, y: r.y + 40, w: 84, h: 26, kind: 'plane' });
      this.decors.push({ kind: 'plane', x: r.x + 30, y: r.y + 40 });
      if (rng.chance(0.6)) {
        const w = 60, h = 34;
        this.addBldg(r.x + r.w - w - 10, r.y + r.h - h - 10, w, h, 24, '#39404a', null, 'hangar');
      }
    }
  }

  // ------------------------------------------------------------- collision
  hashSolids() {
    const g = this.gsize;
    for (let n = 0; n < this.solids.length; n++) {
      const s = this.solids[n];
      const x0 = Math.floor(s.x / g), x1 = Math.floor((s.x + s.w) / g);
      const y0 = Math.floor(s.y / g), y1 = Math.floor((s.y + s.h) / g);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gy = y0; gy <= y1; gy++) {
          const k = gx + ',' + gy;
          let arr = this.grid.get(k);
          if (!arr) { arr = []; this.grid.set(k, arr); }
          arr.push(n);
        }
      }
    }
  }

  solidsNear(x, y, r) {
    const g = this.gsize;
    const out = [];
    const x0 = Math.floor((x - r) / g), x1 = Math.floor((x + r) / g);
    const y0 = Math.floor((y - r) / g), y1 = Math.floor((y + r) / g);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const arr = this.grid.get(gx + ',' + gy);
        if (!arr) continue;
        for (const idx of arr) if (!out.includes(idx)) out.push(idx);
      }
    }
    return out;
  }

  // resolve a circle against the static world. Returns {x,y,nx,ny,power} —
  // position corrected, collision normal and impact strength (0 = no hit).
  collide(x, y, r) {
    let nx = 0, ny = 0, power = 0;
    let px = x, py = y;
    for (const idx of this.solidsNear(x, y, r + 4)) {
      const s = this.solids[idx];
      const push = circleRect(px, py, r, s.x, s.y, s.w, s.h);
      if (push) {
        px += push.x; py += push.y;
        const d = push.d || 0.001;
        nx = push.x / d; ny = push.y / d;
        power = Math.max(power, d);
      }
    }
    // palms and lamps
    for (const c of this.circles) {
      if (c.kind === 'lamp' || c.kind === 'palm') {
        const dx = px - c.x, dy = py - c.y;
        const rr = r + c.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          px += (dx / d) * (rr - d);
          py += (dy / d) * (rr - d);
          nx = dx / d; ny = dy / d;
          power = Math.max(power, rr - d);
        }
      } else if (c.kind === 'fountain') {
        const dx = px - c.x, dy = py - c.y;
        const rr = r + c.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          px += (dx / d) * (rr - d);
          py += (dy / d) * (rr - d);
          nx = dx / d; ny = dy / d;
          power = Math.max(power, rr - d);
        }
      }
    }
    return { x: px, y: py, nx, ny, power };
  }

  // ------------------------------------------------------------- street props
  props() {
    const rng = this.rng;

    // parking lots (drawn by the renderer, filled with parked cars by game.js)
    this.parkingLots = [];
    const lotBlocks = [[6, 4], [12, 8], [4, 9], [15, 3]];
    for (const [lx, ly] of lotBlocks) {
      const r = blockRect(lx, ly);
      const lot = { x: r.x + 8, y: r.y + 8, w: r.w - 16, h: r.h - 16, bx: lx, by: ly };
      this.parkingLots.push(lot);
    }

    // small boats moored at the piers
    this.boats = [];
    for (let k = 0; k < 3; k++) {
      const px = roadX(12) + 43 + 40 + k * 240;
      this.boats.push({
        x: px + 32,
        y: wbY() + 150 - 60 - k * 26,
        len: rng.range(46, 70),
        hue: rng.pick(['#e8e6e3', '#7cffa0', '#ff8f5c']),
        bob: rng.range(0, 6),
      });
    }

    // street lamps along the main roads — the city needs its mercury glow
    this.roadLamps = [];
    for (let i = 0; i <= CFG.COLS; i++) {
      for (let j = 0; j <= CFG.ROWS; j++) {
        if ((i * 2 + j) % 3 !== 0) continue;
        this.roadLamps.push({ x: roadX(i) - CFG.RW / 2 + 5, y: roadY(j) + 120 });
        this.roadLamps.push({ x: roadX(i) + CFG.RW / 2 - 5, y: roadY(j) + 220 });
      }
    }
    for (let j = 0; j <= CFG.ROWS; j += 2) {
      for (let i = 0; i < CFG.COLS; i += 2) {
        this.roadLamps.push({ x: roadX(i) + 170, y: roadY(j) - CFG.RW / 2 + 5 });
      }
    }

    // hydrants + trash bins (bins are real cover)
    this.hydrants = [];
    for (let k = 0; k < 26; k++) {
      const i = rng.int(0, CFG.COLS - 1);
      const j = rng.int(0, CFG.ROWS - 1);
      const r = blockRect(i, j);
      this.hydrants.push({ x: r.x - 9, y: rng.range(r.y + 20, r.y + r.h - 20) });
    }
    this.bins = [];
    for (let k = 0; k < 18; k++) {
      const i = rng.int(0, CFG.COLS - 1);
      const j = rng.int(0, CFG.ROWS - 1);
      const r = blockRect(i, j);
      const bx = r.x + r.w + 8;
      const by = rng.range(r.y + 20, r.y + r.h - 20);
      this.bins.push({ x: bx, y: by, w: 12, h: 12, kind: 'bin' });
      this.solids.push({ x: bx, y: by, w: 12, h: 12, kind: 'bin' });
    }

    // one construction site: cones, barrier fence, half-poured slab
    this.cones = [];
    this.barriers = [];
    const cs = blockRect(13, 9);
    for (let k = 0; k < 10; k++) {
      this.cones.push({ x: cs.x + 16 + (k % 5) * 40, y: cs.y + 16 + Math.floor(k / 5) * 130 });
    }
    for (let k = 0; k < 4; k++) {
      const b = { x: cs.x + 20 + k * 44, y: cs.y + 150, w: 40, h: 8, kind: 'barrier' };
      this.barriers.push(b);
      this.solids.push(b);
    }
    this.decors.push({ kind: 'slab', x: cs.x + 30, y: cs.y + 40, w: 130, h: 90 });

    // rooftop billboards — big, glowing, hungry for attention
    this.billboards = [];
    for (const b of this.bldgs) {
      if (b.kind !== 'tower' || !b.neon) continue;
      if (rng.chance(0.4)) {
        this.billboards.push({
          x: b.x + b.w / 2, y: b.y + b.h / 2 - b.ht * 0.22 - 14,
          w: Math.min(150, b.w + 20),
          text: rng.pick(['VICE PALMS', 'CLUB OCEAN', 'HOTEL LUNA', 'PALMS 24H', 'RADIO WAVE', 'NEON TIDE']),
          c: b.neon,
        });
      }
    }

    // beach day is over: umbrellas folded for the night, nets stay up
    this.beachProps = [];
    for (let k = 0; k < 12; k++) {
      this.beachProps.push({
        x: rng.range(80, CFG.W - 80),
        y: rng.range(CFG.BEACH_Y + 60, CFG.WATER_Y - 90),
        kind: rng.chance(0.6) ? 'umbrella' : 'net',
        hue: rng.pick(['#ff6f9c', '#6fd8ff', '#ffd76f', '#18e0b4']),
      });
    }
  }

  // parked cars for the lots + roadside — game.js calls this after creating G.cars
  parkedCarSpots(rng) {
    const spots = [];
    for (const lot of this.parkingLots) {
      const rows = 3;
      for (let rI = 0; rI < rows; rI++) {
        for (let k = 0; k < 4; k++) {
          if (rng.chance(0.35)) continue;
          spots.push({
            x: lot.x + 26 + k * (lot.w - 52) / 3,
            y: lot.y + 26 + rI * (lot.h - 52) / 2,
            h: 0, roadside: false,
          });
        }
      }
    }
    // a few sleepers at the curb downtown
    for (let k = 0; k < 6; k++) {
      const i = rng.int(7, 11);
      const j = rng.int(5, 9);
      spots.push({
        x: roadX(i) - CFG.RW / 2 + 12,
        y: roadY(j) + rng.range(-100, 100),
        h: Math.PI / 2, roadside: true,
      });
    }
    return spots;
  }

  // drivable surface under a point — cars handle each one differently
  surfaceAt(x, y) {
    if (this.isRoadAt(x, y)) return 'road';
    if (this.runways.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) return 'road';
    if (y > CFG.BEACH_Y && y < CFG.WATER_Y) return 'sand';
    if (this.parkingLots.some((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h)) return 'road';
    const d = this.districtAt(x, y);
    if (d === 'park') return 'grass';
    if (d === 'beach') return 'sand';
    if (this.onWater(x, y) && !this.onPier(x, y)) return 'water';
    return 'concrete';
  }

  districtAt(x, y) {
    const bx = Math.floor((x - CFG.RW / 2) / CFG.B);
    const by = Math.floor((y - CFG.RW / 2) / CFG.B);
    if (bx < 0 || by < 0 || bx >= CFG.COLS || by >= CFG.ROWS) return 'road';
    return this.districtOf(bx, by);
  }

  // ------------------------------------------------------------- road queries
  isRoadAt(x, y) {
    for (let i = 0; i <= CFG.COLS; i++) {
      if (Math.abs(x - roadX(i)) < RW() / 2) return true;
    }
    for (let j = 0; j <= CFG.ROWS; j++) {
      if (Math.abs(y - roadY(j)) < RW() / 2) return true;
    }
    return false;
  }

  // green for which axis at intersection (i,j): 'ns' | 'ew'
  lightGreen(i, j, t) {
    const off = this.lights.get(i + ',' + j) || 0;
    const cyc = (t + off) % 10;
    return cyc < 5 ? 'ns' : 'ew';
  }

  // random point on a random lane, facing along it — for traffic spawns
  randomLanePoint(rng) {
    const vertical = rng.chance(0.5);
    if (vertical) {
      const i = rng.int(0, CFG.COLS);
      const south = rng.chance(0.5);
      const dir = south ? 1 : 3;
      const lane = south ? roadX(i) - RW() / 4 : roadX(i) + RW() / 4;
      return { x: lane, y: rng.range(RW(), CFG.H - RW()), dir, axis: 'v', idx: i };
    }
    const j = rng.int(0, CFG.ROWS);
    const east = rng.chance(0.5);
    const dir = east ? 0 : 2;
    const lane = east ? roadY(j) + RW() / 4 : roadY(j) - RW() / 4;
    return { x: rng.range(RW(), CFG.W - RW()), y: lane, dir, axis: 'h', idx: j };
  }

  // sidewalk point for pedestrian spawns: ring just inside a block edge
  randomSidewalkPoint(rng) {
    const bx = rng.int(0, CFG.COLS - 1);
    const by = rng.int(0, CFG.ROWS - 1);
    const r = blockRect(bx, by);
    const side = rng.int(0, 3);
    const off = 8; // sidewalk band
    if (side === 0) return { x: rng.range(r.x, r.x + r.w), y: r.y - off };
    if (side === 1) return { x: r.x + r.w + off, y: rng.range(r.y, r.y + r.h) };
    if (side === 2) return { x: rng.range(r.x, r.x + r.w), y: r.y + r.h + off };
    return { x: r.x - off, y: rng.range(r.y, r.y + r.h) };
  }

  // the next intersection center a car at (x,y) heading dir will meet
  nextNode(x, y, dir) {
    const d = DIRS[dir];
    if (d.dx > 0) {
      const i = Math.min(CFG.COLS, Math.ceil((x - roadX(0) - RW() / 2 - 1) / B()));
      return { i: clamp(i, 0, CFG.COLS), j: this.nearestRoadIdx(y, true), axis: 'h' };
    }
    if (d.dx < 0) {
      const i = Math.max(0, Math.floor((x - roadX(0) + RW() / 2 + 1) / B()) - 1);
      return { i: clamp(i, 0, CFG.COLS), j: this.nearestRoadIdx(y, true), axis: 'h' };
    }
    if (d.dy > 0) {
      const j = Math.min(CFG.ROWS, Math.ceil((y - roadY(0) - RW() / 2 - 1) / B()));
      return { i: this.nearestRoadIdx(x, false), j: clamp(j, 0, CFG.ROWS), axis: 'v' };
    }
    const j = Math.max(0, Math.floor((y - roadY(0) + RW() / 2 + 1) / B()) - 1);
    return { i: this.nearestRoadIdx(x, false), j: clamp(j, 0, CFG.ROWS), axis: 'v' };
  }

  // nearest road centerline index to a coordinate
  nearestRoadIdx(v, isY) {
    const n = isY ? CFG.ROWS : CFG.COLS;
    let best = 0, bd = 1e9;
    for (let k = 0; k <= n; k++) {
      const c = isY ? roadY(k) : roadX(k);
      const d = Math.abs(v - c);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  // snapped lane center coordinate for a road + dir
  laneCenter(axis, idx, dir) {
    if (axis === 'v') {
      return dir === 1 ? roadX(idx) - RW() / 4 : roadX(idx) + RW() / 4;
    }
    return dir === 0 ? roadY(idx) + RW() / 4 : roadY(idx) - RW() / 4;
  }

  onWater(x, y) {
    for (const r of this.waterRects) if (pointInRect(x, y, r)) return true;
    return y > CFG.WATER_Y;
  }

  onPier(x, y) {
    for (const p of this.piers) if (pointInRect(x, y, p)) return true;
    return false;
  }

  // ------------------------------------------------------------- minimap
  buildMinimap() {
    const sc = 0.1;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(CFG.W * sc);
    cv.height = Math.ceil(CFG.H * sc);
    const c = cv.getContext('2d');
    c.fillStyle = '#0b1d30';                     // ocean base
    c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#c9a86a';                     // beach
    c.fillRect(0, CFG.BEACH_Y * sc, cv.width, (CFG.WATER_Y - CFG.BEACH_Y) * sc);
    c.fillStyle = '#10131c';                     // land
    c.fillRect(0, 0, cv.width, CFG.BEACH_Y * sc);
    // park
    const P = CFG.PARK;
    c.fillStyle = '#12331c';
    c.fillRect(roadX(P.bx) * sc, roadY(P.by) * sc, (P.bw + 1) * CFG.B * sc, (P.bh + 1) * CFG.B * sc);
    // buildings
    c.fillStyle = '#232638';
    for (const b of this.bldgs) {
      c.fillRect(b.x * sc, b.y * sc, Math.max(1, b.w * sc), Math.max(1, b.h * sc));
    }
    // roads
    c.strokeStyle = '#3c3f52';
    c.lineWidth = Math.max(1, CFG.RW * sc);
    c.beginPath();
    for (let i = 0; i <= CFG.COLS; i++) {
      c.moveTo(roadX(i) * sc, 0);
      c.lineTo(roadX(i) * sc, cv.height);
    }
    for (let j = 0; j <= CFG.ROWS; j++) {
      c.moveTo(0, roadY(j) * sc);
      c.lineTo(cv.width, roadY(j) * sc);
    }
    c.stroke();
    // harbor water
    c.fillStyle = '#0b1d30';
    for (const wr of this.waterRects) c.fillRect(wr.x * sc, wr.y * sc, wr.w * sc, wr.h * sc);
    // runway
    c.fillStyle = '#2a2d38';
    for (const rw of this.runways) c.fillRect(rw.x * sc, rw.y * sc, rw.w * sc, rw.h * sc);
    this.mini = cv;
    this.miniScale = sc;
  }

  update() { /* traffic lights are computed from G.t on demand */ }
}

function inB(bx, by, r) {
  return bx >= r.bx && bx < r.bx + r.bw && by >= r.by && by < r.by + r.bh;
}

// harbor basin top edge (pier calculations)
function wbY() { return roadY(0) + CFG.RW / 2; }
