// rng.js — deterministic seeded random number generation for Vice Palms.
// Everything that spawns, jitters or decorates pulls from one of these so a
// given seed always rebuilds the exact same city and the exact same chaos.

/** Small, fast, well-behaved 32-bit PRNG stream. Returns floats in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string hash, used to seed per-block and per-building generators. */
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mix two integers into one seed (order matters, deterministic). */
export function mixSeeds(a, b) {
  let h = (a ^ 0x9E3779B9) >>> 0;
  h = Math.imul(h ^ (b >>> 0), 0x85EBCA6B) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xC2B2AE35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A named random stream. The game keeps a handful of these (world gen, props,
 * traffic, chaos) so subsystems can be reseeded independently without
 * disturbing each other's sequences.
 */
export class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.f = mulberry32(this.seed);
    this.count = 0;
  }

  reseed(seed) {
    this.seed = seed >>> 0;
    this.f = mulberry32(this.seed);
    this.count = 0;
  }

  /** Next float in [0,1). */
  next() {
    this.count++;
    return this.f();
  }

  /** Float in [a,b). */
  range(a, b) {
    return a + (b - a) * this.next();
  }

  /** Integer in [a,b] inclusive. */
  int(a, b) {
    if (b < a) return a;
    return a + Math.floor(this.next() * (b - a + 1));
  }

  /** Random element, array must be non-empty. */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }

  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }

  /** Weighted pick: items is [{item, w}]. */
  weighted(items) {
    let total = 0;
    for (const it of items) total += it.w;
    let r = this.next() * total;
    for (const it of items) {
      r -= it.w;
      if (r <= 0) return it.item;
    }
    return items[items.length - 1].item;
  }

  /** Gaussian-ish value centred on 0, range roughly [-1,1]. */
  bell() {
    return (this.next() + this.next() + this.next() - 1.5) / 1.5;
  }

  /** Random point inside a rect (px units). */
  pointIn(x0, y0, x1, y1) {
    return { x: this.range(x0, x1), y: this.range(y0, y1) };
  }

  /** Random angle in radians. */
  angle() {
    return this.next() * Math.PI * 2;
  }

  /** Shuffled shallow copy of an array. */
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
}

/** Convenience: the default global seed the shipping city uses. */
export const CITY_SEED = 19870614;
