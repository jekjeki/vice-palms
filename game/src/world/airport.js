// PALM AIRFIELD — the third district, laid across the north-west quarter of the city
// grid. A working general-aviation field: one lit runway with taxiway and apron, a
// terminal with its control tower, three hangars, a fuel depot, the cargo yard, a
// service road grid that the public streets still cross (the tower waves them through),
// parked planes, a windsock, a radar dish and a night approach-light rabbit.
//
// The module owns everything about the field: geometry, solids, animation state, the
// three draw layers the painter calls (base, y-sorted items, glow) and the minimap
// stamp. Nothing here touches the network or the DOM.

import { PITCH, GRID } from '../config.js';
import { clamp, TAU, hash01 } from '../util.js';
import { remix, mulberry } from '../rng.js';

// The field sits between the public roads i=2..7 / j=2..5, fifty units inside each so
// the perimeter fence never sits on a street. Every crossing road keeps running: gates
// in the fence line up with them exactly.
export const AIR = {
  x0: 2 * PITCH + 90,   // 930
  y0: 2 * PITCH + 90,   // 930
  x1: 7 * PITCH - 90,   // 2850
  y1: 6 * PITCH - 90,   // 2430
};

// Runway 09/27: centreline, half width, thresholds.
export const RWY = { cy: 1470, hw: 45, x0: 950, x1: 2830 };
const TWY_Y = 1360;              // taxiway A, north of the runway
const TWY_HW = 21;
const APRON = { x: 950, y: 1735, w: 1250, h: 215 };
const SOUTH_Y = 2470;            // fence line, south

// Public roads that cross the field (road centreline coordinates).
const CROSS_X = [3 * PITCH, 4 * PITCH, 5 * PITCH, 6 * PITCH];   // 1260 1680 2100 2520
const CROSS_Y = [3 * PITCH, 4 * PITCH];                        // 1260 1680
const GATE = 55;                 // half width of a fence gate

const FENCE_COL = '#6a707e';
const APRON_COL = '#33363f';
const APRON_JOINT = '#383b45';
const PAINT = '#e8e4d4';
const YELLOW = '#e7c04a';
const GRASS = '#22381f';

// Buildings and their palette, close to the docks warehouse tones so both
// districts read as one industrial family at night.
const HANGAR_WALL = '#4a4038';
const HANGAR_ROOF = '#332c26';
const TERM_WALL = '#3c4560';
const CARGO_WALL = '#514a3c';

export function buildAirport(game) {
  const seed = game.seed;
  const gen = mulberry(remix(seed, 0xa17));
  const a = {
    game,
    bounds: { ...AIR },
    solids: [],
    planes: [],
    floods: [],
    masts: [],
    gates: [],
    props: [],
    t: 0,
    wind: 0.6,
    beacon: 0,
    radarAng: 0,
    night: 0,            // glow intensity, pushed by the skyline's hour
  };

  buildFence(a);
  buildYard(a, gen);
  buildPlanes(a, gen);
  buildLights(a);

  // The field claims its blocks: the generator's buildings, palms, signs and
  // stalls stand down, and the block kind flips so the HUD map and the painter
  // treat the area as open ground.
  for (let i = 2; i <= 7; i++) {
    for (let j = 2; j <= 5; j++) {
      const block = game.city.blocks[i * GRID + j];
      block.kind = 'airfield';
      block.buildings = [];
      block.palms = [];
      block.signs = [];
      block.stalls = [];
      block.lamps = [];
    }
  }
  game.city.lotCars = game.city.lotCars.filter((c) =>
    !(c.x > AIR.x0 - 10 && c.x < AIR.x1 + 10 && c.y > AIR.y0 - 10 && c.y < AIR.y1 + 10));

  // ---------------- queries ----------------

  a.inside = (x, y) => x > AIR.x0 - 10 && x < AIR.x1 + 10 && y > AIR.y0 - 10 && y < AIR.y1 + 10;

  a.solidsNear = function (x, y, out) {
    out.length = 0;
    for (let i = 0; i < a.solids.length; i++) {
      const s = a.solids[i];
      if (x > s.x - 420 && x < s.x + s.w + 420 && y > s.y - 420 && y < s.y + s.h + 420) out.push(s);
    }
    return out;
  };

  // ---------------- animation ----------------

  a.update = function (dt, time) {
    a.t += dt;
    a.wind = 0.55 + Math.sin(a.t * 0.37) * 0.4 + Math.sin(a.t * 1.7) * 0.08;
    a.radarAng += dt * 0.9;
    a.beacon = (a.t * 0.9) % 1;
    // The sky pass reports how deep the night is; the field lights answer.
    a.night = game.skyline ? game.skyline.night : 1;

    // Ramp activity: the fuel bowser works a slow loop from the depot to each
    // apron stand and back, swinging wide on the taxiway. Deterministic, so a
    // given clock always catches the same bowser at the same slab.
    const b = a.bowser;
    b.run = (b.run + dt * 0.06) % 1;
    const legs = [
      { x: 1780, y: 1870 },   // stand 1
      { x: 2280, y: 1870 },   // stand 2
      { x: 2560, y: 1900 },   // stand 3
      { x: 2180, y: 2010 },   // taxiway swing
      { x: 1400, y: 1130 },   // depot apron
      { x: 1200, y: 2010 },   // taxiway back
    ];
    const seg = Math.floor(b.run * legs.length);
    const t2 = (b.run * legs.length) % 1;
    const l0 = legs[seg], l1 = legs[(seg + 1) % legs.length];
    b.x = l0.x + (l1.x - l0.x) * t2;
    b.y = l0.y + (l1.y - l0.y) * t2;
    b.ang = Math.atan2(l1.y - l0.y, l1.x - l0.x);
    // The marshaller waves batons: figure-eight loops, faster near arrival.
    a.marshaller.phase += dt * (2.2 + a.wind * 0.6);
  };

  return a;
}

