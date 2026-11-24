// util.js — small math and geometry helpers shared by every module.

export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.hypot(dx, dy);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

/** Angle wrapped to (-PI, PI]. */
export function wrapAng(a) {
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
}

/** Shortest angular difference from a to b, wrapped. */
export function angDiff(a, b) {
  return wrapAng(b - a);
}

/** Interpolate angle along the shortest arc. */
export function angLerp(a, b, t) {
  return a + angDiff(a, b) * clamp(t, 0, 1);
}

export function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Closest point on a rect to p; also returns the penetration axis hint. */
export function closestOnRect(px, py, r) {
  const cx = clamp(px, r.x, r.x + r.w);
  const cy = clamp(py, r.y, r.y + r.h);
  return { x: cx, y: cy };
}

/** Push a circle out of an axis-aligned rect; returns null when no overlap. */
export function circleRectResolve(px, py, pr, r) {
  const cx = clamp(px, r.x, r.x + r.w);
  const cy = clamp(py, r.y, r.y + r.h);
  const dx = px - cx, dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > pr * pr) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    return { x: px + (dx / d) * (pr - d), y: py + (dy / d) * (pr - d), nx: dx / d, ny: dy / d, push: pr - d };
  }
  // center inside the rect: push along the smallest exit axis
  const left = px - r.x, right = r.x + r.w - px, top = py - r.y, bot = r.y + r.h - py;
  const m = Math.min(left, right, top, bot);
  if (m === left) return { x: r.x - pr, y: py, nx: -1, ny: 0, push: pr + left };
  if (m === right) return { x: r.x + r.w + pr, y: py, nx: 1, ny: 0, push: pr + right };
  if (m === top) return { x: px, y: r.y - pr, nx: 0, ny: -1, push: pr + top };
  return { x: px, y: r.y + r.h + pr, nx: 0, ny: 1, push: pr + bot };
}

/** A circle overlapping an axis-aligned rect at all. */
export function circleRectHit(px, py, pr, r) {
  const cx = clamp(px, r.x, r.x + r.w);
  const cy = clamp(py, r.y, r.y + r.h);
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= pr * pr;
}

/** Push a circle out of every solid it touches. Mutates nothing but returns the new position. */
export function resolveCircleSolids(x, y, r, solids) {
  let hit = false;
  for (let i = 0; i < solids.length; i++) {
    const res = circleRectResolve(x, y, r, solids[i]);
    if (res) {
      x = res.x;
      y = res.y;
      hit = true;
    }
  }
  return { x, y, hit };
}

export function fmtMoney(n) {
  const s = Math.max(0, Math.round(n)).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    out += s[i];
    const rest = s.length - 1 - i;
    if (rest > 0 && rest % 3 === 0) out += ',';
  }
  return '$' + out;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

export function aabbOf(x, y, w, l, ang) {
  // bounding box of a rotated rect (w across, l along heading) centered at x,y
  const c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang));
  const hw = (w * c + l * s) / 2;
  const hh = (w * s + l * c) / 2;
  return { x: x - hw, y: y - hh, w: hw * 2, h: hh * 2 };
}

export function shade(hex, f) {
  // f>0 lighten toward white, f<0 darken toward black
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) {
    r = Math.round(r + (255 - r) * f);
    g = Math.round(g + (255 - g) * f);
    b = Math.round(b + (255 - b) * f);
  } else {
    const k = 1 + f;
    r = Math.round(r * k);
    g = Math.round(g * k);
    b = Math.round(b * k);
  }
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
