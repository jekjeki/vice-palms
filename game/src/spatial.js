// Spatial hash: broad-phase for the few hundred peds, cars, cops and pickups that live around
// the player. Entities register a cell each step; queries walk the covered cells only.

const CELL = 320;

export class SpatialHash {
  constructor() {
    this.map = new Map();
  }
  clear() { this.map.clear(); }
  _key(cx, cy) { return cx * 10007 + cy; }
  insert(obj, x, y, radius) {
    const c = Math.ceil(radius / CELL) + 1;
    const x0 = Math.floor((x - radius) / CELL), x1 = Math.floor((x + radius) / CELL);
    const y0 = Math.floor((y - radius) / CELL), y1 = Math.floor((y + radius) / CELL);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const k = this._key(cx, cy);
      let bucket = this.map.get(k);
      if (!bucket) { bucket = []; this.map.set(k, bucket); }
      bucket.push(obj);
    }
  }
  query(x, y, radius, out) {
    out.length = 0;
    const x0 = Math.floor((x - radius) / CELL), x1 = Math.floor((x + radius) / CELL);
    const y0 = Math.floor((y - radius) / CELL), y1 = Math.floor((y + radius) / CELL);
    const seen = new Set();
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const bucket = this.map.get(this._key(cx, cy));
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const o = bucket[i];
        if (!seen.has(o)) { seen.add(o); out.push(o); }
      }
    }
    return out;
  }
}