// ---------------------------------------------------------------- fences

/** Perimeter fence in four runs, each cut by gates where a public road crosses. */
function buildFence(a) {
  const segs = [];
  const push = (x, y, w, h) => segs.push({ x, y, w, h });

  // North and south: gates at every crossing vertical road.
  for (const [fy, dir] of [[AIR.y0 - 4, 1], [SOUTH_Y, -1]]) {
    let cx = AIR.x0;
    for (const gx of CROSS_X) {
      const g0 = gx - GATE, g1 = gx + GATE;
      if (g0 > cx) push(cx, fy, g0 - cx, 8);
      a.gates.push({ x: g0, y: fy, w: g1 - g0, h: 8, side: dir > 0 ? 'n' : 's', road: gx });
      cx = g1;
    }
    if (cx < AIR.x1) push(cx, fy, AIR.x1 - cx, 8);
  }
  // West and east: gates at every crossing horizontal road.
  for (const fx of [AIR.x0 - 4, AIR.x1 - 4]) {
    let cy = AIR.y0;
    for (const gy of CROSS_Y) {
      const g0 = gy - GATE, g1 = gy + GATE;
      if (g0 > cy) push(fx, cy, 8, g0 - cy);
      a.gates.push({ x: fx, y: g0, w: 8, h: g1 - g0, side: fx < 1600 ? 'w' : 'e', road: gy });
      cy = g1;
    }
    if (cy < AIR.y1) push(fx, cy, 8, AIR.y1 - cy);
  }
  for (const s of segs) a.solids.push({ ...s, tag: 'fence' });
}

// ---------------------------------------------------------------- yard

function buildYard(a, gen) {
  // Terminal block east of the apron, with the tower cab bolted to its corner.
  a.term = { x: 2565, y: 1740, w: 280, h: 210 };
  a.tower = { x: 2762, y: 1755, w: 78, h: 104 };
  a.solids.push({ ...a.term, tag: 'terminal' });
  a.solids.push({ ...a.tower, tag: 'tower' });

  // Hangars: two GA barns and the cargo shed, spread over the south cells.
  a.hangars = [
    { x: 950, y: 2020, w: 250, h: 240, name: 'PALM AIR' },
    { x: 1305, y: 2020, w: 315, h: 240, name: 'AERO CLUB' },
    { x: 2145, y: 2020, w: 315, h: 240, name: 'CARGO', cargo: true },
  ];
  for (const h of a.hangars) a.solids.push({ ...h, tag: 'hangar' });

  // Fuel depot: two tanks and a bermed pad in the north-west cells.
  a.tanks = [
    { x: 1000, y: 980, w: 130, h: 150 },
    { x: 1400, y: 980, w: 130, h: 150 },
  ];
  for (const t of a.tanks) a.solids.push({ ...t, tag: 'fuel' });

  // Cargo warehouse north, with its own apron and a parked freighter.
  a.cargo = { x: 2200, y: 960, w: 260, h: 220 };
  a.solids.push({ ...a.cargo, tag: 'cargo' });

  // Radar dish north-east, windsocks, ground props that never collide.
  a.radar = { x: 2680, y: 1010, r: 34 };
  a.windsocks = [
    { x: 1880, y: 1060 },
    { x: 1240, y: 2380 },
  ];
  a.bowser = { x: 2320, y: 1870, ang: Math.PI, run: 0, leg: 0 };
  a.carts = [
    { x: 1180, y: 1900, ang: 0.4 },
    { x: 1980, y: 1780, ang: -1.2 },
  ];
  // The marshaller works stand 1: a little figure with luminous batons.
  a.marshaller = { x: 1150, y: 1762, phase: 0 };

  // Apron floodlight masts: four corners of the apron plus the south lot pair.
  a.masts = [
    { x: 960, y: 1745 }, { x: 2190, y: 1745 }, { x: 960, y: 1940 }, { x: 2190, y: 1940 },
    { x: 1000, y: 2410 }, { x: 2760, y: 2410 },
  ];
  for (const m of a.masts) a.floods.push(m);
}

function buildPlanes(a, gen) {
  const push = (x, y, ang, type) => {
    const p = { x, y, ang, type, prop: gen() * TAU };
    a.planes.push(p);
    // One axis-aligned hull box per plane; angled tails still read fine.
    const wide = Math.abs(Math.cos(ang)) > 0.7;
    a.solids.push({
      x: wide ? x - 48 : x - 26,
      y: wide ? y - 26 : y - 48,
      w: wide ? 96 : 52,
      h: wide ? 52 : 96,
      tag: 'plane',
    });
  };
  // Three club aircraft on the apron, noses to the lead-in line.
  push(1150, 1845, -Math.PI / 2, 'ga');
  push(1650, 1845, -Math.PI / 2, 'ga');
  push(2080, 1848, -Math.PI / 2 + 0.16, 'ga');
  // The freighter sits at the cargo apron, loading door to the warehouse.
  push(2700, 1070, 0, 'cargo');
}

