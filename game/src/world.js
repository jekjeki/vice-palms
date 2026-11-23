// world.js — deterministic night coastal city "Vice Palms": road grid, neon blocks, beach & park,
// NORTH DOCKS (piers, containers, cranes, ship) and PALM AIRFIELD (runway, hangars, tower).
import { CFG, COLORS } from './config.js';
import { RNG } from './rng.js';
import { clamp, pointInRect, TAU } from './util.js';

export class World {
  constructor(seed = 20260601) {
    this.seed = seed >>> 0;
    this.rng = new RNG(this.seed);
    this.solids = [];        // axis-aligned collision rects {x0,y0,x1,y1,type}
    this.palmSolids = [];    // circular colliders {x,y,r}
    this.water = [];         // water rects (deadly-ish: cars crash, swimmers blocked)
    this.buildings = [];     // visual + solid blocks with windows & neon
    this.neonSigns = [];     // {x,y,text,color,vert}
    this.palms = [];         // decorative palm positions {x,y,s}
    this.lamps = [];         // streetlights {x,y}
    this.props = [];         // misc decorations {kind,x,y,...}
    this.roadH = [];         // horizontal road y centers
    this.roadV = [];         // vertical road x centers
    this.lights = [];        // traffic lights {x,y,ix,iy}
    this.spawns = { cars: [], peds: [] };
    this.pois = {};
    this.cell = 625;
    this.grid = new Map();   // spatial hash of solids
    this.generate();
  }

