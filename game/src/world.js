// ============================================================================
// VICE PALMS — world.js
// One deterministic night city: a road grid of blocks that becomes, by zone,
// a downtown of neon towers, residential strips, a south beach + sea, a 2x2
// park, the NORTH DOCKS (piers, containers, cranes, a moored ship) and the
// PALM AIRFIELD (runway, hangars, tower). Builds collision solids, spawn
// points, named locations and the prerendered minimap. Same seed => same city.
// ============================================================================

import {
  TILE, ROAD, LANE, COLS, ROWS, CITY_W, CITY_H, WATER_NORTH, WATER_SOUTH,
  SIDEWALK, BEACH_ROW, DOCK_ROWS, AIR_COLS, AIR_ROWS, PARK_BLOCKS,
  WORLD_X0, WORLD_Y0, WORLD_X1, WORLD_Y1, TRAFFIC, WEATHER as WEATHER_TYPES,
} from './config.js';
import { RNG, hashSeed, neonWord, streetName } from './rng.js';
import { clamp, TAU } from './util.js';

const BLOCK_INNER = TILE - ROAD; // 78 — block edge length
const BUILD_MIN = 14;            // smallest building side

// Zone palette: [yard fill, edge tint]
const YARD = {
  downtown:   ['#1b1d26', '#14151c'],
  commercial: ['#1d1e26', '#15161d'],
  residential:['#191b20', '#131418'],
  park:       ['#17321f', '#122718'],
  beach:      ['#cbb27a', '#b09a63'],
  docks:      ['#23262e', '#1a1c22'],
  airfield:   ['#23262b', '#1b1d21'],
  plaza:      ['#20222c', '#171821'],
};

const WALL_TONES = ['#2a2c38', '#26272f', '#31333f', '#232530', '#2e2a36', '#3a3444'];
const ROOF_TONES = ['#3a3d4c', '#34363f', '#43465a', '#2e303c', '#403a4e', '#4a4454'];
const CONTAINER_COLORS = ['#b0483f', '#3f7ab0', '#4f9c58', '#b0913f', '#7a4fa0', '#3fa0a0'];

export class World {
  constructor(seed) {
    this.seed = seed;
    this.rng = new RNG(hashSeed('vice-palms-' + seed));
    this.nameRng = new RNG(hashSeed('names-' + seed));
    this.blocks = [];        // blocks[j][i]
    this.solids = [];
    this.hash = new Map();   // spatial hash of solids, cell 48
    this.neon = [];          // {x,y,w,h,color,word,flicker}
    this.streetlights = [];  // {x,y}
    this.palms = [];         // {x,y,s,seed}
    this.sandDots = [];      // beach texture specks
    this.crosswalks = [];    // per-intersection marking flag
    this.locations = {};
    this.waves = [];         // water animation phase seeds
    this.weather = null;
    this.parkingSpots = [];  // {x,y,angle}
    this.hydrants = [];      // {x,y}
    this.busStops = [];      // {x,y,angle}
    this.manholes = [];      // {x,y}
    this.awnings = [];       // {x,y,w,color}
    this.yachts = [];        // {x,y}
    this.floodlights = [];   // {x,y}
    this.runwayLights = [];  // {x,y,color}
    this.boardwalk = null;   // {x0,x1,y,h}
    this.ferris = null;      // {x,y,r}
    this.roofPads = [];      // helipads {x,y}
    this.roofTanks = [];     // water towers {x,y}
    this.minimap = null;
    this.mmScale = 0.26;     // minimap px per world unit
    this.build();
    this.buildMinimap();
  }

  // ---------------------------------------------------------------- building
  build() {
    const rng = this.rng;
    // Block zones
    for (let j = 0; j < ROWS; j++) {
      this.blocks[j] = [];
      for (let i = 0; i < COLS; i++) {
        const b = {
          i, j,
          x: i * TILE + ROAD / 2,
          y: j * TILE + ROAD / 2,
          w: BLOCK_INNER,
          h: BLOCK_INNER,
          type: 'residential',
          buildings: [],
          props: [],
          neon: [],
          trees: [],
        };
        this.blocks[j][i] = b;
        b.type = this.zoneFor(i, j, rng);
        this.fillBlock(b, rng);
      }
    }
    this.placeStreetlights();
    this.placePalms(rng);
    this.placeBeachDetail(rng);
    this.placeWaterWaves(rng);
    this.buildWeather();
    this.buildParking(rng);
    this.buildStreetFurniture(rng);
    this.buildHarborDetails(rng);
    this.buildRunwayLights();
    this.buildFerrisWheel();
    this.buildBoardwalk();
    this.buildRoofFeatures(rng);
    this.nameLocations();
    this.buildMinimap();
  }

  zoneFor(i, j, rng) {
    if (j === BEACH_ROW) return 'beach';
    if (j < DOCK_ROWS && i < 9) return 'docks';
    if (AIR_COLS.includes(i) && AIR_ROWS.includes(j)) return 'airfield';
    for (const [pi, pj] of PARK_BLOCKS) if (pi === i && pj === j) return 'park';
    if (i >= 4 && i <= 8 && j >= 3 && j <= 6) return 'downtown';
    if (i === 5 && j === 5) return 'plaza';
    const central = i >= 3 && i <= 9 && j >= 2 && j <= 7;
    if (central) return rng.chance(0.55) ? 'commercial' : 'downtown';
    return rng.chance(0.4) ? 'commercial' : 'residential';
  }