function buildLights(a) {
  // Runway edge lights, every 96 units, staggered slightly off the edge line.
  a.rwyEdge = [];
  for (let x = RWY.x0; x <= RWY.x1; x += 96) {
    a.rwyEdge.push({ x, y: RWY.cy - RWY.hw - 6 });
    a.rwyEdge.push({ x, y: RWY.cy + RWY.hw + 6 });
  }
  // Threshold bars: green facing an approaching plane, red facing the departure end.
  a.thresholds = [
    { x: RWY.x0 + 8, y: RWY.cy - 30 }, { x: RWY.x0 + 8, y: RWY.cy + 30 },
    { x: RWY.x1 - 8, y: RWY.cy - 30 }, { x: RWY.x1 - 8, y: RWY.cy + 30 },
  ];
  // Approach rabbit: five strobes marching toward each threshold, off the fence.
  a.strobesW = [];
  for (let k = 0; k < 5; k++) a.strobesW.push({ x: RWY.x0 - 30 - k * 56, y: RWY.cy });
  a.strobesE = [];
  for (let k = 0; k < 5; k++) a.strobesE.push({ x: RWY.x1 + 30 + k * 56, y: RWY.cy });
  // PAPI: two white, two red, left of the west threshold.
  a.papi = [];
  for (let k = 0; k < 4; k++) a.papi.push({ x: RWY.x0 + 30, y: RWY.cy - 66 + k * 18 });
  // Taxiway blue edge lights.
  a.twyEdge = [];
  for (let x = RWY.x0 + 40; x <= RWY.x1 - 40; x += 120) {
    a.twyEdge.push({ x, y: TWY_Y - TWY_HW - 5 });
    a.twyEdge.push({ x, y: TWY_Y + TWY_HW + 5 });
  }
  a.connectors = [1140, 1760, 2620];  // taxiway stubs down to the runway
}

// ---------------------------------------------------------------- draw: ground

export function drawAirportBase(ctx, a, view) {
  const { x0, x1, y0, y1 } = view;
  if (x1 < AIR.x0 - 400 || x0 > AIR.x1 + 400 || y1 < AIR.y0 - 400 || y0 > AIR.y1 + 500) return;

  // Field slab: packed earth around the fence, grass islands inside.
  ctx.fillStyle = GRASS;
  ctx.fillRect(AIR.x0, AIR.y0, AIR.x1 - AIR.x0, AIR.y1 - AIR.y0);

  // Perimeter service road hugging the fence line.
  ctx.fillStyle = '#2c2f37';
  ctx.fillRect(AIR.x0 + 12, AIR.y0 + 12, AIR.x1 - AIR.x0 - 24, 44);
  ctx.fillRect(AIR.x0 + 12, AIR.y1 - 56, AIR.x1 - AIR.x0 - 24, 44);
  ctx.fillRect(AIR.x0 + 12, AIR.y0 + 12, 44, AIR.y1 - AIR.y0 - 24);
  ctx.fillRect(AIR.x1 - 56, AIR.y0 + 12, 44, AIR.y1 - AIR.y0 - 24);

  drawApron(ctx, a);
  drawRunway(ctx, a);
  drawTaxiway(ctx, a);
  drawYardGround(ctx, a);
  drawFence(ctx, a, view);
}

function drawApron(ctx, a) {
  const r = APRON;
  ctx.fillStyle = APRON_COL;
  ctx.fillRect(r.x - 40, r.y - 30, r.w + 80, r.h + 90);
  // Concrete joints in a lazy grid.
  ctx.strokeStyle = APRON_JOINT;
  ctx.lineWidth = 2;
  for (let x = r.x - 40; x <= r.x + r.w + 40; x += 96) {
    ctx.beginPath(); ctx.moveTo(x, r.y - 30); ctx.lineTo(x, r.y + r.h + 60); ctx.stroke();
  }
  for (let y = r.y - 30; y <= r.y + r.h + 60; y += 78) {
    ctx.beginPath(); ctx.moveTo(r.x - 40, y); ctx.lineTo(r.x + r.w + 40, y); ctx.stroke();
  }
  // Three stands: corner brackets and a lead-in line to the taxiway stub.
  for (const px of [1150, 1650, 2080]) {
    ctx.strokeStyle = PAINT;
    ctx.lineWidth = 3;
    ctx.strokeRect(px - 46, r.y + 8, 92, 130);
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(px, r.y + 8); ctx.lineTo(px, TWY_Y + TWY_HW + 40); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Service lettering right on the slab.
  ctx.fillStyle = 'rgba(232,228,212,0.34)';
  ctx.font = 'bold 44px Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('PALM AIRFIELD', r.x + 30, r.y + r.h + 34);
  ctx.font = 'bold 20px Consolas, monospace';
  ctx.fillText('GA APRON — SLOT 1-3', r.x + 30, r.y + r.h + 58);

  // Helipad south-east: circle, H, touchdown ring.
  ctx.strokeStyle = PAINT;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(2690, 2330, 52, 0, TAU); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(2690, 2330, 36, 0, TAU); ctx.stroke();
  ctx.fillStyle = PAINT;
  ctx.font = 'bold 44px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('H', 2690, 2346);

  // South service lot: parking bays along the fence.
  ctx.strokeStyle = 'rgba(232,228,212,0.5)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    const bx = 1420 + k * 52;
    ctx.strokeRect(bx, 2330, 44, 92);
  }
}