  generate() {
    const R = CFG.ROAD_SPACING, W = CFG.W, H = CFG.H;
    // road grid: leave room for harbor (north), beach (south), airfield (east)
    for (let i = 1; i <= 13; i++) this.roadV.push(i * R);          // x = 340..4420
    for (let i = 1; i <= 10; i++) this.roadH.push(i * R);          // y = 340..3400
    this.roadH[0] = R; // keep first row after docks land strip

    // --- zones -----------------------------------------------------------
    this.water.push({ x0: -200, y0: CFG.HARBOR_N - 900, x1: W + 200, y1: CFG.HARBOR_N, kind: 'harbor' });
    this.water.push({ x0: -200, y0: CFG.OCEAN_S, x1: W + 200, y1: H + 300, kind: 'ocean' });

    // city block buildings (skip park & docks & airfield zones)
    const PARK = CFG.PARK;
    for (let bx = 0; bx < CFG.COLS; bx++) {
      for (let by = 0; by < CFG.ROWS; by++) {
        const x0 = bx * R + CFG.ROAD_W / 2 + 4;
        const y0 = by * R + CFG.ROAD_W / 2 + 4;
        const x1 = (bx + 1) * R - CFG.ROAD_W / 2 - 4;
        const y1 = (by + 1) * R - CFG.ROAD_W / 2 - 4;
        const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
        if (cxm < CFG.HARBOR_N + 60 || cym < CFG.HARBOR_N) continue;               // docks zone
        if (cym > CFG.SAND_S - 100) continue;                                      // beach strip
        if (x0 >= CFG.AIR_W - 60) continue;                                        // airfield zone
        const inPark = x0 >= PARK.x0 - 40 && x1 <= PARK.x1 + 40 && y0 >= PARK.y0 - 40 && y1 <= PARK.y1 + 40;
        if (inPark) continue;

        const r = this.rng;
        // 1-3 buildings per block with alley gaps
        const parts = r.int(1, 3);
        let cursor = x0;
        for (let p = 0; p < parts; p++) {
          const span = (x1 - cursor) / (parts - p);
          const gap = parts > 1 ? r.range(10, 26) : 0;
          const bw = span - gap;
          if (bw < 40) break;
          const bh0 = y0 + (parts > 2 && p === 1 ? r.range(30, 80) : 0);
          const bh1 = y1 - (parts > 2 && p === 1 ? r.range(30, 80) : 0);
          const col = COLORS.building[r.int(0, COLORS.building.length - 1)];
          const floors = r.int(2, 9);
          const b = { x0: cursor, y0: bh0, x1: cursor + bw, y1: bh1, color: col, floors, lit: [] };
          // window lights: deterministic per floor
          for (let f = 0; f < floors; f++) {
            const row = [];
            const n = Math.max(2, Math.floor(bw / 26));
            for (let k = 0; k < n; k++) row.push(r.f() < 0.55 ? r.int(1, 3) : 0);
            b.lit.push(row);
          }
          // murals on wide building faces (deterministic art picks)
        if (bw > 120 && r.f() < 0.22) {
          const arts = [
            { kind: 'flamingo', color: '#ff5da2' },
            { kind: 'sunset', color: '#ffd166' },
            { kind: 'wave', color: '#00e5ff' },
          ];
          b.mural = arts[r.int(0, arts.length - 1)];
        }
        // neon signs on avenue-facing buildings
          if (r.f() < 0.3 && bw > 90) {
            const names = ['PALMS', 'CLUB', 'MOTEL', '24H', 'DINER', 'BAR', 'VICE', 'HOTEL', 'GIRLZ', 'TATTOO', 'NEON', 'LIQUOR', 'ARCADE', 'SUSHI', 'ROXY', 'PALM FIZZ', 'KARAOKE', 'CAFE', 'WAX', 'BINGO'];
            const text = names[r.int(0, names.length - 1)];
            const color = COLORS.neon[['pink', 'cyan', 'gold', 'lime', 'violet'][r.int(0, 4)]];
            const onLeft = r.chance(0.5);
            this.neonSigns.push({ x: onLeft ? b.x0 : b.x1, y: r.range(b.y0 + 30, b.y1 - 30), text, color, vert: onLeft ? 1 : -1 });
          }
          b.type = 'building';
          this.buildings.push(b);
          this.addSolid(b);
          cursor += bw + gap;
        }
      }
    }

    // --- PARK (center green with palms & paths) ---------------------------
    for (let i = 0; i < 26; i++) {
      const px = this.rng.range(PARK.x0 + 30, PARK.x1 - 30);
      const py = this.rng.range(PARK.y0 + 30, PARK.y1 - 30);
      if (Math.abs((py - (PARK.y0 + PARK.y1) / 2)) < 26 || Math.abs(px - (PARK.x0 + PARK.x1) / 2) < 26) continue;
      this.palms.push({ x: px, y: py, s: this.rng.range(0.9, 1.35) });
      this.palmSolids.push({ x: px, y: py, r: 7 });
    }
    this.props.push({ kind: 'fountain', x: (PARK.x0 + PARK.x1) / 2, y: (PARK.y0 + PARK.y1) / 2 });

    // --- BEACH (south sand, palms, beach hut, lifeguard towers) -----------
    for (let i = 0; i < 40; i++) {
      const px = this.rng.range(120, CFG.AIR_W - 120);
      const py = this.rng.range(CFG.SAND_S + 26, CFG.OCEAN_S - 40);
      if (this.palms.some((p) => Math.hypot(p.x - px, p.y - py) < 90)) continue;
      this.palms.push({ x: px, y: py, s: this.rng.range(1.0, 1.4) });
      this.palmSolids.push({ x: px, y: py, r: 7 });
    }
    for (let i = 0; i < 4; i++) {
      const x = 500 + i * 1100;
      this.props.push({ kind: 'lifeguard', x, y: CFG.SAND_S + 90 });
    }
    this.props.push({ kind: 'beachhut', x: 1020, y: CFG.SAND_S + 60, w: 120, h: 70 });
    this.addSolid({ x0: 960, y0: CFG.SAND_S + 30, x1: 1080, y1: CFG.SAND_S + 100, type: 'hut' });

    // --- NORTH DOCKS: piers, containers, cranes, ship ---------------------
    const dockTop = CFG.HARBOR_N, dockBot = CFG.DOCKS_S;
    for (let i = 0; i < 4; i++) {
      const px = 380 + i * 980;
      this.props.push({ kind: 'pier', x: px, y: (dockTop + dockBot) / 2, w: 70, h: dockBot - dockTop + 240 });
    }
    // container stacks
    const contCols = ['#b3452c', '#2c6cb3', '#b3922c', '#3d8a3d', '#7a3db3', '#b32c5e'];
    for (let i = 0; i < 34; i++) {
      const x = this.rng.range(300, 4100);
      const y = this.rng.range(dockTop + 60, dockBot - 60);
      const w = this.rng.int(52, 86), h = 30;
      const rect = { x0: x, y0: y, x1: x + w, y1: y + h, type: 'container', color: contCols[this.rng.int(0, contCols.length - 1)], stack: this.rng.int(1, 3) };
      this.buildings.push({ x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1, color: rect.color, floors: 0, container: true, stack: rect.stack });
      this.addSolid(rect);
    }
    // cranes
    for (let i = 0; i < 3; i++) {
      const x = 700 + i * 1300;
      this.props.push({ kind: 'crane', x, y: dockTop + 10 });
      this.addSolid({ x0: x - 12, y0: dockTop, x1: x + 12, y1: dockTop + 46, type: 'crane' });
    }
    // cargo ship
    this.props.push({ kind: 'ship', x: 2300, y: dockTop - 210, w: 700, h: 260 });
    this.addSolid({ x0: 1960, y0: dockTop - 330, x1: 2660, y1: dockTop - 90, type: 'ship' });
    this.props.push({ kind: 'dockshed', x: 3350, y: 480, w: 240, h: 130 });
    this.addSolid({ x0: 3230, y0: 415, x1: 3470, y1: 545, type: 'shed' });
    this.props.push({ kind: 'marina', x: 460, y: 500 });

    // --- PALM AIRFIELD (east): runway, hangars, tower, fence --------------
    const AW = CFG.AIR_W;
    this.props.push({ kind: 'runway', x0: AW - 40, y0: 1900, x1: W, y1: 2060 });
    this.props.push({ kind: 'runway', x0: AW - 40, y0: 1900, x1: W, y1: 2060, sec: 2 });
    for (let i = 0; i < 3; i++) {
      const hx = AW + 120 + i * 300, hy = 1500;
      this.props.push({ kind: 'hangar', x: hx, y: hy, w: 220, h: 150 });
      this.addSolid({ x0: hx - 110, y0: hy - 75, x1: hx + 110, y1: hy + 75, type: 'hangar' });
    }
    this.props.push({ kind: 'tower', x: AW + 260, y: 2280 });
    this.addSolid({ x0: AW + 230, y0: 2250, x1: AW + 290, y1: 2310, type: 'tower' });
    // perimeter fence with west gate
    const fy0 = 1380, fy1 = 2450;
    for (let y = fy0; y < fy1; y += 40) {
      if (y > 1930 && y < 2040) continue; // gate
      this.addSolid({ x0: AW - 70, y0: y, x1: AW - 58, y1: y + 24, type: 'fence' });
    }
    for (let x = AW - 70; x < W - 40; x += 60) {
      this.addSolid({ x0: x, y0: fy0 - 12, x1: x + 36, y1: fy0, type: 'fence' });
      this.addSolid({ x0: x, y0: fy1, x1: x + 36, y1: fy1 + 12, type: 'fence' });
    }
    this.props.push({ kind: 'plane', x: AW + 420, y: 1980 });

    // --- street lamps along roads ------------------------------------------
    for (const y of this.roadH) for (let x = 200; x < CFG.AIR_W; x += 340) this.lamps.push({ x, y: y - CFG.ROAD_W / 2 - 8 });
    for (const x of this.roadV) for (let y = 400; y < CFG.SAND_S; y += 340) this.lamps.push({ x: x + CFG.ROAD_W / 2 + 8, y });

    // --- traffic lights at intersections of avenues ------------------------
    for (let ix = 1; ix < this.roadV.length; ix += 2) {
      for (let iy = 1; iy < this.roadH.length; iy += 2) {
        this.lights.push({ x: this.roadV[ix], y: this.roadH[iy], ix, iy });
      }
    }

    // --- OLD TOWN (NW brick district): alleys, market stalls, fountain ------
    for (let bx = 1; bx <= 3; bx++) {
      for (let by = 5; by <= 7; by++) {
        const x0 = bx * R - 150, y0 = by * R - 150;
        // brick tone override for buildings that were just generated there
        for (const b of this.buildings) {
          if (b.container) continue;
          if (b.x0 >= x0 - 170 && b.x1 <= x0 + 510 && b.y0 >= y0 - 170 && b.y1 <= y0 + 510) {
            b.brick = true;
            b.color = ['#4a2a24', '#4a3324', '#3a2a2a'][(bx + by) % 3];
          }
        }
      }
    }
    // market stalls along the old town streets
    for (let i = 0; i < 6; i++) {
      const sx = 500 + (i % 3) * 340 + 90;
      const sy = 1740 + Math.floor(i / 3) * 340 + 60;
      this.props.push({ kind: 'stall', x: sx, y: sy, color: ['#c94f6d', '#4f8ac9', '#c9a44f'][i % 3] });
      this.addSolid({ x0: sx - 30, y0: sy - 8, x1: sx + 30, y1: sy + 8, type: 'stall' });
    }
    this.props.push({ kind: 'oldfountain', x: 1620, y: 2080 });

    // --- GLASS TOWERS (downtown east): reflective high-rises -----------------
    for (const b of this.buildings) {
      if (b.container || b.floors < 6) continue;
      if (b.x0 > 2700 && b.x0 < 4100 && b.y0 > 800 && b.y0 < 2400 && RNG.hash(b.x0 + b.y0 * 3) < 0.5) {
        b.glass = true;
        b.color = '#1c2a3a';
      }
    }

    // --- construction sites (2, with crane cones and barriers) --------------
    const sites = [{ x: 1400, y: 1740 }, { x: 3820, y: 2400 }];
    for (const s of sites) {
      this.props.push({ kind: 'site', x: s.x, y: s.y, w: 200, h: 140 });
      this.addSolid({ x0: s.x - 60, y0: s.y - 40, x1: s.x + 20, y1: s.y + 30, type: 'foundation' });
      this.props.push({ kind: 'minicrane', x: s.x + 80, y: s.y - 30 });
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU;
        this.props.push({ kind: 'cone', x: s.x + Math.cos(ang) * 110, y: s.y + Math.sin(ang) * 80 });
      }
      for (let i = 0; i < 4; i++) {
        this.props.push({ kind: 'barrier', x: s.x - 110 + i * 8, y: s.y - 70 + i * 46 });
      }
    }

