// mapscreen.js — TAB: full city map overlay with POIs, markers and the player
import { CFG } from './config.js';
import { TAU } from './util.js';
import { BUS_LOOP } from './transit.js';

export function updateMap(game, dt) {
  if (game.state !== 'map') return;
  if (game.input.pressed('TAB') || game.input.pressed('ESC')) {
    game.state = 'play';
  }
}

export function drawMap(game, ctx) {
  const W = CFG.VIEW_W, H = CFG.VIEW_H;
  ctx.fillStyle = 'rgba(3,3,10,0.88)';
  ctx.fillRect(0, 0, W, H);

  const size = Math.min(W, H) - 120;
  const ox = (W - size) / 2, oy = (H - size) / 2;
  const s = size / Math.max(CFG.W, CFG.H);
  const T = (x, y) => ({ x: ox + x * s, y: oy + y * s });

  // title
  ctx.textAlign = 'center';
  ctx.font = '800 26px "Segoe UI", sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText('VICE PALMS — CITY MAP', W / 2, oy - 22);
  ctx.font = '600 13px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(200,200,215,0.6)';
  ctx.fillText('TAB or ESC to close', W / 2, oy - 4);

  // frame
  ctx.strokeStyle = 'rgba(255,209,102,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, size, size);
  ctx.fillStyle = '#0b0b14';
  ctx.fillRect(ox, oy, size, size);

  // water + sand + park
  let a = T(0, CFG.HARBOR_N);
  ctx.fillStyle = '#0a1626';
  ctx.fillRect(ox, a.y, size, (CFG.HARBOR_N + 900) * s - 0);
  a = T(0, CFG.OCEAN_S);
  ctx.fillRect(ox, a.y, size, size);
  a = T(0, CFG.SAND_S);
  ctx.fillStyle = '#8a7a52';
  ctx.fillRect(ox, a.y, size, (CFG.OCEAN_S - CFG.SAND_S) * s);
  a = T(CFG.PARK.x0, CFG.PARK.y0);
  ctx.fillStyle = '#17301c';
  ctx.fillRect(a.x, a.y, (CFG.PARK.x1 - CFG.PARK.x0) * s, (CFG.PARK.y1 - CFG.PARK.y0) * s);
  a = T(CFG.AIR_W, 1300);
  ctx.fillStyle = '#10101a';
  ctx.fillRect(a.x, a.y, (CFG.W - CFG.AIR_W) * s, 1200 * s);

  // roads
  ctx.strokeStyle = '#3c3c52';
  ctx.lineWidth = Math.max(1.5, 40 * s);
  for (const y of game.world.roadH) {
    const p1 = T(0, y), p2 = T(CFG.AIR_W, y);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
  for (const x of game.world.roadV) {
    const p1 = T(x, CFG.DOCKS_S), p2 = T(x, CFG.SAND_S);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }

  // POIs
  const POI_LABELS = {
    beachhut: ['RICO HUT', '#ff5da2'], garage: ['GARAGE', '#ffd166'], marina: ['MARINA', '#00e5ff'],
    taxi: ['TAXI STAND', '#ffd166'], phonebooth: ['BOOTH', '#00e5ff'], safehouse: ['SAFEHOUSE', '#8cff5d'],
    police: ['VPD', '#4f8aff'], hospital: ['HOSPITAL', '#ff5d7d'], spray: ['SPRAY', '#ff5da2'],
    gas: ['FUEL', '#ffd166'], ammunation: ['GUNS', '#8cff5d'], food: ['FOOD', '#00e5ff'],
  };
  ctx.font = '700 9px "Segoe UI", sans-serif';
  for (const [key, [label, color]] of Object.entries(POI_LABELS)) {
    const poi = game.world.pois[key];
    if (!poi) continue;
    const pt = T(poi.x, poi.y);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, TAU); ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillText(label, pt.x + 6, pt.y + 3);
  }

  // mission markers
  for (const m of game.missions.markers) {
    const pt = T(m.x, m.y);
    ctx.fillStyle = m.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // player
  const p = game.player;
  const pt = T(p.inCar ? p.inCar.x : p.x, p.inCar ? p.inCar.y : p.y);
  const h = p.inCar ? p.inCar.h : p.h;
  ctx.save();
  ctx.translate(pt.x, pt.y);
  ctx.rotate(h + Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // bus route
  ctx.strokeStyle = 'rgba(255,209,102,0.4)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  BUS_LOOP.forEach((w, i) => {
    const q = T(w.x, w.y);
    if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'left';
}
