// ============================================================================
// VICE PALMS — rng.js
// Deterministic seeded randomness. Same seed => same city, same spawns, same
// staged screenshot scenes. mulberry32 core; tiny string hashing for names.
// ============================================================================

// xmur3 string hash -> 32-bit seed material.
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class RNG {
  constructor(seed) {
    this.a = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 0x9e3779b9;
    this.cache = null;
  }

  // raw float in [0,1)
  next() {
    let t = (this.a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // float in [lo, hi)
  range(lo, hi) {
    return lo + this.next() * (hi - lo);
  }

  // int in [lo, hi] inclusive
  int(lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // pick with a lucky second roll: biased toward the start of the array
  pickBias(arr, bias = 0.35) {
    const i = Math.floor(Math.abs(this.next() - bias * this.next()) * arr.length);
    return arr[Math.min(i, arr.length - 1)];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  angle() {
    return this.next() * Math.PI * 2;
  }

  // one of n near-equal lanes
  lane(n) {
    return Math.floor(this.next() * n);
  }
}

// Fixed neighborhood words used for building naming / neon signs.
const NEON_WORDS = [
  'MALIBU', 'CLUB', 'OCEAN VIEW', 'PALMS HOTEL', 'EL RANCHO', 'MOTEL', 'DINER',
  '24H', 'LIQUOR', 'CASINO', 'VICE', 'TATTOO', 'NOODLE BAR', 'KARAOKE', 'GYM',
  'PAWN', 'CINEMA', 'ROOFTOP', 'BEACH BAR', 'NEON', 'LAUNDRY', 'PIZZA', 'SUSHI',
  'STRIP CLUB', 'RECORDS', 'ARCADE', 'BANK', 'HOTEL LUNA', 'CAB CO', 'MARKET',
];

const STREETS = [
  'Ocean', 'Palm', 'Flamingo', 'Vice', 'Coral', 'Sunset', 'Marina', 'Collins',
  'Washington', 'Lincoln', 'Pelican', 'Starfish', 'Neon', 'Steel', 'Harbor',
];

const AVE = ['Ave', 'St', 'Blvd', 'Drive', 'Way'];

export function streetName(rng) {
  return rng.pick(STREETS) + ' ' + rng.pick(AVE);
}

export function neonWord(rng) {
  return rng.pick(NEON_WORDS);
}

// Deterministic per-entity id: collision-free counter + seed salt.
let idCounter = 1;
export function nextId() {
  return idCounter++;
}
export function resetIds(seed) {
  idCounter = (seed >>> 0) % 100000 + 1;
}