    // --- plaza with fountain plaza tiles (downtown) --------------------------
    this.props.push({ kind: 'plaza', x: 3060, y: 1720, w: 220, h: 180 });
    for (let i = 0; i < 6; i++) {
      this.props.push({ kind: 'planter', x: 3060 - 90 + (i % 3) * 90, y: 1620 + Math.floor(i / 3) * 210 });
    }

    // --- harbor extras: fishing boats, pallet stacks, dock lamps ------------
    this.props.push({ kind: 'boat', x: 1250, y: 130, len: 120 });
    this.props.push({ kind: 'boat', x: 3480, y: 90, len: 90 });
    for (let i = 0; i < 5; i++) {
      const x = 900 + i * 620;
      this.props.push({ kind: 'pallets', x, y: 640 });
      this.props.push({ kind: 'docklamp', x: x + 260, y: 300 });
    }
    this.addSolid({ x0: 1190, y0: 70, x1: 1310, y1: 190, type: 'boat' });

    // --- airfield extras: second runway stripe + parked crew cars -----------
    this.props.push({ kind: 'runway', x0: CFG.AIR_W - 40, y0: 2260, x1: W, y1: 2340, sec: 3 });
    this.spawns.cars.push({ x: CFG.AIR_W + 140, y: 2200, h: 0, type: 'pickup', parked: true });
    this.spawns.cars.push({ x: CFG.AIR_W + 240, y: 2200, h: 0, type: 'van', parked: true });

