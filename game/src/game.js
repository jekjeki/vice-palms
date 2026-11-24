// Vice Palms — core state, world sim orchestration, save/load, wanted logic
import { World, mulberry32 } from './world.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { AudioSys } from './audio.js';

export const S = { inited: false };
export const STEP = 1 / 60;

export function makeState(seed) {
  const fresh = {
    mode: 'title', seed, frame: 0, time: 0,
    money: 0, heat: 0, wanted: 0, crimeT: 99,
    cam: { x: 0, y: 0 }, shake: 0, flash: 0, fade: 0,
    keys: {}, pressed: new Set(), mouse: { x: 640, y: 360, down: false },
    bullets: [], particles: [], decals: [],
    subtitles: [], objective: '',
    stats: { kills: 0, jack: 0, missions: 0, arrests: 0, deaths: 0 },
    shot: null, shotAt: 0, shotReady: false,
    audioOn: false, endT: 0, endKind: '', msgT: 0, msg: '',
    errors: [],
  };
  for (const k of Object.keys(fresh)) S[k] = fresh[k];
  S.rng = mulberry32(seed);
  S.inited = true;
  return S;
}

export function startRun(seed) {
  S.world = new World(seed);
  S.player = new Player();
  S.traffic = new Traffic();
  S.peds = new Peds();
  S.police = new Police();
  S.missions = new Missions();
  if (!S.audio) S.audio = new AudioSys();
  S.audio.setMuted(!S.audioOn);
  S.bullets.length = 0; S.particles.length = 0; S.decals.length = 0;
  S.money = 0; S.heat = 0; S.wanted = 0; S.crimeT = 99;
  S.frame = 0; S.time = 0;
  const p = S.world.playerStart;
  S.player.x = p.x; S.player.y = p.y; S.player.a = Math.PI;
  S.cam.x = p.x; S.cam.y = p.y;
  S.missions.begin();
}

export function newGame(seed) {
  makeState(seed);
  startRun(seed);
  S.mode = 'play';
}

// ---- crime / wanted -------------------------------------------------------
export function crime(amount) {
  S.heat = Math.min(5.99, S.heat + amount);
  S.crimeT = 0;
  const lvl = Math.floor(S.heat);
  if (lvl !== S.wanted) { S.wanted = lvl; S.police.sync(); if (lvl > 0) S.audio.blip(880, 0.09, 'square', 0.06); }
}

export function say(text, t = 4) { S.subtitles.push({ text, t }); }
export function toast(text) { S.msg = text; S.msgT = 3; }

// ---- transitions ----------------------------------------------------------
export function wasted() {
  if (S.mode !== 'play') return;
  S.mode = 'wasted'; S.endKind = 'WASTED'; S.endT = 0; S.stats.deaths++;
  S.audio.explosion();
}
export function busted() {
  if (S.mode !== 'play') return;
  S.mode = 'busted'; S.endKind = 'BUSTED'; S.endT = 0; S.stats.arrests++;
  S.audio.blip(220, 0.4, 'sawtooth', 0.1);
}
export function respawn() {
  const p = S.player;
  p.exitCar();
  p.hp = 100; p.armor = Math.max(0, p.armor - 50); p.ammo = Math.max(p.ammo, 12);
  const w = S.world;
  p.x = w.playerStart.x; p.y = w.playerStart.y; p.a = Math.PI;
  S.heat = 0; S.wanted = 0; S.crimeT = 99;
  S.police.clear();
  S.bullets.length = 0;
  S.money = Math.max(0, S.money - (S.endKind === 'BUSTED' ? Math.min(800, Math.floor(S.money * 0.2)) : 200));
  S.cam.x = p.x; S.cam.y = p.y;
  S.mode = 'play';
  S.missions.onRespawn();
}

// ---- persistence ----------------------------------------------------------
const SAVE_KEY = 'vicepalms.save.v1';
export function saveGame() {
  try {
    const d = { seed: S.seed, money: S.money, mission: S.missions.idx, stats: S.stats, ammo: S.player.ammo, armor: S.player.armor };
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    toast('Game saved');
    return true;
  } catch (e) { toast('Save failed'); return false; }
}
export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
export function loadGame() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!d) { toast('No save found'); return false; }
    makeState(d.seed);
    startRun(d.seed);
    S.money = d.money || 0; S.stats = d.stats || S.stats;
    S.player.ammo = d.ammo || 0; S.player.armor = d.armor || 0;
    S.missions.idx = d.mission || 0; S.missions.begin();
    S.mode = 'play';
    toast('Game loaded');
    return true;
  } catch (e) { toast('Load failed'); return false; }
}

// ---- menu / confirm keys --------------------------------------------------
export function handleKey(code) {
  if (code === 'Enter') {
    if (S.mode === 'title') newGame(S.seed);
    else if (S.mode === 'wasted' || S.mode === 'busted') respawn();
    else if (S.mode === 'credits') { S.mode = 'title'; }
  }
  if (S.mode === 'title' && code === 'KeyI') loadGame();
  if (code === 'KeyP' || code === 'Escape') {
    if (S.mode === 'play') S.mode = 'pause';
    else if (S.mode === 'pause') S.mode = 'play';
  }
  if (S.mode === 'pause') {
    if (code === 'KeyO') saveGame();
    if (code === 'KeyI') loadGame();
  }
  if (S.mode === 'play' && code === 'KeyM') {
    S.audioOn = !S.audioOn; S.audio.setMuted(!S.audioOn);
    toast(S.audioOn ? 'Audio on' : 'Audio muted');
  }
}

