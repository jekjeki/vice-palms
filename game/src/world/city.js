// City generation: a GRID x GRID coastal street grid where every grid line is a two-way road.
// Land blocks hold pseudo-3D buildings (roofs, AC units, window grids), pocket parks, surface
// lots and one landmark plaza; the east column is the neon hotel strip, and beyond it the sand
// and the sea. Everything derives from the seed, so a given seed rebuilds an identical city.

import { GRID, PITCH, ROAD, WALK, SAND, NEON } from '../config.js';
import { mulberry, remix } from '../rng.js';
import { clamp, circlePush } from '../util.js';

const WALLS = ['#4b3f61', '#3f4a6b', '#6b3f58', '#3f6a62', '#6a5c3f', '#514466', '#2f4a54', '#5a4848', '#46516b'];
const ROOFS = ['#332e48', '#2c3850', '#4e2e40', '#2c4e48', '#4e432c', '#3f2e4e', '#223a44', '#442e2e', '#3a4258'];
const STRIP_COL = GRID - 1;   // the beachfront column

/** Centre of block (i, j) — the shared anchor for spawns, markers and the HUD. */
export function blockCenter(i, j) {
  return { x: (i + 0.5) * PITCH, y: (j + 0.5) * PITCH };
}

/** Land rect of block (i, j): between the two roads, sidewalks painted inside. */
export function blockRect(i, j) {
  return { x: i * PITCH + ROAD / 2, y: j * PITCH + ROAD / 2, w: PITCH - ROAD, h: PITCH - ROAD };
}