    // --- ambient wildlife: seagulls circle the beach and the harbor ---------
    this.gulls = [];
    for (let i = 0; i < 8; i++) {
      const gx = this.rng.range(400, 4000);
      const gy = this.rng.f() < 0.5 ? this.rng.range(CFG.SAND_S, CFG.OCEAN_S + 60) : this.rng.range(60, 240);
      this.gulls.push({ x: gx, y: gy, r: 40 + this.rng.f() * 70, sp: this.rng.range(0.8, 1.6), ph: this.rng.f() * TAU });
    }

    // --- cafe tables on the old town sidewalks -------------------------------
    for (let i = 0; i < 5; i++) {
      this.props.push({ kind: 'cafetable', x: 480 + i * 110, y: 1782 });
      this.props.push({ kind: 'umbrellastand', x: 480 + i * 110, y: 1798 });
    }

    // --- beach extras: umbrellas, surfboards, more lifeguards ---------------
    for (let i = 0; i < 14; i++) {
      const x = this.rng.range(260, 4000);
      this.props.push({ kind: 'umbrella', x, y: this.rng.range(CFG.SAND_S + 60, CFG.OCEAN_S - 60), color: COLORS.neon[['pink', 'cyan', 'gold'][i % 3]] });
    }
    for (let i = 0; i < 6; i++) {
      this.props.push({ kind: 'surfboard', x: this.rng.range(300, 4000), y: this.rng.range(CFG.OCEAN_S - 40, CFG.OCEAN_S + 20) });
    }
    this.props.push({ kind: 'lifeguard', x: 2600, y: CFG.SAND_S + 90 });
    this.props.push({ kind: 'lifeguard', x: 3400, y: CFG.SAND_S + 90 });

