// VICE PALMS — small math / geometry helpers plus particle primitives.

import { G } from './state.js';
import { runRNG } from './rng.js';

export const TAU = Math.PI * 2;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
export function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
export function angTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
export function normAng(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
export function angLerp(a, b, t) { return a + normAng(b - a) * clamp(t, 0, 1); }
export function moveToward(cur, target, maxStep) {
  const d = target - cur;
  return Math.abs(d) <= maxStep ? target : cur + Math.sign(d) * maxStep;
}

export function rectHit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
export function ptInRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
export function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
  return dist2(cx, cy, nx, ny) < r * r;
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
export function fmtTime(t) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}
export function pad2(n) { return n < 10 ? '0' + n : '' + n; }

// ---- particles -----------------------------------------------------------
// G.parts entries: {x,y,vx,vy,life,maxLife,r,col,kind,extra}
// kind: 'smoke' | 'fire' | 'spark' | 'blood' | 'glass' | 'ring' | 'shell'

export function spawnPart(p) {
  if (G.parts.length > 900) G.parts.shift();
  p.maxLife = p.life;
  G.parts.push(p);
  return p;
}

export function burst(x, y, n, opts) {
  for (let i = 0; i < n; i++) {
    const a = runRNG.next() * TAU;
    const sp = runRNG.range(opts.spMin ?? 20, opts.spMax ?? 120);
    spawnPart({
      x, y,
      vx: Math.cos(a) * sp + (opts.vx || 0),
      vy: Math.sin(a) * sp + (opts.vy || 0),
      life: runRNG.range(opts.lifeMin ?? 0.3, opts.lifeMax ?? 0.8),
      r: runRNG.range(opts.rMin ?? 1.5, opts.rMax ?? 4),
      col: opts.col || '#ffcc66',
      kind: opts.kind || 'spark',
      drag: opts.drag,
    });
  }
}

export function smokePuff(x, y, vx, vy, col) {
  spawnPart({ x, y, vx, vy, life: runRNG.range(0.7, 1.4), r: runRNG.range(4, 9), col: col || 'rgba(90,90,100,0.5)', kind: 'smoke' });
}

export function explosionAt(x, y, big) {
  const R = big ? 130 : 100;
  G.flashes.push({ x, y, r: R, t: 0.5, max: 0.5 });
  G.shake = Math.min(22, G.shake + (big ? 18 : 12));
  burst(x, y, big ? 46 : 30, { spMin: 60, spMax: 320, lifeMin: 0.25, lifeMax: 0.9, rMin: 2, rMax: 6, col: '#ffb347', kind: 'fire' });
  burst(x, y, 16, { spMin: 30, spMax: 140, lifeMin: 0.8, lifeMax: 1.8, rMin: 6, rMax: 14, col: 'rgba(70,70,78,0.55)', kind: 'smoke' });
  spawnPart({ x, y, vx: 0, vy: 0, life: 0.35, r: 8, col: '#fff1a8', kind: 'ring', extra: { rMax: R } });
  G.sfx && G.sfx('boom');
}

export function updateParticles(dt) {
  const parts = G.parts;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    if (p.kind === 'ring') { p.r += (p.extra.rMax - p.r) * Math.min(1, dt * 14); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const drag = p.drag ?? (p.kind === 'smoke' ? 0.6 : 2.2);
    const f = Math.max(0, 1 - drag * dt);
    p.vx *= f; p.vy *= f;
    if (p.kind === 'smoke') p.r += 10 * dt;
  }
  for (let i = G.flashes.length - 1; i >= 0; i--) {
    G.flashes[i].t -= dt;
    if (G.flashes[i].t <= 0) G.flashes.splice(i, 1);
  }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - G.shake * dt * 5.5 - 2 * dt);
}
