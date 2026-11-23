// ---------------------------------------------------------------------------
// rng.js — deterministic seeded randomness. The whole world and every staged
// screenshot scene derive from integer seeds so runs are reproducible.
// ---------------------------------------------------------------------------

/** xmurmur3-ish string hash: turns "play" or "7" into a 32-bit seed. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  return h >>> 0;
}

export class RNG {
  constructor(seed) {
    if (typeof seed === 'string') seed = hashSeed(seed);
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  /** mulberry32 — fast, tiny, good enough distribution for gameplay. */
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** float in [a, b) */
  range(a, b) {
    return a + this.next() * (b - a);
  }

  /** integer in [a, b) — b defaults to a+1 */
  int(a, b) {
    if (b === undefined) { b = a; a = 0; }
    return Math.floor(this.range(a, b));
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** weighted pick: entries are [item, weight] */
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += e[1];
    let r = this.next() * total;
    for (const e of entries) {
      r -= e[1];
      if (r <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  }

  chance(p) {
    return this.next() < p;
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  /** gaussian-ish jitter (sum of 3 uniforms), roughly [-1, 1] peaked at 0 */
  jitter() {
    return (this.next() + this.next() + this.next()) / 1.5 - 1;
  }
}