function drawRunway(ctx, a) {
  const y0 = RWY.cy - RWY.hw, h = RWY.hw * 2;
  ctx.fillStyle = '#23252c';
  ctx.fillRect(RWY.x0 - 60, y0, (RWY.x1 - RWY.x0) + 120, h);
  // Edge stripes.
  ctx.fillStyle = PAINT;
  ctx.fillRect(RWY.x0 - 60, y0, (RWY.x1 - RWY.x0) + 120, 4);
  ctx.fillRect(RWY.x0 - 60, y0 + h - 4, (RWY.x1 - RWY.x0) + 120, 4);
  // Centreline dashes, 30 painted / 22 gap.
  ctx.fillStyle = 'rgba(232,228,212,0.85)';
  for (let x = RWY.x0 + 40; x < RWY.x1 - 70; x += 52) ctx.fillRect(x, RWY.cy - 3, 30, 6);
  // Threshold piano keys, eight bars per end.
  for (const [tx, dir] of [[RWY.x0 + 8, 1], [RWY.x1 - 8, -1]]) {
    for (let k = 0; k < 8; k++) {
      const y = RWY.cy - 66 + k * 18;
      ctx.fillStyle = PAINT;
      ctx.fillRect(dir > 0 ? tx : tx - 34, y, 34, 10);
    }
    // Runway designator painted on the milk bottle side.
    ctx.save();
    ctx.translate(tx + dir * 74, RWY.cy);
    ctx.rotate(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillStyle = PAINT;
    ctx.font = 'bold 44px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(dir > 0 ? '9' : '27', 0, 15);
    ctx.restore();
  }
  // Touchdown zone triplets.
  for (const [tx, dir] of [[RWY.x0 + 130, 1], [RWY.x1 - 130, -1]]) {
    ctx.fillStyle = 'rgba(232,228,212,0.8)';
    for (let k = -1; k <= 1; k++) ctx.fillRect(tx, RWY.cy + k * 22 - 3, 42, 6);
  }
  // Hold-short double lines wherever a public road meets the runway.
  ctx.strokeStyle = YELLOW;
  ctx.lineWidth = 4;
  for (const rx of CROSS_X) {
    if (rx < RWY.x0 || rx > RWY.x1) continue;
    for (const ey of [y0 - 16, y0 + h + 16]) {
      ctx.beginPath();
      ctx.moveTo(rx - 52, ey); ctx.lineTo(rx + 52, ey);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx - 52, ey + (ey < RWY.cy ? 12 : -12)); ctx.lineTo(rx + 52, ey + (ey < RWY.cy ? 12 : -12));
      ctx.stroke();
    }
  }
}

function drawTaxiway(ctx, a) {
  ctx.fillStyle = '#2a2c34';
  ctx.fillRect(RWY.x0 + 20, TWY_Y - TWY_HW, RWY.x1 - RWY.x0 - 40, TWY_HW * 2);
  ctx.fillStyle = YELLOW;
  ctx.fillRect(RWY.x0 + 40, TWY_Y - 2, RWY.x1 - RWY.x0 - 80, 4);
  for (const cx of a.connectors) {
    ctx.fillStyle = '#2a2c34';
    ctx.fillRect(cx - TWY_HW, TWY_Y - TWY_HW, TWY_HW * 2, RWY.cy + RWY.hw - (TWY_Y - TWY_HW) + 10);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(cx - 2, TWY_Y, 4, RWY.cy - TWY_Y + 10);
  }
}

function drawYardGround(ctx, a) {
  // Cargo apron in the north-east cell.
  ctx.fillStyle = '#35383f';
  ctx.fillRect(2100, 940, 640, 260);
  ctx.strokeStyle = 'rgba(232,228,212,0.4)';
  ctx.lineWidth = 2;
  for (let x = 2140; x < 2740; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 950); ctx.lineTo(x, 1190); ctx.stroke();
  }
  // Fuel berms around both tanks.
  ctx.strokeStyle = '#5b5548';
  ctx.lineWidth = 6;
  for (const t of a.tanks) ctx.strokeRect(t.x - 16, t.y - 16, t.w + 32, t.h + 32);
}

function drawFence(ctx, a, view) {
  ctx.fillStyle = FENCE_COL;
  for (const s of a.solids) {
    if (s.tag !== 'fence') continue;
    if (s.x > view.x1 || s.x + s.w < view.x0 || s.y > view.y1 || s.y + s.h < view.y0) continue;
    ctx.fillRect(s.x, s.y, s.w, s.h);
  }
  // Fence posts and the gate posts: darker stubs every 90 units.
  ctx.fillStyle = '#3d4148';
  for (const s of a.solids) {
    if (s.tag !== 'fence') continue;
    if (s.x > view.x1 || s.x + s.w < view.x0 || s.y > view.y1 || s.y + s.h < view.y0) continue;
    if (s.w > s.h) {
      for (let x = s.x; x < s.x + s.w; x += 90) ctx.fillRect(x, s.y - 1, 6, 10);
    } else {
      for (let y = s.y; y < s.y + s.h; y += 90) ctx.fillRect(s.x - 1, y, 10, 6);
    }
  }
  for (const g of a.gates) {
    ctx.fillStyle = '#8a5c3c';
    if (g.w > g.h) { ctx.fillRect(g.x - 6, g.y - 3, 8, 14); ctx.fillRect(g.x + g.w - 2, g.y - 3, 8, 14); }
    else { ctx.fillRect(g.x - 3, g.y - 6, 14, 8); ctx.fillRect(g.x - 3, g.y + g.h - 2, 14, 8); }
  }
}

