// rng.js — deterministic seeded RNG (mulberry32) so worlds and staged shots replay identically
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1337) { this.next = mulberry32(seed); this.seed = seed >>> 0; }
  f() { return this.next(); }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(a + this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  // stable hash for per-object sub-choices without consuming stream order
  static hash(n) {
    let a = (n + 0x9E3779B9) >>> 0;
    a = Math.imul(a ^ (a >>> 16), 0x45d9f3b); a = Math.imul(a ^ (a >>> 16), 0x45d9f3b);
    return ((a ^ (a >>> 16)) >>> 0) / 4294967296;
  }
}

// shared runtime RNG for non-deterministic gameplay effects (particles, jitter)
export const fx = new RNG((Math.random() * 2 ** 31) >>> 0);
