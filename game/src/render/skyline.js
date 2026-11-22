// The sky: a real time-of-day pass instead of a flat fill. Vice Palms keeps its
// palette nocturnal — the loop runs dusk to pre-dawn and wraps — but the gradient
// moves hour by hour: sunset fire at 19:00, deep blue-black by midnight, a violet
// breath before the wrap. Stars wheel slowly, the moon rides its arc, clouds drift
// with parallax, and a distant city silhouette ring crowns the northern horizon
// with the airfield's glow dome breathing on it.
//
// One hour of game sky takes 26 real seconds, so a staged screenshot can pick any
// mood it wants by setting game.time.

import { clamp, TAU, hash01 } from '../util.js';
import { DOCKS_NORTH_Y } from '../world/district.js';
import { AIR, airportCenter } from '../world/airport.js';

const HOUR_SECS = 26;        // real seconds per game hour
const HOUR_BASE = 19;        // the loop starts at dusk
const HOUR_SPAN = 10.4;      // 19:00 → 05:24, then wraps back to dusk

/** Sky colors keyed by hour: top, mid and horizon tones plus a warm horizon boost. */
const SKY_STOPS = [
  { h: 19.0, top: '#241b3e', mid: '#5b2a4a', low: '#b4503c', warm: 0.85 },
  { h: 20.2, top: '#141a33', mid: '#26244a', low: '#4a2c50', warm: 0.35 },
  { h: 21.6, top: '#0b0e1e', mid: '#141830', low: '#20263f', warm: 0.08 },
  { h: 24.0, top: '#080b18', mid: '#0e1226', low: '#161b30', warm: 0 },
  { h: 2.2,  top: '#080b18', mid: '#0e1226', low: '#161b30', warm: 0 },
  { h: 4.0,  top: '#0c1024', mid: '#1a1c38', low: '#2c2444', warm: 0.1 },
  { h: 5.2,  top: '#1c1836', mid: '#42284a', low: '#7c3c44', warm: 0.55 },
];

function hexOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** The hour this frame shows, plus how deep the night is (0 dusk → 1 midnight). */
export function hourOf(game) {
  const h = HOUR_BASE + ((game.time / HOUR_SECS) % HOUR_SPAN);
  const night = h <= 19 ? 0 : clamp((h - 19.4) / 2.2, 0, 1);
  return { h, night };
}

function paletteAt(h) {
  // Wrap-aware search: stops are sorted, the last stop blends back into the first.
  const stops = SKY_STOPS;
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (h >= stops[i].h && h <= stops[i + 1].h) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const t = a.h === b.h ? 0 : clamp((h - a.h) / (b.h - a.h), 0, 1);
  return {
    top: mix(hexOf(a.top), hexOf(b.top), t),
    mid: mix(hexOf(a.mid), hexOf(b.mid), t),
    low: mix(hexOf(a.low), hexOf(b.low), t),
    warm: a.warm + (b.warm - a.warm) * t,
  };
}

// Star field: fixed lattice positions, hashed, so no two runs differ.
const STARS = [];
for (let i = 0; i < 170; i++) {
  STARS.push({
    u: hash01(i * 3.7 + 1, i * 9.1),
    v: hash01(i * 5.3 + 2, i * 2.9) * 0.62,
    s: 0.6 + hash01(i, i * 1.7) * 1.5,
    tw: hash01(i * 2.2, i * 4.4) * TAU,
  });
}

// Clouds: slow parallax puffs at three depths.
const CLOUDS = [];
for (let i = 0; i < 11; i++) {
  CLOUDS.push({
    u: hash01(i * 7.7 + 3, i * 1.3),
    v: 0.06 + hash01(i * 3.1, i * 8.8) * 0.4,
    s: 0.5 + hash01(i * 1.9, i * 5.5) * 1.1,
    spd: 0.004 + hash01(i * 2.6, i * 6.2) * 0.007,
    puffs: 3 + (i % 3),
  });
}

