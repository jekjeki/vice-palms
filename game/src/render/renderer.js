// The renderer: a two-stage night pipeline. The base pass paints the city in its own colours
// (emissives — neon, lit windows — at full brightness), a light map is multiplied over it for
// the ambient night mood, and an additive glow pass paints the actual light sources on top:
// lamp pools, headlight cones, neon spill, sirens, fire. Culled by camera rect; y-sorted
// painter's order for buildings, palms and actors.

import { BLOCKS, PITCH, ROAD_W, SIDEWALK, BEACH_W, SEA_W, NIGHT } from '../config.js';
import { blockRect } from '../world/city.js';
import { clamp, TAU } from '../util.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.light = document.createElement('canvas');
    this.lightCtx = this.light.getContext('2d');
    this.vignette = null;
    this.resize();
  }

  resize() {
    const w = this.canvas.width, h = this.canvas.height;
    this.light.width = w; this.light.height = h;
    // Pre-render the vignette once per size.
    const v = document.createElement('canvas');
    v.width = w; v.height = h;
    const vc = v.getContext('2d');
    const g = vc.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.hypot(w, h) * 0.66);
    g.addColorStop(0, 'rgba(4,6,14,0)');
    g.addColorStop(0.75, 'rgba(4,6,14,0.14)');
    g.addColorStop(1, 'rgba(2,3,9,0.42)');
    vc.fillStyle = g;
    vc.fillRect(0, 0, w, h);
    // A faint violet bloom low in the frame reads as distant city haze.
    const hz = vc.createLinearGradient(0, h * 0.55, 0, h);
    hz.addColorStop(0, 'rgba(30,40,90,0)');
    hz.addColorStop(1, 'rgba(44,36,84,0.16)');
    vc.fillStyle = hz;
    vc.fillRect(0, h * 0.55, w, h * 0.45);
    this.vignette = v;
  }

  render(game, ui) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const cam = ui.cameraOverride ?? game.camera;
    const zoom = cam.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = NIGHT.sky;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);
    this.basePass(ctx, game, cam, zoom, W, H);
    ctx.restore();

    // Ambient night mood (multiply), then the real lights (additive), then the vignette.
    this.ambientPass(game, cam, zoom, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.light, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    this.glowPass(game, cam, zoom, W, H);
    ctx.globalCompositeOperation = 'source-over';
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0);
  }

  // ------------------------------------------------------------------ base pass

  basePass(ctx, game, cam, zoom, W, H) {
    const hw = W / (2 * zoom), hh = H / (2 * zoom);
    const x0 = cam.x - hw, x1 = cam.x + hw, y0 = cam.y - hh, y1 = cam.y + hh;
    const WORLD = BLOCKS * PITCH;

    // Ocean beyond the beach; a subtle swell runs through it.
    ctx.fillStyle = NIGHT.water;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (x1 > WORLD + BEACH_W) {
      ctx.strokeStyle = 'rgba(90,160,210,0.14)';
      ctx.lineWidth = 2;
      const t = game.time;
      for (let wy = Math.floor(y0 / 90) * 90; wy < y1; wy += 90) {
        ctx.beginPath();
        for (let wx = Math.max(x0, WORLD + BEACH_W); wx < x1; wx += 26) {
          const yo = Math.sin(wx * 0.02 + wy * 0.11 + t * 1.4) * 4;
          wx === Math.max(x0, WORLD + BEACH_W) ? ctx.moveTo(wx, wy + yo) : ctx.lineTo(wx, wy + yo);
        }
        ctx.stroke();
      }
    }
    // Sand and its wet edge.
    if (x1 > WORLD) {
      ctx.fillStyle = NIGHT.sand;
      ctx.fillRect(WORLD, Math.max(0, y0), BEACH_W, Math.min(WORLD, y1) - Math.max(0, y0));
      ctx.fillStyle = 'rgba(60,80,110,0.35)';
      ctx.fillRect(WORLD + BEACH_W - 46, Math.max(0, y0), 46, Math.min(WORLD, y1) - Math.max(0, y0));
    }

    // Roads along every grid line.
    ctx.fillStyle = NIGHT.asphalt;
    const i0 = Math.max(0, Math.floor((x0 - ROAD_W / 2) / PITCH)), i1 = Math.min(BLOCKS, Math.ceil((x1 + ROAD_W / 2) / PITCH));
    const j0 = Math.max(0, Math.floor((y0 - ROAD_W / 2) / PITCH)), j1 = Math.min(BLOCKS, Math.ceil((y1 + ROAD_W / 2) / PITCH));
    for (let i = i0; i <= i1; i++) ctx.fillRect(i * PITCH - ROAD_W / 2, y0, ROAD_W, y1 - y0);
    for (let j = j0; j <= j1; j++) ctx.fillRect(x0, j * PITCH - ROAD_W / 2, x1 - x0, ROAD_W);

    // Lane markings: dashed centre lines, skipping the intersections.
    ctx.strokeStyle = 'rgba(215,208,150,0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([24, 30]);
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j < j1; j++) {
        const a = j * PITCH + ROAD_W / 2 + 6, b = (j + 1) * PITCH - ROAD_W / 2 - 6;
        if (b < y0 || a > y1) continue;
        ctx.moveTo(i * PITCH, Math.max(a, y0));
        ctx.lineTo(i * PITCH, Math.min(b, y1));
      }
    }
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i < i1; i++) {
        const a = i * PITCH + ROAD_W / 2 + 6, b = (i + 1) * PITCH - ROAD_W / 2 - 6;
        if (b < x0 || a > x1) continue;
        ctx.moveTo(Math.max(a, x0), j * PITCH);
        ctx.lineTo(Math.min(b, x1), j * PITCH);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Intersections: crosswalk zebras and a slightly worn centre.
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const cx = i * PITCH, cy = j * PITCH;
        if (cx + ROAD_W / 2 < x0 || cx - ROAD_W / 2 > x1 || cy + ROAD_W / 2 < y0 || cy - ROAD_W / 2 > y1) continue;
        ctx.fillStyle = NIGHT.asphaltSide;
        ctx.fillRect(cx - ROAD_W / 2, cy - ROAD_W / 2, ROAD_W, ROAD_W);
        ctx.fillStyle = 'rgba(228,228,238,0.28)';
        for (let s = 0; s < 5; s++) {
          const off = -ROAD_W / 2 + 9 + s * 16;
          ctx.fillRect(cx + off, cy - ROAD_W / 2 - 26, 9, 18);          // north
          ctx.fillRect(cx + off, cy + ROAD_W / 2 + 8, 9, 18);           // south
          ctx.fillRect(cx - ROAD_W / 2 - 26, cy + off, 18, 9);          // west
          ctx.fillRect(cx + ROAD_W / 2 + 8, cy + off, 18, 9);           // east
        }
      }
    }

    // Blocks: sidewalk band + interior by type.
    const bi0 = clamp(Math.floor((x0 - ROAD_W / 2) / PITCH), 0, BLOCKS - 1);
    const bi1 = clamp(Math.ceil((x1 + ROAD_W / 2) / PITCH), 0, BLOCKS - 1);
    const bj0 = clamp(Math.floor((y0 - ROAD_W / 2) / PITCH), 0, BLOCKS - 1);
    const bj1 = clamp(Math.ceil((y1 + ROAD_W / 2) / PITCH), 0, BLOCKS - 1);
    for (let i = bi0; i <= bi1; i++) {
      for (let j = bj0; j <= bj1; j++) {
        const block = game.city.blocks[i * BLOCKS + j];
        const r = blockRect(i, j);
        ctx.fillStyle = NIGHT.sidewalk;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = NIGHT.curb;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        const ix = r.x + SIDEWALK, iy = r.y + SIDEWALK, iw = r.w - SIDEWALK * 2, ih = r.h - SIDEWALK * 2;
        if (block.type === 'park') {
          ctx.fillStyle = NIGHT.grass;
          ctx.fillRect(ix, iy, iw, ih);
          ctx.strokeStyle = 'rgba(120,130,110,0.25)';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(ix, iy + ih / 2); ctx.lineTo(ix + iw, iy + ih / 2);
          ctx.moveTo(ix + iw / 2, iy); ctx.lineTo(ix + iw / 2, iy + ih);
          ctx.stroke();
        } else if (block.type === 'plaza') {
          ctx.fillStyle = '#42465a';
          ctx.fillRect(ix, iy, iw, ih);
          ctx.fillStyle = '#4c5168';
          ctx.beginPath(); ctx.arc(ix + iw / 2, iy + ih / 2, 34, 0, TAU); ctx.fill();
        } else if (block.type === 'lot') {
          ctx.fillStyle = NIGHT.asphaltSide;
          ctx.fillRect(ix, iy, iw, ih);
          ctx.strokeStyle = 'rgba(225,225,205,0.3)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (const s of block.stalls) {
            ctx.moveTo(s.x, s.y + (s.row === 0 ? 20 : -20));
            ctx.lineTo(s.x, s.y + (s.row === 0 ? -16 : 16));
          }
          ctx.stroke();
        } else {
          ctx.fillStyle = '#232631';
          ctx.fillRect(ix, iy, iw, ih);
        }
      }
    }

    // Collect y-sorted drawables.
    const items = [];
    for (let i = bi0; i <= bi1; i++) {
      for (let j = bj0; j <= bj1; j++) {
        const block = game.city.blocks[i * BLOCKS + j];
        for (const b of block.buildings) items.push({ y: b.y + b.h, kind: 'bld', o: b });
        for (const p of block.palms) items.push({ y: p.y, kind: 'palm', o: p });
        for (const s of block.signs) items.push({ y: s.y + s.h, kind: 'sign', o: s });
      }
    }
    for (const p of game.city.beachPalms) {
      if (p.y > y0 - 60 && p.y < y1 + 60 && p.x > x0 - 60 && p.x < x1 + 60) items.push({ y: p.y, kind: 'palm', o: p });
    }
    for (const v of game.vehicles) {
      if (v.x > x0 - 140 && v.x < x1 + 140 && v.y > y0 - 140 && v.y < y1 + 140) items.push({ y: v.y + v.def.len / 2, kind: 'veh', o: v });
    }
    for (const ped of game.peds) {
      if (ped.x > x0 - 40 && ped.x < x1 + 40 && ped.y > y0 - 40 && ped.y < y1 + 40) items.push({ y: ped.y, kind: 'ped', o: ped });
    }
    if (!game.player.inCar) items.push({ y: game.player.y, kind: 'player', o: game.player });
    for (const pk of game.pickups) {
      if (pk.x > x0 - 40 && pk.x < x1 + 40 && pk.y > y0 - 40 && pk.y < y1 + 40) items.push({ y: pk.y, kind: 'pk', o: pk });
    }
    const marker = game.missions.marker();
    if (marker && marker.x > x0 - 200 && marker.x < x1 + 200 && marker.y > y0 - 200 && marker.y < y1 + 200) {
      items.push({ y: marker.y + 1, kind: 'marker', o: marker });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      switch (it.kind) {
        case 'bld': this.drawBuilding(ctx, it.o); break;
        case 'palm': this.drawPalm(ctx, it.o, game); break;
        case 'sign': this.drawSignBase(ctx, it.o, game); break;
        case 'veh': this.drawVehicle(ctx, it.o); break;
        case 'ped': this.drawPed(ctx, it.o); break;
        case 'player': this.drawPlayer(ctx, game.player); break;
        case 'pk': this.drawPickup(ctx, it.o, game); break;
        case 'marker': this.drawMarker(ctx, it.o, game); break;
      }
    }

    // Smoke/dark particles ride in the base pass; bright ones glow in the additive pass.
    for (const p of game.fx.pool) {
      if (!p.active || p.kind !== 'smoke') continue;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.7;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawBuilding(ctx, b) {
    const o = Math.min(26, 4 + b.floors * 2.6);
    // Ground footprint in wall colour (visible on the south/east strips).
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Window slots on the exposed strips; lit ones glow warm in the base pass itself.
    ctx.fillStyle = '#101321';
    const nCols = Math.max(1, Math.floor((b.w - 12) / 20));
    for (let c = 0; c < nCols; c++) {
      ctx.fillRect(b.x + 10 + c * 20, b.y + b.h - o + 4, 9, o - 9);
      if (hash01(b.x + c * 7.3, b.y) < b.lit) {
        ctx.fillStyle = hash01(b.x * 1.7 + c, b.y * 2.3) < 0.7 ? '#ffcf8a' : '#9fdcff';
        ctx.fillRect(b.x + 10 + c * 20, b.y + b.h - o + 4, 9, o - 9);
        ctx.fillStyle = '#101321';
      }
    }
    const nRows = Math.max(1, Math.floor((b.h - 12) / 20));
    for (let r = 0; r < nRows; r++) {
      ctx.fillRect(b.x + b.w - o + 4, b.y + 10 + r * 20, o - 9, 9);
      if (hash01(b.y + r * 5.1, b.x) < b.lit) {
        ctx.fillStyle = hash01(b.y * 1.3 + r, b.x * 3.1) < 0.7 ? '#ffcf8a' : '#9fdcff';
        ctx.fillRect(b.x + b.w - o + 4, b.y + 10 + r * 20, o - 9, 9);
        ctx.fillStyle = '#101321';
      }
    }
    // Roof slab shifted north-west.
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x - o, b.y - o, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x - o, b.y - o, b.w, b.h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x - o, b.y - o, b.w, 3);
    // Roof clutter: AC units and vents.
    ctx.fillStyle = '#565b66';
    for (const ac of b.ac) {
      ctx.fillRect(ac.x - o, ac.y - o, ac.s, ac.s);
      ctx.fillStyle = '#6c7280';
      ctx.fillRect(ac.x - o + 2, ac.y - o + 2, ac.s - 4, ac.s - 4);
      ctx.fillStyle = '#565b66';
    }
    for (const v of b.vents) {
      ctx.fillStyle = '#3c3f4a';
      ctx.beginPath(); ctx.arc(v.x - o, v.y - o, 5, 0, TAU); ctx.fill();
    }
  }

  drawSignBase(ctx, s, game) {
    // Emissive: painted at full colour in the base pass; the glow pass adds spill and halo.
    const flicker = s.flicker ? (Math.sin(game.time * 9 + s.seed) + Math.sin(game.time * 23 + s.seed * 2)) : 1;
    const alpha = s.flicker ? (flicker > -0.4 ? 1 : 0.35) : 1;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = '#0c0e16';
    if (s.vertical) {
      ctx.save();
      ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.font = 'bold 11px Consolas, "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(s.text, 0, 4);
      ctx.restore();
    } else {
      ctx.font = 'bold 10px Consolas, "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(s.text, s.x + s.w / 2, s.y + s.h / 2 + 4);
    }
    ctx.globalAlpha = 1;
  }

  drawPalm(ctx, p, game) {
    const sway = Math.sin(game.time * 1.3 + p.x * 0.01) * 0.09;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.s, p.s);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(10, 6, 22, 9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5a4028';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.stroke();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + sway;
      ctx.strokeStyle = k % 2 ? '#3f9a5c' : '#4cb26e';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a) * 16, Math.sin(a) * 16, Math.cos(a + sway) * 27, Math.sin(a + sway) * 27);
      ctx.stroke();
    }
    ctx.fillStyle = '#54bd76';
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawVehicle(ctx, v) {
    const d = v.def;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.save();
    ctx.rotate(v.ang);
    ctx.fillRect(-d.len / 2 + 4, -d.wid / 2 + 5, d.len, d.wid);
    ctx.restore();
    ctx.rotate(v.ang);
    const burnt = v.exploded;
    ctx.fillStyle = burnt ? '#1b1b1f' : v.color;
    roundRect(ctx, -d.len / 2, -d.wid / 2, d.len, d.wid, 7);
    ctx.fill();
    if (!burnt) {
      ctx.fillStyle = '#101014';
      for (const [wx, wy] of [[-d.len / 2 + 12, -d.wid / 2 - 2], [-d.len / 2 + 12, d.wid / 2 - 4], [d.len / 2 - 16, -d.wid / 2 - 2], [d.len / 2 - 16, d.wid / 2 - 4]]) {
        ctx.fillRect(wx, wy, 10, 6);
      }
    }
    ctx.fillStyle = burnt ? '#0d0d10' : '#151a24';
    roundRect(ctx, -d.len / 2 + d.len * 0.28, -d.wid / 2 + 5, d.len * 0.34, d.wid - 10, 4);
    ctx.fill();
    ctx.fillStyle = burnt ? '#232326' : shade(v.color, 1.18);
    roundRect(ctx, -d.len / 2 + d.len * 0.18, -d.wid / 2 + 6, d.len * 0.16, d.wid - 12, 3);
    ctx.fill();
    if (!burnt) {
      ctx.fillStyle = '#d8d8c8';
      ctx.fillRect(d.len / 2 - 5, -d.wid / 2 + 5, 4, 7);
      ctx.fillRect(d.len / 2 - 5, d.wid / 2 - 12, 4, 7);
      ctx.fillStyle = '#a02a2a';
      ctx.fillRect(-d.len / 2 + 1, -d.wid / 2 + 5, 3, 7);
      ctx.fillRect(-d.len / 2 + 1, d.wid / 2 - 12, 3, 7);
    }
    if (d.id === 'interceptor') {
      ctx.fillStyle = '#1d2740';
      ctx.fillRect(-d.len / 2 + d.len * 0.3, -d.wid / 2, d.len * 0.2, d.wid);
      ctx.fillStyle = burnt ? '#202024' : '#101318';
      ctx.fillRect(-d.len / 2 + d.len * 0.42, -6, 12, 12);
    }
    if (v.def.id === 'coralcab' && !burnt) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-6, -8, 12, 16);
    }
    if (!burnt && v.hp < d.hp * 0.5) {
      ctx.fillStyle = 'rgba(10,10,12,0.55)';
      ctx.beginPath(); ctx.arc(d.len * 0.22, -d.wid * 0.15, 8, 0, TAU); ctx.fill();
      if (v.hp < d.hp * 0.3) { ctx.beginPath(); ctx.arc(-d.len * 0.2, d.wid * 0.2, 7, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  drawPed(ctx, ped) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      ctx.fillStyle = 'rgba(120,16,28,0.5)';
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = ped.shirt;
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath(); ctx.arc(7, 2, 3, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(2, 3, 6.5, 3.2, 0, 0, TAU); ctx.fill();
    const bob = ped.state === 'flee' ? Math.sin(ped.phase * 2.2) * 1.6 : Math.sin(ped.phase) * 1.1;
    ctx.fillStyle = '#14161c';
    const step = Math.sin(ped.phase) * 3;
    ctx.fillRect(-3 + step, 2, 3, 3);
    ctx.fillRect(1 - step, 2, 3, 3);
    ctx.fillStyle = ped.isCop ? '#2e4a7a' : ped.shirt;
    ctx.beginPath(); ctx.ellipse(0, -2 + bob * 0.2, 5, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(0, -7, 3.4, 0, TAU); ctx.fill();
    if (ped.isCop) {
      ctx.fillStyle = '#16233c';
      ctx.fillRect(-3, -10.5, 6, 2.5);
    }
    ctx.restore();
  }

  drawPlayer(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.heading + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(2, 3, 7, 3.6, 0, 0, TAU); ctx.fill();
    const step = Math.sin(p.walkPhase) * 3.4;
    ctx.fillStyle = '#101218';
    ctx.fillRect(-4 + step, 2, 3.4, 4);
    ctx.fillRect(1 - step, 2, 3.4, 4);
    // Tropical shirt: loud pink-and-teal, Rico's old one.
    ctx.fillStyle = '#e2527e';
    ctx.beginPath(); ctx.ellipse(0, -2, 5.6, 6.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2fb9a8';
    ctx.fillRect(-4, -4, 3, 3);
    ctx.fillRect(2, -1, 3, 3);
    ctx.fillStyle = '#c99a72';
    ctx.beginPath(); ctx.arc(0, -8, 3.8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#241a10';
    ctx.beginPath(); ctx.arc(0, -9.4, 3.4, Math.PI, TAU); ctx.fill();
    if (p.weapon === 'pistol') {
      ctx.fillStyle = '#20242c';
      ctx.fillRect(3, -10, 6, 3);
    }
    ctx.restore();
  }

  drawPickup(ctx, pk, game) {
    const bob = Math.sin(game.time * 3 + pk.phase) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    const color = pk.kind === 'pistol' ? '#ffd977' : pk.kind === 'health' ? '#7dffa4' : pk.kind === 'armor' ? '#6fb7ff' : '#c7ff7d';
    ctx.fillStyle = 'rgba(10,12,18,0.9)';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = color;
    if (pk.kind === 'pistol') { ctx.fillRect(-5, -2, 10, 4); ctx.fillRect(-2, 2, 4, 5); }
    else if (pk.kind === 'health') { ctx.fillRect(-6, -2, 12, 4); ctx.fillRect(-2, -6, 4, 12); }
    else if (pk.kind === 'armor') { ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(6, -3); ctx.lineTo(0, 7); ctx.lineTo(-6, -3); ctx.closePath(); ctx.fill(); }
    else { ctx.fillRect(-6, -4, 12, 8); ctx.fillStyle = '#1a3a20'; ctx.fillRect(-1, -4, 2, 8); }
    ctx.restore();
  }

  drawMarker(ctx, m, game) {
    const pulse = 0.75 + Math.sin(game.time * 3) * 0.25;
    ctx.save();
    ctx.globalAlpha = 0.22 * pulse;
    ctx.fillStyle = m.color;
    ctx.beginPath(); ctx.arc(m.x, m.y, 46, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(m.x, m.y, 46, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.9;
    const bob = Math.sin(game.time * 4) * 5;
    ctx.translate(m.x, m.y - 34 + bob);
    ctx.beginPath();
    ctx.moveTo(-10, -12); ctx.lineTo(10, -12); ctx.lineTo(0, 4); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------ ambient pass

  /** The light map: ambient darkness plus the moon washing the shore. Multiplied later. */
  ambientPass(game, cam, zoom, W, H) {
    const lc = this.lightCtx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    const amb = NIGHT.ambient;
    lc.fillStyle = `rgb(${amb[0]},${amb[1]},${amb[2]})`;
    lc.fillRect(0, 0, W, H);
    // Moonlight: a smooth wash that peaks over the open water and fades at the shore.
    const WORLD = BLOCKS * PITCH;
    lc.save();
    lc.translate(W / 2, H / 2);
    lc.scale(zoom, zoom);
    lc.translate(-cam.x, -cam.y);
    const g = lc.createLinearGradient(WORLD - 200, 0, WORLD + SEA_W * 0.8, 0);
    g.addColorStop(0, 'rgba(70,110,160,0)');
    g.addColorStop(0.25, 'rgba(70,110,160,0.45)');
    g.addColorStop(0.6, 'rgba(80,125,175,0.75)');
    g.addColorStop(1, 'rgba(80,125,175,0.55)');
    lc.fillStyle = g;
    lc.fillRect(WORLD - 200, cam.y - H / zoom, SEA_W + 200, (H / zoom) * 2);
    lc.restore();
  }

  // ------------------------------------------------------------------ glow pass (additive)

  glowPass(game, cam, zoom, W, H) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);
    const hw = W / (2 * zoom), hh = H / (2 * zoom);
    const x0 = cam.x - hw - 250, x1 = cam.x + hw + 250, y0 = cam.y - hh - 250, y1 = cam.y + hh + 250;
    const WORLD = BLOCKS * PITCH;

    const i0 = Math.max(0, Math.floor((x0 - ROAD_W / 2) / PITCH)), i1 = Math.min(BLOCKS, Math.ceil((x1 + ROAD_W / 2) / PITCH));
    const j0 = Math.max(0, Math.floor((y0 - ROAD_W / 2) / PITCH)), j1 = Math.min(BLOCKS, Math.ceil((y1 + ROAD_W / 2) / PITCH));

    // Street lamps at every visible intersection, warm pools on the asphalt.
    const lamp = lampSprite();
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const cx = i * PITCH, cy = j * PITCH;
        for (const [lx, ly] of [[-ROAD_W / 2 - 8, -ROAD_W / 2 - 8], [ROAD_W / 2 + 8, ROAD_W / 2 + 8]]) {
          ctx.save();
          ctx.translate(cx + lx, cy + ly);
          ctx.scale(1.6, 1.25);
          ctx.drawImage(lamp, -70, -70);
          ctx.restore();
        }
        // Traffic light state dots: green/red pair across the intersection.
        const phase = (i + j + Math.floor(game.time / 9)) % 2;
        ctx.fillStyle = phase === 0 ? 'rgba(55,255,139,0.9)' : 'rgba(255,69,55,0.9)';
        ctx.beginPath(); ctx.arc(cx + ROAD_W / 2 + 6, cy - ROAD_W / 2 - 6, 3.4, 0, TAU); ctx.fill();
        ctx.fillStyle = phase === 0 ? 'rgba(255,69,55,0.9)' : 'rgba(55,255,139,0.9)';
        ctx.beginPath(); ctx.arc(cx - ROAD_W / 2 - 6, cy + ROAD_W / 2 + 6, 3.4, 0, TAU); ctx.fill();
      }
    }

    // Neon signs: halo around the bar plus a coloured spill pool on the street below.
    const bi0 = clamp(Math.floor((x0 - ROAD_W / 2) / PITCH), 0, BLOCKS - 1);
    const bi1 = clamp(Math.ceil((x1 + ROAD_W / 2) / PITCH), 0, BLOCKS - 1);
    const bj0 = clamp(Math.floor((y0 - ROAD_W / 2) / PITCH), 0, BLOCKS - 1);
    const bj1 = clamp(Math.ceil((y1 + ROAD_W / 2) / PITCH), 0, BLOCKS - 1);
    for (let i = bi0; i <= bi1; i++) {
      for (let j = bj0; j <= bj1; j++) {
        const block = game.city.blocks[i * BLOCKS + j];
        for (const s of block.signs) {
          const rgb = hexRGB(s.color);
          const flicker = s.flicker ? (Math.sin(game.time * 9 + s.seed) + Math.sin(game.time * 23 + s.seed * 2)) : 1;
          const a = s.flicker && flicker <= -0.4 ? 0.3 : 1;
          const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
          if (!s.vertical) {
            // Halo hugging the bar.
            const rad = Math.max(s.w, s.h) * 1.35;
            const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
            g.addColorStop(0, `rgba(${rgb},${0.3 * a})`);
            g.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, TAU); ctx.fill();
            // Spill on the street the sign faces (south-facing bars light the sidewalk).
            const spillY = s.y + s.h + 26;
            const gs = ctx.createRadialGradient(cx, spillY, 4, cx, spillY, 70);
            gs.addColorStop(0, `rgba(${rgb},${0.2 * a})`);
            gs.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = gs;
            ctx.save();
            ctx.translate(cx, spillY);
            ctx.scale(1.4, 0.9);
            ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.fill();
            ctx.restore();
          }
        }
      }
    }

    // Vehicles: headlight cones, road pool, tail lights, police strobes.
    for (const v of game.vehicles) {
      if (v.x < x0 || v.x > x1 || v.y < y0 || v.y > y1) continue;
      if (v.exploded) continue;
      const d = v.def;
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.ang);
      const coneLen = 300;
      for (const side of [-1, 1]) {
        const g = ctx.createLinearGradient(d.len / 2, 0, d.len / 2 + coneLen, side * d.wid * 0.55);
        g.addColorStop(0, 'rgba(255,238,196,0.55)');
        g.addColorStop(0.4, 'rgba(255,226,170,0.22)');
        g.addColorStop(1, 'rgba(255,220,160,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(d.len / 2 - 4, side * (d.wid / 2 - 9));
        ctx.lineTo(d.len / 2 + coneLen, side * d.wid * 1.8);
        ctx.lineTo(d.len / 2 + coneLen, side * d.wid * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,250,225,0.95)';
        ctx.fillRect(d.len / 2 - 5, side * (d.wid / 2 - 12), 5, 7);
      }
      // Pooled light on the road ahead.
      const pool = ctx.createRadialGradient(d.len / 2 + 70, 0, 8, d.len / 2 + 70, 0, 95);
      pool.addColorStop(0, 'rgba(255,232,190,0.35)');
      pool.addColorStop(1, 'rgba(255,232,190,0)');
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.arc(d.len / 2 + 70, 0, 95, 0, TAU); ctx.fill();
      // Tail lights.
      ctx.fillStyle = 'rgba(255,70,60,0.8)';
      ctx.fillRect(-d.len / 2, -d.wid / 2 + 5, 3, 7);
      ctx.fillRect(-d.len / 2, d.wid / 2 - 12, 3, 7);
      ctx.restore();
      // Police lightbar strobe washing the street.
      if (d.id === 'interceptor' && (v.siren || v.role === 'cop')) {
        const blue = Math.floor(game.time * 6) % 2 === 0;
        const rgb = blue ? '70,130,255' : '255,70,80';
        const g = ctx.createRadialGradient(v.x, v.y, 6, v.x, v.y, 130);
        g.addColorStop(0, `rgba(${rgb},0.4)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(v.x, v.y, 130, 0, TAU); ctx.fill();
      }
      // Burning cars throw firelight.
      if (v.dead) {
        const g = ctx.createRadialGradient(v.x, v.y, 4, v.x, v.y, 110);
        g.addColorStop(0, 'rgba(255,140,50,0.5)');
        g.addColorStop(1, 'rgba(255,140,50,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(v.x, v.y, 110, 0, TAU); ctx.fill();
      }
    }

    // Peds: phone screens; cops carry a flashlight pool.
    for (const ped of game.peds) {
      if (ped.x < x0 || ped.x > x1 || ped.y < y0 || ped.y > y1) continue;
      if (ped.state === 'down') continue;
      if (ped.phone) {
        ctx.fillStyle = 'rgba(120,170,255,0.5)';
        ctx.beginPath(); ctx.arc(ped.x, ped.y - 4, 5, 0, TAU); ctx.fill();
      }
      if (ped.isCop) {
        const g = ctx.createRadialGradient(ped.x, ped.y, 4, ped.x, ped.y, 110);
        g.addColorStop(0, 'rgba(255,240,190,0.22)');
        g.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ped.x, ped.y, 110, 0, TAU); ctx.fill();
      }
    }

    // The player reads clearly with a small cool pool.
    const p = game.player;
    const gp = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 80);
    gp.addColorStop(0, 'rgba(185,195,235,0.2)');
    gp.addColorStop(1, 'rgba(185,195,235,0)');
    ctx.fillStyle = gp;
    ctx.beginPath(); ctx.arc(p.x, p.y, 80, 0, TAU); ctx.fill();

    // Mission marker beam.
    const marker = game.missions.marker();
    if (marker && marker.x > x0 && marker.x < x1 && marker.y > y0 && marker.y < y1) {
      const gm = ctx.createRadialGradient(marker.x, marker.y, 6, marker.x, marker.y, 85);
      gm.addColorStop(0, hexA(marker.color, 0.3));
      gm.addColorStop(1, hexA(marker.color, 0));
      ctx.fillStyle = gm;
      ctx.beginPath(); ctx.arc(marker.x, marker.y, 85, 0, TAU); ctx.fill();
    }

    // Pickups shimmer.
    for (const pk of game.pickups) {
      if (pk.x < x0 || pk.x > x1 || pk.y < y0 || pk.y > y1) continue;
      const c = pk.kind === 'pistol' ? '255,217,119' : pk.kind === 'health' ? '125,255,164' : pk.kind === 'armor' ? '111,183,255' : '199,255,125';
      const gk = ctx.createRadialGradient(pk.x, pk.y, 2, pk.x, pk.y, 18);
      gk.addColorStop(0, `rgba(${c},0.45)`);
      gk.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = gk;
      ctx.beginPath(); ctx.arc(pk.x, pk.y, 18, 0, TAU); ctx.fill();
    }

    // Glowing particles: fire, muzzle, flash, sparks, cash.
    for (const pt of game.fx.pool) {
      if (!pt.active || pt.kind === 'smoke' || pt.kind === 'blood') continue;
      const a = clamp(pt.life / pt.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      const size = pt.kind === 'flash' ? pt.size * (1 + (1 - a)) : pt.size;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ------------------------------------------------------------------ helpers

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, f) {
  const [r, g, b] = hexRGB(hex);
  return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`;
}

function hexRGB(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function hexA(hex, a) {
  const [r, g, b] = hexRGB(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function hash01(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

let lampCache = null;
function lampSprite() {
  if (lampCache) return lampCache;
  const c = document.createElement('canvas');
  c.width = 140; c.height = 140;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(70, 70, 4, 70, 70, 68);
  rg.addColorStop(0, 'rgba(255,214,140,0.4)');
  rg.addColorStop(0.5, 'rgba(255,200,120,0.13)');
  rg.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 140, 140);
  lampCache = c;
  return c;
}
