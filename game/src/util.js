// Vice Palms — small math / formatting helpers shared by every module.

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(k, dt) {
  return 1 - Math.exp(-k * dt);
}

export function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function dist(x1, y1, x2, y2) {
  return Math.sqrt(dist2(x1, y1, x2, y2));
}

export function len(x, y) {
  return Math.sqrt(x * x + y * y);
}

/** Wrap an angle difference into [-PI, PI]. */
export function angDiff(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Rotate angle a toward angle b by at most max radians. */
export function angLerp(a, b, max) {
  const d = angDiff(b - a);
  return a + clamp(d, -max, max);
}

export function ptInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function rectOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Closest point of rect r to (x, y) plus the distance to it. */
export function closestOnRect(x, y, r) {
  const cx = clamp(x, r.x, r.x + r.w);
  const cy = clamp(y, r.y, r.y + r.h);
  return { x: cx, y: cy, d: dist(x, y, cx, cy) };
}

export function fmtMoney(n) {
  const v = Math.max(0, Math.round(n));
  return '$' + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  const m = (t / 60) | 0;
  const ss = t % 60;
  return m + ':' + String(ss).padStart(2, '0');
}

/** Pick a random element (rng is a mulberry-style fn returning [0,1)). */
export function choice(rng, arr) {
  return arr[(rng() * arr.length) | 0];
}

/** Draw rounded-rect path on a context (no fill/stroke). */
export function rrPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Shade a #rrggbb color by factor f (1 = unchanged, <1 darker, >1 lighter). */
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/** rgba() string from a #rrggbb color and alpha. */
export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/** Text with a hard drop shadow, the HUD workhorse. */
export function shadowText(ctx, txt, x, y, size, col, align, font, shadowCol) {
  ctx.font = (font || 'bold ') + size + 'px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = shadowCol || 'rgba(0,0,0,0.75)';
  ctx.fillText(txt, x + 2, y + 2);
  ctx.fillStyle = col;
  ctx.fillText(txt, x, y);
}