/** The main sky fill: gradient, stars, moon, clouds. Screen space, no transform. */
export function paintSky(ctx, game, W, H) {
  const { h, night } = hourOf(game);
  game.skyline = game.skyline || { night: 1 };
  game.skyline.night = night;

  const pal = paletteAt(h);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgb(pal.top));
  g.addColorStop(0.55, rgb(pal.mid));
  g.addColorStop(1, rgb(pal.low));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Warm horizon band at the dusk and dawn shoulders.
  if (pal.warm > 0.02) {
    const wg = ctx.createLinearGradient(0, H * 0.72, 0, H);
    wg.addColorStop(0, 'rgba(255,140,70,0)');
    wg.addColorStop(1, `rgba(255,${Math.round(120 + pal.warm * 60)},60,${(pal.warm * 0.38).toFixed(3)})`);
    ctx.fillStyle = wg;
    ctx.fillRect(0, H * 0.6, W, H * 0.4);
  }

  drawStars(ctx, game, W, H, night, h);
  drawMoon(ctx, game, W, H, h, night);
  drawClouds(ctx, game, W, H, night, pal);
  drawShootingStars(ctx, game, W, H, night);
  drawSatellite(ctx, game, W, H, night);
}

function drawStars(ctx, game, W, H, night, h) {
  if (night < 0.12) return;
  // Slow wheel around a point above the top edge; parallax nudges with the camera.
  const cx = W * 0.5, cy = -H * 0.9;
  const wheel = (game.time / HOUR_SECS) * 0.05;
  for (const st of STARS) {
    const a0 = Math.atan2(st.v * H - cy, st.u * W - cx) + wheel;
    const r = Math.hypot(st.u * W - cx, st.v * H - cy);
    let x = cx + Math.cos(a0) * r;
    let y = cy + Math.sin(a0) * r;
    // Parallax nudge: the sky leans a few pixels against the camera.
    x -= (game.camera?.x ?? 0) * 0.012;
    y -= (game.camera?.y ?? 0) * 0.012;
    if (x < -10 || x > W + 10 || y < -10 || y > H * 0.8) continue;
    const tw = 0.55 + 0.45 * Math.sin(game.time * 1.7 + st.tw);
    ctx.fillStyle = `rgba(220,228,255,${(0.5 * night * tw).toFixed(3)})`;
    ctx.fillRect(x, y, st.s, st.s);
    if (st.s > 1.6) {
      ctx.fillStyle = `rgba(220,228,255,${(0.16 * night * tw).toFixed(3)})`;
      ctx.fillRect(x - st.s, y, st.s * 3, st.s * 0.6);
    }
  }
}

function drawMoon(ctx, game, W, H, h, night) {
  // The moon rides one arc per night: up after 20:00, gone before the wrap.
  const t = clamp((h - 20) / 9, 0, 1);
  if (t <= 0 || t >= 1) return;
  const x = W * (0.18 + 0.64 * t);
  const y = H * (0.52 - Math.sin(t * Math.PI) * 0.44);
  const r = Math.min(W, H) * 0.032;
  // Halo.
  const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 4);
  g.addColorStop(0, `rgba(214,228,255,${0.3 * night})`);
  g.addColorStop(1, 'rgba(214,228,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 4, 0, TAU); ctx.fill();
  // Disc with a bite and a couple of maria.
  ctx.fillStyle = `rgba(226,234,252,${0.92 * Math.max(0.4, night)})`;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(148,164,196,0.5)';
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.2, r * 0.3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.25, y + r * 0.3, r * 0.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.4, y - r * 0.35, r * 0.14, 0, TAU); ctx.fill();
}

