// ============================================================
// DISTRICT MAP — the North Docks on the minimap.
//
// Stamps the district onto the HUD's pre-rendered map (piers,
// yards, roads, shore, island, turf tints, landmark pins) and
// provides the live blip pass: the ferry, the heist marker, an
// active skirmish and drive-by, plus fog-of-war shading from
// the weather system.
// ============================================================

import { GRID, PITCH, SPAN, SAND } from '../config.js';
import { DOCKS_WATER_Y, DOCKS_NORTH_Y } from '../world/district.js';

const MAP_PX = 760;
const STYLE = {
  water: '#0c2033',
  land: '#26282f',
  road: '#8d93a8',
  pier: '#6b4f33',
  yard: '#2c2f36',
  warehouse: '#4a4e56',
  island: '#8a744c',
  tides: 'rgba(255,85,51,0.18)',
  cinders: 'rgba(51,170,255,0.18)',
};

// ------------------------------------------------------------
// Static pass — stamped into hud.underlay once per attach().
// `k` is the baked map scale (MAP_PX / full span), `north` is how
// much world sits above y=0 (the docks depth), so the map grows
// upward without moving the city.
// ------------------------------------------------------------
export function stampDocksMap(g, game, kx, ky, north, mapPx) {
  const docks = game.docks;
  if (!docks) return;

  // World y maps to (y + north) * ky; world x maps to x * kx.
  const wx = (worldX) => worldX * kx;
  const wy = (worldY) => (worldY + north) * ky;

  // Bay water behind everything.
  g.fillStyle = STYLE.water;
  g.fillRect(0, 0, mapPx, wy(DOCKS_WATER_Y));

  // Dock apron.
  g.fillStyle = STYLE.land;
  g.fillRect(0, wy(DOCKS_WATER_Y), SPAN * kx, (0 - DOCKS_WATER_Y) * ky);

  // Roads.
  g.strokeStyle = STYLE.road;
  g.lineWidth = Math.max(1, 90 * kx * 0.8);
  g.beginPath();
  for (const r of docks.roads) {
    if (r.kind === 'v') {
      g.moveTo(wx(r.x), wy(r.y));
      g.lineTo(wx(r.x), wy(r.y + r.h));
    } else {
      g.moveTo(wx(r.x), wy(r.y + r.h / 2));
      g.lineTo(wx(r.x + r.w), wy(r.y + r.h / 2));
    }
  }
  g.stroke();

  // Piers.
  g.fillStyle = STYLE.pier;
  for (const p of docks.piers) {
    g.fillRect(wx(p.x), wy(p.y), p.w * kx, p.h * ky);
  }

  // Yards and warehouses.
  for (const yd of docks.yards) {
    g.fillStyle = STYLE.yard;
    g.fillRect(wx(yd.x0), wy(yd.y0), (yd.x1 - yd.x0) * kx, (yd.y1 - yd.y0) * ky);
  }
  for (const w of docks.warehouses) {
    g.fillStyle = STYLE.warehouse;
    g.fillRect(wx(w.x), wy(w.y), w.w * kx, w.h * ky);
  }

  // Island.
  const isl = docks.island;
  if (isl) {
    g.fillStyle = STYLE.island;
    g.beginPath();
    g.ellipse(wx(isl.x), wy(isl.y), isl.rx * kx, isl.ry * ky, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Gang turf tints.
  for (const t of docks.gangTurf) {
    g.fillStyle = t.gang === 'tides' ? STYLE.tides : STYLE.cinders;
    g.fillRect(wx(t.x0), wy(t.y0), (t.x1 - t.x0) * kx, (t.y1 - t.y0) * ky);
  }

  // Landmark pins: the lighthouse, the ship, the harbormaster, the slip.
  for (const prop of docks.props) {
    if (prop.icon === 'pier') continue;
    const colors = {
      lighthouse: '#e8e4da',
      ship: '#7dd4ff',
      office: '#ffd98a',
      ferry: '#ffb84d',
      market: '#ff9d6b',
      yard: '#c7a23a',
      warehouse: '#9aa0a6',
      rail: '#b0895a',
    };
    const c = colors[prop.icon];
    if (!c) continue;
    g.fillStyle = c;
    g.beginPath();
    g.arc(wx(prop.x), wy(prop.y), 3, 0, Math.PI * 2);
    g.fill();
  }

  // "NORTH DOCKS" label.
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.font = 'bold 11px Consolas, monospace';
  g.textAlign = 'center';
  g.fillText('NORTH DOCKS', wx(SPAN / 2), wy(DOCKS_WATER_Y + 60));
}

// ------------------------------------------------------------
// Live pass — blips drawn over the minimap every frame.
// (mx, my) = minimap centre; r = radius; toMini(wx, wy) -> [x, y]
// already includes the north offset in the HUD's coordinate map.
// ------------------------------------------------------------
export function drawDocksBlips(ctx, game, toMini, mx, my, r) {
  const docks = game.docks;
  if (!docks) return;

  // The ferry: a white hull dot with a trailing wake tick.
  if (game.ferry) {
    const [fx, fy] = toMini(game.ferry.x, game.ferry.y);
    if (Math.hypot(fx - mx, fy - my) < r - 4) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(fx, fy, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx - 5, fy + 5);
      ctx.stroke();
    }
  }

  // The heist marker in gold ring form (on top of missions marker).
  const hm = game.heists?.marker();
  if (hm) {
    const [hx, hy] = toMini(hm.x, hm.y);
    const cx = clampN(hx, mx - r + 10, mx + r - 10);
    const cy = clampN(hy, my - r + 10, my + r - 10);
    ctx.strokeStyle = hm.color;
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.stroke();
  }

  // A live skirmish: two flashing dots (red vs blue).
  const sk = game.gangs?.skirmish;
  if (sk) {
    const [sx, sy] = toMini(sk.x, sk.y);
    if (Math.hypot(sx - mx, sy - my) < r - 6) {
      const blink = Math.floor(game.time * 4) % 2 === 0;
      ctx.fillStyle = blink ? '#ff5533' : '#33aaff';
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = blink ? '#33aaff' : '#ff5533';
      ctx.beginPath(); ctx.arc(sx - 6, sy, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Hideouts: small crew-colored diamonds.
  for (const h of docks.hideouts) {
    const [hx2, hy2] = toMini(h.x, h.y);
    if (Math.hypot(hx2 - mx, hy2 - my) < r - 6) {
      ctx.fillStyle = h.gang === 'tides' ? '#ff5533' : '#33aaff';
      ctx.save();
      ctx.translate(hx2, hy2);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
      ctx.restore();
    }
  }

  // Weather fog-of-war over the whole map circle.
  const fog = game.weather?.fogOfWarCell;
  if (fog) {
    const FOW_N = game.weather.FOW_N;
    const cell = game.weather.FOW_CELL;
    ctx.save();
    for (let gz = 0; gz < FOW_N; gz++) {
      for (let gx = 0; gx < FOW_N; gx++) {
        const v = game.weather.state.fogOfWar[gz * FOW_N + gx];
        if (v >= 0.96) continue;
        const [wx0, wy0] = toMini(gx * cell, gz * cell - 4700);
        const [wx1, wy1] = toMini((gx + 1) * cell, (gz + 1) * cell - 4700);
        ctx.fillStyle = `rgba(6,10,18,${(0.66 * (1 - v)).toFixed(3)})`;
        ctx.fillRect(wx0, wy0, wx1 - wx0 + 1, wy1 - wy0 + 1);
      }
    }
    ctx.restore();
  }
}

function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ------------------------------------------------------------
// Legend (docs / debug).
// ------------------------------------------------------------
export function docksLegend() {
  return [
    { color: STYLE.water, label: 'Bay water' },
    { color: STYLE.land, label: 'Dock apron' },
    { color: STYLE.pier, label: 'Piers A–E' },
    { color: STYLE.yard, label: 'Container yards' },
    { color: STYLE.warehouse, label: 'Warehouses' },
    { color: STYLE.island, label: 'Bay Marina island' },
  ];
}