    // --- downtown road furniture: parking meters, mailboxes, hydrants -------
    for (const x of this.roadV) {
      for (const y of this.roadH) {
        if (RNG.hash(x * 3 + y * 7) < 0.12) this.props.push({ kind: 'meter', x: x - CFG.ROAD_W / 2 - 14, y: y + 44 });
        if (RNG.hash(x * 5 + y * 11) < 0.08) this.props.push({ kind: 'mailbox', x: x + CFG.ROAD_W / 2 + 14, y: y - 44 });
      }
    }

    // --- points of interest (missions / services) --------------------------
    this.pois = {
      beachhut: { x: 1020, y: CFG.SAND_S - 26 },
      garage: { x: 2380, y: 2896 },
      marina: { x: 460, y: 430 },
      taxi: { x: 1700, y: 2725 },
      phonebooth: { x: 3060, y: 1196 },
      safehouse: { x: 748, y: 2210 },
      police: { x: 1386, y: 1700 },
      hospital: { x: 2074, y: 1016 },
      docksGate: { x: 1700, y: 800 },
      airGate: { x: CFG.AIR_W - 100, y: 1985 },
      shipDeck: { x: 2300, y: 300 },
      spray: { x: 1904, y: 3090 },
      gas: { x: 1196, y: 1352 },
      ammunation: { x: 2765, y: 1494 },
      food: { x: 1516, y: 2680 },
    };

    // --- service storefronts (drawn by render, used by shops.js) ------------
    this.props.push({ kind: 'shopfront', x: 1904, y: 3160, color: '#ff5da2', label: "PAY 'N' SPRAY", w: 120, h: 70 });
    this.props.push({ kind: 'shopfront', x: 1196, y: 1290, color: '#ffd166', label: 'OCTANE FUEL', w: 130, h: 70 });
    this.props.push({ kind: 'shopfront', x: 2850, y: 1494, color: '#8cff5d', label: 'AMMU-NATION', w: 120, h: 70 });
    this.props.push({ kind: 'shopfront', x: 1516, y: 2630, color: '#00e5ff', label: 'PALM DOGS', w: 96, h: 60 });
    // storefronts are solid boxes
    this.addSolid({ x0: 1844, y0: 3125, x1: 1964, y1: 3195, type: 'shop' });
    this.addSolid({ x0: 1131, y0: 1255, x1: 1261, y1: 1325, type: 'shop' });
    this.addSolid({ x0: 2790, y0: 1459, x1: 2910, y1: 1529, type: 'shop' });
    this.addSolid({ x0: 1468, y0: 2600, x1: 1564, y1: 2660, type: 'shop' });
    // storefronts replace any procedurally placed building on their block
    const shopRects = [[1844, 3125, 1964, 3195], [1131, 1255, 1261, 1325], [2790, 1459, 2910, 1529], [1468, 2600, 1564, 2660]];
    this.buildings = this.buildings.filter((b) => !shopRects.some((r) => b.x0 < r[2] && b.x1 > r[0] && b.y0 < r[3] && b.y1 > r[1]));

