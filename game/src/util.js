// util.js — shared mutable game context (G), seeded RNG, math helpers.
// G is populated by game.js; every other module only reads/writes fields on it.
// Keeping it here avoids import cycles entirely.

// ---------------------------------------------------------------- global ctx
export const G = {
  t: 0,                 // total sim time (s)
  state: 'boot',        // boot | title | playing | paused | wasted | busted | passed | end
  shot: null,           // staged screenshot scene name
  seed: 7,
  muted: false,

  world: null,          // World (world.js)
  player: null,         // Player (player.js)
  police: null,         // Police (police.js)
  missions: null,       // Missions (missions.js)

  cars: [],             // every Car (traffic + police + parked + player's)
  peds: [],             // Ped
  cops: [],             // foot cops (Cop extends Ped-ish plain objects)
  bullets: [],
  parts: [],            // particles
  skids: [],            // tire-mark decals
  booms: [],            // explosion flashes {x,y,t,r}
  spikes: [],           // VCPD spike strips {x,y,w,h,life}

  weather: null,        // Weather (weather.js)
  shops: null,          // Shops (shops.js)
  helis: null,          // Helis (heli.js)
  radioName: '',        // shown by the HUD after cycling stations
  garageData: null,     // stored personal car {type, color}
  photo: false,         // photo mode: hide the HUD for clean shots

  cam: { x: 0, y: 0, z: 1, shake: 0, flash: 0 },
  money: 350,

  hud: {
    sub: '', subT: 0,           // subtitle + remaining time
    mission: '', missionT: 0,   // top-center mission text
    passed: 0,                  // mission-passed overlay timer
    passedName: '',
    help: 0,                    // context help line timer
    helpText: '',
  },

  w: 1280, h: 720,      // canvas logical size
};

export function say(text, dur = 3.6) {
  G.hud.sub = text;
  G.hud.subT = dur;
}

export function missionText(text, dur = 4.5) {
  G.hud.mission = text;
  G.hud.missionT = dur;
}

export function help(text, dur = 4) {
  G.hud.helpText = text;
  G.hud.help = dur;
}

// ------------------------------------------------------------------- seeded RNG
// mulberry32 — small, fast, deterministic.
export class RNG {
  constructor(seed) {
    this.s = seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }
  f() {                        // [0,1)
    let t = this.s += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  range(a, b) { return a + this.f() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
}

// ------------------------------------------------------------------- math
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}
export function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }

export function angNorm(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}
export function angLerp(a, b, t) {
  return a + angNorm(b - a) * clamp(t, 0, 1);
}

export function len2(x, y) { return Math.sqrt(x * x + y * y); }

// deterministic hash for per-position stability (neon flicker, window lights)
export function hash2(x, y) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------- collision primitives
// resolve a circle against an axis-aligned rect; returns push-out vector or null
export function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  let dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { x: (dx / d) * (r - d), y: (dy / d) * (r - d), d };
  }
  // center inside the rect — push out along the shallowest axis
  const l = cx - rx, rt = rx + rw - cx, tp = cy - ry, bt = ry + rh - cy;
  const m = Math.min(l, rt, tp, bt);
  if (m === l) return { x: -(l + r), y: 0, d: l + r };
  if (m === rt) return { x: rt + r, y: 0, d: rt + r };
  if (m === tp) return { x: 0, y: -(tp + r), d: tp + r };
  return { x: 0, y: bt + r, d: bt + r };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// keep a hex string, dim it by factor k (0..1) — cheap night shading
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.round(clamp(v * k, 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function fmtMoney(n) {
  const s = Math.max(0, Math.floor(n)).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return '$' + out;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
