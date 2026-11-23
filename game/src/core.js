// core.js — constants, math, seeded RNG, input, shared mutable state. No imports.
export const VW = 1280, VH = 720;            // internal resolution
export const WW = 6400, WH = 4800;           // world size (units; ~1 unit = 1 px at zoom 1)
export const ROAD_W = 64, LANE = 16, SIDEWALK = 22;
export const NIGHT = true;
export const STAMINA_MAX = 100;              // sprint stamina pool
export const WEAPONS = {
  fist: { name: 'FISTS', cd: 0.38, melee: true, dmg: 22 },
  pistol: { name: 'PISTOL', cd: 0.27, dmg: 16, spread: 0.03, spd: 1150 },
  smg: { name: 'SMG', cd: 0.09, dmg: 9, spread: 0.09, spd: 1250 },
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const len = (x, y) => Math.hypot(x, y);
export function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
export function angTurn(cur, target, rate) { const d = angDiff(cur, target); return cur + clamp(d, -rate, rate); }
export function approach(v, target, amt) { return v < target ? Math.min(v + amt, target) : Math.max(v - amt, target); }
export const TAU = Math.PI * 2;

// Deterministic hash for window lights etc.
export function hash2(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }

// mulberry32 — small, fast, deterministic.
export class Rng {
  constructor(seed) { this.s = seed >>> 0; }
  r() { let t = (this.s += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  ri(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  rf(a, b) { return a + this.r() * (b - a); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  chance(p) { return this.r() < p; }
}

export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.pressed = new Set();
    this.mx = VW / 2; this.my = VH / 2; this.mdown = false; this.mclicked = false;
    this.anyKey = false;
    addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'F1'].includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) { this.keys.add(e.code); this.pressed.add(e.code); this.anyKey = true; }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mx = (e.clientX - r.left) * (canvas.width / r.width);
      this.my = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mdown = true; this.mclicked = true; } });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mdown = false; });
    addEventListener('blur', () => { this.keys.clear(); this.mdown = false; });
  }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { for (const c of codes) if (this.pressed.has(c)) { return true; } return false; }
  endFrame() { this.pressed.clear(); this.mclicked = false; this.anyKey = false; }
}

// Shared mutable game state — filled by game.init / shots.setup.
export const S = {
  mode: 'title',        // title | playing | paused | wasted | busted | over
  modeT: 0,             // seconds in current mode
  time: 0, frame: 0, seed: 1337, rng: null,
  cam: { x: WW / 2, y: WH / 2, zoom: 0.9, sx: 0, sy: 0 },
  world: null, player: null,
  cars: [], peds: [], cops: [], bullets: [], particles: [], explosions: [], bodies: [], skids: [],
  pickups: [], heli: null, heliT: 0, zone: '', zoneT: 0, horn: 0, bigMap: false, stamina: 0,
  wanted: 0, seenT: 0, bustT: 0,
  money: 0, moneyShow: 0,
  mission: { active: null, side: null, index: 0, done: [], banner: null, blip: null, timer: 0, stage: null, spawned: [] },
  toasts: [], subs: [], banner: null,
  flash: 0, flashCol: '255,255,255', shake: 0,
  lightPhase: 0,
  muted: false, freeze: false, shot: null, shotHold: 0, demo: 0,
  sfx: [], panics: [],
  rain: 0, rainT: 0, radio: 0, spray: 0, sprayCd: 0, dogs: [], lightning: 0,
  totalKills: 0, damage: { dir: 0, t: 0 },
};

export function say(text, dur = 4.2) { S.subs.push({ text, t: 0, dur }); if (S.subs.length > 3) S.subs.shift(); }
export function toast(text, dur = 3) { S.toasts.push({ text, t: 0, dur }); }
export function addMoney(n) { S.money = Math.max(0, S.money + n); if (n > 0) S.moneyShow = Math.min(S.moneyShow + n, 999999); }
export const moneyFmt = (n) => n.toLocaleString('en-US');
export function panic(x, y, r = 420) { S.panics.push({ x, y, r, t: 0 }); }

// Radio stations: chord sets, tempos and flavors for the music scheduler.
export const RADIO = [
  { name: 'VICE WAVE 103', bpm: 106, chords: [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]], pad: 0.018, lead: 2 },
  { name: 'PALM FM 96.5', bpm: 122, chords: [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [146.8, 174.6, 220]], pad: 0.022, lead: 1 },
  { name: 'NIGHT DRIVE 88.1', bpm: 88, chords: [[130.8, 155.6, 196], [123.5, 146.8, 185], [110, 130.8, 164.8], [98, 123.5, 146.8]], pad: 0.026, lead: 0 },
];
// Cross-module hooks — game.js registers these; other modules call them without importing game.js.
export const hooks = {
  damagePlayer: null, damageCar: null, killPed: null, explodeCar: null,
  addWanted: null, tryCarjack: null, missionFail: null, spawnFx: null,
};