    // --- parking lots with painted stalls + parked cars ---------------------
    const lots = [{ x: 2260, y: 1740, cols: 5, rows: 3 }, { x: 3380, y: 2560, cols: 4, rows: 3 }];
    for (const lot of lots) {
      this.props.push({ kind: 'lot', x: lot.x, y: lot.y, cols: lot.cols, rows: lot.rows });
      for (let cxi = 0; cxi < lot.cols; cxi++) {
        for (let cyi = 0; cyi < lot.rows; cyi++) {
          if (this.rng.f() < 0.55) continue; // some stalls empty
          const type = ['sedan', 'coupe', 'van', 'pickup'][this.rng.int(0, 3)];
          this.spawns.cars.push({ x: lot.x - lot.cols * 34 + cxi * 68 + 34, y: lot.y - lot.rows * 56 + cyi * 112, h: Math.PI / 2, type, parked: true });
        }
      }
    }

    // --- billboards on rooftops and lots ------------------------------------
    const billArt = [
      { text: 'DRINK PALM FIZZ', color: COLORS.neon.gold },
      { text: 'VICE PALMS CASINO', color: COLORS.neon.pink },
      { text: 'FLY PALM AIR', color: COLORS.neon.cyan },
      { text: 'GATOR GYM 24H', color: COLORS.neon.lime },
      { text: 'NEON WAX MOTORS', color: COLORS.neon.violet },
      { text: 'HARBOR SIDE SUITES', color: COLORS.neon.red },
    ];
    const billSpots = [[880, 1080], [2060, 780], [3080, 1760], [4060, 1080], [540, 2720], [3720, 3060]];
    billSpots.forEach((s, i) => this.props.push({ kind: 'billboard', x: s[0], y: s[1], art: billArt[i % billArt.length] }));

    // --- bus stops -----------------------------------------------------------
    for (const [x, y] of [[1046, 1046], [2404, 1046], [1046, 2750], [3406, 2404]]) {
      this.props.push({ kind: 'busstop', x, y });
    }

    // --- street litter: dumpsters, hydrants, benches ------------------------
    for (let i = 0; i < 46; i++) {
      const x = this.rng.range(300, 4100), y = this.rng.range(700, 3400);
      // only on sidewalks
      const ry = Math.round(y / CFG.ROAD_SPACING) * CFG.ROAD_SPACING;
      if (Math.abs(y - ry) > 40 && Math.abs(y - ry) < 46) continue;
      const kind = this.rng.pick(['dumpster', 'hydrant', 'bench', 'bin']);
      this.props.push({ kind, x, y: y < ry ? ry - 42 : ry + 42 });
      if (kind === 'dumpster') this.addSolid({ x0: x - 16, y0: (y < ry ? ry - 50 : ry + 34), x1: x + 16, y1: (y < ry ? ry - 34 : ry + 50), type: 'dumpster' });
    }
    // rooftop AC units on tall buildings (visual only)
    for (const b of this.buildings) {
      if (b.container || b.floors < 5) continue;
      b.ac = this.rng.f() < 0.6;
      // skyline extras: rooftop pools, entrance canopies, neon window bands
      if (b.floors >= 7 && this.rng.f() < 0.35) b.pool = true;
      if (b.floors >= 4 && this.rng.f() < 0.4) b.canopy = { side: this.rng.chance(0.5) ? 'n' : 's', color: COLORS.neon[['pink', 'cyan', 'gold'][this.rng.int(0, 2)]] };
      if (b.floors >= 6 && this.rng.f() < 0.3) b.band = COLORS.neon[['violet', 'lime', 'red'][this.rng.int(0, 2)]];
    }

