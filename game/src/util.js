// util.js — small pure helpers shared by every subsystem.

export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Frame-rate independent smoothing factor. */
export function damp(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** Normalize an angle into [-PI, PI). */
export function angNorm(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/** Shortest-way angle interpolation. */
export function angLerp(a, b, t) {
  return a + angNorm(b - a) * t;
}

/** Move angle a toward b by up to maxStep radians. */
export function angMove(a, b, maxStep) {
  const d = angNorm(b - a);
  if (Math.abs(d) <= maxStep) return angNorm(b);
  return angNorm(a + Math.sign(d) * maxStep);
}

export function vecLen(vx, vy) {
  return Math.sqrt(vx * vx + vy * vy);
}

/** Set (out.len, out.nx, out.ny) for a vector without allocating. */
export function vecNorm(vx, vy, out) {
  const len = vecLen(vx, vy);
  if (len > 1e-6) {
    out.nx = vx / len;
    out.ny = vy / len;
    out.len = len;
  } else {
    out.nx = 0; out.ny = 0; out.len = 0;
  }
  return out;
}

export function aabbOverlap(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

export function pointInRect(px, py, r) {
  return px >= r.x0 && px < r.x1 && py >= r.y0 && py < r.y1;
}

/**
 * Push a circle out of an AABB. Returns a mutation target {px, py, depth}
 * when they overlap, null otherwise. Cheap and allocation-free when `out`
 * is reused.
 */
export function circleRectPush(cx, cy, r, rect, out) {
  const nx = clamp(cx, rect.x0, rect.x1);
  const ny = clamp(cy, rect.y0, rect.y1);
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const push = r - d;
    out.px = (dx / d) * push;
    out.py = (dy / d) * push;
    out.depth = push;
  } else {
    // centre inside the rect: escape along the shallowest axis
    const l = cx - rect.x0, ri = rect.x1 - cx, t = cy - rect.y0, b = rect.y1 - cy;
    const m = Math.min(l, ri, t, b);
    if (m === l) { out.px = -(l + r); out.py = 0; }
    else if (m === ri) { out.px = ri + r; out.py = 0; }
    else if (m === t) { out.px = 0; out.py = -(t + r); }
    else { out.px = 0; out.py = b + r; }
    out.depth = r + m;
  }
  return out;
}

/** Closest point on a segment to a point. Writes into out {x, y, t}. */
export function closestOnSeg(px, py, ax, ay, bx, by, out) {
  const abx = bx - ax, aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 > 1e-9 ? ((px - ax) * abx + (py - ay) * aby) / ab2 : 0;
  t = clamp(t, 0, 1);
  out.x = ax + abx * t;
  out.y = ay + aby * t;
  out.t = t;
  return out;
}

/** True when a circle overlaps a rect at all. */
export function circleRectHit(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x0, rect.x1);
  const ny = clamp(cy, rect.y0, rect.y1);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

/** Simple $ formatter: 1234 -> "$1,234". */
export function fmtMoney(n) {
  const v = Math.max(0, Math.round(n));
  let s = String(v);
  let out = '';
  while (s.length > 3) {
    out = ',' + s.slice(-3) + out;
    s = s.slice(0, -3);
  }
  return '$' + s + out;
}

/** mm:ss timer text, seconds in. */
export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** Speed in mph given px/s (tuned so ~118 px/s cruise feels like ~35 mph). */
export function pxToMph(v) {
  return Math.abs(v) * 0.3;
}

/** Inclusive integer range helper. */
export function irand(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

/** Unique-ish ids for effects and entities. */
let nextId = 1;
export function uid() {
  return nextId++;
}

/** Pick a colour channel string from a small palette. */
export function pickColor(list, r) {
  return list[Math.floor(r * list.length) % list.length];
}

/** True when two circles overlap. */
export function circleHit(ax, ay, ar, bx, by, br) {
  const dx = bx - ax, dy = by - ay;
  const rr = ar + br;
  return dx * dx + dy * dy <= rr * rr;
}

/** Serialize a rect-ish object compactly for save files. */
export function compactRect(r) {
  return [Math.round(r.x0), Math.round(r.y0), Math.round(r.x1), Math.round(r.y1)];
}

/** Fade helper: 0..1 over dur, hold at ends. */
export function fade01(t, dur) {
  return clamp(t / dur, 0, 1);
}

/** Ease functions used by screens and flashes. */
export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3),
  inCubic: (t) => Math.pow(clamp(t, 0, 1), 3),
  outQuad: (t) => 1 - (1 - clamp(t, 0, 1)) * (1 - clamp(t, 0, 1)),
  pulse: (t) => 0.5 + 0.5 * Math.sin(t * TAU),
};
