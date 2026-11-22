// Broad-phase grid. Cars, people and pickups drop their circle into overlapping cells each
// step; neighbourhood queries visit only the covered cells, which keeps hundreds of actors
// inside the frame budget. Cell keys fold two small signed integers into one number: the world
// spans a few hundred cells per axis (40 blocks * 420 pitch at 320-unit cells, plus the beach),
// so |cy| stays far under the 4095 half-range the fold needs and the key stays unique.

const CELL = 320;
const CELL_INV = 1 / CELL;

export class Grid {
  constructor() { this.cells = new Map(); this.epoch = 0; }

  clear() { this.cells.clear(); }

  /** Distinct while both |cx| and |cy| stay below 4096 — the city never gets near that. */
  static key(cx, cy) { return cx * 8191 + cy; }

  add(obj, x, y, radius) {
    const x0 = Math.floor((x - radius) * CELL_INV), x1 = Math.floor((x + radius) * CELL_INV);
    const y0 = Math.floor((y - radius) * CELL_INV), y1 = Math.floor((y + radius) * CELL_INV);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = Grid.key(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) { bucket = []; this.cells.set(k, bucket); }
        bucket.push(obj);
      }
    }
  }

  /** Objects whose cells overlap the query circle, deduplicated into `out`. */
  near(x, y, radius, out) {
    out.length = 0;
    const epoch = ++this.epoch;
    const x0 = Math.floor((x - radius) * CELL_INV), x1 = Math.floor((x + radius) * CELL_INV);
    const y0 = Math.floor((y - radius) * CELL_INV), y1 = Math.floor((y + radius) * CELL_INV);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.cells.get(Grid.key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const o = bucket[i];
          if (o._seen === epoch) continue;
          o._seen = epoch;
          out.push(o);
        }
      }
    }
    return out;
  }
}
