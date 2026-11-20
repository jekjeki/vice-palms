// City generation for Vice Palms: a 40x40 coastal grid. Each grid line is a two-lane road;
// each land block holds buildings (with rooftops, AC units and neon signs), a park or a
// parking lot, and the east edge is the beach strip with palms and neon hotels. Everything
// is generated from one seed so ?shot= replays the same city.

import { BLOCKS, PITCH, ROAD_W, SIDEWALK, BEACH_W, NIGHT } from '../config.js';
import { createRandom, derive } from '../random.js';
import { clamp, circlePush } from '../util.js';

const WALL_COLORS = ['#4d3f63', '#3f4d6e', '#6e3f5c', '#3f6e64', '#6e5c3f', '#54486e', '#2f4a55', '#5c4a4a'];
const ROOF_COLORS = ['#35304a', '#2e3a50', '#503042', '#2e504a', '#50452e', '#413a50', '#243c46', '#463a3a'];
const NEON = [
  { color: NIGHT.neonPink, text: 'CLUB RIVIERA' },
  { color: NIGHT.neonCyan, text: 'PALMS HOTEL' },
  { color: NIGHT.neonAmber, text: 'EL FARO' },
  { color: NIGHT.neonLime, text: '24H DINER' },
  { color: NIGHT.neonViolet, text: 'CASA ROSA' },
  { color: NIGHT.neonCyan, text: 'LA MAREA' },
  { color: NIGHT.neonPink, text: 'SUN NAILS' },
  { color: NIGHT.neonAmber, text: 'PAWN & GOLD' },
  { color: NIGHT.neonViolet, text: 'NEON PDQ' },
  { color: NIGHT.neonLime, text: 'TATU STUDIO' },
];

export const CELL_BEACH = BLOCKS; // block column index holding the sand strip

/** Centre of the land part of block (i, j) — the shared anchor for spawns and markers. */
export function blockCenter(i, j) {
  return { x: (i + 0.5) * PITCH, y: (j + 0.5) * PITCH };
}

/** Land rect of block (i, j): the area between two roads minus nothing; sidewalks live inside. */
export function blockRect(i, j) {
  return { x: i * PITCH + ROAD_W / 2, y: j * PITCH + ROAD_W / 2, w: PITCH - ROAD_W, h: PITCH - ROAD_W };
}

/** Phase of the traffic light at intersection (ix, iy): 0 = north-south green, 1 = east-west. */
export function lightPhase(ix, iy, t) {
  return (ix + iy + Math.floor(t / 9)) % 2;
}

