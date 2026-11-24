// Vice Palms — seeded night city: road grid, neon blocks, park, beach, docks
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PITCH = 520, ROAD = 110, COLS = 12, ROWS = 9;
export const CITY_W = COLS * PITCH;          // 6240
export const CITY_H = ROWS * PITCH;          // 4680
export const BEACH_H = 700;
export const WORLD_H = CITY_H + BEACH_H;     // 5380
export const ROAD_HALF = ROAD / 2;
export const OCEAN_Y = CITY_H + 430;

export const NEON = ['#ff2e88', '#22e6ff', '#ffd23e', '#7cff4f', '#b967ff', '#ff7a1a', '#ff4b4b', '#4bffec'];
const WALLS = ['#1b1626', '#191a2b', '#221527', '#141d2c', '#1e1420', '#18202a'];
const WIN = ['#ffd98a', '#9adcff', '#ffe9c9', '#b7f7c9'];

export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.solids = [];   // rects {x,y,w,h}
    this.blocks = [];   // {x,y,w,h,kind,buildings:[]}
    this.signs = [];    // {x,y,c,w,txt}
    this.trees = [];    // {x,y,r,palm}
    this.roadsV = []; this.roadsH = [];
    this.pickups = [];
    this.missionSpots = {};
    this.playerStart = { x: 0, y: 0 };
    this.generate();
    this.buildMinimap();
  }

  generate() {
    const R = this.rng;
    for (let i = 1; i < COLS; i++) this.roadsV.push(i * PITCH);
    for (let j = 1; j <= ROWS; j++) this.roadsH.push(j * PITCH); // includes beachfront road
    const parkC = new Set([4, 5]), parkR = new Set([3, 4]);

    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const x0 = i * PITCH + ROAD_HALF, y0 = j * PITCH + ROAD_HALF;
        const w = PITCH - ROAD, h = PITCH - ROAD;
        let kind = 'city';
        if (i >= 10) kind = 'dock';
        else if (parkC.has(i) && parkR.has(j)) kind = 'park';
        else if (R() < 0.07) kind = 'lot';
        const blk = { x: x0, y: y0, w, h, kind, buildings: [] };
        this.blocks.push(blk);
        if (kind === 'city') this.genCityBlock(blk);
        else if (kind === 'park') this.genPark(blk);
        else if (kind === 'dock') this.genDock(blk);
      }
    }
    this.genBeach();
    this.genSpots();
    this.genPickups();
  }

  genCityBlock(blk) {
    const R = this.rng;
    const nx = R() < 0.5 ? 2 : 1, ny = R() < 0.5 ? 2 : 1;
    const cw = (blk.w - 52) / nx, ch = (blk.h - 52) / ny;
    for (let a = 0; a < nx; a++) {
      for (let b = 0; b < ny; b++) {
        const inx = 6 + R() * 22, iny = 6 + R() * 22;
        const bx = blk.x + 26 + a * cw + inx / 2;
        const by = blk.y + 26 + b * ch + iny / 2;
        const bw = cw - inx, bh = ch - iny;
        const c = WALLS[(R() * WALLS.length) | 0];
        const win = WIN[(R() * WIN.length) | 0];
        const neon = R() < 0.62;
        blk.buildings.push({ x: bx, y: by, w: bw, h: bh, c, win, neon, nc: NEON[(R() * NEON.length) | 0], lit: 0.25 + R() * 0.55 });
        this.solids.push({ x: bx, y: by, w: bw, h: bh });
        if (neon && R() < 0.5) {
          this.signs.push({
            x: bx + bw / 2, y: by - 6, c: NEON[(R() * NEON.length) | 0],
            txt: ['PALMS', 'OCEAN VIEW', 'HOTEL', 'NOODLES', 'CLUB VICE', '24H', 'MOTEL', 'TATTOO', 'LIQUOR', 'GARAGE'][(R() * 10) | 0],
            w: Math.min(bw - 20, 150),
          });
        }
      }
    }
  }

  genPark(blk) {
    const R = this.rng;
    const n = 7 + (R() * 5 | 0);
    for (let k = 0; k < n; k++) {
      const t = { x: blk.x + 30 + R() * (blk.w - 60), y: blk.y + 30 + R() * (blk.h - 60), r: 15 + R() * 9, palm: false };
      this.trees.push(t);
    }
    this.pond = { x: blk.x + blk.w / 2, y: blk.y + blk.h / 2, rx: 90, ry: 62 };
  }

  genDock(blk) {
    const R = this.rng;
    if (R() < 0.4) {
      // warehouse
      const bw = blk.w - 90, bh = blk.h - 120;
      const b = { x: blk.x + 40, y: blk.y + 60, w: bw, h: bh, c: '#20242c', win: '#8fa3b7', neon: false, lit: 0.2 };
      blk.buildings.push(b);
      this.solids.push(b);
    } else {
      // container rows
      const cols = (blk.w / 78) | 0;
      for (let r = 0; r < 3; r++) {
        for (let c2 = 0; c2 < cols; c2++) {
          if (R() < 0.25) continue;
          const cx = blk.x + 24 + c2 * 78, cy = blk.y + 40 + r * 118;
          const cont = { x: cx, y: cy, w: 64, h: 30, c: NEON[(R() * NEON.length) | 0], win: null, neon: false, lit: 0, cont: true };
          blk.buildings.push(cont);
          this.solids.push(cont);
        }
      }
    }
    // crane mast
    if (R() < 0.6) {
      const cr = { x: blk.x + blk.w - 70, y: blk.y + 30, w: 26, h: blk.h - 70, c: '#3a3320', win: null, neon: false, lit: 0, crane: true };
      blk.buildings.push(cr);
      this.solids.push(cr);
    }
  }

  genBeach() {
    const R = this.rng;
    // ocean is solid (keep vehicles out of the Atlantic)
    this.solids.push({ x: -400, y: OCEAN_Y, w: CITY_W + 800, h: WORLD_H - OCEAN_Y + 400, water: true });
    for (let k = 0; k < 46; k++) {
      const x = 60 + R() * (CITY_W - 120);
      const y = CITY_H + 60 + R() * (OCEAN_Y - CITY_H - 100);
      this.trees.push({ x, y, r: 13 + R() * 7, palm: true });
    }
    // boardwalk props
    for (let k = 0; k < 14; k++) {
      this.signs.push({
        x: 200 + k * (CITY_W / 14), y: CITY_H + 70, c: NEON[(R() * NEON.length) | 0],
        txt: ['BEACH', 'SURF', 'TACOS', 'ICE', 'BAR', 'SUNSET'][(R() * 6) | 0], w: 90,
      });
    }
  }

  genSpots() {
    const sp = this.missionSpots;
    sp.rico = { x: 5 * PITCH + 70, y: 4 * PITCH - 70 };
    sp.garage = { x: 2 * PITCH + 180, y: 6 * PITCH + 190 };
    sp.club = { x: 7 * PITCH + 180, y: 2 * PITCH + 170 };
    sp.docks = { x: 10 * PITCH + 130, y: 3 * PITCH + 60 };
    sp.beach = { x: 6 * PITCH + 40, y: CITY_H + 170 };
    sp.bank = { x: 6 * PITCH + 190, y: 1 * PITCH + 180 };
    sp.store = { x: 3 * PITCH + 170, y: 2 * PITCH + 170 };
    sp.escape = { x: 1 * PITCH + 60, y: CITY_H + 190 };
    sp.ware = { x: 10 * PITCH + 240, y: 5 * PITCH + 200 };
    sp.hospital = { x: 5 * PITCH - 60, y: 5 * PITCH + 60 };
    this.playerStart = { x: 5 * PITCH, y: 4 * PITCH + 150 };
  }

  genPickups() {
    const P = this.pickups;
    const put = (x, y, kind) => P.push({ x, y, kind, taken: false, rt: 0 });
    put(4.5 * PITCH, 3.5 * PITCH, 'health');
    put(6 * PITCH + 80, CITY_H + 240, 'health');
    put(2 * PITCH + 120, 6 * PITCH + 80, 'armor');
    put(11 * PITCH, 5 * PITCH, 'armor');
    put(5 * PITCH + 60, 4 * PITCH - 140, 'ammo');
    put(10 * PITCH + 100, 3 * PITCH + 140, 'ammo');
    put(7 * PITCH - 80, 2 * PITCH - 60, 'health');
    put(1 * PITCH + 80, CITY_H + 260, 'armor');
  }

  // ---- queries ----
  isRoad(x, y) {
    if (y > CITY_H + 30) return true; // beachfront + sand drive
    for (const v of this.roadsV) if (Math.abs(x - v) < ROAD_HALF) return true;
    for (const h of this.roadsH) if (Math.abs(y - h) < ROAD_HALF) return true;
    return false;
  }
  solidHit(x, y) {
    if (x < 0 || y < 0 || x > CITY_W || y > WORLD_H) return true;
    for (const s of this.solids) {
      if (s.water) continue;
      if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) return true;
    }
    return false;
  }
  resolveCircle(o, r) {
    const hits = [];
    for (const s of this.solids) {
      if (s.water) continue;
      const nx = Math.max(s.x, Math.min(o.x, s.x + s.w));
      const ny = Math.max(s.y, Math.min(o.y, s.y + s.h));
      const dx = o.x - nx, dy = o.y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.01;
        const push = r - d;
        o.x += (dx / d) * push; o.y += (dy / d) * push;
        hits.push(Math.atan2(dy, dx));
      }
    }
    for (const t of this.trees) {
      const dx = o.x - t.x, dy = o.y - t.y;
      const rr = r + t.r * 0.55;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        o.x += (dx / d) * (rr - d); o.y += (dy / d) * (rr - d);
        hits.push(Math.atan2(dy, dx));
      }
    }
    if (o.x < r) { o.x = r; hits.push(0); }
    if (o.x > CITY_W - r) { o.x = CITY_W - r; hits.push(Math.PI); }
    if (o.y < r) { o.y = r; hits.push(Math.PI / 2); }
    if (o.y > OCEAN_Y - r - 8) { o.y = OCEAN_Y - r - 8; hits.push(-Math.PI / 2); }
    return hits;
  }
  randomRoadPoint(R) {
    if (R() < 0.5) {
      const x = this.roadsV[(R() * this.roadsV.length) | 0];
      return { x: x + (R() < 0.5 ? -24 : 24), y: 60 + R() * (CITY_H - 120) };
    }
    const y = this.roadsH[(R() * this.roadsH.length) | 0];
    return { x: 60 + R() * (CITY_W - 120), y: y + (R() < 0.5 ? -24 : 24) };
  }
  sidewalkPoint(R) {
    const b = this.blocks[(R() * this.blocks.length) | 0];
    const side = R();
    if (side < 0.25) return { x: b.x + R() * b.w, y: b.y - 13 };
    if (side < 0.5) return { x: b.x + R() * b.w, y: b.y + b.h + 13 };
    if (side < 0.75) return { x: b.x - 13, y: b.y + R() * b.h };
    return { x: b.x + b.w + 13, y: b.y + R() * b.h };
  }

  // ---- minimap base (1/8 scale) ----
  buildMinimap() {
    const sc = (this.mms = 8);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(CITY_W / sc); cv.height = Math.ceil(WORLD_H / sc);
    const c = cv.getContext('2d');
    c.fillStyle = '#101318'; c.fillRect(0, 0, cv.width, cv.height);
    // blocks
    for (const b of this.blocks) {
      c.fillStyle = b.kind === 'park' ? '#15351f' : b.kind === 'dock' ? '#1c2126' : '#191c26';
      c.fillRect(b.x / sc, b.y / sc, b.w / sc, b.h / sc);
      for (const bd of b.buildings) {
        c.fillStyle = b.kind === 'dock' ? '#2c3038' : '#2a2536';
        c.fillRect(bd.x / sc, bd.y / sc, bd.w / sc, bd.h / sc);
      }
    }
    // beach + ocean
    c.fillStyle = '#c7b26b'; c.fillRect(0, CITY_H / sc, cv.width, (OCEAN_Y - CITY_H) / sc);
    c.fillStyle = '#0d2c4a'; c.fillRect(0, OCEAN_Y / sc, cv.width, cv.height - OCEAN_Y / sc);
    // roads
    c.strokeStyle = '#3d4353'; c.lineWidth = ROAD / sc - 1;
    for (const v of this.roadsV) { c.beginPath(); c.moveTo(v / sc, 0); c.lineTo(v / sc, CITY_H / sc); c.stroke(); }
    for (const h of this.roadsH) { c.beginPath(); c.moveTo(0, h / sc); c.lineTo(CITY_W / sc, h / sc); c.stroke(); }
    this.mm = cv;
  }
}