    // --- beach extras: volleyball court + boardwalk --------------------------
    this.props.push({ kind: 'court', x: 2600, y: CFG.SAND_S + 110 });
    this.props.push({ kind: 'boardwalk', x0: 300, x1: 4100, y: CFG.SAND_S + 14 });

    // --- airfield extras: fuel drums + windsock ------------------------------
    for (let i = 0; i < 8; i++) {
      this.props.push({ kind: 'drums', x: CFG.AIR_W + 140 + (i % 4) * 70, y: 2140 + Math.floor(i / 4) * 60 });
    }
    this.props.push({ kind: 'windsock', x: CFG.AIR_W + 60, y: 1840 });

    // --- drive-in theater by the beach: giant screen + speaker posts --------
    this.props.push({ kind: 'drivein', x: 3450, y: CFG.SAND_S - 60 });
    for (let i = 0; i < 4; i++) {
      this.props.push({ kind: 'speaker', x: 3300 + i * 100, y: CFG.SAND_S + 80 });
    }
    this.addSolid({ x0: 3330, y0: CFG.SAND_S - 130, x1: 3570, y1: CFG.SAND_S - 66, type: 'screen' });

    // --- landmark blocks: VPD precinct, hospital, Palm Garage ---------------
    const landmarks = [
      { x: 1386, y: 1700, kind: 'precinct', label: 'VPD PRECINCT 1', color: '#4f8aff', w: 150, h: 100 },
      { x: 2074, y: 1016, kind: 'hospital', label: 'MERCY GENERAL', color: '#ff5d7d', w: 150, h: 100 },
      { x: 2380, y: 2896, kind: 'garagebld', label: 'PALM GARAGE', color: '#ffd166', w: 140, h: 90 },
    ];
    for (const L of landmarks) {
      this.props.push({ kind: L.kind, x: L.x, y: L.y, label: L.label, color: L.color, w: L.w, h: L.h });
      this.addSolid({ x0: L.x - L.w / 2, y0: L.y - L.h / 2, x1: L.x + L.w / 2, y1: L.y + L.h / 2, type: L.kind });
    }
    // remove procedural buildings that collide with landmark footprints
    const lmRects = [[1311, 1650, 1461, 1750], [1999, 966, 2149, 1066], [2310, 2851, 2450, 2941]];
    this.buildings = this.buildings.filter((b) => !b.container && !lmRects.some((r) => b.x0 < r[2] && b.x1 > r[0] && b.y0 < r[3] && b.y1 > r[1]));

    // --- hidden packages (12 collectibles tucked around town) ----------------
    // snap each to the nearest sidewalk so they are always reachable on foot
    const snapSidewalk = (x, y) => {
      const R = CFG.ROAD_SPACING;
      const rx = Math.round(x / R) * R, ry = Math.round(y / R) * R;
      if (Math.abs(y - ry) <= Math.abs(x - rx)) return { x: clamp(x, 120, 4160), y: ry + (y > ry ? 1 : -1) * 42 };
      return { x: rx + (x > rx ? 1 : -1) * 42, y: clamp(y, 400, 3360) };
    };
    this.hidden = [
      [462, 560], [1216, 428], [2066, 348], [3216, 560], [4088, 460],
      [560, 1420], [1790, 1745], [3060, 2078], [4150, 2350], [836, 3080],
      [2470, 3220], [3690, 2870],
    ].map(([hx, hy]) => { const s = snapSidewalk(hx, hy); return [s.x, s.y]; });

    // --- landmark neon: VPD, hospital and hotel crown signs ------------------
    this.neonSigns.push({ x: this.pois.police.x, y: this.pois.police.y + 40, text: 'VPD', color: '#4f8aff', vert: -1 });
    this.neonSigns.push({ x: this.pois.hospital.x, y: this.pois.hospital.y + 40, text: 'MED', color: '#ff5d7d', vert: -1 });
    this.neonSigns.push({ x: 2720 + 20, y: 1700, text: 'HOTEL', color: '#c77dff', vert: 1 });

