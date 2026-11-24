// util.js — math, RNG, geometry helpers. No side effects at import.

// ---------------------------------------------------------------- RNG ----
// mulberry32: small, fast, deterministic. worldgen + staged shots use it.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// hash of two ints -> [0,1). Used for per-block determinism.
export function hash2(a, b) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------- math ------
export const TAU = Math.PI * 2;

export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
export function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }

export function angNorm(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
export function angLerp(a, b, t) {
  return a + angNorm(b - a) * t;
}

export function pick(rng, arr) { return arr[(rng() * arr.length) | 0]; }
export function picki(arr, i) { return arr[i % arr.length]; }

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

export function fmtMoney(n) {
  const s = Math.max(0, Math.round(n)).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return '$' + out;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = (sec / 60) | 0, s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// ---------------------------------------------------------- geometry -----
export function pointInRect(px, py, r) {
  return px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1;
}

export function rectsOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

// Circle vs AABB. Returns push vector {x,y,depth} to move the circle out,
// or null when not touching.
export function circleRectPush(px, py, r, rect) {
  const cx = clamp(px, rect.x0, rect.x1);
  const cy = clamp(py, rect.y0, rect.y1);
  const dx = px - cx, dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const depth = r - d;
    return { x: (dx / d) * depth, y: (dy / d) * depth, depth };
  }
  // center inside the rect: push out through the nearest face
  const l = px - rect.x0, rr = rect.x1 - px, t = py - rect.y0, b = rect.y1 - py;
  const m = Math.min(l, rr, t, b);
  if (m === l) return { x: -(l + r), y: 0, depth: l + r };
  if (m === rr) return { x: rr + r, y: 0, depth: rr + r };
  if (m === t) return { x: 0, y: -(t + r), depth: t + r };
  return { x: 0, y: b + r, depth: b + r };
}

// distance from point to a rect's edge (0 when inside)
export function rectDist(px, py, r) {
  const dx = Math.max(r.x0 - px, 0, px - r.x1);
  const dy = Math.max(r.y0 - py, 0, py - r.y1);
  return Math.hypot(dx, dy);
}

// axis-aligned bounding rect of a circle
export function circleAABB(x, y, r) {
  return { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
}

// ------------------------------------------------------------- misc ------
let _uid = 1;
export function uid() { return _uid++; }

export function nowSec() { return performance.now() / 1000; }