// ---------------------------------------------------------------- draw: standing items

/** Standing props inside the view, pre-sorted by their base line for the painter. */
export function airportSortItems(a, view) {
  const items = [];
  const add = (kind, o, z) => items.push({ kind, o, z });
  if (a.term && a.term.y < view.y1 + 80 && a.term.y + a.term.h > view.y0 - 80) {
    add('terminal', a.term, a.term.y + a.term.h);
    add('tower', a.tower, a.tower.y + a.tower.h);
  }
  for (const h of a.hangars) add('hangar', h, h.y + h.h);
  if (a.cargo) add('cargo', a.cargo, a.cargo.y + a.cargo.h);
  for (const t of a.tanks) add('fuel', t, t.y + t.h);
  add('radar', a.radar, a.radar.y + a.radar.r);
  for (const w of a.windsocks) add('windsock', w, w.y + 10);
  for (const p of a.planes) add('plane', p, p.y + 30);
  for (const m of a.masts) add('mast', m, m.y + 8);
  add('bowser', a.bowser, a.bowser.y + 20);
  add('marshaller', a.marshaller, a.marshaller.y + 10);
  for (const c of a.carts) add('cart', c, c.y + 16);
  return items;
}

export function drawAirportItem(ctx, kind, o, a) {
  switch (kind) {
    case 'terminal': drawTerminal(ctx, o, a); break;
    case 'tower': drawTower(ctx, o, a); break;
    case 'hangar': drawHangar(ctx, o, a); break;
    case 'cargo': drawCargoShed(ctx, o, a); break;
    case 'fuel': drawTank(ctx, o, a); break;
    case 'radar': drawRadar(ctx, o, a); break;
    case 'windsock': drawWindsock(ctx, o, a); break;
    case 'plane': drawPlane(ctx, o, a); break;
    case 'mast': drawMast(ctx, o, a); break;
    case 'bowser': drawBowser(ctx, o, a); break;
    case 'marshaller': drawMarshaller(ctx, o, a); break;
    case 'cart': drawCart(ctx, o, a); break;
  }
}

function shadow(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(4,6,12,0.36)';
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, TAU);
  ctx.fill();
}

function drawTerminal(ctx, t, a) {
  shadow(ctx, t.x + t.w / 2, t.y + t.h + 8, t.w * 0.55, 12);
  // Body.
  ctx.fillStyle = TERM_WALL;
  ctx.fillRect(t.x, t.y, t.w, t.h);
  // Roof cap with a slight overhang.
  ctx.fillStyle = '#2c3350';
  ctx.fillRect(t.x - 6, t.y - 6, t.w + 12, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(t.x - 6, t.y - 6, t.w + 12, 6);
  // Glass front facing the apron (west): a lit band of windows.
  for (let wy = t.y + 18; wy < t.y + t.h - 14; wy += 30) {
    ctx.fillStyle = 'rgba(150,196,238,0.28)';
    ctx.fillRect(t.x, wy, 14, 18);
    ctx.fillStyle = 'rgba(210,232,255,0.5)';
    ctx.fillRect(t.x, wy, 3, 18);
  }
  // Doors: three gates with jet-bridge stubs.
  for (let k = 0; k < 3; k++) {
    const dy = t.y + 34 + k * 62;
    ctx.fillStyle = '#20242e';
    ctx.fillRect(t.x - 12, dy, 14, 28);
    ctx.fillStyle = '#4a5570';
    ctx.fillRect(t.x - 34, dy + 4, 22, 12);
  }
  // Wordmark on the roof.
  ctx.fillStyle = '#e8e4d4';
  ctx.font = 'bold 17px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PALM AIRFIELD', t.x + t.w / 2 - 30, t.y + 10);
}

function drawTower(ctx, tw, a) {
  shadow(ctx, tw.x + tw.w / 2, tw.y + tw.h + 6, tw.w * 0.6, 9);
  // Shaft.
  ctx.fillStyle = '#39415c';
  ctx.fillRect(tw.x, tw.y, tw.w, tw.h);
  ctx.fillStyle = '#2e3550';
  ctx.fillRect(tw.x + 4, tw.y + 8, tw.w - 8, tw.h - 16);
  // Cab: dark glass ringed by a walkway.
  ctx.fillStyle = '#1d2436';
  ctx.fillRect(tw.x - 7, tw.y - 26, tw.w + 14, 30);
  ctx.fillStyle = 'rgba(140,220,255,0.4)';
  ctx.fillRect(tw.x - 3, tw.y - 22, tw.w + 6, 20);
  // Radar spoke under the cab spins slowly.
  ctx.save();
  ctx.translate(tw.x + tw.w / 2, tw.y + tw.h - 8);
  ctx.rotate(a.radarAng);
  ctx.strokeStyle = '#c9d4ea';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
  ctx.restore();
  // Antennas.
  ctx.strokeStyle = '#8d93a8';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(tw.x + 10, tw.y - 26); ctx.lineTo(tw.x + 10, tw.y - 44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tw.x + tw.w - 10, tw.y - 26); ctx.lineTo(tw.x + tw.w - 10, tw.y - 40); ctx.stroke();
}

