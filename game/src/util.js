// ---------------------------------------------------------------------------
// util.js — small math / geometry / formatting helpers shared everywhere.
// ---------------------------------------------------------------------------

export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** frame-rate independent exponential approach */
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function wrapAngle(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

export function angleDamp(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function len(x, y) {
  return Math.hypot(x, y);
}

export function aabb(x, y, w, h) {
  return { x, y, w, h, x2: x + w, y2: y + h, cx: x + w / 2, cy: y + h / 2 };
}

export function rectContains(r, x, y) {
  return x >= r.x && x < r.x2 && y >= r.y && y < r.y2;
}

export function rectsOverlap(a, b) {
  return a.x < b.x2 && a.x2 > b.x && a.y < b.y2 && a.y2 > b.y;
}

export function circleRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x2);
  const ny = clamp(cy, rect.y, rect.y2);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Push a circle out of an AABB along the shallowest axis.
 * Returns {x, y} correction or null when not overlapping.
 */
export function circleRectPushout(cx, cy, r, rect) {
  if (cx + r <= rect.x || cx - r >= rect.x2 || cy + r <= rect.y || cy - r >= rect.y2) return null;
  const left = cx - (rect.x - r);
  const right = (rect.x2 + r) - cx;
  const top = cy - (rect.y - r);
  const bottom = (rect.y2 + r) - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: -left, y: 0 };
  if (m === right) return { x: right, y: 0 };
  if (m === top) return { x: 0, y: -top };
  return { x: 0, y: bottom };
}

/** squared distance from point P to segment AB */
export function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  const qx = ax + dx * t, qy = ay + dy * t;
  return dist2(px, py, qx, qy);
}

/** does segment AB cross any solid? returns true/false — used for bullets & sight */
export function segBlocked(solids, circles, ax, ay, bx, by, step = 26) {
  const d = dist(ax, ay, bx, by);
  const n = Math.max(1, Math.ceil(d / step));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    for (const s of solids) {
      if (x >= s.x && x <= s.x2 && y >= s.y && y <= s.y2) return true;
    }
    for (const c of circles) {
      const r = c.r;
      if (dist2(x, y, c.x, c.y) <= r * r) return true;
    }
  }
  return false;
}

export function fmtMoney(n) {
  const neg = n < 0;
  n = Math.abs(Math.round(n));
  let s = String(n);
  if (n >= 1000000) s = (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  else if (n >= 10000) s = (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  else s = n.toLocaleString('en-US');
  return (neg ? '-$' : '$') + s;
}

export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

/** darken/lighten a #rrggbb colour by factor f (0..2, 1 = unchanged) */
export function shade(hex, f) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const cr = clamp(Math.round(r * f), 0, 255);
  const cg = clamp(Math.round(g * f), 0, 255);
  const cb = clamp(Math.round(b * f), 0, 255);
  return '#' + ((1 << 24) | (cr << 16) | (cg << 8) | cb).toString(16).slice(1);
}

/** #rrggbb + alpha → rgba() string */
export function rgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** ease a value with smoothstep */
export function smooth(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

export function pickWeighted(rng, entries) {
  return rng.weighted(entries);
}

/** shortest signed angle from a to b (radians) */
export function angleTo(a, b) {
  return wrapAngle(b - a);
}

/** Manhattan distance — how the city grid thinks */
export function manhattan(ax, ay, bx, by) {
  return Math.abs(bx - ax) + Math.abs(by - ay);
}

/** in-place Fisher-Yates with an RNG (deterministic with a seeded rng) */
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** fixed-timestep accumulator: returns whole steps to run (max 5) */
export function stepsFor(dt, fixed, acc) {
  acc.v += dt;
  let n = 0;
  while (acc.v >= fixed && n < 5) {
    acc.v -= fixed;
    n++;
  }
  if (n === 5) acc.v = 0; // fell too far behind — drop the backlog
  return n;
}

/** ease-out cubic for UI slides */
export function easeOut(t) {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}

/** format a compass heading in degrees */
export function headingDeg(angle) {
  let d = Math.round((angle * 180 / Math.PI + 90) % 360);
  if (d < 0) d += 360;
  return d;
}

/** rough canvas text width helper for panels */
export function textWidth(g, str, font) {
  g.save();
  g.font = font;
  const w = g.measureText(str).width;
  g.restore();
  return w;
}