    // --- spawn tables (deterministic) --------------------------------------
    const carTypes = ['sedan', 'sedan', 'taxi', 'van', 'pickup', 'coupe', 'sport', 'truck', 'bus', 'sedan', 'coupe', 'taxi'];
    for (const y of this.roadH) {
      for (let x = 240; x < CFG.AIR_W - 60; x += 480) {
        const jitter = (RNG.hash(x * 7 + y) - 0.5) * 120;
        const type = carTypes[Math.floor(RNG.hash(x + y * 3) * carTypes.length) % carTypes.length];
        this.spawns.cars.push({ x: x + jitter, y: y + CFG.LANE_OFF, h: 0, type });
        this.spawns.cars.push({ x: x + 240 + jitter, y: y - CFG.LANE_OFF, h: Math.PI, type: carTypes[Math.floor(RNG.hash(x * 5 + y) * carTypes.length) % carTypes.length] });
      }
    }
    for (const x of this.roadV) {
      for (let y = 420; y < CFG.SAND_S - 100; y += 520) {
        const type = carTypes[Math.floor(RNG.hash(x * 11 + y) * carTypes.length) % carTypes.length];
        this.spawns.cars.push({ x: x - CFG.LANE_OFF, y: y + 60, h: Math.PI / 2, type });
        this.spawns.cars.push({ x: x + CFG.LANE_OFF, y: y + 300, h: -Math.PI / 2, type });
      }
    }
    for (const y of this.roadH) {
      for (let x = 180; x < CFG.AIR_W; x += 170) {
        this.spawns.peds.push({ x, y: y - CFG.ROAD_W / 2 - 14, dir: RNG.hash(x + y) > 0.5 ? 0 : Math.PI });
        this.spawns.peds.push({ x: x + 85, y: y + CFG.ROAD_W / 2 + 14, dir: RNG.hash(x * 3 + y) > 0.5 ? 0 : Math.PI });
      }
    }
    // taxi for the taxi stand mission
    this.spawns.cars.push({ x: 1700, y: 2760, h: 0, type: 'taxi' });
  }

  addSolid(r) {
    this.solids.push(r);
    const c = this.cell;
    for (let gx = Math.floor(r.x0 / c); gx <= Math.floor(r.x1 / c); gx++) {
      for (let gy = Math.floor(r.y0 / c); gy <= Math.floor(r.y1 / c); gy++) {
        const k = gx + ',' + gy;
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(r);
      }
    }
  }

  // solids near a point (spatial hash lookup)
  nearSolids(x, y) {
    const c = this.cell, gx = Math.floor(x / c), gy = Math.floor(y / c), out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const arr = this.grid.get((gx + i) + ',' + (gy + j));
      if (arr) out.push(...arr);
    }
    return out;
  }

  isWater(x, y) {
    for (const w of this.water) if (pointInRect(x, y, w)) return w.kind;
    return null;
  }

  inZone(x, y) {
    if (y < CFG.DOCKS_S && y > -100 && x < 4200) return 'docks';
    if (x >= CFG.AIR_W - 60) return 'airfield';
    if (y >= CFG.SAND_S - 40) return 'beach';
    const P = CFG.PARK;
    if (x >= P.x0 && x <= P.x1 && y >= P.y0 && y <= P.y1) return 'park';
    return 'city';
  }

  // world-space to nearest road lane center for a given direction of travel
  snapLane(pos, dir) {
    const R = CFG.ROAD_SPACING, off = CFG.LANE_OFF;
    if (dir === 0 || dir === Math.PI) {
      const ry = Math.round(pos.y / R) * R;
      return dir === 0 ? ry + off : ry - off;
    }
    const rx = Math.round(pos.x / R) * R;
    return dir === Math.PI / 2 ? rx - off : rx + off;
  }

  // green phase for an intersection at time t: 'ns' or 'ew'
  lightPhase(ix, iy, t) {
    return ((Math.floor(t / 7) + ix * 3 + iy * 7) % 2) === 0 ? 'ns' : 'ew';
  }
}