function drawClouds(ctx, game, W, H, night, pal) {
  for (const c of CLOUDS) {
    const drift = ((c.u + game.time * c.spd) % 1.25) - 0.12;
    const x = drift * W;
    const y = c.v * H;
    const s = c.s * Math.min(W, H) * 0.055;
    // Parallax: deeper clouds lean less.
    const lean = ((game.camera?.x ?? 0) * 0.004 * c.s) % W;
    const cxp = x - lean;
    if (cxp < -260 || cxp > W + 260) continue;
    // Dusk clouds catch fire; midnight clouds go almost black.
    const warm = pal.warm * (0.5 + c.v);
    const rC = Math.round(30 + warm * 190);
    const gC = Math.round(26 + warm * 90);
    const bC = Math.round(44 + warm * 40);
    const alpha = 0.1 + night * 0.1;
    for (let k = 0; k < c.puffs; k++) {
      const px = cxp + (k - c.puffs / 2) * s * 1.15;
      const py = y + Math.sin(k * 2.4 + c.u * 9) * s * 0.24;
      const pr = s * (0.7 + 0.5 * hash01(k * 3, c.u * 100));
      const g = ctx.createRadialGradient(px, py, pr * 0.2, px, py, pr);
      g.addColorStop(0, `rgba(${rC},${gC},${bC},${alpha})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- small sky events

// Two shooting stars per night-hour on average: a streak with a fading tail,
// spawned deterministically from the clock so replays match.
function drawShootingStars(ctx, game, W, H, night) {
  if (night < 0.3) return;
  const slot = Math.floor(game.time / 13);
  const seed = hash01(slot * 17.3, slot * 9.7);
  if (seed > 0.38) return;                       // most slots are quiet
  const life = 1.1;
  const t = (game.time % 13) / life;
  if (t > 1) return;
  const x0 = (0.1 + hash01(slot, 3) * 0.8) * W;
  const y0 = (0.05 + hash01(slot, 5) * 0.3) * H;
  const ang = Math.PI * (0.62 + hash01(slot, 7) * 0.3);
  const speed = W * 0.34;
  const x = x0 + Math.cos(ang) * speed * t;
  const y = y0 + Math.sin(ang) * speed * t;
  const fade = Math.sin(t * Math.PI);
  // Tail: a short bright streak behind the head.
  const tail = 46 + hash01(slot, 11) * 40;
  const g = ctx.createLinearGradient(x, y, x - Math.cos(ang) * tail, y - Math.sin(ang) * tail);
  g.addColorStop(0, `rgba(235,242,255,${(0.85 * fade * night).toFixed(3)})`);
  g.addColorStop(1, 'rgba(235,242,255,0)');
  ctx.strokeStyle = g;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(ang) * tail, y - Math.sin(ang) * tail);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,255,255,${(0.9 * fade).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
}

// A slow high satellite: one steady dot crossing the whole sky every 47
// seconds, no twinkle, no tail — the kind of thing you only notice if you
// stare. Free world-building.
function drawSatellite(ctx, game, W, H, night) {
  if (night < 0.35) return;
  const period = 47;
  const t = (game.time % period) / period;
  const x = t * (W + 240) - 120;
  const y = H * (0.1 + hash01(9, 2) * 0.16) + Math.sin(t * Math.PI) * 14;
  ctx.fillStyle = `rgba(220,230,255,${(0.5 * night).toFixed(3)})`;
  ctx.fillRect(x, y, 1.6, 1.6);
}

// ---------------------------------------------------------------- far ring

// The distant skyline is generated once: a jagged tower ring standing on the
// northern horizon, with lit windows and two red beacons.
const RING = [];
{
  let x = 0;
  let k = 0;
  while (x < 2600) {
    const w = 60 + hash01(k * 3.1, 7) * 120;
    const hgt = 40 + hash01(k * 5.7, 11) * 150;
    RING.push({ x, w, h: hgt, tier: hash01(k, 3) > 0.72 ? 1 : 0 });
    x += w + 14 + hash01(k * 2.3, 5) * 60;
    k++;
  }
}

// A second, farther ring: sparse tall towers standing deeper behind the first,
// drawn first so the near ring reads in front of it.
const RING_FAR = [];
{
  let x = -300;
  let k = 0;
  while (x < 3200) {
    const w = 90 + hash01(k * 7.3, 13) * 150;
    const hgt = 120 + hash01(k * 9.7, 17) * 210;
    RING_FAR.push({ x, w, h: hgt });
    x += w + 120 + hash01(k * 4.1, 19) * 340;
    k++;
  }
}

/**
 * World-space silhouette ring along the docks horizon (y = DOCKS_NORTH_Y).
 * Painted right after the base pass begins, so the whole city stands in front of it.
 */
export function paintFarRing(ctx, game, cam, view) {
  // Only when the camera is far enough north to see the horizon at all.
  if (cam.y > DOCKS_NORTH_Y + 1500) return;
  const horizon = DOCKS_NORTH_Y;
  ctx.save();
  // The ring sits behind everything: fixed parallax of 0.22 on the camera.
  ctx.translate(-cam.x * 0.22, -cam.y * 0.08);
  const anchorX = cam.x * 0.78 - 1300;
  const night = game.skyline?.night ?? 1;

  // Horizon haze: a thin band of atmosphere where the land gives up.
  const haze = ctx.createLinearGradient(0, horizon - 190, 0, horizon + 30);
  haze.addColorStop(0, 'rgba(70,90,140,0)');
  haze.addColorStop(1, `rgba(88,104,150,${(0.2 + night * 0.12).toFixed(3)})`);
  ctx.fillStyle = haze;
  ctx.fillRect(anchorX - 400, horizon - 190, 3600, 220);

  // Far tier first: dimmer, taller, slower to catch the eye.
  ctx.fillStyle = 'rgba(14,16,30,0.9)';
  for (const t of RING_FAR) {
    const x = anchorX + t.x;
    if (x > view.x1 + 200 || x + t.w < view.x0 - 200) continue;
    ctx.fillRect(x, horizon - t.h, t.w, t.h + 6);
  }
  // A couple of aviation lights on the far towers, blinking out of phase.
  const blink2 = (game.time * 0.5) % 1 < 0.4;
  if (blink2) {
    for (let k = 0; k < RING_FAR.length; k += 3) {
      const t = RING_FAR[k];
      ctx.fillStyle = 'rgba(255,120,110,0.55)';
      ctx.beginPath(); ctx.arc(anchorX + t.x + t.w / 2, horizon - t.h - 4, 2, 0, TAU); ctx.fill();
    }
  }

  // Tower silhouettes.
  ctx.fillStyle = 'rgba(10,12,24,0.92)';
  for (const t of RING) {
    const x = anchorX + t.x;
    ctx.fillRect(x, horizon - t.h - (t.tier ? t.h * 0.4 : 0), t.w, t.h + (t.tier ? t.h * 0.4 : 0) + 4);
  }
  // Lit windows: sparse warm dots on the nearer towers.
  for (const t of RING) {
    if (t.tier) continue;
    const x = anchorX + t.x;
    if (x < view.x0 - 200 || x > view.x1 + 200) continue;
    for (let wy = 8; wy < t.h - 6; wy += 14) {
      for (let wx = 6; wx < t.w - 6; wx += 12) {
        const lit = hash01(x + wx, horizon - wy);
        if (lit > 0.86) {
          ctx.fillStyle = `rgba(255,214,150,${(0.5 * night).toFixed(3)})`;
          ctx.fillRect(x + wx, horizon - wy, 2.4, 3.4);
        }
      }
    }
  }
  // Two blinking beacons on the tallest tier towers.
  const blink = (game.time * 0.8) % 1 < 0.5;
  if (blink) {
    for (const t of RING) {
      if (!t.tier) continue;
      const x = anchorX + t.x + t.w / 2;
      ctx.fillStyle = 'rgba(255,90,90,0.8)';
      ctx.beginPath(); ctx.arc(x, horizon - t.h * 1.42, 2.6, 0, TAU); ctx.fill();
    }
  }

  // The airfield's glow dome: light pollution hanging over the field's bearing.
  // The dome drifts with the same 0.56 apparent rate as the ring towers.
  const domeX = anchorX + 1300 + ((airportCenter().x * 0.56) % 2600);
  const domeY = horizon + 60;
  const dome = ctx.createRadialGradient(domeX, domeY, 10, domeX, domeY, 560);
  dome.addColorStop(0, `rgba(255,214,150,${(0.14 * night).toFixed(3)})`);
  dome.addColorStop(0.5, `rgba(255,190,120,${(0.05 * night).toFixed(3)})`);
  dome.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = dome;
  ctx.beginPath(); ctx.ellipse(domeX, domeY, 560, 260, 0, 0, TAU); ctx.fill();

  // Airport beacon: the tower's white-green pulse reaching over the ring.
  if ((game.time * 0.9) % 1 < 0.22) {
    ctx.fillStyle = `rgba(190,255,220,${(0.7 * night).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(domeX, horizon - 150, 3, 0, TAU); ctx.fill();
  }

  // Harbor traffic on the far water: a slow pair of running lights slides the
  // horizon, one warm one cold, passing behind the tower ring.
  const cross = ((game.time * 0.014) % 1.3) - 0.15;
  const boatX = anchorX + cross * 3400;
  const boatY = horizon - 26 - Math.sin(cross * 9) * 3;
  ctx.fillStyle = `rgba(255,214,150,${(0.75 * night).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(boatX, boatY, 2.2, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(140,220,255,${(0.7 * night).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(boatX + 10, boatY + 1, 1.8, 0, TAU); ctx.fill();
  ctx.restore();
}

/** Dusk time value for staged shots: set game.time to this for the cover mood. */
export function duskTime() {
  return (19.55 - HOUR_BASE) * HOUR_SECS;
}