function drawHangar(ctx, h, a) {
  shadow(ctx, h.x + h.w / 2, h.y + h.h + 8, h.w * 0.6, 12);
  ctx.fillStyle = HANGAR_WALL;
  ctx.fillRect(h.x, h.y, h.w, h.h);
  ctx.fillStyle = HANGAR_ROOF;
  ctx.fillRect(h.x - 4, h.y - 8, h.w + 8, 20);
  // Ribbed roof: dark seams across.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = h.x + 8; x < h.x + h.w - 6; x += 22) ctx.fillRect(x, h.y - 4, 3, h.h + 6);
  // Sliding door on the south face, slightly open with warm light spilling.
  const dw = h.w * 0.62;
  const dx = h.x + (h.w - dw) / 2;
  ctx.fillStyle = '#2a2622';
  ctx.fillRect(dx, h.y + h.h - 92, dw, 92);
  ctx.fillStyle = h.cargo ? 'rgba(255,190,110,0.16)' : 'rgba(255,214,150,0.2)';
  ctx.fillRect(dx + 8, h.y + h.h - 84, dw - 16, 84);
  ctx.fillStyle = '#5b5348';
  ctx.fillRect(dx, h.y + h.h - 92, 4, 92);
  ctx.fillStyle = '#e8e4d4';
  ctx.font = 'bold 14px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(h.name, h.x + h.w / 2, h.y + h.h - 100);
}

function drawCargoShed(ctx, c, a) {
  shadow(ctx, c.x + c.w / 2, c.y + c.h + 8, c.w * 0.55, 11);
  ctx.fillStyle = CARGO_WALL;
  ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.fillStyle = '#3a3428';
  ctx.fillRect(c.x - 5, c.y - 6, c.w + 10, 18);
  // Loading doors facing the apron.
  for (let k = 0; k < 3; k++) {
    const dx = c.x + 18 + k * (c.w - 60) / 2.4;
    ctx.fillStyle = '#26221c';
    ctx.fillRect(dx, c.y + c.h - 74, 44, 74);
    ctx.fillStyle = 'rgba(255,190,110,0.14)';
    ctx.fillRect(dx + 4, c.y + c.h - 68, 36, 68);
  }
  ctx.fillStyle = 'rgba(232,228,212,0.75)';
  ctx.font = 'bold 13px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CONCH CARGO', c.x + c.w / 2, c.y + 16);
}

function drawTank(ctx, t, a) {
  shadow(ctx, t.x + t.w / 2, t.y + t.h + 6, t.w * 0.6, 9);
  // Cylinder from above: body with a banded top and a spiral stair dot.
  ctx.fillStyle = '#8a8f9c';
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.fillStyle = '#767c8a';
  ctx.fillRect(t.x + 6, t.y + 6, t.w - 12, t.h - 12);
  ctx.strokeStyle = 'rgba(20,24,32,0.6)';
  ctx.lineWidth = 2;
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.ellipse(t.x + t.w / 2, t.y + (t.h * k) / 4, t.w / 2 - 2, 7, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = '#c94b3c';
  ctx.fillRect(t.x + t.w / 2 - 8, t.y + t.h / 2 - 8, 16, 16);
  ctx.fillStyle = '#e8e4d4';
  ctx.font = 'bold 11px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FUEL', t.x + t.w / 2, t.y + t.h / 2 + 26);
}

function drawRadar(ctx, r, a) {
  shadow(ctx, r.x, r.y + r.r, r.r * 0.9, 7);
  ctx.fillStyle = '#3d4148';
  ctx.fillRect(r.x - 5, r.y - 4, 10, r.r + 10);
  // Dish: an arc rotating with the radar angle.
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(a.radarAng * 0.6);
  ctx.fillStyle = '#c9d4ea';
  ctx.beginPath();
  ctx.ellipse(0, 0, r.r, r.r * 0.42, 0, Math.PI * 0.62, Math.PI * 1.38);
  ctx.fill();
  ctx.fillStyle = '#8d93a8';
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
}

