// Seeded deterministic RNG (mulberry32). The same seed rebuilds the same city and replays the
// same screenshot scene, which is what the ?shot= mode leans on.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a sub-seed so each subsystem (buildings, signs, traffic) gets its own stable stream. */
export function derive(seed, salt) {
  return (Math.imul(seed ^ salt, 0x85ebca6b) ^ (seed >>> 13)) | 0;
}
