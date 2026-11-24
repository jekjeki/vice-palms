// Vice Palms — seeded deterministic RNG (mulberry32).

export class RNG {
  constructor(seed) {
    this.s = (seed >>> 0) || 1;
  }

  /** Next float in [0, 1). */
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [a, b). */
  range(a, b) {
    return a + this.next() * (b - a);
  }

  /** Integer in [a, b] inclusive. */
  int(a, b) {
    return a + ((this.next() * (b - a + 1)) | 0);
  }

  /** Random array element. */
  pick(arr) {
    return arr[(this.next() * arr.length) | 0];
  }

  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }

  /** Random angle. */
  angle() {
    return this.next() * Math.PI * 2;
  }
}

/** Turn any string into a usable 32-bit seed. */
export function hashSeed(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