export function generateCity(seed) {
  const gen = mulberry(remix(seed, 0x51f3));
  const blocks = new Array(GRID * GRID);
  const lotCars = [];

  // One block in ~6 becomes a park or a lot; one landmark plaza hosts the mission buyers.
  const kinds = new Map();
  for (let n = 0; n < 6; n++) kinds.set((gen() * GRID | 0) * GRID + (gen() * (GRID - 2) | 0), 'park');
  for (let n = 0; n < 8; n++) kinds.set((gen() * (GRID - 2) | 0) * GRID + (gen() * (GRID - 2) | 0), 'lot');
  kinds.set(19 * GRID + 20, 'plaza');

  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const block = { i, j, kind: kinds.get(i * GRID + j) ?? 'city', buildings: [], palms: [], signs: [], stalls: [], lamps: [] };
      blocks[i * GRID + j] = block;
      const r = blockRect(i, j);
      const ix = r.x + WALK, iy = r.y + WALK;
      const iw = r.w - WALK * 2, ih = r.h - WALK * 2;
      const strip = i === STRIP_COL;

      // Corner street lamps sit just outside each block on the sidewalk.
      block.lamps.push({ x: r.x - 4, y: r.y - 4 }, { x: r.x + r.w + 4, y: r.y + r.h + 4 });

      if (block.kind === 'park') {
        const n = 6 + (gen() * 3 | 0);
        for (let p = 0; p < n; p++) block.palms.push({ x: ix + 26 + gen() * (iw - 52), y: iy + 26 + gen() * (ih - 52), s: 0.8 + gen() * 0.55 });
        continue;
      }
      if (block.kind === 'plaza') {
        block.palms.push({ x: ix + iw / 2, y: iy + ih / 2, s: 1.45 });
        block.palms.push({ x: ix + iw * 0.22, y: iy + ih * 0.78, s: 0.95 });
        block.palms.push({ x: ix + iw * 0.78, y: iy + ih * 0.22, s: 0.95 });
        continue;
      }
      if (block.kind === 'lot') {
        const stallW = 46;
        const rows = 2;
        const per = Math.floor(iw / stallW);
        for (let row = 0; row < rows; row++) {
          const y = iy + (row === 0 ? 26 : ih - 26);
          for (let s = 0; s < per; s++) {
            block.stalls.push({ x: ix + s * stallW + stallW / 2, y, row });
            if (gen() < 0.3) lotCars.push({ x: ix + s * stallW + stallW / 2, y, ang: row === 0 ? Math.PI / 2 : -Math.PI / 2, def: gen() * 10 | 0 });
          }
        }
        continue;
      }

      // Buildings: 1-2 columns x 1-2 rows with alley gaps between them.
      const cols = strip ? 1 : gen() < 0.55 ? 2 : 1;
      const rowsN = gen() < 0.55 ? 2 : 1;
      for (let c = 0; c < cols; c++) {
        for (let rN = 0; rN < rowsN; rN++) {
          if (!strip && cols * rowsN > 1 && gen() < 0.12) continue;
          const gw = iw / cols, gh = ih / rowsN;
          const pad = 10;
          const bx = ix + c * gw + pad, by = iy + rN * gh + pad;
          const bw = gw - pad * 2, bh = gh - pad * 2;
          const pal = gen() * WALLS.length | 0;
          const b = {
            x: bx, y: by, w: bw, h: bh,
            wall: WALLS[pal], roof: ROOFS[pal],
            floors: strip ? 4 + (gen() * 6 | 0) : 1 + (gen() * 5 | 0),
            lit: 0.32 + gen() * 0.58,
            acs: [], stacks: [],
          };
          const nAc = 1 + (gen() * 3 | 0);
          for (let a = 0; a < nAc; a++) {
            b.acs.push({ x: bx + 12 + gen() * (bw - 24), y: by + 12 + gen() * (bh - 24), s: 9 + gen() * 9 });
          }
          if (gen() < 0.45) b.stacks.push({ x: bx + bw * (0.3 + gen() * 0.4), y: by + bh * (0.3 + gen() * 0.4), r: 4 + gen() * 3 });
          block.buildings.push(b);

          // Neon: blade signs hang off the street wall, marquees stretch along the beach
          // wall of every strip hotel, rooftop billboards crown the tallest ones.
          const flick = gen() < 0.25;
          if (b.floors >= 2 && gen() < (strip ? 0.85 : 0.26)) {
            const [color, text] = NEON[gen() * NEON.length | 0];
            if (strip) {
              const sh = Math.min(bh * 0.55, 64);
              block.signs.push({ style: 'blade', x: bx - 3, y: by + (bh - sh) / 2, w: 12, h: sh, color, text, flicker: flick, seed: gen() * 6.28, vertical: true });
            } else if (gen() < 0.5) {
              const sh = Math.min(bh * 0.55, 64);
              block.signs.push({ style: 'blade', x: bx - 3, y: by + (bh - sh) / 2, w: 12, h: sh, color, text, flicker: flick, seed: gen() * 6.28, vertical: true });
            } else {
              const sw = Math.min(bw * 0.7, 88);
              block.signs.push({ style: 'bar', x: bx + (bw - sw) / 2, y: by + bh - 3, w: sw, h: 12, color, text, flicker: flick, seed: gen() * 6.28, vertical: false });
            }
          }
          // Every strip hotel hangs a marquee facing the beach road.
          if (strip && b.floors >= 2 && gen() < 0.8) {
            const [color, text] = NEON[gen() * NEON.length | 0];
            const sw = Math.min(bw * 0.8, 106);
            block.signs.push({ style: 'bar', x: bx + (bw - sw) / 2, y: by + bh - 3, w: sw, h: 13, color, text, flicker: flick, seed: gen() * 6.28, vertical: false });
          }
          if (strip && b.floors >= 6 && gen() < 0.55) {
            const [color, text] = NEON[gen() * NEON.length | 0];
            const sw = Math.min(bw * 0.8, 104);
            block.signs.push({ style: 'board', x: bx + (bw - sw) / 2, y: by - 14, w: sw, h: 16, color, text, flicker: flick, seed: gen() * 6.28, vertical: false });
          }
        }
      }
      // Palms planted along the strip road edge.
      if (strip) {
        for (let p = 0; p < 2; p++) block.palms.push({ x: r.x - ROAD / 2 - 18, y: r.y + (p + 0.5) * r.h / 2, s: 1.05 + gen() * 0.4 });
      }
    }
  }

  // Beach palms: two staggered rows marching down the sand.
  const beachPalms = [];
  for (let y = 40, row = 0; y < GRID * PITCH - 40; y += 58, row++) {
    beachPalms.push({ x: GRID * PITCH + SAND * (0.3 + (row % 2 ? 0.28 : 0)), y, s: 0.9 + ((row * 7919) % 13) / 60 });
  }

  return { seed, blocks, lotCars, beachPalms };
}

/** Building rects near a point, gathered into `out` for circle-vs-city collision. */
export function buildingsNear(city, x, y, out) {
  out.length = 0;
  const bi = clamp(Math.floor((x - ROAD / 2) / PITCH), 0, GRID - 1);
  const bj = clamp(Math.floor((y - ROAD / 2) / PITCH), 0, GRID - 1);
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = bi + di, j = bj + dj;
      if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
      const list = city.blocks[i * GRID + j].buildings;
      for (let k = 0; k < list.length; k++) out.push(list[k]);
    }
  }
  return out;
}

/** Resolve a circle against nearby buildings and the world bounds. */
export function collideCity(city, x, y, r) {
  const scratch = [];
  let bumped = false;
  const list = buildingsNear(city, x, y, scratch);
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const push = circlePush(x, y, r, s.x, s.y, s.w, s.h);
    if (push) { x += push.x; y += push.y; bumped = true; }
  }
  const maxX = GRID * PITCH + SAND - r;
  if (x < r) { x = r; bumped = true; }
  if (y < r) { y = r; bumped = true; }
  if (y > GRID * PITCH - r) { y = GRID * PITCH - r; bumped = true; }
  if (x > maxX) { x = maxX; bumped = true; }
  return { x, y, bumped };
}
