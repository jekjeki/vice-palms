// rng.js — deterministic seeded random. mulberry32 core.

export class RNG {
  constructor(seed) {
    this.s = seed >>> 0;
  }

  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** float in [a,b) */
  range(a, b) {
    return a + this.next() * (b - a);
  }

  /** integer in [a,b] inclusive */
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }

  /** pick n distinct-ish items (shallow shuffle of a copy) */
  sample(arr, n) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  }
}

/** Hash a string to a 32-bit seed so `?seed=vice` works. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
