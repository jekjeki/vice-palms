// Shared math: the small helpers every other module reaches for, kept free of game state.

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

/** Linear blend of a toward b by t in [0,1] — the easing behind every smoothed camera. */
export function lerp(a, b, t) { return a + (b - a) * t; }

/** Inverse of lerp: where t lands between a and b, clamped to [0,1]. */
export function invLerp(a, b, v) { return a === b ? 0 : clamp((v - a) / (b - a), 0, 1); }

/** Quadratic ease-out, for UI counters and banner fades that should land softly. */
export function easeOut(t) { const s = 1 - clamp(t, 0, 1); return 1 - s * s; }

/** Shortest signed turn from angle a toward angle b, in (-PI, PI]. */
export function turnDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Rotate angle a toward angle b by at most maxStep radians — dampened turrets and drift. */
export function turnToward(a, b, maxStep) {
  const d = turnDelta(a, b);
  return a + clamp(d, -maxStep, maxStep);
}

/** Deterministic 2D hash in [0,1) — used for window lights and asphalt variation. */
export function hash01(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Push a circle out of an axis-aligned rect along the shallowest escape axis. */
export function circlePush(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    return { x: (dx / d) * (r - d), y: (dy / d) * (r - d) };
  }
  const west = cx - rx, east = rx + rw - cx, north = cy - ry, south = ry + rh - cy;
  const m = Math.min(west, east, north, south);
  if (m === west) return { x: -(west + r), y: 0 };
  if (m === east) return { x: east + r, y: 0 };
  if (m === north) return { x: 0, y: -(north + r) };
  return { x: 0, y: south + r };
}