  addSolid(x, y, w, h, kind) {
    const s = { x, y, w, h, kind };
    this.solids.push(s);
    const x0 = Math.floor(x / 48), x1 = Math.floor((x + w) / 48);
    const y0 = Math.floor(y / 48), y1 = Math.floor((y + h) / 48);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = cx + ',' + cy;
        let arr = this.hash.get(k);
        if (!arr) { arr = []; this.hash.set(k, arr); }
        arr.push(s);
      }
    }
    return s;
  }

  solidsNear(x, y, r = 1) {
    const out = [];
    const x0 = Math.floor((x - r) / 48), x1 = Math.floor((x + r) / 48);
    const y0 = Math.floor((y - r) / 48), y1 = Math.floor((y + r) / 48);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.hash.get(cx + ',' + cy);
        if (arr) for (const s of arr) if (!out.includes(s)) out.push(s);
      }
    }
    return out;
  }

  // Any solid containing the point (LOS blocking / bullet stop).
  blockedAt(x, y) {
    for (const s of this.solidsNear(x, y, 1)) {
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
    }
    return null;
  }

  // True when nothing solid sits within r of the point (exact distance test,
  // not the cell-level query — spawn checks need the precision).
  clearAt(x, y, r) {
    for (const s of this.solidsNear(x, y, r + 1)) {
      const nx = clamp(x, s.x, s.x + s.w);
      const ny = clamp(y, s.y, s.y + s.h);
      const dx = x - nx, dy = y - ny;
      if (dx * dx + dy * dy < r * r) return false;
    }
    return true;
  }

  // Point is on asphalt (road or runway).
  isRoad(x, y) {
    if (x < WORLD_X0 || x > WORLD_X1 || y < WORLD_Y0 || y > WORLD_Y1) return false;
    // Runway
    if (x > 874 && x < 1240 && y > 122 && y < 166) return true;
    const fx = x - Math.round(x / TILE) * TILE;
    const fy = y - Math.round(y / TILE) * TILE;
    const inCityX = x >= -ROAD / 2 && x <= CITY_W + ROAD / 2;
    const inCityY = y >= -ROAD / 2 && y <= CITY_H + ROAD / 2;
    return (Math.abs(fx) <= ROAD / 2 && inCityY) || (Math.abs(fy) <= ROAD / 2 && inCityX);
  }

  isWater(x, y) {
    return y < -ROAD / 2 || y > CITY_H + ROAD / 2;
  }

  regionAt(x, y) {
    if (this.isWater(x, y)) return 'water';
    if (y > 869 && y < 971) return 'beach';
    if (x < 872 && y < 190) return 'docks';
    if (x >= 872 && y < 384) return 'airfield';
    for (const [pi, pj] of PARK_BLOCKS) {
      if (x > pi * TILE + 9 && x < pi * TILE + 87 && y > pj * TILE + 9 && y < pj * TILE + 87) return 'park';
    }
    return 'city';
  }

  // Human name for where you're standing — HUD zone line + full map labels.
  streetAt(x, y) {
    const region = this.regionAt(x, y);
    if (region === 'water') return 'OPEN WATER';
    if (region === 'beach') return 'VICE BEACH';
    if (region === 'docks') return 'NORTH DOCKS';
    if (region === 'airfield') return 'PALM AIRFIELD';
    if (region === 'park') return 'PALMS PARK';
    const i = Math.round(x / TILE), j = Math.round(y / TILE);
    const onV = Math.abs(x - i * TILE) <= ROAD / 2 + 3 && i >= 0 && i <= COLS && y >= -ROAD / 2 && y <= CITY_H + ROAD / 2;
    const onH = Math.abs(y - j * TILE) <= ROAD / 2 + 3 && j >= 0 && j <= ROWS && x >= -ROAD / 2 && x <= CITY_W + ROAD / 2;
    const nv = this.streetNames.v[i], nh = this.streetNames.h[j];
    if (onV && onH && nv && nh) return nv + ' × ' + nh;
    if (onV && nv) return nv;
    if (onH && nh) return nh;
    if (i >= 4 && i <= 8 && j >= 3 && j <= 6) return 'DOWNTOWN';
    return 'BACKSTREETS';
  }

  // ------------------------------------------------------------------ blocks
  fillBlock(b, rng) {
    const bx = b.x, by = b.y;
    const ix = bx + SIDEWALK, iy = by + SIDEWALK;   // buildable origin
    const iw = BLOCK_INNER - SIDEWALK * 2, ih = BLOCK_INNER - SIDEWALK * 2; // 68x68

    switch (b.type) {
      case 'beach': this.fillBeach(b, rng, ix, iy, iw, ih); break;
      case 'docks': this.fillDocks(b, rng, ix, iy, iw, ih); break;
      case 'airfield': this.fillAirfield(b, rng, ix, iy, iw, ih); break;
      case 'park': this.fillPark(b, rng, ix, iy, iw, ih); break;
      default: this.fillCity(b, rng, ix, iy, iw, ih); break;
    }
  }

  // Standard city block: 1-4 buildings with neon on commercial/downtown.
  fillCity(b, rng, ix, iy, iw, ih) {
    const downtown = b.type === 'downtown';
    const neonChance = b.type === 'commercial' ? 0.6 : downtown ? 0.75 : 0.15;
    const layout = rng.next();
    const cells = [];

    if (layout < 0.22) {
      cells.push([ix, iy, iw, ih]);
    } else if (layout < 0.5) {
      const w1 = Math.floor(iw * rng.range(0.38, 0.62));
      cells.push([ix, iy, w1 - 2, ih], [ix + w1 + 2, iy, iw - w1 - 2, ih]);
    } else if (layout < 0.78) {
      const h1 = Math.floor(ih * rng.range(0.38, 0.62));
      cells.push([ix, iy, iw, h1 - 2], [ix, iy + h1 + 2, iw, ih - h1 - 2]);
    } else {
      const w1 = Math.floor(iw * rng.range(0.4, 0.6));
      const h1 = Math.floor(ih * rng.range(0.4, 0.6));
      cells.push(
        [ix, iy, w1 - 2, h1 - 2],
        [ix + w1 + 2, iy, iw - w1 - 2, h1 - 2],
        [ix, iy + h1 + 2, w1 - 2, ih - h1 - 2],
        [ix + w1 + 2, iy + h1 + 2, iw - w1 - 2, ih - h1 - 2],
      );
    }

    for (const [cx, cy, cw, ch] of cells) {
      if (cw < BUILD_MIN || ch < BUILD_MIN) continue;
      const inx = cx + rng.int(0, 2), iny = cy + rng.int(0, 2);
      const bw = cw - rng.int(0, 3), bh = ch - rng.int(0, 3);
      if (bw < BUILD_MIN || bh < BUILD_MIN) continue;
      const ht = downtown ? rng.range(9, 19) : rng.range(4, 11);
      const bl = {
        x: inx, y: iny, w: bw, h: bh, ht,
        wall: rng.pick(WALL_TONES),
        roof: rng.pick(ROOF_TONES),
        wseed: rng.int(1, 999999),
        lit: rng.chance(0.8),
        sign: null,
      };
      b.buildings.push(bl);
      this.addSolid(bl.x, bl.y, bl.w, bl.h, 'building');
      if (rng.chance(neonChance) && bl.w >= 18 && bl.h >= 14) {
        this.addNeonSign(b, bl, rng);
      }
    }

    // Alleys: a dumpster or two as small non-blocking props.
    const props = rng.int(0, 2);
    for (let p = 0; p < props; p++) {
      b.props.push({
        x: ix + rng.range(0, iw - 4), y: iy + rng.range(0, ih - 3),
        w: rng.range(2, 3.4), h: rng.range(1.6, 2.4),
        kind: rng.chance(0.5) ? 'dumpster' : 'planter',
      });
    }
  }

  addNeonSign(b, bl, rng) {
    const colorRoll = rng.next();
    const color = colorRoll < 0.2 ? '#ff3ca0' : colorRoll < 0.4 ? '#25e8ff' : colorRoll < 0.55 ? '#8dff4a'
      : colorRoll < 0.7 ? '#ffb02e' : colorRoll < 0.85 ? '#a06bff' : '#2effc8';
    const word = neonWord(this.nameRng);
    const onSouth = rng.chance(0.65);
    const w = Math.min(bl.w * 0.8, 4 + word.length * 2.2);
    const sign = {
      x: bl.x + (bl.w - w) / 2,
      y: onSouth ? bl.y + bl.h - 1.6 : bl.y + 0.4,
      w, h: 2.6,
      color,
      word,
      flicker: rng.chance(0.14) ? rng.range(6, 14) : 0,
      phase: rng.range(0, 10),
    };
    b.neon.push(sign);
    this.neon.push(sign);
    bl.sign = sign;
  }

  // Beach row: dunes, palms, lifeguard huts, a shack or two.
  fillBeach(b, rng, ix, iy, iw, ih) {
    const huts = rng.int(0, 2);
    for (let k = 0; k < huts; k++) {
      const w = rng.range(8, 12), h = rng.range(6, 8);
      const x = ix + rng.range(4, iw - w - 4), y = iy + rng.range(6, ih - h - 10);
      b.buildings.push({ x, y, w, h, ht: 3.4, wall: '#5a4a38', roof: '#8a5a3a', wseed: rng.int(1, 999999), lit: false, shack: true, sign: null });
      this.addSolid(x, y, w, h, 'hut');
    }
    if (b.i === 3) {
      // Rico's beach shack — a mission landmark.
      b.buildings.push({ x: ix + 28, y: iy + 44, w: 14, h: 10, ht: 3.8, wall: '#6a4f3a', roof: '#d0843c', wseed: 77, lit: true, shack: true, sign: null });
      this.addSolid(ix + 28, iy + 44, 14, 10, 'hut');
    }
    for (let k = 0; k < 6; k++) {
      const px = ix + rng.range(2, iw - 2), py = iy + rng.range(2, ih - 2);
      if (this.blockedAt(px, py) === null) b.trees.push({ x: px, y: py, palm: true, s: rng.range(0.85, 1.25), seed: rng.int(1, 999999) });
    }
  }

  // Docks: paved lots, container stacks, crane feet, quay details.
  fillDocks(b, rng, ix, iy, iw, ih) {
    const stacks = rng.int(2, 5);
    for (let k = 0; k < stacks; k++) {
      const rows = rng.int(1, 2), cols = rng.int(1, 3);
      const cx0 = ix + rng.range(2, Math.max(2, iw - cols * 7 - 2));
      const cy0 = iy + rng.range(2, Math.max(2, ih - rows * 3.4 - 2));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = cx0 + c * 7.4, y = cy0 + r * 3.8;
          b.props.push({ x, y, w: 6.6, h: 3, kind: 'container', color: rng.pick(CONTAINER_COLORS) });
          this.addSolid(x, y, 6.6, 3, 'container');
        }
      }
    }
    if (rng.chance(0.45)) {
      const x = ix + rng.range(6, iw - 8), y = iy + rng.range(6, ih - 8);
      b.props.push({ x, y, w: 4, h: 4, kind: 'crane', color: '#c8862a' });
      this.addSolid(x, y, 4, 4, 'crane');
    }
  }

  // Airfield: runway strip (visual), hangars, tower, parked plane, fuel tanks.
  fillAirfield(b, rng, ix, iy, iw, ih) {
    if (b.j === 2) {
      // Hangar row along the south apron.
      const hangarW = 30, hangarH = 17;
      const hx = ix + 12 + (b.i - 10) * 4, hy = iy + 34;
      b.buildings.push({ x: hx, y: hy, w: hangarW, h: hangarH, ht: 7, wall: '#3c4048', roof: '#565b66', wseed: 4242, lit: true, hangar: true, sign: null });
      this.addSolid(hx, hy, hangarW, hangarH, 'hangar');
      if (rng.chance(0.6)) {
        const tx = ix + rng.range(3, iw - 6), ty = iy + rng.range(3, 14);
        b.props.push({ x: tx, y: ty, w: 5, h: 5, kind: 'fuel', color: '#8a2f2f' });
        this.addSolid(tx, ty, 5, 5, 'fuel');
      }
    } else if (b.j === 0 && b.i === 10) {
      // Control tower
      b.props.push({ x: ix + 22, y: iy + 24, w: 7, h: 7, kind: 'tower', color: '#4a4f5c' });
      this.addSolid(ix + 22, iy + 24, 7, 7, 'tower');
    } else if (b.j === 3 && b.i === 12) {
      // A parked twin-prop, nose west.
      b.props.push({ x: ix + 18, y: iy + 22, w: 24, h: 9, kind: 'plane', color: '#cfd3da' });
      this.addSolid(ix + 18, iy + 22, 24, 9, 'plane');
    }
  }

  // Park: paths, pond, benches, dense palms/trees.
  fillPark(b, rng, ix, iy, iw, ih) {
    b.pond = (b.i === 7 && b.j === 6) ? { x: ix + 16, y: iy + 14, w: 34, h: 30 } : null;
    const trees = rng.int(7, 11);
    for (let k = 0; k < trees; k++) {
      const px = ix + rng.range(3, iw - 3), py = iy + rng.range(3, ih - 3);
      if (b.pond && px > b.pond.x - 2 && px < b.pond.x + b.pond.w + 2 && py > b.pond.y - 2 && py < b.pond.y + b.pond.h + 2) continue;
      if (this.blockedAt(px, py)) continue;
      b.trees.push({ x: px, y: py, palm: rng.chance(0.7), s: rng.range(0.9, 1.4), seed: rng.int(1, 999999) });
    }
    for (let k = 0; k < 3; k++) {
      b.props.push({ x: ix + rng.range(4, iw - 6), y: iy + rng.range(4, ih - 4), w: 2.6, h: 1, kind: 'bench' });
    }
  }

  placeStreetlights() {
    for (let j = 0; j <= ROWS; j++) {
      for (let i = 0; i <= COLS; i++) {
        const x = i * TILE, y = j * TILE;
        if (y > CITY_H) continue; // beach sea edge
        if ((i + j) % 2 === 0) {
          this.streetlights.push({ x: x - ROAD / 2 - 1.2, y: y - ROAD / 2 - 1.2 });
        } else {
          this.streetlights.push({ x: x + ROAD / 2 + 1.2, y: y + ROAD / 2 + 1.2 });
        }
      }
    }
    // Extra lamps along the beach boulevard.
    for (let x = 40; x < CITY_W; x += 96) this.streetlights.push({ x, y: CITY_H - ROAD / 2 - 2 });
  }

  placePalms(rng) {
    // Beach boulevard median + sand fringe.
    for (let x = 24; x < CITY_W; x += 21) {
      if (!rng.chance(0.8)) continue;
      this.palms.push({ x: x + rng.range(-4, 4), y: CITY_H - ROAD / 2 - 8 + rng.range(-2, 2), s: rng.range(1, 1.4), seed: rng.int(1, 999999) });
    }
    // Downtown avenues: sporadic sidewalk palms.
    for (let i = 0; i <= COLS; i += 1) {
      for (let y = 60; y < CITY_H - 120; y += 130) {
        if (rng.chance(0.22)) this.palms.push({ x: i * TILE + ROAD / 2 + 2.5, y: y + rng.range(-20, 20), s: rng.range(0.9, 1.2), seed: rng.int(1, 999999) });
      }
    }
    for (const p of this.palms) {
      this.addSolid(p.x - 0.7, p.y - 0.7, 1.4, 1.4, 'palm');
    }
    // Park trees also block (they live in blocks; re-add here for solids).
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const b = this.blocks[j][i];
      for (const t of b.trees) this.addSolid(t.x - 0.7, t.y - 0.7, 1.4, 1.4, 'tree');
    }
  }

  placeBeachDetail(rng) {
    for (let k = 0; k < 420; k++) {
      const x = rng.range(6, CITY_W - 6), y = rng.range(BEACH_ROW * TILE + 14, CITY_H + 4);
      this.sandDots.push({ x, y, s: rng.range(0.5, 1.6), d: rng.chance(0.5) });
    }
    // Parasols + a couple of lifeguard towers.
    this.beachProps = [];
    const PARA = ['#ff3ca0', '#ffb02e', '#25e8ff', '#8dff4a'];
    for (let k = 0; k < 26; k++) {
      const x = rng.range(14, CITY_W - 14), y = rng.range(BEACH_ROW * TILE + 16, CITY_H - 6);
      if (this.blockedAt(x, y)) continue;
      this.beachProps.push({ x, y, kind: 'parasol', color: rng.pick(PARA), seed: rng.int(1, 999999) });
    }
    for (let k = 0; k < 3; k++) {
      const x = 150 + k * 340 + rng.range(-30, 30);
      const y = rng.range(BEACH_ROW * TILE + 30, CITY_H - 20);
      if (this.blockedAt(x, y)) continue;
      this.beachProps.push({ x, y, kind: 'lifeguard', seed: rng.int(1, 999999) });
      this.addSolid(x - 2, y - 2, 4, 4, 'hut');
    }
  }

  placeWaterWaves(rng) {
    for (let k = 0; k < 26; k++) this.waves.push({ phase: rng.range(0, TAU), speed: rng.range(0.5, 1.3) });
  }

  // ------------------------------------------------------------- extras
  buildWeather() {
    const types = WEATHER_TYPES;
    this.weather = this.rng.chance(0.45) ? types[0] : this.rng.pick(types);
  }

  // Curb-side parking on residential/commercial/docks roads + two lots.
  buildParking(rng) {
    for (let j = 1; j < ROWS - 1; j++) {
      for (let i = 0; i < COLS; i++) {
        const b = this.blocks[j][i];
        if (b.type === 'beach' || b.type === 'park' || b.type === 'airfield') continue;
        if (!rng.chance(0.5)) continue;
        // North curb of the road below the block: y = (j+1)*TILE - 7.
        const count = rng.int(1, 3);
        for (let k = 0; k < count; k++) {
          const x = b.x + 10 + k * 7 + rng.range(0, 2);
          if (x > b.x + b.w - 6) break;
          this.parkingSpots.push({ x, y: (j + 1) * TILE - 7, angle: rng.chance(0.8) ? 0 : Math.PI });
        }
      }
    }
    // A proper lot in the docks and one near the airfield.
    const lot = (lx, ly, cols, rows) => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          this.parkingSpots.push({ x: lx + c * 7, y: ly + r * 6, angle: Math.PI / 2 });
        }
      }
    };
    lot(120, 60, 6, 3);
    lot(890, 300, 5, 3);
  }

  buildStreetFurniture(rng) {
    // Hydrants at some block corners (tiny solids).
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const b = this.blocks[j][i];
        if (b.type === 'beach' || b.type === 'park') continue;
        if (rng.chance(0.4)) {
          const hx = b.x - 2.6, hy = b.y + 6 + rng.range(0, b.h - 12);
          this.hydrants.push({ x: hx, y: hy });
          this.addSolid(hx - 0.5, hy - 0.5, 1, 1, 'hydrant');
        }
        if (rng.chance(0.22)) {
          // Bus stop shelter on the east sidewalk.
          const sx = b.x + b.w - SIDEWALK / 2, sy = b.y + rng.range(12, b.h - 16);
          this.busStops.push({ x: sx, y: sy });
          this.addSolid(sx - 1.6, sy - 1.4, 3.2, 2.8, 'shelter');
        }
      }
    }
    // Manholes on roads (pure deco, drawn with the markings).
    for (let k = 0; k < 130; k++) {
      const vertical = rng.chance(0.5);
      const line = rng.int(0, vertical ? COLS : ROWS) * TILE;
      const along = rng.range(10, (vertical ? CITY_H : CITY_W) - 10);
      if (vertical) this.manholes.push({ x: line + rng.range(-5, 5), y: along });
      else this.manholes.push({ x: along, y: line + rng.range(-5, 5) });
    }
  }

  buildHarborDetails(rng) {
    // Yachts moored between the piers.
    const spots = [240, 340, 660, 760, 1000];
    for (let k = 0; k < spots.length; k++) {
      if (rng.chance(0.75)) {
        const x = spots[k], y = -30 - rng.range(0, 10);
        this.yachts.push({ x, y });
        this.addSolid(x - 4, y - 1.5, 8, 3, 'yacht');
      }
    }
    // Dock floodlight masts along the quay and yards.
    for (let x = 60; x < 850; x += 140) {
      this.floodlights.push({ x, y: 2 + rng.range(-2, 2) });
    }
    this.floodlights.push({ x: 200, y: 150 }, { x: 500, y: 120 }, { x: 760, y: 168 });
  }

  buildRunwayLights() {
    for (let x = 874; x <= 1240; x += 12) {
      this.runwayLights.push({ x, y: 120, color: x % 48 < 24 ? '#e8f4ff' : '#ffb02e' });
      this.runwayLights.push({ x, y: 168, color: x % 48 < 24 ? '#e8f4ff' : '#ffb02e' });
    }
    for (let y = 126; y <= 162; y += 9) {
      this.runwayLights.push({ x: 872, y, color: '#7dff8a' });
    }
  }

  buildFerrisWheel() {
    // Landmark: the Palms Wheel on block (8, BEACH_ROW).
    const x = 8 * TILE + 48, y = 9 * TILE + 40;
    this.ferris = { x, y, r: 22 };
    this.addSolid(x - 3, y + 16, 6, 5, 'ferris');
  }

  buildBoardwalk() {
    this.boardwalk = { x0: -9, x1: CITY_W + 9, y: 9 * TILE - 2, h: 8 };
  }

  buildRoofFeatures(rng) {
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const b = this.blocks[j][i];
        for (const bl of b.buildings) {
          if (bl.shack || bl.hangar) continue;
          // Awnings over shopfronts (south face, commercial feel).
          if ((b.type === 'commercial' || b.type === 'residential') && bl.h < 9 && bl.w >= 16) {
            const colors = ['#b0483f', '#2f7a5e', '#3f5ab0', '#b08a2f'];
            const aw = {
              x: bl.x + 2, y: bl.y + bl.h, w: Math.min(bl.w - 4, 18),
              color: rng.pick(colors),
            };
            this.awnings.push(aw);
            bl.awning = aw;
          }
          // Helipads on towers.
          if (bl.ht >= 15 && bl.w >= 22) {
            this.roofPads.push({ x: bl.x + bl.w / 2, y: bl.y + bl.h / 2 });
            bl.helipad = true;
          } else if (bl.ht >= 8 && rng.chance(0.3)) {
            this.roofTanks.push({ x: bl.x + bl.w / 2, y: bl.y + bl.h / 2 });
            bl.tank = true;
          }
        }
      }
    }
  }

  nameLocations() {
    // Street names per grid line (deterministic, seeded).
    this.streetNames = { v: [], h: [] };
    for (let i = 0; i <= COLS; i++) this.streetNames.v[i] = streetName(this.nameRng);
    for (let j = 0; j <= ROWS; j++) this.streetNames.h[j] = streetName(this.nameRng);
    // Ocean Drive & Neon Strip: fixed landmarks on the beach + main drag.
    this.streetNames.h[ROWS] = 'OCEAN DRIVE';
    this.streetNames.v[5] = 'NEON STRIP';
    const L = (n, x, y) => (this.locations[n] = { x, y });
    L('hospital', 5 * TILE + 48, 4 * TILE - 10);
    L('policeSt', 8 * TILE + 48, 4 * TILE - 10);
    L('plaza', 5 * TILE + 48, 5 * TILE + 48);
    L('club', 2 * TILE + 48, 3 * TILE + 48);
    L('hotel', 6 * TILE + 48, 2 * TILE + 48);
    L('market', 9 * TILE + 48, 6 * TILE + 48);
    L('garage', 2 * TILE + 48, 6 * TILE - 10);
    L('docksGate', 4 * TILE, 1 * TILE + 48);
    L('pier1', 192, -34);
    L('pier2', 572, -34);
    L('dockShip', 430, -30);
    L('crane', 768, 60);
    L('hangar', 11 * TILE + 48, 2 * TILE + 62);
    L('runwayW', 10 * TILE + 8, 144);
    L('runwayE', 12 * TILE + 60, 144);
    L('runwayMid', 11 * TILE + 48, 144);
    L('towerLoc', 1005, 60);
    L('beachShack', 3 * TILE + 48, 9 * TILE + 62);
    L('mansion', 7 * TILE + 48, 8 * TILE + 48);
    L('taxiDepot', 1 * TILE + 48, 6 * TILE + 48);
    L('busStop', 5 * TILE - 10, 7 * TILE + 48);
  }

  // ---------------------------------------------------------------- spawning
  // Random lane point on the road grid, a given distance band from (px,py).
  // Strategy: pick a road LINE that passes near the anchor first, then a
  // point along that line inside the distance band — high yield, seeded.
  randomLanePoint(rng, px, py, minD, maxD) {
    for (let t = 0; t < 40; t++) {
      const vertical = rng.chance(0.5);
      const maxLine = vertical ? COLS : ROWS;
      const cands = [];
      for (let i = 0; i <= maxLine; i++) {
        const coord = i * TILE;
        const perp = vertical ? Math.abs(coord - px) : Math.abs(coord - py);
        if (perp <= maxD + 6) cands.push(i);
      }
      if (!cands.length) return null;
      const line = rng.pick(cands);
      const lineCoord = line * TILE;
      const along = vertical ? py : px;
      for (let k = 0; k < 8; k++) {
        let x, y, dir;
        const a = clamp(along + rng.range(-maxD, maxD), -ROAD / 2 + 4, (vertical ? CITY_H : CITY_W) + ROAD / 2 - 4);
        if (vertical) {
          x = lineCoord + (rng.chance(0.5) ? LANE : -LANE);
          y = a;
          dir = x > lineCoord ? 3 : 1;   // right-hand: +lane drives north
        } else {
          y = lineCoord + (rng.chance(0.5) ? LANE : -LANE);
          x = a;
          dir = y > lineCoord ? 0 : 2;   // +lane south of line drives east
        }
        if (vertical && y > CITY_H - 4) continue;              // beach sea edge
        if (y < 6 && rng.chance(0.5)) continue;                // thin harbor road traffic
        const d = Math.hypot(x - px, y - py);
        if (d < minD || d > maxD) continue;
        if (!this.clearAt(x, y, 3)) continue;
        return { x, y, dir };
      }
    }
    return null;
  }

  // Sidewalk point around a random block.
  randomSidewalkPoint(rng, px, py, minD, maxD) {
    for (let t = 0; t < 40; t++) {
      const i = rng.int(0, COLS - 1), j = rng.int(0, ROWS - 1);
      const b = this.blocks[j][i];
      if (b.type === 'beach' || b.type === 'docks' || b.type === 'airfield') continue;
      const side = rng.int(0, 3);
      const t2 = rng.range(4, BLOCK_INNER - 4);
      let x, y;
      if (side === 0) { x = b.x + t2; y = b.y + SIDEWALK / 2; }
      else if (side === 1) { x = b.x + t2; y = b.y + BLOCK_INNER - SIDEWALK / 2; }
      else if (side === 2) { x = b.x + SIDEWALK / 2; y = b.y + t2; }
      else { x = b.x + BLOCK_INNER - SIDEWALK / 2; y = b.y + t2; }
      const d = Math.hypot(x - px, y - py);
      if (d < minD || d > maxD) continue;
      if (this.blockedAt(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  // ------------------------------------------------------------------ lights
  // Which direction has green at intersection (i, j)? Returns 'ns' | 'ew'.
  greenDir(ix, iy, t) {
    const offset = (ix + iy) & 1;
    return Math.floor(t / TRAFFIC.LIGHT_CYCLE + offset) % 2 === 0 ? 'ns' : 'ew';
  }

  // Yellow warning window?
  isYellow(ix, iy, t) {
    const cycle = TRAFFIC.LIGHT_CYCLE;
    const off = ((ix + iy) & 1) * 0; // phases align to grid parity
    const ft = (t + off) % cycle;
    return ft > cycle - TRAFFIC.LIGHT_YELLOW;
  }

  // ---------------------------------------------------------------- minimap
  buildMinimap() {
    const s = this.mmScale;
    const w = Math.ceil((WORLD_X1 - WORLD_X0) * s);
    const h = Math.ceil((WORLD_Y1 - WORLD_Y0) * s);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    const wx = (x) => (x - WORLD_X0) * s;
    const wy = (y) => (y - WORLD_Y0) * s;

    // Base
    c.fillStyle = '#101322';
    c.fillRect(0, 0, w, h);
    // Harbor + sea
    c.fillStyle = '#0c2740';
    c.fillRect(0, 0, w, wy(-ROAD / 2));
    c.fillRect(0, wy(CITY_H + ROAD / 2), w, h);
    // Beach sand
    c.fillStyle = '#6e6042';
    c.fillRect(0, wy(BEACH_ROW * TILE + 9), w, wy(CITY_H) - wy(BEACH_ROW * TILE + 9) + 4);
    // Blocks
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const b = this.blocks[j][i];
        c.fillStyle = YARD[b.type][0];
        c.fillRect(wx(b.x), wy(b.y), b.w * s, b.h * s);
        if (b.pond) {
          c.fillStyle = '#0c2740';
          c.fillRect(wx(b.pond.x), wy(b.pond.y), b.pond.w * s, b.pond.h * s);
        }
        for (const bl of b.buildings) {
          c.fillStyle = '#262a38';
          c.fillRect(wx(bl.x), wy(bl.y), bl.w * s, bl.h * s);
        }
      }
    }
    // Roads
    c.fillStyle = '#3a3f52';
    for (let i = 0; i <= COLS; i++) c.fillRect(wx(i * TILE - ROAD / 2), wy(-ROAD / 2), ROAD * s, (CITY_H + ROAD) * s);
    for (let j = 0; j <= ROWS; j++) c.fillRect(wx(-ROAD / 2), wy(j * TILE - ROAD / 2), (CITY_W + ROAD) * s, ROAD * s);
    // Runway
    c.fillStyle = '#4a4e58';
    c.fillRect(wx(874), wy(122), (1240 - 874) * s, 44 * s);
    // Ship + piers
    c.fillStyle = '#39424e';
    c.fillRect(wx(360), wy(-70), 200 * s, 54 * s);
    this.minimap = cv;
  }

  // ------------------------------------------------------------------ drawing
  // Ground pass: everything flat under entities.
  drawGround(ctx, vx0, vy0, vx1, vy1, t) {
    // Base asphalt over the whole city band.
    ctx.fillStyle = '#20222c';
    ctx.fillRect(vx0, Math.max(vy0, -ROAD / 2), vx1 - vx0, Math.min(vy1, CITY_H + ROAD / 2) - Math.max(vy0, -ROAD / 2));

    // Blocks (yards, sidewalks, markings) within view.
    const i0 = clamp(Math.floor((vx0 - ROAD) / TILE), 0, COLS - 1);
    const i1 = clamp(Math.ceil((vx1 + ROAD) / TILE), 0, COLS - 1);
    const j0 = clamp(Math.floor((vy0 - ROAD) / TILE), 0, ROWS - 1);
    const j1 = clamp(Math.ceil((vy1 + ROAD) / TILE), 0, ROWS - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        this.drawBlockGround(ctx, this.blocks[j][i], t);
      }
    }
    this.drawRoadMarkings(ctx, vx0, vy0, vx1, vy1, t);
    this.drawWater(ctx, vx0, vy0, vx1, vy1, t);
  }

  drawBlockGround(ctx, b, t) {
    const [fill, edge] = YARD[b.type];
    // Sidewalk slab then yard inset.
    ctx.fillStyle = '#33363f';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = fill;
    ctx.fillRect(b.x + SIDEWALK, b.y + SIDEWALK, b.w - SIDEWALK * 2, b.h - SIDEWALK * 2);

    if (b.type === 'beach') {
      // Sand swallows the sidewalk: full sand fill + specks.
      ctx.fillStyle = YARD.beach[0];
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (const d of this.sandDots) {
        if (d.x > b.x && d.x < b.x + b.w && d.y > b.y && d.y < b.y + b.h) {
          ctx.fillRect(d.x, d.y, d.s, d.s * 0.6);
        }
      }
    }

    if (b.type === 'park') {
      // Diagonal paths
      ctx.strokeStyle = '#5a5344';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(b.x + 6, b.y + b.h / 2);
      ctx.lineTo(b.x + b.w - 6, b.y + b.h / 2);
      ctx.moveTo(b.x + b.w / 2, b.y + 6);
      ctx.lineTo(b.x + b.w / 2, b.y + b.h - 6);
      ctx.stroke();
      if (b.pond) {
        ctx.fillStyle = '#0d3352';
        ctx.beginPath();
        ctx.ellipse(b.pond.x + b.pond.w / 2, b.pond.y + b.pond.h / 2, b.pond.w / 2, b.pond.h / 2, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(140,220,255,0.25)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    if (b.type === 'docks') {
      // Painted lot lanes
      ctx.strokeStyle = 'rgba(255,200,80,0.16)';
      ctx.lineWidth = 0.5;
      for (let y = b.y + 14; y < b.y + b.h; y += 18) {
        ctx.beginPath(); ctx.moveTo(b.x + 6, y); ctx.lineTo(b.x + b.w - 6, y); ctx.stroke();
      }
    }

    if (b.type === 'airfield') {
      ctx.fillStyle = '#3c3f47';
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }

    // Props (flat parts: containers drawn as solids at entity height though)
    for (const p of b.props) {
      if (p.kind === 'bench') {
        ctx.fillStyle = '#4a3d2c';
        ctx.fillRect(p.x, p.y, p.w, p.h);
      } else if (p.kind === 'planter') {
        ctx.fillStyle = '#2c4432';
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }
    }
  }

  drawRoadMarkings(ctx, vx0, vy0, vx1, vy1, t) {
    const i0 = clamp(Math.floor(vx0 / TILE) - 1, 0, COLS);
    const i1 = clamp(Math.ceil(vx1 / TILE) + 1, 0, COLS);
    const j0 = clamp(Math.floor(vy0 / TILE) - 1, 0, ROWS);
    const j1 = clamp(Math.ceil(vy1 / TILE) + 1, 0, ROWS);

    ctx.strokeStyle = 'rgba(230,220,140,0.34)';
    ctx.lineWidth = 0.35;
    ctx.setLineDash([2.6, 3.2]);
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      ctx.moveTo(i * TILE, Math.max(vy0, 0));
      ctx.lineTo(i * TILE, Math.min(vy1, CITY_H));
    }
    for (let j = j0; j <= j1; j++) {
      ctx.moveTo(Math.max(vx0, 0), j * TILE);
      ctx.lineTo(Math.min(vx1, CITY_W), j * TILE);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosswalks at downtown-ish intersections
    ctx.fillStyle = 'rgba(220,225,235,0.30)';
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = i * TILE, y = j * TILE;
        if (y > CITY_H - 2 || (x > 860 && y < 390)) continue; // skip sea edge & airfield
        for (let k = -1; k <= 1; k += 2) {
          ctx.fillRect(x - ROAD / 2 + 2, y + k * (ROAD / 2 + 1.2) - 0.8, ROAD - 4, 1.6);
          ctx.fillRect(x + k * (ROAD / 2 + 1.2) - 0.8, y - ROAD / 2 + 2, 1.6, ROAD - 4);
        }
      }
    }

    // Manholes and drains (pure deco).
    ctx.fillStyle = 'rgba(8,10,14,0.5)';
    for (const m of this.manholes) {
      if (m.x < vx0 || m.x > vx1 || m.y < vy0 || m.y > vy1) continue;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.1, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,126,140,0.35)';
      ctx.lineWidth = 0.15;
      ctx.stroke();
    }

    // Runway strip + dashes
    if (vx1 > 860 && vy0 < 180 && vy1 > 110) {
      ctx.fillStyle = '#33363e';
      ctx.fillRect(874, 122, 366, 44);
      ctx.strokeStyle = 'rgba(240,240,240,0.5)';
      ctx.lineWidth = 0.7;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(884, 144);
      ctx.lineTo(1230, 144);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(240,240,240,0.75)';
      ctx.strokeRect(874, 122, 366, 44);
    }

    // Traffic lights (heads only; glow is the light pass's job)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (i === 0 && j === 0) continue;
        const x = i * TILE, y = j * TILE;
        if (y > CITY_H - 2 || (x > 860 && y < 390)) continue;
        const gd = this.greenDir(i, j, t);
        const yellow = this.isYellow(i, j, t);
        this.drawLightHead(ctx, x - ROAD / 2 - 2.4, y - ROAD / 2 - 2.4, gd === 'ns' ? 'g' : yellow ? 'y' : 'r');
        this.drawLightHead(ctx, x + ROAD / 2 + 2.4, y + ROAD / 2 + 2.4, gd === 'ew' ? 'g' : yellow ? 'y' : 'r');
      }
    }
  }

  drawLightHead(ctx, x, y, state) {
    ctx.fillStyle = '#14161c';
    ctx.fillRect(x - 1, y - 1, 2, 2);
    const col = state === 'g' ? '#2ecc71' : state === 'y' ? '#f1c40f' : '#e74c3c';
    ctx.fillStyle = col;
    ctx.fillRect(x - 0.55, y - 0.55, 1.1, 1.1);
  }

  drawWater(ctx, vx0, vy0, vx1, vy1, t) {
    const bands = [];
    if (vy0 < -ROAD / 2) bands.push([vy0, -ROAD / 2]);                 // harbor
    if (vy1 > CITY_H + ROAD / 2) bands.push([CITY_H + ROAD / 2, vy1]); // sea
    for (const [y0, y1] of bands) {
      ctx.fillStyle = '#0a2038';
      ctx.fillRect(vx0, y0, vx1 - vx0, y1 - y0);
      // Wave lines
      ctx.strokeStyle = 'rgba(90,170,220,0.20)';
      ctx.lineWidth = 0.4;
      for (let wi = 0; wi < this.waves.length; wi++) {
        const w = this.waves[wi];
        const wy = y0 + ((wi * 7.3) % (y1 - y0));
        const off = Math.sin(t * w.speed + w.phase) * 6;
        ctx.beginPath();
        ctx.moveTo(Math.max(vx0, -10) + off, wy);
        ctx.lineTo(Math.min(vx1, WORLD_X1) - 10 + off, wy);
        ctx.stroke();
      }
      // Foam edge along the shoreline
      const shoreY = y0 < 0 ? -ROAD / 2 : CITY_H + ROAD / 2;
      ctx.fillStyle = 'rgba(200,235,255,0.22)';
      const foam = 0.6 + Math.sin(t * 1.4) * 0.35;
      ctx.fillRect(Math.max(vx0, -10), y0 < 0 ? shoreY - foam : shoreY, vx1 - vx0, foam + 0.8);
    }
  }

  // Solid props & structures (containers, cranes, ship, hangars, tower...).
  drawStructures(ctx, vx0, vy0, vx1, vy1, t = 0) {
    // Ship in the harbor
    if (vy0 < 30) {
      ctx.save();
      // hull
      ctx.fillStyle = '#2e3846';
      ctx.fillRect(360, -70, 200, 50);
      ctx.fillStyle = '#39434f';
      ctx.fillRect(364, -66, 192, 42);
      // deck house
      ctx.fillStyle = '#4d5866';
      ctx.fillRect(500, -62, 40, 18);
      ctx.fillStyle = '#ffd23c';
      ctx.fillRect(516, -60, 6, 6);
      // containers on deck
      const deckCols = ['#b0483f', '#3f7ab0', '#4f9c58'];
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = deckCols[k % 3];
        ctx.fillRect(374 + (k % 3) * 22, -34 + Math.floor(k / 3) * 8, 19, 6);
      }
      // navigation lights + name
      const blink = Math.sin(t * 2.4) > 0.4 ? 1 : 0.25;
      ctx.fillStyle = `rgba(46,204,113,${blink})`;
      ctx.fillRect(366, -66, 1.6, 1.6);            // starboard
      ctx.fillStyle = `rgba(231,76,60,${blink})`;
      ctx.fillRect(552, -66, 1.6, 1.6);            // port
      ctx.fillStyle = 'rgba(255,220,150,0.85)';
      ctx.fillRect(506, -60, 2, 2);
      ctx.fillRect(512, -60, 2, 2);
      ctx.fillRect(530, -60, 2, 2);
      ctx.fillStyle = 'rgba(220,230,240,0.75)';
      ctx.font = '700 8px "Consolas", monospace';
      ctx.fillText('M/V VICE PALMS', 396, -52);
      ctx.restore();
    }
    // Docks & airfield solid props from blocks in view
    const i0 = clamp(Math.floor((vx0 - ROAD) / TILE), 0, COLS - 1);
    const i1 = clamp(Math.ceil((vx1 + ROAD) / TILE), 0, COLS - 1);
    const j0 = clamp(Math.floor((vy0 - ROAD) / TILE), 0, ROWS - 1);
    const j1 = clamp(Math.ceil((vy1 + ROAD) / TILE), 0, ROWS - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const b = this.blocks[j][i];
        for (const p of b.props) {
          if (p.kind === 'container') {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            for (let rx = p.x + 1; rx < p.x + p.w - 0.6; rx += 1.4) ctx.fillRect(rx, p.y + 0.3, 0.35, p.h - 0.6);
            ctx.strokeStyle = 'rgba(255,255,255,0.14)';
            ctx.strokeRect(p.x, p.y, p.w, p.h);
          } else if (p.kind === 'crane') {
            ctx.fillStyle = '#c8862a';
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.strokeStyle = '#e8b04a';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(p.x + 2, p.y + 2); ctx.lineTo(p.x + 2, p.y - 26);
            ctx.lineTo(p.x + 30, p.y - 26); ctx.lineTo(p.x + 26, p.y + 2);
            ctx.stroke();
          } else if (p.kind === 'fuel') {
            ctx.fillStyle = '#8a2f2f';
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = '#d5d9df';
            ctx.font = '700 4px monospace';
            ctx.fillText('FUEL', p.x + 0.6, p.y + 3.2);
          } else if (p.kind === 'tower') {
            ctx.fillStyle = '#4a4f5c';
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = '#2a2e3a';
            ctx.fillRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
            ctx.fillStyle = '#7ee6ff';
            ctx.fillRect(p.x + 1.4, p.y + 1.4, p.w - 2.8, 2.2);
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(p.x + p.w / 2, p.y + p.h / 2); ctx.lineTo(p.x + p.w / 2, p.y - 10);
            ctx.stroke();
          } else if (p.kind === 'plane') {
            ctx.fillStyle = '#9aa2ae';
            ctx.fillRect(p.x, p.y + 3, p.w, 3);            // fuselage
            ctx.fillRect(p.x + p.w * 0.42, p.y, 3.2, 9);   // wing
            ctx.fillStyle = '#c9cfd8';
            ctx.fillRect(p.x + p.w - 6, p.y + 1.4, 5, 6.2); // tail
            ctx.fillStyle = '#2a2e3a';
            ctx.fillRect(p.x + 1, p.y + 4.2, 2.4, 0.8);    // cockpit
          } else if (p.kind === 'dumpster') {
            ctx.fillStyle = '#3d5c46';
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(p.x, p.y, p.w, 0.6);
          }
        }
        for (const tr of b.trees) this.drawTree(ctx, tr);
      }
    }
    // Palms (from the global list, view-culled)
    for (const p of this.palms) {
      if (p.x < vx0 - 8 || p.x > vx1 + 8 || p.y < vy0 - 8 || p.y > vy1 + 8) continue;
      this.drawPalm(ctx, p);
    }
    // Streetlight poles
    for (const s of this.streetlights) {
      if (s.x < vx0 - 4 || s.x > vx1 + 4 || s.y < vy0 - 4 || s.y > vy1 + 4) continue;
      ctx.fillStyle = '#3a3f4a';
      ctx.beginPath(); ctx.arc(s.x, s.y, 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8e2c8';
      ctx.beginPath(); ctx.arc(s.x, s.y, 0.3, 0, TAU); ctx.fill();
    }
    // Boardwalk planks along the beach top edge.
    if (this.boardwalk && vy1 > this.boardwalk.y - 6 && vy0 < this.boardwalk.y + this.boardwalk.h + 6) {
      const bw = this.boardwalk;
      ctx.fillStyle = '#6b5232';
      ctx.fillRect(bw.x0, bw.y, bw.x1 - bw.x0, bw.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 0.22;
      ctx.beginPath();
      for (let x = bw.x0; x < bw.x1; x += 3.2) {
        ctx.moveTo(x, bw.y);
        ctx.lineTo(x, bw.y + bw.h);
      }
      ctx.stroke();
      // Rail toward the sand.
      ctx.strokeStyle = '#8a6a40';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(bw.x0, bw.y + bw.h);
      ctx.lineTo(bw.x1, bw.y + bw.h);
      ctx.stroke();
    }

    // Yachts in the harbor.
    for (const y of this.yachts) {
      if (y.x < vx0 - 20 || y.x > vx1 + 20 || y.y < vy0 - 20 || y.y > vy1 + 20) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(y.x + 0.6, y.y + 1.6, 4.6, 2.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8ecf2';
      ctx.beginPath();
      ctx.moveTo(y.x - 4.4, y.y);
      ctx.quadraticCurveTo(y.x, y.y - 2.6, y.x + 4.4, y.y);
      ctx.quadraticCurveTo(y.x, y.y + 2.2, y.x - 4.4, y.y);
      ctx.fill();
      ctx.fillStyle = '#39506e';
      ctx.fillRect(y.x - 1, y.y - 1.6, 2, 1.6);
      ctx.fillStyle = 'rgba(255,220,140,0.8)';
      ctx.fillRect(y.x + 1.2, y.y - 1.2, 1.4, 0.9);
    }

    // Ferris wheel — the Palms Wheel.
    if (this.ferris && this.ferris.x > vx0 - 40 && this.ferris.x < vx1 + 40 && this.ferris.y > vy0 - 40 && this.ferris.y < vy1 + 40) {
      const f = this.ferris;
      const rot = t * 0.22;
      // Supports
      ctx.strokeStyle = '#4a4f5c';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(f.x - 8, f.y + 18); ctx.lineTo(f.x, f.y);
      ctx.moveTo(f.x + 8, f.y + 18); ctx.lineTo(f.x, f.y);
      ctx.stroke();
      // Rim + spokes
      ctx.strokeStyle = '#ff3ca0';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.stroke();
      for (let k = 0; k < 8; k++) {
        const a = rot + (k / 8) * TAU;
        const cx = f.x + Math.cos(a) * f.r, cy = f.y + Math.sin(a) * f.r;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        // Cabin
        ctx.fillStyle = ['#ff3ca0', '#25e8ff', '#8dff4a', '#ffb02e'][k % 4];
        ctx.fillRect(cx - 1.2, cy - 0.6, 2.4, 2);
      }
      // Hub
      ctx.fillStyle = '#e8ecf2';
      ctx.beginPath(); ctx.arc(f.x, f.y, 1.6, 0, TAU); ctx.fill();
    }

    // Beach parasols & lifeguard towers.
    if (this.beachProps && vy1 > 860) {
      for (const bp of this.beachProps) {
        if (bp.x < vx0 - 8 || bp.x > vx1 + 8 || bp.y < vy0 - 8 || bp.y > vy1 + 8) continue;
        if (bp.kind === 'parasol') {
          const sway = Math.sin((bp.seed % 53) + (this._gt || 0) * 0.7) * 0.3;
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.beginPath(); ctx.ellipse(bp.x + 1, bp.y + 0.8, 2.2, 1.2, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#8a6a40';
          ctx.lineWidth = 0.3;
          ctx.beginPath(); ctx.moveTo(bp.x, bp.y); ctx.lineTo(bp.x + sway, bp.y - 2.6); ctx.stroke();
          ctx.fillStyle = bp.color;
          ctx.beginPath(); ctx.arc(bp.x + sway, bp.y - 2.6, 2.1, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.beginPath(); ctx.arc(bp.x + sway - 0.5, bp.y - 3, 0.8, 0, TAU); ctx.fill();
        } else {
          // Lifeguard tower on stilts
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(bp.x - 2.4, bp.y + 1.4, 5, 1.6);
          ctx.strokeStyle = '#7a5a3a';
          ctx.lineWidth = 0.4;
          ctx.beginPath();
          ctx.moveTo(bp.x - 1.6, bp.y + 1.4); ctx.lineTo(bp.x - 1, bp.y - 2.2);
          ctx.moveTo(bp.x + 1.6, bp.y + 1.4); ctx.lineTo(bp.x + 1, bp.y - 2.2);
          ctx.stroke();
          ctx.fillStyle = '#d8604a';
          ctx.fillRect(bp.x - 2.2, bp.y - 3.6, 4.4, 2.6);
          ctx.fillStyle = '#f2efe8';
          ctx.fillRect(bp.x - 2.2, bp.y - 3.6, 4.4, 0.7);
        }
      }
    }

    // Hydrants + bus stops.
    for (const h of this.hydrants) {
      if (h.x < vx0 - 4 || h.x > vx1 + 4 || h.y < vy0 - 4 || h.y > vy1 + 4) continue;
      ctx.fillStyle = '#b03a2e';
      ctx.beginPath(); ctx.arc(h.x, h.y, 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e85a4e';
      ctx.beginPath(); ctx.arc(h.x, h.y, 0.3, 0, TAU); ctx.fill();
    }
    for (const bs of this.busStops) {
      if (bs.x < vx0 - 8 || bs.x > vx1 + 8 || bs.y < vy0 - 8 || bs.y > vy1 + 8) continue;
      ctx.fillStyle = 'rgba(80,90,110,0.9)';
      ctx.fillRect(bs.x - 1.6, bs.y - 1.4, 3.2, 0.4);      // roof
      ctx.fillStyle = '#3f4654';
      ctx.fillRect(bs.x - 1.5, bs.y - 1, 0.3, 2.4);        // post
      ctx.fillRect(bs.x + 1.2, bs.y - 1, 0.3, 2.4);
      ctx.fillStyle = '#ffd23c';
      ctx.fillRect(bs.x - 0.9, bs.y - 1.1, 1.8, 0.5);      // sign
    }

    // Airfield fence (painted, non-solid)
    if (vx1 > 900 && vy0 < 380) {
      ctx.strokeStyle = 'rgba(190,196,210,0.4)';
      ctx.lineWidth = 0.45;
      ctx.setLineDash([2.4, 2]);
      ctx.strokeRect(930, 30, 310, 330);
      ctx.setLineDash([]);
    }
  }

  drawTree(ctx, tr) {
    if (tr.palm) this.drawPalm(ctx, { x: tr.x, y: tr.y, s: tr.s, seed: tr.seed });
    else {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(tr.x + 0.8, tr.y + 0.9, 1.7 * tr.s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1e4a2a';
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 1.7 * tr.s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2c6438';
      ctx.beginPath(); ctx.arc(tr.x - 0.3, tr.y - 0.4, 1.15 * tr.s, 0, TAU); ctx.fill();
    }
  }

  drawPalm(ctx, p) {
    const sway = Math.sin((p.seed % 97) + this.gameTimeSafe() * 0.9) * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(p.x + 1.2, p.y + 1, 2.4 * p.s, 1.5 * p.s, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6b4d2e';
    ctx.lineWidth = 0.65 * p.s;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(p.x + sway * 0.6, p.y - 1.6 * p.s, p.x + sway, p.y - 3.1 * p.s);
    ctx.stroke();
    const tx = p.x + sway, ty = p.y - 3.1 * p.s;
    ctx.strokeStyle = '#2f7a3e';
    ctx.lineWidth = 0.5 * p.s;
    for (let f = 0; f < 6; f++) {
      const a = (f / 6) * TAU + (p.seed % 7) * 0.3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a) * 1.6 * p.s, ty + Math.sin(a) * 1.6 * p.s - 0.5,
        tx + Math.cos(a) * 2.7 * p.s, ty + Math.sin(a) * 2.2 * p.s + 0.5);
      ctx.stroke();
    }
  }

  gameTimeSafe() {
    // Cheap static sway time; render passes the real t via game when present.
    return (typeof this._gt === 'number') ? this._gt : 0;
  }

  // A single building with pseudo-3D parallax extrusion.
  drawBuilding(ctx, bl, cam, t) {
    const cx = bl.x + bl.w / 2, cy = bl.y + bl.h / 2;
    const k = 0.0011 * bl.ht * cam.z * 7.2 / 7.2; // parallax per unit height
    const ox = (cx - cam.x) * bl.ht * 0.0016 * (cam.z * 7.2) / 7.2;
    const oy = (cy - cam.y) * bl.ht * 0.0016 * (cam.z * 7.2) / 7.2;
    const roofX = bl.x + ox, roofY = bl.y + oy;

    // Visible wall faces: toward the offset direction.
    ctx.fillStyle = bl.wall;
    if (oy > 0.05) {
      // south face visible
      ctx.fillRect(bl.x, bl.y + bl.h, bl.w, oy);
      this.drawWindows(ctx, bl.x, bl.y + bl.h, bl.w, oy, bl, true, t);
    } else if (oy < -0.05) {
      ctx.fillRect(bl.x + ox, bl.y + oy, bl.w, -oy);
      this.drawWindows(ctx, bl.x + ox, bl.y + oy, bl.w, -oy, bl, true, t);
    }
    if (ox > 0.05) {
      ctx.fillRect(bl.x + bl.w, bl.y + Math.max(0, oy), ox, bl.h - Math.abs(oy));
      this.drawWindows(ctx, bl.x + bl.w, bl.y + Math.max(0, oy), ox, bl.h - Math.abs(oy), bl, false, t);
    } else if (ox < -0.05) {
      ctx.fillRect(bl.x + ox, bl.y + Math.max(0, -oy), -ox, bl.h - Math.abs(oy));
      this.drawWindows(ctx, bl.x + ox, bl.y + Math.max(0, -oy), -ox, bl.h - Math.abs(oy), bl, false, t);
    }

    // Roof slab
    ctx.fillStyle = bl.roof;
    ctx.fillRect(roofX, roofY, bl.w, bl.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.3;
    ctx.strokeRect(roofX, roofY, bl.w, bl.h);

    // Roof clutter for taller buildings
    if (bl.ht > 8 && !bl.shack) {
      const s = bl.wseed;
      const acX = roofX + 4 + (s % Math.max(1, bl.w - 10));
      const acY = roofY + 4 + ((s >> 3) % Math.max(1, bl.h - 10));
      ctx.fillStyle = '#23252e';
      ctx.fillRect(acX, acY, 3, 2.4);
      ctx.fillStyle = '#31343f';
      ctx.fillRect(acX + 0.3, acY + 0.3, 2.4, 1.8);
      if (bl.ht > 13) {
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(roofX + bl.w * 0.82, roofY + bl.h * 0.2, 0.5 + Math.sin(t * 3) * 0.15, 0, TAU);
        ctx.fill();
      }
    }
    // Helipad on towers
    if (bl.helipad) {
      const hx = roofX + bl.w / 2, hy = roofY + bl.h / 2;
      ctx.strokeStyle = 'rgba(240,244,248,0.75)';
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(240,244,248,0.75)';
      ctx.font = '700 6px "Consolas", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('H', hx, hy + 2.2);
      ctx.textAlign = 'left';
    }
    // Water tank
    if (bl.tank) {
      const tx = roofX + bl.w / 2, ty = roofY + bl.h / 2;
      ctx.fillStyle = '#2c3340';
      ctx.beginPath(); ctx.arc(tx, ty, 2.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4c5666';
      ctx.beginPath(); ctx.arc(tx - 0.3, ty - 0.4, 1.7, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.2;
      ctx.beginPath(); ctx.arc(tx, ty, 2.3, 0, TAU); ctx.stroke();
    }
    if (bl.hangar) {
      // Arched roof stripes
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.8;
      for (let yy = roofY + 3; yy < roofY + bl.h - 2; yy += 3.4) {
        ctx.beginPath();
        ctx.moveTo(roofX + 1.4, yy);
        ctx.lineTo(roofX + bl.w - 1.4, yy);
        ctx.stroke();
      }
      ctx.fillStyle = '#565b66';
      ctx.fillRect(roofX + bl.w * 0.3, roofY + bl.h - 0.4, bl.w * 0.4, 1.6);
    }
  }

  drawWindows(ctx, x, y, w, h, bl, horizontal, t) {
    if (!bl.lit || w < 4 || h < 1.2) return;
    const rng = (n) => {
      const s = Math.sin(n * 127.1 + bl.wseed * 0.001) * 43758.5453;
      return s - Math.floor(s);
    };
    let rows, cols, rw, rh;
    if (horizontal) { rows = Math.max(1, Math.floor(h / 2.4)); cols = Math.max(1, Math.floor(w / 3.2)); rw = 1.6; rh = 1.1; }
    else { rows = Math.max(1, Math.floor(h / 3.2)); cols = Math.max(1, Math.floor(w / 2.4)); rw = 1.1; rh = 1.6; }
    const gx = horizontal ? 3.2 : 2.4;
    const gy = horizontal ? 2.4 : 3.2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng(r * 61 + c * 7 + 3) < 0.34;
        if (!lit) continue;
        const wx = x + 0.8 + c * gx + (horizontal ? 0 : (w - cols * gx) / 2);
        const wy = y + 0.5 + r * gy + (horizontal ? (h - rows * gy) / 2 : 0);
        const warm = rng(r * 13 + c * 29 + 7) < 0.7;
        ctx.fillStyle = warm ? 'rgba(255,190,110,0.75)' : 'rgba(120,220,255,0.6)';
        ctx.fillRect(wx, wy, rw, rh);
      }
    }
  }

    // Neon sign faces (bright boxes + text); glow comes from the light pass.
  drawNeon(ctx, t) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const storm = this.weather && this.weather.id === 'storm';
    for (const n of this.neon) {
      if (n._vx === undefined) { n._vx = n.x; n._vy = n.y; }
      if (n._vx > vx1hack + 40 || n._vx < vx0hack - 40) continue;
      let on = 1;
      if (n.flicker) on = (Math.sin(t * n.flicker + n.phase) > -0.82) ? 1 : 0.25;
      if (storm && Math.sin(t * 31 + n.phase * 7) < -0.985) on *= 0.3; // storm flicker
      const a = on;
      // Mounting frame
      ctx.globalAlpha = 0.5 * a;
      ctx.fillStyle = '#0e1018';
      ctx.fillRect(n._vx - 0.7, n._vy - 0.7, n.w + 1.4, n.h + 1.4);
      ctx.globalAlpha = 0.28 * a;
      ctx.fillStyle = n.color;
      ctx.fillRect(n._vx - 0.4, n._vy - 0.4, n.w + 0.8, n.h + 0.8);
      ctx.globalAlpha = 0.95 * a;
      ctx.fillRect(n._vx, n._vy, n.w, n.h);
      ctx.fillStyle = '#0c0d14';
      ctx.font = '700 2.2px "Consolas", monospace';
      ctx.fillText(n.word, n._vx + n.w / 2, n._vy + n.h / 2 + 0.15);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

// Cull window shared by drawNeon (set each frame by the renderer).
let vx0hack = 0, vx1hack = 0, vy0hack = 0, vy1hack = 0;
export function setNeonCull(vx0, vy0, vx1, vy1) {
  vx0hack = vx0; vy0hack = vy0; vx1hack = vx1; vy1hack = vy1;
}
