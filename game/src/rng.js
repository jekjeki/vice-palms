// VICE PALMS — deterministic seeded RNG (mulberry32). All world gen and staged
// shots pull from a seeded instance so the city and screenshots are reproducible.

export class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.s = seed >>> 0;
  }
  next() {                       // [0,1)
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

// shared runtime RNG for non-critical gameplay noise (smoke jitter etc.)
export const runRNG = new RNG(0xC0FFEE);

export function reseedRun(seed) { runRNG.s = seed >>> 0; }