function drawWindsock(ctx, w, a) {
  shadow(ctx, w.x, w.y + 8, 8, 4);
  ctx.fillStyle = '#3d4148';
  ctx.fillRect(w.x - 3, w.y - 26, 6, 34);
  // Cone streams downwind; length and flutter read off the wind value.
  const len = 26 + a.wind * 22;
  const flutter = Math.sin(a.t * 7 + w.x) * 3;
  ctx.fillStyle = '#e07b2e';
  ctx.beginPath();
  ctx.moveTo(w.x + 3, w.y - 24);
  ctx.lineTo(w.x + 3 + len, w.y - 20 + flutter);
  ctx.lineTo(w.x + 3 + len, w.y - 10 + flutter);
  ctx.lineTo(w.x + 3, w.y - 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2e7d2';
  ctx.fillRect(w.x + 3, w.y - 20 + flutter * 0.5, len * 0.34, 8);
}

function drawPlane(ctx, p, a) {
  const cos = Math.cos(p.ang), sin = Math.sin(p.ang);
  const px = (dx, dy) => p.x + dx * cos - dy * sin;
  const py = (dx, dy) => p.y + dx * sin + dy * cos;
  shadow(ctx, p.x, p.y + 6, p.type === 'cargo' ? 62 : 44, 14);
  if (p.type === 'cargo') {
    // Freighter: fat fuselage, straight wings with two props, twin tail.
    ctx.fillStyle = '#d8d2c4';
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.ang);
    ctx.fillRect(-70, -13, 140, 26);                       // fuselage
    ctx.fillRect(-16, -78, 26, 156);                       // wing box
    ctx.fillRect(-70, -60, 20, 120);                       // wings
    ctx.fillRect(-78, -22, 12, 14); ctx.fillRect(-78, 8, 12, 14); // tailplane
    ctx.fillStyle = '#6f6350';
    ctx.fillRect(-78, -8, 10, 16);
    ctx.fillStyle = '#2c3038';
    for (const wx of [-58, 6]) { ctx.beginPath(); ctx.arc(wx, -58, 9, 0, TAU); ctx.arc(wx, 58, 9, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#3f4a6b';
    ctx.fillRect(30, -11, 26, 22);                          // cargo door
    ctx.fillStyle = '#e8e4d4';
    ctx.font = 'bold 11px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CONCH AIR', 0, -18);
    ctx.restore();
  } else {
    // Club single: slim fuselage, high wing, spinning prop disc.
    ctx.fillStyle = '#e9ecf4';
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.ang);
    ctx.fillRect(-44, -8, 88, 16);
    ctx.fillRect(-12, -64, 20, 128);
    ctx.fillRect(-48, -52, 14, 104);
    ctx.fillStyle = '#c94b3c';
    ctx.fillRect(-50, -6, 12, 12);
    ctx.fillStyle = '#25272e';
    ctx.beginPath(); ctx.arc(46, 0, 5, 0, TAU); ctx.fill();
    // Prop blur: a translucent disc ahead of the nose.
    ctx.globalAlpha = 0.22 + 0.08 * Math.sin(p.prop + a.t * 22);
    ctx.beginPath(); ctx.ellipse(52, 0, 5, 34, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#19c6d8';
    ctx.fillRect(-26, -3, 16, 6);
    ctx.restore();
  }
}

function drawMast(ctx, m, a) {
  shadow(ctx, m.x, m.y + 6, 9, 4);
  ctx.fillStyle = '#4a4f5c';
  ctx.fillRect(m.x - 4, m.y - 34, 8, 40);
  ctx.fillStyle = '#2c2f37';
  ctx.fillRect(m.x - 16, m.y - 40, 32, 8);
}

function drawBowser(ctx, b, a) {
  shadow(ctx, b.x, b.y + 10, 26, 7);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.ang);
  ctx.fillStyle = '#c8b48c';
  ctx.fillRect(-30, -11, 60, 22);
  ctx.fillStyle = '#a08a5e';
  ctx.fillRect(6, -8, 18, 16);
  ctx.fillStyle = '#25272e';
  ctx.beginPath(); ctx.arc(-18, 12, 5, 0, TAU); ctx.arc(16, 12, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c94b3c';
  ctx.fillRect(-26, -9, 10, 6);
  // Reel hose marker when the bowser is parked at a stand (slow legs).
  ctx.restore();
}

function drawMarshaller(ctx, m, a) {
  shadow(ctx, m.x, m.y + 6, 8, 4);
  // Body: hi-vis vest over darks.
  ctx.fillStyle = '#2c3444';
  ctx.fillRect(m.x - 5, m.y - 10, 10, 18);
  ctx.fillStyle = '#e8e44a';
  ctx.fillRect(m.x - 5, m.y - 6, 10, 9);
  ctx.fillStyle = '#d8b56a';
  ctx.beginPath(); ctx.arc(m.x, m.y - 15, 5, 0, TAU); ctx.fill();
  // Batons: two glowing wands sweeping a slow figure-eight.
  for (const side of [-1, 1]) {
    const w = Math.sin(a.marshaller.phase + (side > 0 ? Math.PI / 2 : 0)) * 0.9;
    const hx = m.x + side * 7 + Math.cos(w) * 5;
    const hy = m.y - 18 + Math.sin(w * 2) * 5;
    ctx.strokeStyle = '#2c3444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m.x + side * 4, m.y - 10);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = '#a2ff5e';
    ctx.beginPath(); ctx.arc(hx, hy, 2.6, 0, TAU); ctx.fill();
  }
}

function drawCart(ctx, c, a) {
  shadow(ctx, c.x, c.y + 8, 16, 5);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.ang);
  ctx.fillStyle = '#5a6272';
  ctx.fillRect(-14, -8, 28, 16);
  ctx.fillStyle = '#39415c';
  ctx.fillRect(-14, -8, 28, 5);
  ctx.fillStyle = '#c9c39a';
  ctx.fillRect(-10, -4, 12, 7);
  ctx.restore();
}

// ---------------------------------------------------------------- draw: glow