// ---- bullets ----------------------------------------------------------------
export function spawnBullet(x, y, ang, from, spd = 900) {
  if (S.bullets.length > 120) return;
  S.bullets.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.7, from });
  S.audio.gunshot();
}

function updateBullets(dt) {
  const w = S.world, p = S.player;
  for (let i = S.bullets.length - 1; i >= 0; i--) {
    const b = S.bullets[i];
    const steps = 2;
    let dead = (b.life -= dt) <= 0;
    for (let s = 0; s < steps && !dead; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      if (w.solidHit(b.x, b.y)) dead = true;
      else if (b.from === 'cop') {
        if (p.alive() && Math.abs(b.x - p.cx()) < 16 && Math.abs(b.y - p.cy()) < 16) {
          p.hurt(b.from === 'cop' ? 9 : 5); dead = true;
        } else {
          const c = S.traffic.hitCar(b.x, b.y) || S.police.hitCar(b.x, b.y);
          if (c) { damageCar(c, 7, b.from); dead = true; }
        }
      } else {
        const ped = S.peds.hitPed(b.x, b.y);
        if (ped) { ped.kill(); dead = true; }
        else {
          const c = S.traffic.hitCar(b.x, b.y) || S.police.hitCar(b.x, b.y);
          if (c) { damageCar(c, 8, 'player'); dead = true; }
          else if (S.police.hitCop(b.x, b.y)) { dead = true; }
        }
      }
    }
    if (dead) {
      S.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.15, max: 0.15, r: 5, c: '#ffe9a0' });
      S.bullets.splice(i, 1);
    }
  }
}

// ---- particles / decals -----------------------------------------------------
export function addParticles(x, y, n, opts = {}) {
  for (let i = 0; i < n; i++) {
    if (S.particles.length > 400) return;
    const a = S.rng() * Math.PI * 2, sp = (opts.spd || 120) * (0.3 + S.rng());
    S.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: (opts.life || 0.6) * (0.6 + S.rng() * 0.7), max: opts.life || 0.6,
      r: (opts.r || 6) * (0.5 + S.rng()), c: opts.c || '#ffae42', fire: opts.fire,
    });
  }
}
export function addDecal(x, y, r, c) {
  S.decals.push({ x, y, r, c });
  if (S.decals.length > 90) S.decals.shift();
}

function updateParticles(dt) {
  for (let i = S.particles.length - 1; i >= 0; i--) {
    const q = S.particles[i];
    q.life -= dt;
    if (q.life <= 0) { S.particles.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.fire) { q.vy -= 40 * dt; q.vx *= 0.98; } else { q.vx *= 0.9; q.vy *= 0.9; }
  }
}

// ---- pickups ------------------------------------------------------------------
function updatePickups(dt) {
  const p = S.player;
  for (const u of S.world.pickups) {
    if (u.taken) { u.rt -= dt; if (u.rt <= 0) u.taken = false; continue; }
    if (Math.hypot(u.x - p.cx(), u.y - p.cy()) < 34) {
      u.taken = true; u.rt = 45;
      if (u.kind === 'health') { p.hp = Math.min(100, p.hp + 50); toast('+50 Health'); }
      if (u.kind === 'armor') { p.armor = Math.min(100, p.armor + 50); toast('+50 Armor'); }
      if (u.kind === 'ammo') { p.ammo += 24; toast('+24 Ammo'); }
      S.audio.blip(980, 0.08, 'sine', 0.07);
    }
  }
}

// ---- main update ----------------------------------------------------------------
export function updateGame(s) {
  if (s.mode === 'play') simStep(s, STEP);
  else if (s.mode === 'wasted' || s.mode === 'busted') {
    s.endT += STEP;
    updateParticles(STEP);
    if (s.endT > 3.2) respawn();
  } else if (s.mode === 'title') {
    s.time += STEP;
  }
}

function simStep(s, dt) {
  s.time += dt;
  const p = s.player;
  p.update(dt);
  s.traffic.update(dt);
  s.peds.update(dt);
  s.police.update(dt);
  s.missions.update(dt);
  updateBullets(dt);
  updateParticles(dt);
  updatePickups(dt);

  // wanted decay
  s.crimeT += dt;
  if (s.heat > 0 && s.crimeT > 16) {
    s.heat = Math.max(0, s.heat - dt * 0.22);
    const lvl = Math.floor(s.heat);
    if (lvl !== s.wanted) { s.wanted = lvl; s.police.sync(); }
  }

  // camera
  const t = p.inCar || p;
  s.cam.x += (t.x - s.cam.x) * Math.min(1, dt * 6);
  s.cam.y += (t.y - s.cam.y) * Math.min(1, dt * 6);
  s.shake = Math.max(0, s.shake - dt * 22);
  s.flash = Math.max(0, s.flash - dt * 2.2);
  s.msgT = Math.max(0, s.msgT - dt);
  for (let i = s.subtitles.length - 1; i >= 0; i--) {
    s.subtitles[i].t -= dt;
    if (s.subtitles[i].t <= 0) s.subtitles.splice(i, 1);
  }
  s.audio.update(dt, s);
}
