// ============================================================================
// VICE PALMS — util.js
// Math, collision and formatting helpers. Dependency-free.
// ============================================================================

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent exponential approach.
export function damp(a, b, rate, dt) {
  return lerp(a, b, 1 - Math.exp(-rate * dt));
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

// Wrap an angle into [-PI, PI].
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

// Shortest angular step from a to b, scaled by t.
export function angleTowards(a, b, t) {
  return a + wrapAngle(b - a) * clamp(t, 0, 1);
}

export function angleDiff(a, b) {
  return wrapAngle(b - a);
}

// --- Rects / circles ---------------------------------------------------------

export function rectContains(r, x, y) {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.h + r.y;
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function circleRectOverlap(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// Push a circle out of an AABB along the shallowest penetration axis.
// Returns null when not overlapping, else {nx, ny, depth}.
export function resolveCircleRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  let dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  }
  // Center inside the rect: push out through the nearest face.
  const left = cx - rect.x, right = rect.x + rect.w - cx;
  const top = cy - rect.y, bottom = rect.y + rect.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { nx: -1, ny: 0, depth: left + r };
  if (m === right) return { nx: 1, ny: 0, depth: right + r };
  if (m === top) return { nx: 0, ny: -1, depth: top + r };
  return { nx: 0, ny: 1, depth: bottom + r };
}

// Coarse line-of-sight: sample the segment in steps against a predicate.
export function losClear(x0, y0, x1, y1, blocked) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(len / 3));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blocked(x0 + dx * t, y0 + dy * t)) return false;
  }
  return true;
}

// --- Formatting ----------------------------------------------------------------

export function money(n) {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-$' : '$') + s;
}

export function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

export function clockStr(t) {
  // 24-h city clock, 1 game minute per real second of play, starts 22:00.
  const base = 22 * 60;
  const m = Math.floor(base + t) % (24 * 60);
  return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
}

export function timerStr(s) {
  if (s < 0) s = 0;
  const m = Math.floor(s / 60);
  return m + ':' + pad2(Math.floor(s % 60));
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// --- Small drawing helpers shared by entity renderers ---------------------------

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function shadowBlob(ctx, x, y, r, alpha = 0.28) {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.72, 0, 0, TAU);
  ctx.fill();
}

// Draw a soft radial glow (used by lights, coronas, bloom).
export function glow(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colorAt(color, alpha));
  g.addColorStop(0.55, colorAt(color, alpha * 0.42));
  g.addColorStop(1, colorAt(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function colorAt(color, alpha) {
  // Accepts '#rrggbb'.
  if (color[0] !== '#' || color.length !== 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Hex -> [r,g,b] floats, for compositing math.
export function rgbOf(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