export function generateCity(seed) {
  const rand = createRandom(derive(seed, 0x51f3));
  const blocks = new Array(BLOCKS * BLOCKS);
  const parked = [];

  // One block in nine becomes a park or a parking lot; the east column is the neon strip.
  const specials = new Map();
  for (let n = 0; n < 7; n++) {
    specials.set((rand() * BLOCKS | 0) * BLOCKS + (rand() * (BLOCKS - 2) | 0), 'park');
  }
  for (let n = 0; n < 9; n++) {
    specials.set((rand() * (BLOCKS - 2) | 0) * BLOCKS + (rand() * (BLOCKS - 2) | 0), 'lot');
  }
  const plazaBlock = 20 * BLOCKS + 19;
  specials.set(plazaBlock, 'plaza'); // landmark: the marina-facing plaza where missions meet

  for (let j = 0; j < BLOCKS; j++) {
    for (let i = 0; i < BLOCKS; i++) {
      const idx = i * BLOCKS + j;
      const strip = i === BLOCKS - 1;
      const type = specials.get(idx) ?? 'city';
      const block = { type, i, j, buildings: [], palms: [], stalls: [], signs: [], lights: [] };
      blocks[idx] = block;
      const rect = blockRect(i, j);
      const ix = rect.x + SIDEWALK, iy = rect.y + SIDEWALK;
      const iw = rect.w - SIDEWALK * 2, ih = rect.h - SIDEWALK * 2;

      if (type === 'park') {
        for (let p = 0; p < 7; p++) block.palms.push({ x: ix + 30 + rand() * (iw - 60), y: iy + 30 + rand() * (ih - 60), s: 0.8 + rand() * 0.6 });
        continue;
      }
      if (type === 'plaza') {
        block.palms.push({ x: ix + iw / 2, y: iy + ih / 2, s: 1.4 });
        continue;
      }
      if (type === 'lot') {
        // Painted stalls in two rows; a few parked cars the player can steal.
        const stallW = 46, rows = 2;
        const count = Math.floor(iw / stallW);
        for (let row = 0; row < rows; row++) {
          const y = iy + (row === 0 ? 26 : ih - 26);
          for (let s = 0; s < count; s++) {
            block.stalls.push({ x: ix + s * stallW + stallW / 2, y, row });
            if (rand() < 0.3) {
              parked.push({ x: ix + s * stallW + stallW / 2, y, ang: row === 0 ? Math.PI / 2 : -Math.PI / 2, v: rand() * 8 | 0 });
            }
          }
        }
        continue;
      }

      // Buildings: split the land into 1-2 columns and 1-2 rows with alleys between.
      const cols = strip ? 1 : rand() < 0.55 ? 2 : 1;
      const rows = rand() < 0.55 ? 2 : 1;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (!strip && cols * rows > 1 && rand() < 0.12) continue; // gaps read as alleys
          const gw = iw / cols, gh = ih / rows;
          const pad = 10;
          const bx = ix + c * gw + pad, by = iy + r * gh + pad;
          const bw = gw - pad * 2, bh = gh - pad * 2;
          const floors = strip ? 4 + (rand() * 6 | 0) : 1 + (rand() * 5 | 0);
          const pal = rand() * WALL_COLORS.length | 0;
          const b = {
            x: bx, y: by, w: bw, h: bh,
            wall: WALL_COLORS[pal], roof: ROOF_COLORS[pal],
            floors, lit: 0.35 + rand() * 0.55,
            ac: [], vents: [],
          };
          const acCount = 1 + (rand() * 3 | 0);
          for (let a = 0; a < acCount; a++) {
            b.ac.push({ x: bx + 14 + rand() * (bw - 28), y: by + 14 + rand() * (bh - 28), s: 10 + rand() * 8 });
          }
          if (rand() < 0.5) b.vents.push({ x: bx + bw * 0.5 + (rand() - 0.5) * bw * 0.4, y: by + bh * 0.5 + (rand() - 0.5) * bh * 0.4 });
          block.buildings.push(b);

          // Neon signs: on the strip nearly every building glows; downtown about one in four.
          const signChance = strip ? 0.85 : 0.24;
          if (floors >= 2 && rand() < signChance) {
            const def = NEON[rand() * NEON.length | 0];
            // Face the nearest road: strip hotels face west (the street), others face south or west.
            const west = strip || rand() < 0.5;
            const south = !west;
            const sw = west ? 12 : Math.min(bw * 0.7, 90);
            const sh = west ? Math.min(bh * 0.55, 70) : 12;
            const sx = west ? bx - 3 : bx + (bw - sw) / 2;
            const sy = south ? by + bh - 3 : by + (bh - sh) / 2;
            block.signs.push({ x: sx, y: sy, w: sw, h: sh, color: def.color, text: def.text, vertical: west && strip, flicker: rand() < 0.25, seed: rand() * 6.28 });
          }
          // Strip hotels also hang a big marquee sign facing the beach road (south wall).
          if (strip && rand() < 0.7) {
            const def = NEON[rand() * NEON.length | 0];
            const sw = Math.min(bw * 0.8, 110);
            block.signs.push({ x: bx + (bw - sw) / 2, y: by + bh - 3, w: sw, h: 13, color: def.color, text: def.text, vertical: false, flicker: rand() < 0.25, seed: rand() * 6.28 });
          }
        }
      }
      if (strip) for (let p = 0; p < 2; p++) block.palms.push({ x: rect.x - ROAD_W / 2 - 18, y: rect.y + (p + 0.5) * rect.h / 2, s: 1.1 + rand() * 0.4 });
    }
  }

  // Beach palms along the whole sand strip, evenly staggered in two rows.
  const beachPalms = [];
  for (let y = 40, row = 0; y < BLOCKS * PITCH - 40; y += 56, row++) {
    beachPalms.push({ x: BLOCKS * PITCH + BEACH_W * (0.28 + 0.3 * (row % 2 ? 0.5 : 0)), y, s: 0.9 + ((row * 2654435761) % 100) / 250 });
  }

  return { seed, blocks, parked, beachPalms };
}

/** Buildings and other solid rects near a point, for circle-vs-city collision. */
export function solidsNear(city, x, y, out) {
  out.length = 0;
  const bi = clamp(Math.floor((x - ROAD_W / 2) / PITCH), 0, BLOCKS - 1);
  const bj = clamp(Math.floor((y - ROAD_W / 2) / PITCH), 0, BLOCKS - 1);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = bi + di, j = bj + dj;
    if (i < 0 || j < 0 || i >= BLOCKS || j >= BLOCKS) continue;
    const block = city.blocks[i * BLOCKS + j];
    for (let k = 0; k < block.buildings.length; k++) out.push(block.buildings[k]);
  }
  return out;
}

/** Resolve a moving circle against nearby building rects and the world bounds. */
export function collideCircle(city, x, y, r) {
  const scratch = [];
  let hit = false;
  const solids = solidsNear(city, x, y, scratch);
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    const push = circleVsRect(x, y, r, s.x, s.y, s.w, s.h);
    if (push) { x += push.x; y += push.y; hit = true; }
  }
  // World bounds: keep inside the playable square (the beach water edge stops traffic).
  const maxX = BLOCKS * PITCH + (r > 0 ? BEACH_W - r : 0);
  if (x < r) { x = r; hit = true; }
  if (y < r) { y = r; hit = true; }
  if (y > BLOCKS * PITCH - r) { y = BLOCKS * PITCH - r; hit = true; }
  if (x > maxX) { x = maxX; hit = true; }
  return { x, y, hit };
}

function circleVsRect(cx, cy, r, rx, ry, rw, rh) { return circlePush(cx, cy, r, rx, ry, rw, rh); }
