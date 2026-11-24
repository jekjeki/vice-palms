// VICE PALMS — shared runtime state. Single source of truth, imported by every
// module. Contains no imports itself so the dependency graph stays acyclic.

import { CFG } from './config.js';

export const G = {
  // canvas / loop
  canvas: null,
  ctx: null,
  W: CFG.VIEW_W,
  H: CFG.VIEW_H,
  time: 0,            // seconds since boot
  frame: 0,
  dt: 0,
  running: false,

  // camera
  cam: { x: 1200, y: 1800, shake: 0 },
  shake: 0,

  // world
  world: null,

  // entities
  cars: [],
  peds: [],
  cops: [],           // foot police officers
  bullets: [],
  parts: [],
  flashes: [],
  pickups: [],        // mission pickups / money
  markers: [],        // transient mission markers (dynamic ones)

  // player
  player: {
    x: 1120, y: 1750, ang: -Math.PI / 2,
    vx: 0, vy: 0,
    hp: CFG.P_HP, armor: 0,
    money: CFG.START_MONEY,
    stars: 0,
    car: null,          // currently driving this car or null
    weapon: 'fist',     // 'fist' | 'pistol'
    ammo: 0,
    cd: 0,              // fire cooldown
    punchT: 0,          // punch anim timer
    hurtT: 0,           // red flash timer
    walkT: 0,           // walk cycle phase
    dead: false,
  },

  // progression
  missionIdx: 0,       // next story mission to offer (0-based)
  mission: null,       // active mission runtime {def, step, data, timer, ...}
  sideCooldown: {},    // side mission id -> time until available again
  sideMission: null,   // one side mission at a time
  done: false,         // story complete
  epilogue: false,

  // world ambience
  lightT: 0,           // traffic light cycle phase
  dayT: 0,             // 0..1 night-to-dawn slow drift (visual only)

  // police
  copTimer: 0,
  roadblockTimer: 0,
  losTimer: 0,         // seconds since no cop had line of sight
  bustT: 0,
  gunfireT: 0,         // seconds since the last shot was fired nearby (panic trigger)

  // spawn director
  trafficTimer: 0,
  pedTimer: 0,

  // ui / flow
  screen: 'title',     // title | play | pause | wasted | busted | end
  screenT: 0,
  toasts: [],          // {msg,t,max}
  subs: [],            // subtitle queue {lines,t,max}
  subNow: null,
  bigMsg: null,        // {text,sub,t,max,col}
  stats: { carjacks: 0, kills: 0, copKills: 0, missionsDone: 0, earned: 0 },
  starPulse: 0,

  // save
  saveKey: 'vice-palms-save-v3',
  hasSave: false,

  // audio
  muted: false,
  sfx: null,           // installed by audio.js: name -> play

  // shot mode
  shotMode: null,      // 'start' | 'play' | 'end' | 'chaos' | null
  shotFreeze: false,   // staged shots pause simulation after N seconds
  seed: 1337,

  // input edge tracking lives in input.js
};

export function toast(msg, dur = 2.6) {
  G.toasts.push({ msg, t: dur, max: dur });
  if (G.toasts.length > 3) G.toasts.shift();
}

export function say(lines, hold = 3.2) {
  // lines: string | string[] — shown sequentially at the bottom
  const arr = Array.isArray(lines) ? lines : [lines];
  for (const l of arr) G.subs.push({ line: l, t: hold, max: hold });
}

export function bigMsg(text, sub, col, dur = 2.8) {
  G.bigMsg = { text, sub, t: dur, max: dur, col: col || '#ffe36e' };
}

export function addMoney(n) {
  G.player.money = Math.max(0, G.player.money + n);
  if (n > 0) G.stats.earned += n;
}

export function addStars(n) {
  const before = G.player.stars;
  G.player.stars = Math.max(0, Math.min(5, G.player.stars + n));
  if (G.player.stars > before) {
    G.losTimer = 0;
    G.starPulse = 1;
    G.copTimer = Math.min(G.copTimer, 0.4); // respond fast to escalation
    if (before === 0) toast('WANTED — the Vice Palms PD is on you');
  }
}

export function damagePlayer(dmg, src) {
  const p = G.player;
  if (p.dead || G.screen !== 'play') return;
  if (p.armor > 0) {
    const a = Math.min(p.armor, dmg * 0.65);
    p.armor -= a; dmg -= a;
  }
  p.hp -= dmg;
  p.hurtT = 0.35;
  if (p.hp <= 0) {
    p.hp = 0; p.dead = true;
    G.screen = 'wasted'; G.screenT = 0;
    G.sfx && G.sfx('wasted');
  }
}

export function resetPlayer(x, y) {
  const p = G.player;
  p.x = x; p.y = y; p.vx = 0; p.vy = 0;
  p.hp = CFG.P_HP; p.armor = 0;
  p.car = null; p.dead = false;
  p.stars = 0; p.cd = 0;
}

export function saveGame() {
  try {
    const p = G.player;
    const data = {
      v: 3,
      money: p.money,
      hp: p.hp,
      armor: p.armor,
      ammo: p.ammo,
      weapon: p.weapon,
      missionIdx: G.missionIdx,
      done: G.done,
      stats: G.stats,
      x: p.x, y: p.y,
    };
    localStorage.setItem(G.saveKey, JSON.stringify(data));
    G.hasSave = true;
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(G.saveKey);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (d.v !== 3) return false;
    const p = G.player;
    p.money = d.money ?? CFG.START_MONEY;
    p.hp = d.hp ?? CFG.P_HP;
    p.armor = d.armor ?? 0;
    p.ammo = d.ammo ?? 0;
    p.weapon = d.weapon === 'pistol' ? 'pistol' : 'fist';
    G.missionIdx = d.missionIdx ?? 0;
    G.done = !!d.done;
    if (d.stats) G.stats = d.stats;
    p.x = d.x ?? 1120; p.y = d.y ?? 1750;
    p.car = null; p.dead = false; p.stars = 0;
    p.restored = true;
    return true;
  } catch { return false; }
}

export function deleteSave() {
  try { localStorage.removeItem(G.saveKey); } catch {}
  G.hasSave = false;
}

export function checkSave() {
  try { G.hasSave = !!localStorage.getItem(G.saveKey); } catch { G.hasSave = false; }
}
