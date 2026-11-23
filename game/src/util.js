// util.js — math, geometry and small helpers shared by every module
export const TAU = Math.PI * 2;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.hypot(dx, dy); }
export function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
export function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
export function approach(a, b, d) { return a < b ? Math.min(a + d, b) : Math.max(a - d, b); }
export function rand(a, b) { return a + Math.random() * (b - a); }
export function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
export function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

export function now() { return performance.now() / 1000; }

export function fmtMoney(n) {
  const neg = n < 0 ? '-' : '';
  return neg + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
}
export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

// AABB helpers
export function rectsOverlap(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }
export function pointInRect(px, py, r) { return px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1; }
export function rectCenter(r) { return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }; }
export function rectW(r) { return r.x1 - r.x0; }
export function rectH(r) { return r.y1 - r.y0; }

// circle vs AABB: returns penetration correction {x,y} or null
export function circleRect(cx, cy, cr, r) {
  const nx = clamp(cx, r.x0, r.x1), ny = clamp(cy, r.y0, r.y1);
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > cr * cr) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const push = cr - d;
    return { x: (dx / d) * push, y: (dy / d) * push };
  }
  // center inside rect: push out through the nearest face
  const left = cx - r.x0, right = r.x1 - cx, top = cy - r.y0, bot = r.y1 - cy;
  const m = Math.min(left, right, top, bot);
  if (m === left) return { x: -(left + cr), y: 0 };
  if (m === right) return { x: right + cr, y: 0 };
  if (m === top) return { x: 0, y: -(top + cr) };
  return { x: 0, y: bot + cr };
}

// oriented car box (x,y,heading,len,wid) vs point
export function carContains(car, px, py, pad = 0) {
  const dx = px - car.x, dy = py - car.y;
  const c = Math.cos(-car.h), s = Math.sin(-car.h);
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return Math.abs(lx) <= car.len / 2 + pad && Math.abs(ly) <= car.wid / 2 + pad;
}

// oriented box vs circle (for car vs ped / player collisions)
export function carCircle(car, px, py, pr) {
  const dx = px - car.x, dy = py - car.y;
  const c = Math.cos(-car.h), s = Math.sin(-car.h);
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  const qx = clamp(lx, -car.len / 2, car.len / 2);
  const qy = clamp(ly, -car.wid / 2, car.wid / 2);
  const ddx = lx - qx, ddy = ly - qy;
  return ddx * ddx + ddy * ddy < pr * pr;
}

export function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) * k, 0, 255) | 0;
  const g = clamp(((n >> 8) & 255) * k, 0, 255) | 0;
  const b = clamp((n & 255) * k, 0, 255) | 0;
  return `rgb(${r},${g},${b})`;
}

export function classOf(v) { return Object.prototype.toString.call(v).slice(8, -1); }
