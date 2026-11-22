// Seeded randomness. The city, the spawns and the screenshot staging all draw from streams
// rooted in one seed, so ?shot=&seed=N rebuilds an identical frame, and free play feels varied
// without ever touching the global Math.random. Even the pre-seed default stream is a fixed
// mulberry run, so a page that somehow draws before seedRun() is still reproducible.

let stream = mulberry(0x0a11ce);

/** mulberry32 — small, fast, good enough distribution for a city. */
export function mulberry(seed) {
  let a = seed | 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix a salt into a seed so each subsystem gets an independent stream. */
export function remix(seed, salt) {
  return (Math.imul(seed ^ salt, 0x9e3779b9) ^ (seed >>> 15)) | 0;
}

/** Point the global runtime stream at a deterministic generator (or back to the fixed default). */
export function seedRun(seed) { stream = mulberry(seed); }
export function freeRun() { stream = mulberry(0x0a11ce); }
export function rand() { return stream(); }
export function randInt(n) { return Math.floor(stream() * n); }
/** True `p` of the time — the readable spelling of `rand() < p`. */
export function chance(p) { return stream() < p; }

/** Uniform float in [lo, hi) — spawn rings and cruise-speed jitter read better spelled out. */
export function randRange(lo, hi) { return lo + stream() * (hi - lo); }

/** One element of an array, or null when it is empty. */
export function pick(list) { return list.length ? list[randInt(list.length)] : null; }