export function drawAirportGlow(ctx, a, view) {
  const { x0, x1, y0, y1 } = view;
  if (x1 < AIR.x0 - 500 || x0 > AIR.x1 + 500 || y1 < AIR.y0 - 500 || y0 > AIR.y1 + 500) return;
  const night = Math.max(0.25, a.night);

  // Runway edge lights: cool white pools.
  for (const l of a.rwyEdge) {
    if (l.x < x0 - 40 || l.x > x1 + 40 || l.y < y0 - 40 || l.y > y1 + 40) continue;
    lightDot(ctx, l.x, l.y, 15, 30, `rgba(235,244,255,${0.5 * night})`);
  }
  // Thresholds: green bars on the approach side, red on the departure side.
  const phase = Math.sin(a.t * 2.2) > 0 ? 1 : 0;
  for (let k = 0; k < a.thresholds.length; k++) {
    const th = a.thresholds[k];
    const west = k < 2;
    const color = (k % 2 === phase) ? 'rgba(120,255,170,0.75)' : 'rgba(255,110,110,0.6)';
    lightDot(ctx, th.x + (west ? -6 : 6), th.y, 14, 34, color.replace('0.75', `${0.7 * night}`).replace('0.6', `${0.55 * night}`));
  }
  // Approach rabbit: exactly one strobe burning per side, marching inward.
  const step = Math.floor(a.t * 8) % 6;
  if (step < 5) {
    const s = a.strobesW[step];
    lightDot(ctx, s.x, s.y, 18, 60, `rgba(255,250,220,${0.8 * night})`);
    const e = a.strobesE[step];
    lightDot(ctx, e.x, e.y, 18, 60, `rgba(255,250,220,${0.8 * night})`);
  }
  // PAPI: two white two red, breathing with the rabbit.
  for (let k = 0; k < a.papi.length; k++) {
    const p = a.papi[k];
    const c = k < 2 ? `rgba(255,255,255,${0.65 * night})` : `rgba(255,70,70,${0.6 * night})`;
    lightDot(ctx, p.x, p.y, 8, 26, c);
  }
  // Taxiway edge: blue teasers.
  for (const t of a.twyEdge) {
    if (t.x < x0 - 40 || t.x > x1 + 40) continue;
    lightDot(ctx, t.x, t.y, 7, 20, `rgba(120,170,255,${0.55 * night})`);
  }
  // Apron floods: warm ellipses pooled under each mast.
  for (const m of a.masts) {
    if (m.x < x0 - 200 || m.x > x1 + 200 || m.y < y0 - 200 || m.y > y1 + 200) continue;
    const g = ctx.createRadialGradient(m.x, m.y + 20, 8, m.x, m.y + 20, 130);
    g.addColorStop(0, `rgba(255,226,170,${0.4 * night})`);
    g.addColorStop(0.5, `rgba(255,214,150,${0.16 * night})`);
    g.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(m.x, m.y + 30, 130, 92, 0, 0, TAU); ctx.fill();
    // The lamp head itself.
    lightDot(ctx, m.x, m.y - 38, 8, 34, `rgba(255,240,210,${0.8 * night})`);
  }
  // Tower cab glow + the rotating beacon flash.
  if (a.tower) {
    lightDot(ctx, a.tower.x + a.tower.w / 2, a.tower.y - 10, 26, 70, `rgba(140,220,255,${0.3 * night})`);
    const b = a.beacon;
    const bx = a.tower.x + a.tower.w / 2 + Math.cos(b * TAU) * 46;
    const by = a.tower.y - 40 + Math.sin(b * TAU) * 6;
    lightDot(ctx, bx, by, 6, 40, b < 0.5 ? `rgba(120,255,190,${0.9 * night})` : `rgba(255,255,255,${0.9 * night})`);
  }
  // Hangar doors: warm spill through the gap.
  for (const h of a.hangars) {
    lightDot(ctx, h.x + h.w / 2, h.y + h.h - 46, 30, 90, `rgba(255,200,130,${0.22 * night})`);
  }
  // Fuel pad: a single red caution light.
  for (const t of a.tanks) lightDot(ctx, t.x + t.w / 2, t.y + t.h + 12, 6, 26, `rgba(255,90,70,${0.6 * night})`);
  // Helipad flood: green ring.
  lightDot(ctx, 2690, 2330, 54, 90, `rgba(120,255,170,${0.14 * night})`);
  // Cargo floods, cooler.
  for (let k = 0; k < 3; k++) {
    lightDot(ctx, 2218 + k * 90, a.cargo.y + a.cargo.h + 20, 24, 70, `rgba(210,230,255,${0.2 * night})`);
  }
}

/** Small additive lamp: a hard core inside a soft falloff. */
function lightDot(ctx, x, y, core, halo, color) {
  const g = ctx.createRadialGradient(x, y, 1, x, y, halo);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.22)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, halo, 0, TAU); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, core * 0.28, 0, TAU); ctx.fill();
}

// ---------------------------------------------------------------- minimap

/** Stamp the field onto the HUD's baked map. */
export function stampAirportMap(g, a, kx, ky, north) {
  const X = (wx) => wx * kx;
  const Y = (wy) => (wy + north) * ky;
  // Field slab.
  g.fillStyle = '#3a3d46';
  g.fillRect(X(AIR.x0), Y(AIR.y0), (AIR.x1 - AIR.x0) * kx, (AIR.y1 - AIR.y0) * ky);
  // Runway strip.
  g.fillStyle = '#565a68';
  g.fillRect(X(RWY.x0 - 60), Y(RWY.cy - RWY.hw), (RWY.x1 - RWY.x0 + 120) * kx, RWY.hw * 2 * ky);
  g.fillStyle = '#8d93a8';
  g.fillRect(X(RWY.x0 + 40), Y(RWY.cy) - 1, (RWY.x1 - RWY.x0 - 80) * kx, Math.max(1, 2 * ky));
  // Terminal / hangar blocks.
  g.fillStyle = '#6a7086';
  for (const h of a.hangars) g.fillRect(X(h.x), Y(h.y), h.w * kx, h.h * ky);
  if (a.term) g.fillRect(X(a.term.x), Y(a.term.y), a.term.w * kx, a.term.h * ky);
  if (a.cargo) g.fillRect(X(a.cargo.x), Y(a.cargo.y), a.cargo.w * kx, a.cargo.h * ky);
}

/** Where the field sits, for the minimap blip and the skyline dome. */
export function airportCenter() {
  return { x: (AIR.x0 + AIR.x1) / 2, y: (AIR.y0 + AIR.y1) / 2 };
}
