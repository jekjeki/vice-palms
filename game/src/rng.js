// Seeded randomness. The city, the spawns and the screenshot staging all draw from streams
// rooted in one seed, so ?shot=&seed=N rebuilds an identical frame, and free play feels varied
// without ever touching the global Math.random.

let stream = Math.random;

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

/** Point the global runtime stream at a deterministic generator (or back to Math.random). */
export function seedRun(seed) { stream = mulberry(seed); }
export function freeRun() { stream = Math.random; }
export function rand() { return stream(); }
export function randInt(n) { return Math.floor(stream() * n); }
export function pick(list) { return list[Math.floor(stream() * list.length)]; }
