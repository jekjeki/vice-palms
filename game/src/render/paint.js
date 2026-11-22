// The night renderer, in three layers. The base pass paints the city in its own colours with
// emissives (neon, lit windows) at full strength; a light map is multiplied over everything for
// the ambient mood; an additive glow pass paints the true light sources — lamp pools, headlight
// cones, neon spill with wet-asphalt reflections, sirens, turn signals, fire, brake and reverse
// lamps. Camera shake rides the world transform; culling uses the camera rect; buildings, palms
// and actors draw y-sorted.

import { GRID, PITCH, ROAD, WALK, SAND, OCEAN, LIGHT } from '../config.js';
import { blockRect } from '../world/city.js';
import { clamp, TAU, hash01 } from '../util.js';
import { rand } from '../rng.js';
import {
  drawDocksBase, drawDocksActors, drawDocksGlow, drawDocksSky,
  dockSortItems, drawDockItem,
} from '../world/district.js';

export class Painter {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lightMap = document.createElement('canvas');
    this.lightCtx = this.lightMap.getContext('2d');
    this.overlay = null;
    this.resize();
  }

  resize() {
    const w = this.canvas.width, h = this.canvas.height;
    this.lightMap.width = w; this.lightMap.height = h;
    const v = document.createElement('canvas');
    v.width = w; v.height = h;
    const vc = v.getContext('2d');
    // Vignette pulls the corners down; a violet haze hugs the bottom of the frame.
    const g = vc.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.hypot(w, h) * 0.64);
    g.addColorStop(0, 'rgba(4,6,14,0)');
    g.addColorStop(0.72, 'rgba(4,6,14,0.15)');
    g.addColorStop(1, 'rgba(2,3,9,0.44)');
    vc.fillStyle = g;
    vc.fillRect(0, 0, w, h);
    const hz = vc.createLinearGradient(0, h * 0.55, 0, h);
    hz.addColorStop(0, 'rgba(34,42,96,0)');
    hz.addColorStop(1, 'rgba(48,38,92,0.17)');
    vc.fillStyle = hz;
    vc.fillRect(0, h * 0.55, w, h * 0.45);
    this.overlay = v;
  }

  render(game, ui) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const cam0 = ui.cameraOverride ?? game.camera;
    // Explosion shake: a decaying jitter around the camera focus.
    let shakeX = 0, shakeY = 0;
    if (game.shake > 0.01) {
      shakeX = (rand() - 0.5) * game.shake;
      shakeY = (rand() - 0.5) * game.shake;
    }
    const cam = { x: cam0.x + shakeX, y: cam0.y + shakeY, zoom: cam0.zoom };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = LIGHT.sky;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    this.base(ctx, game, cam, W, H);
    ctx.restore();

    this.ambient(game, cam, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.lightMap, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    this.glow(game, cam, W, H);
    // Blast flash: one additive wash that fades as game.flash decays.
    if (game.flash > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,176,96,${(game.flash * 0.55).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (this.overlay) ctx.drawImage(this.overlay, 0, 0);
    // Weather rides last: fog wash, rain streaks, lightning pulses.
    if (game.weather) game.weather.drawScreen(ctx, W, H, game.time, cam);
  }

  // ---------------------------------------------------------------- base layer

  base(ctx, game, cam, W, H) {
    const hw = W / (2 * cam.zoom), hh = H / (2 * cam.zoom);
    const x0 = cam.x - hw, x1 = cam.x + hw, y0 = cam.y - hh, y1 = cam.y + hh;
    const SPAN = GRID * PITCH;
    const view = { x0, x1, y0, y1 };

    // Ocean with a slow swell, only when the beach is on screen.
    ctx.fillStyle = LIGHT.water;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (x1 > SPAN + SAND) {
      ctx.strokeStyle = 'rgba(90,160,210,0.15)';
      ctx.lineWidth = 2;
      const t = game.time;
      for (let wy = Math.floor(y0 / 88) * 88; wy < y1; wy += 88) {
        ctx.beginPath();
        for (let wx = Math.max(x0, SPAN + SAND); wx < x1; wx += 26) {
          const yo = Math.sin(wx * 0.021 + wy * 0.1 + t * 1.35) * 4;
          wx <= Math.max(x0, SPAN + SAND) + 26 ? ctx.moveTo(wx, wy + yo) : ctx.lineTo(wx, wy + yo);
        }
        ctx.stroke();
      }
      // Shore foam lines where water meets sand.
      ctx.strokeStyle = LIGHT.foam;
      ctx.lineWidth = 3;
      for (let wy = Math.floor(y0 / 140) * 140; wy < y1; wy += 140) {
        ctx.beginPath();
        ctx.moveTo(SPAN + SAND, wy + Math.sin(t * 1.6 + wy) * 5);
        ctx.lineTo(SPAN + SAND + 60, wy + 10 + Math.sin(t * 1.6 + wy) * 5);
        ctx.stroke();
      }
    }
    // Sand with a wet band at the waterline.
    if (x1 > SPAN) {
      ctx.fillStyle = LIGHT.sand;
      ctx.fillRect(SPAN, Math.max(0, y0), SAND, Math.min(SPAN, y1) - Math.max(0, y0));
      ctx.fillStyle = LIGHT.sandWet;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(SPAN + SAND - 52, Math.max(0, y0), 52, Math.min(SPAN, y1) - Math.max(0, y0));
      ctx.globalAlpha = 1;
    }

    // The docks district paints its own ground, roads and water north of
    // the grid before the city layer takes over at y >= 0.
    if (game.docks) drawDocksBase(ctx, game.docks, view);

    this.roads(ctx, game, view);
    this.blocks(ctx, game, view);
    this.actors(ctx, game, cam, view);
    if (game.docks) {
      // Ferry and gulls ride above the district's static layer.
      game.ferry?.draw(ctx);
      drawDocksSky(ctx, game.docks, view);
    }
  }

  roads(ctx, game, view) {
    const { x0, x1, y0, y1 } = view;
    // City roads stop at the shoreline: everything north of y=0 belongs to
    // the docks, which paints its own street grid.
    const ry0 = Math.max(0, y0);
    const i0 = Math.max(0, Math.floor((x0 - ROAD / 2) / PITCH)), i1 = Math.min(GRID, Math.ceil((x1 + ROAD / 2) / PITCH));
    const j0 = Math.max(0, Math.floor((y0 - ROAD / 2) / PITCH)), j1 = Math.min(GRID, Math.ceil((y1 + ROAD / 2) / PITCH));

    ctx.fillStyle = LIGHT.asphalt;
    for (let i = i0; i <= i1; i++) ctx.fillRect(i * PITCH - ROAD / 2, ry0, ROAD, y1 - ry0);
    for (let j = j0; j <= j1; j++) ctx.fillRect(x0, j * PITCH - ROAD / 2, x1 - x0, ROAD);

    // Wet-asphalt variation: faint darker patches per road cell, deterministic per seed.
    ctx.fillStyle = 'rgba(8,10,18,0.16)';
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j < j1; j++) {
        if (hash01(i * 3.7, j * 9.1) < 0.4) {
          ctx.fillRect(i * PITCH - ROAD / 2, Math.max(j * PITCH + ROAD / 2, ry0), ROAD, Math.min(PITCH - ROAD, y1 - Math.max(j * PITCH + ROAD / 2, ry0)));
        }
      }
    }

    // Dashed centre lines, skipping the intersection squares.
    ctx.strokeStyle = LIGHT.paint;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 34]);
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j < j1; j++) {
        const a = j * PITCH + ROAD / 2 + 6, b = (j + 1) * PITCH - ROAD / 2 - 6;
        if (b < y0 || a > y1) continue;
        ctx.moveTo(i * PITCH, Math.max(a, y0));
        ctx.lineTo(i * PITCH, Math.min(b, y1));
      }
    }
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i < i1; i++) {
        const a = i * PITCH + ROAD / 2 + 6, b = (i + 1) * PITCH - ROAD / 2 - 6;
        if (b < x0 || a > x1) continue;
        ctx.moveTo(Math.max(a, x0), j * PITCH);
        ctx.lineTo(Math.min(b, x1), j * PITCH);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Intersections: worn centre, zebra crossings on all four approaches.
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const cx = i * PITCH, cy = j * PITCH;
        if (cx + ROAD / 2 < x0 || cx - ROAD / 2 > x1 || cy + ROAD / 2 < y0 || cy - ROAD / 2 > y1) continue;
        ctx.fillStyle = LIGHT.asphaltJoint;
        ctx.fillRect(cx - ROAD / 2, cy - ROAD / 2, ROAD, ROAD);
        ctx.fillStyle = 'rgba(226,226,236,0.26)';
        for (let s = 0; s < 5; s++) {
          const off = -ROAD / 2 + 9 + s * 16;
          ctx.fillRect(cx + off, cy - ROAD / 2 - 26, 9, 18);
          ctx.fillRect(cx + off, cy + ROAD / 2 + 8, 9, 18);
          ctx.fillRect(cx - ROAD / 2 - 26, cy + off, 18, 9);
          ctx.fillRect(cx + ROAD / 2 + 8, cy + off, 18, 9);
        }
        // Manhole cover on some crossings.
        if (hash01(i * 13.1, j * 7.7) < 0.3) {
          ctx.fillStyle = '#1c1e24';
          ctx.beginPath(); ctx.arc(cx + ROAD / 4, cy + ROAD / 4, 6, 0, TAU); ctx.fill();
        }
      }
    }
  }

  blocks(ctx, game, view) {
    const { x0, x1, y0, y1 } = view;
    const bi0 = clamp(Math.floor((x0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bi1 = clamp(Math.ceil((x1 + ROAD / 2) / PITCH), 0, GRID - 1);
    const bj0 = clamp(Math.floor((y0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bj1 = clamp(Math.ceil((y1 + ROAD / 2) / PITCH), 0, GRID - 1);
    for (let i = bi0; i <= bi1; i++) {
      for (let j = bj0; j <= bj1; j++) {
        const block = game.city.blocks[i * GRID + j];
        const r = blockRect(i, j);
        ctx.fillStyle = LIGHT.sidewalk;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        // Paving joints across the sidewalk band.
        ctx.strokeStyle = LIGHT.paving;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let px = r.x + 44; px < r.x + r.w; px += 44) {
          ctx.moveTo(px, r.y); ctx.lineTo(px, r.y + WALK);
          ctx.moveTo(px, r.y + r.h - WALK); ctx.lineTo(px, r.y + r.h);
        }
        for (let py = r.y + 44; py < r.y + r.h; py += 44) {
          ctx.moveTo(r.x, py); ctx.lineTo(r.x + WALK, py);
          ctx.moveTo(r.x + r.w - WALK, py); ctx.lineTo(r.x + r.w, py);
        }
        ctx.stroke();
        ctx.strokeStyle = LIGHT.curb;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(r.x, r.y, r.w, r.h);

        const ix = r.x + WALK, iy = r.y + WALK, iw = r.w - WALK * 2, ih = r.h - WALK * 2;
        if (block.kind === 'park') {
          ctx.fillStyle = LIGHT.grass;
          ctx.fillRect(ix, iy, iw, ih);
          ctx.strokeStyle = 'rgba(120,130,110,0.25)';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(ix, iy + ih / 2); ctx.lineTo(ix + iw, iy + ih / 2);
          ctx.moveTo(ix + iw / 2, iy); ctx.lineTo(ix + iw / 2, iy + ih);
          ctx.stroke();
        } else if (block.kind === 'plaza') {
          ctx.fillStyle = '#434759';
          ctx.fillRect(ix, iy, iw, ih);
          ctx.fillStyle = '#4d5268';
          ctx.beginPath(); ctx.arc(ix + iw / 2, iy + ih / 2, 36, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#585d74';
          ctx.lineWidth = 3;
          ctx.stroke();
        } else if (block.kind === 'lot') {
          ctx.fillStyle = LIGHT.asphaltJoint;
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
          ctx.fillStyle = '#22252f';
          ctx.fillRect(ix, iy, iw, ih);
        }
      }
    }
  }

  /** Everything that stands on the ground, painter-sorted by its base line. */
  actors(ctx, game, cam, view) {
    const { x0, x1, y0, y1 } = view;
    const items = [];
    const bi0 = clamp(Math.floor((x0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bi1 = clamp(Math.ceil((x1 + ROAD / 2) / PITCH), 0, GRID - 1);
    const bj0 = clamp(Math.floor((y0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bj1 = clamp(Math.ceil((y1 + ROAD / 2) / PITCH), 0, GRID - 1);
    for (let i = bi0; i <= bi1; i++) {
      for (let j = bj0; j <= bj1; j++) {
        const block = game.city.blocks[i * GRID + j];
        for (const b of block.buildings) items.push({ z: b.y + b.h, kind: 'bld', o: b });
        for (const p of block.palms) items.push({ z: p.y, kind: 'palm', o: p });
        for (const s of block.signs) items.push({ z: s.y + s.h, kind: 'sign', o: s });
      }
    }
    for (const p of game.city.beachPalms) {
      if (p.y > y0 - 60 && p.y < y1 + 60 && p.x > x0 - 60 && p.x < x1 + 60) items.push({ z: p.y, kind: 'palm', o: p });
    }
    for (const c of game.cars) {
      if (c.x > x0 - 150 && c.x < x1 + 150 && c.y > y0 - 150 && c.y < y1 + 150) items.push({ z: c.y + c.spec.len / 2, kind: 'car', o: c });
    }
    for (const person of game.people) {
      if (person.x > x0 - 40 && person.x < x1 + 40 && person.y > y0 - 40 && person.y < y1 + 40) items.push({ z: person.y, kind: 'person', o: person });
    }
    if (!game.player.car) items.push({ z: game.player.y, kind: 'hero', o: game.player });
    for (const pk of game.pickups) {
      if (pk.dead) continue;
      if (pk.x > x0 - 40 && pk.x < x1 + 40 && pk.y > y0 - 40 && pk.y < y1 + 40) items.push({ z: pk.y, kind: 'pk', o: pk });
    }
    const marker = game.missions.marker();
    if (marker && marker.x > x0 - 200 && marker.x < x1 + 200 && marker.y > y0 - 200 && marker.y < y1 + 200) {
      items.push({ z: marker.y + 1, kind: 'marker', o: marker });
    }
    // The docks' own props join the same y-sort so a car parked in front of
    // a container stack reads correctly.
    if (game.docks) {
      for (const it of dockSortItems(game.docks, view)) items.push({ z: it.z, kind: 'dock', sub: it.kind, o: it.o });
    }
    const hMarker = game.heists?.marker();
    if (hMarker && hMarker.x > x0 - 200 && hMarker.x < x1 + 200 && hMarker.y > y0 - 200 && hMarker.y < y1 + 200) {
      items.push({ z: hMarker.y + 1, kind: 'marker', o: hMarker });
    }
    items.sort((a, b) => a.z - b.z);
    for (const it of items) {
      if (it.kind === 'bld') this.building(ctx, it.o);
      else if (it.kind === 'palm') this.palm(ctx, it.o, game);
      else if (it.kind === 'sign') this.signBase(ctx, it.o, game);
      else if (it.kind === 'car') this.car(ctx, it.o);
      else if (it.kind === 'person') this.person(ctx, it.o);
      else if (it.kind === 'hero') this.hero(ctx, game.player);
      else if (it.kind === 'pk') this.pickup(ctx, it.o, game);
      else if (it.kind === 'marker') this.marker(ctx, it.o, game);
      else if (it.kind === 'dock') drawDockItem(ctx, it.sub, it.o, game.docks);
    }

    // Dark smoke and blast debris ride the base layer; the bright particles glow above.
    for (const p of game.fx.pool) {
      if (!p.live || (p.kind !== 'smoke' && p.kind !== 'debris')) continue;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.7;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  building(ctx, b) {
    const lift = Math.min(28, 4 + b.floors * 2.7);
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // South-facing window slots, warm or cool when lit.
    ctx.fillStyle = '#0f1220';
    const cols = Math.max(1, Math.floor((b.w - 12) / 21));
    for (let c = 0; c < cols; c++) {
      const wx = b.x + 10 + c * 21, wy = b.y + b.h - lift + 4;
      ctx.fillRect(wx, wy, 9, lift - 9);
      if (hash01(b.x + c * 7.3, b.y) < b.lit) {
        ctx.fillStyle = hash01(b.x * 1.7 + c, b.y * 2.3) < 0.68 ? '#ffce8c' : '#9edaff';
        ctx.fillRect(wx, wy, 9, lift - 9);
        ctx.fillStyle = '#0f1220';
      }
    }
    // East-facing strip.
    const rows = Math.max(1, Math.floor((b.h - 12) / 21));
    for (let r = 0; r < rows; r++) {
      const wx = b.x + b.w - lift + 4, wy = b.y + 10 + r * 21;
      ctx.fillRect(wx, wy, lift - 9, 9);
      if (hash01(b.y + r * 5.1, b.x) < b.lit) {
        ctx.fillStyle = hash01(b.y * 1.3 + r, b.x * 3.1) < 0.68 ? '#ffce8c' : '#9edaff';
        ctx.fillRect(wx, wy, lift - 9, 9);
        ctx.fillStyle = '#0f1220';
      }
    }
    // Roof slab pushed north-west with a lit parapet line.
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x - lift, b.y - lift, b.w, b.h);
    ctx.strokeStyle = LIGHT.roofTrim;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x - lift, b.y - lift, b.w, b.h);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fillRect(b.x - lift, b.y - lift, b.w, 3);
    // Rooftop clutter: AC boxes and vent caps.
    for (const ac of b.acs) {
      ctx.fillStyle = '#565b66';
      ctx.fillRect(ac.x - lift, ac.y - lift, ac.s, ac.s);
      ctx.fillStyle = '#6d7381';
      ctx.fillRect(ac.x - lift + 2, ac.y - lift + 2, ac.s - 4, ac.s - 4);
    }
    for (const s of b.stacks) {
      ctx.fillStyle = '#3b3e49';
      ctx.beginPath(); ctx.arc(s.x - lift, s.y - lift, s.r, 0, TAU); ctx.fill();
    }
    // Water tank: a raised drum with a dark cap shadow.
    if (b.tank) {
      ctx.fillStyle = '#2a2d38';
      ctx.beginPath(); ctx.arc(b.tank.x - lift, b.tank.y - lift, b.tank.r + 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#565b66';
      ctx.beginPath(); ctx.arc(b.tank.x - lift, b.tank.y - lift - 1.5, b.tank.r, 0, TAU); ctx.fill();
    }
    // Antenna mast: a thin lattice stroke rising off the roof (the beacon glows above).
    if (b.ant) {
      ctx.strokeStyle = '#20232c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.ant.x - lift, b.ant.y - lift);
      ctx.lineTo(b.ant.x - lift, b.ant.y - lift - b.ant.h);
      ctx.moveTo(b.ant.x - lift - 3, b.ant.y - lift);
      ctx.lineTo(b.ant.x - lift, b.ant.y - lift - b.ant.h * 0.5);
      ctx.moveTo(b.ant.x - lift + 3, b.ant.y - lift);
      ctx.lineTo(b.ant.x - lift, b.ant.y - lift - b.ant.h * 0.5);
      ctx.stroke();
    }
  }

  signBase(ctx, s, game) {
    // Emissive paint: full colour here; halo, spill and reflection come in the glow layer.
    const flick = s.flicker ? Math.sin(game.time * 9 + s.seed) + Math.sin(game.time * 23 + s.seed * 2) : 1;
    const a = s.flicker ? (flick > -0.4 ? 1 : 0.35) : 1;
    ctx.globalAlpha = a;
    ctx.fillStyle = s.color;
    if (s.style === 'board') {
      // Rooftop billboard: dark board, glowing rim, bright tube text.
      ctx.fillStyle = '#12141d';
      ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#0c0e16';
      ctx.font = 'bold 11px Consolas, "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(s.text, s.x + s.w / 2, s.y + s.h / 2 + 4);
      // Two support posts up to the roof.
      ctx.strokeStyle = '#20222c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.x + 6, s.y + s.h); ctx.lineTo(s.x + 6, s.y + s.h + 12);
      ctx.moveTo(s.x + s.w - 6, s.y + s.h); ctx.lineTo(s.x + s.w - 6, s.y + s.h + 12);
      ctx.stroke();
    } else {
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
    }
    ctx.globalAlpha = 1;
  }

  palm(ctx, p, game) {
    const sway = Math.sin(game.time * 1.25 + p.x * 0.011) * 0.09;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.s, p.s);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(10, 6, 22, 9, 0, 0, TAU); ctx.fill();
    // Trunk: two strokes for a rough silhouette, plus a root flare.
    ctx.strokeStyle = '#5c4228';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#6b4e30';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, TAU); ctx.stroke();
    // Fronds: tapered filled leaves fanning around the crown, alternating greens.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + sway;
      const tipX = Math.cos(a + sway) * 28, tipY = Math.sin(a + sway) * 28;
      ctx.fillStyle = k % 2 ? '#3f9a5c' : '#4db572';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a - 0.28) * 17 - 2, Math.sin(a - 0.28) * 17 - 2, tipX, tipY);
      ctx.quadraticCurveTo(Math.cos(a + 0.28) * 17 + 2, Math.sin(a + 0.28) * 17 + 2, 0, 0);
      ctx.fill();
    }
    ctx.fillStyle = '#5dbd7d';
    ctx.beginPath(); ctx.arc(0, 0, 4.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6b4e30';
    ctx.beginPath(); ctx.arc(3, 3, 2, 0, TAU); ctx.arc(-3, 2, 2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  car(ctx, v) {
    const s = v.spec;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.save();
    ctx.rotate(v.ang);
    ctx.fillRect(-s.len / 2 + 4, -s.wid / 2 + 5, s.len, s.wid);
    ctx.restore();
    ctx.rotate(v.ang);
    const burnt = v.wasted;
    ctx.fillStyle = burnt ? '#1a1a1e' : s.tone;
    this.roundRect(ctx, -s.len / 2, -s.wid / 2, s.len, s.wid, 7);
    ctx.fill();
    if (!burnt) {
      // Trim stripe along the flank for the models that wear one.
      ctx.fillStyle = s.trim;
      ctx.fillRect(-s.len * 0.1, -s.wid / 2 + 1.5, s.len * 0.2, 2);
      ctx.fillRect(-s.len * 0.1, s.wid / 2 - 3.5, s.len * 0.2, 2);
      // Tyres poke past the body corners.
      ctx.fillStyle = '#0e0e12';
      for (const [wx, wy] of [[-s.len / 2 + 11, -s.wid / 2 - 2.5], [-s.len / 2 + 11, s.wid / 2 - 3.5], [s.len / 2 - 15, -s.wid / 2 - 2.5], [s.len / 2 - 15, s.wid / 2 - 3.5]]) {
        ctx.fillRect(wx, wy, 10, 6);
      }
    }
    // Cabin glass and rear deck.
    ctx.fillStyle = burnt ? '#0c0c0f' : '#141925';
    this.roundRect(ctx, -s.len / 2 + s.len * 0.29, -s.wid / 2 + 5, s.len * 0.33, s.wid - 10, 4);
    ctx.fill();
    ctx.fillStyle = burnt ? '#222226' : this.brighten(s.tone, 1.16);
    this.roundRect(ctx, -s.len / 2 + s.len * 0.17, -s.wid / 2 + 6, s.len * 0.15, s.wid - 12, 3);
    ctx.fill();
    if (!burnt) {
      // Headlights and tail lights.
      ctx.fillStyle = '#e8e8d4';
      ctx.fillRect(s.len / 2 - 5, -s.wid / 2 + 5, 4, 7);
      ctx.fillRect(s.len / 2 - 5, s.wid / 2 - 12, 4, 7);
      ctx.fillStyle = '#b02a2a';
      ctx.fillRect(-s.len / 2 + 1, -s.wid / 2 + 5, 3, 7);
      ctx.fillRect(-s.len / 2 + 1, s.wid / 2 - 12, 3, 7);
    }
    if (s.id === 'warden') {
      // Police livery: navy band, roof pod, static lightbar (the glow layer animates it).
      ctx.fillStyle = '#1c2c54';
      ctx.fillRect(-s.len / 2 + s.len * 0.28, -s.wid / 2, s.len * 0.2, s.wid);
      ctx.fillStyle = burnt ? '#202024' : '#101318';
      ctx.fillRect(-s.len / 2 + s.len * 0.4, -6, 12, 12);
      if (!burnt) {
        ctx.fillStyle = '#4a7dff';
        ctx.fillRect(-s.len / 2 + s.len * 0.42, -5, 3, 10);
        ctx.fillStyle = '#ff4a55';
        ctx.fillRect(-s.len / 2 + s.len * 0.42 + 5, -5, 3, 10);
      }
    }
    if (s.id === 'cabana' && !burnt) {
      ctx.fillStyle = '#181818';
      ctx.fillRect(-6, -8, 12, 16);
      ctx.fillStyle = '#ffd977';
      ctx.fillRect(-4, -6, 8, 5);
    }
    if (!burnt && v.hp < s.hp * 0.5) {
      ctx.fillStyle = 'rgba(10,10,12,0.55)';
      ctx.beginPath(); ctx.arc(s.len * 0.22, -s.wid * 0.15, 8, 0, TAU); ctx.fill();
      if (v.hp < s.hp * 0.3) { ctx.beginPath(); ctx.arc(-s.len * 0.2, s.wid * 0.2, 7, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  person(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.mode === 'down') {
      ctx.fillStyle = 'rgba(120,16,28,0.5)';
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = p.shirt;
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = p.skin;
      ctx.beginPath(); ctx.arc(7, 2, 3, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(2, 3, 6.5, 3.2, 0, 0, TAU); ctx.fill();
    const bob = p.mode === 'bolt' ? Math.sin(p.phase * 2.1) * 1.6 : Math.sin(p.phase) * 1.1;
    const step = p.mode === 'gawk' || p.pauseT > 0 ? 0 : Math.sin(p.phase) * 3;
    ctx.fillStyle = '#14161c';
    ctx.fillRect(-3 + step, 2, 3, 3);
    ctx.fillRect(1 - step, 2, 3, 3);
    ctx.fillStyle = p.shirt;
    ctx.beginPath(); ctx.ellipse(0, -2 + bob * 0.2, 5, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(0, -7, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = p.hair;
    ctx.beginPath(); ctx.arc(0, -7.6, 3.1, Math.PI * 0.9, TAU * 1.6); ctx.fill();
    if (p.isCop) {
      ctx.fillStyle = '#16233c';
      ctx.fillRect(-3, -10.6, 6, 2.4);
    }
    ctx.restore();
  }

  hero(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.heading + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(2, 3, 7, 3.6, 0, 0, TAU); ctx.fill();
    const step = Math.sin(p.walkPhase) * 3.4;
    ctx.fillStyle = '#101218';
    ctx.fillRect(-4 + step, 2, 3.4, 4);
    ctx.fillRect(1 - step, 2, 3.4, 4);
    // The old pink-and-teal vacation shirt.
    ctx.fillStyle = '#e2527e';
    ctx.beginPath(); ctx.ellipse(0, -2, 5.6, 6.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2fb9a8';
    ctx.fillRect(-4, -4, 3, 3);
    ctx.fillRect(2, -1, 3, 3);
    ctx.fillStyle = '#c99a72';
    ctx.beginPath(); ctx.arc(0, -8, 3.8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#241a10';
    ctx.beginPath(); ctx.arc(0, -9.4, 3.3, Math.PI * 0.85, TAU * 1.55); ctx.fill();
    if (p.weapon === 'pistol') {
      ctx.fillStyle = '#20242c';
      ctx.fillRect(3, -10, 6.5, 3);
    }
    ctx.restore();
  }

  pickup(ctx, pk, game) {
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

  marker(ctx, m, game) {
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
    ctx.translate(m.x, m.y - 34 + Math.sin(game.time * 4) * 5);
    ctx.beginPath();
    ctx.moveTo(-10, -12); ctx.lineTo(10, -12); ctx.lineTo(0, 4); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- ambient layer

  ambient(game, cam, W, H) {
    const lc = this.lightCtx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    const amb = LIGHT.ambient;
    lc.fillStyle = `rgb(${amb[0]},${amb[1]},${amb[2]})`;
    lc.fillRect(0, 0, W, H);
    // Moon wash over the water, fading inland.
    lc.save();
    lc.translate(W / 2, H / 2);
    lc.scale(cam.zoom, cam.zoom);
    lc.translate(-cam.x, -cam.y);
    const SPAN = GRID * PITCH;
    const g = lc.createLinearGradient(SPAN - 210, 0, SPAN + SAND + OCEAN * 0.8, 0);
    g.addColorStop(0, 'rgba(72,112,160,0)');
    g.addColorStop(0.25, 'rgba(72,112,160,0.45)');
    g.addColorStop(0.6, 'rgba(84,128,178,0.76)');
    g.addColorStop(1, 'rgba(84,128,178,0.55)');
    lc.fillStyle = g;
    lc.fillRect(SPAN - 210, cam.y - H / cam.zoom, SAND + OCEAN + 210, (H / cam.zoom) * 2);
    lc.restore();
    // Weather tints the whole light map: cool damp tones under rain and storm.
    if (game.weather) game.weather.paintLight(lc, W, H);
  }

  // ---------------------------------------------------------------- glow layer

  glow(game, cam, W, H) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    const hw = W / (2 * cam.zoom), hh = H / (2 * cam.zoom);
    const x0 = cam.x - hw - 260, x1 = cam.x + hw + 260, y0 = cam.y - hh - 260, y1 = cam.y + hh + 260;
    const SPAN = GRID * PITCH;

    const bi0 = clamp(Math.floor((x0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bi1 = clamp(Math.ceil((x1 + ROAD / 2) / PITCH), 0, GRID - 1);
    const bj0 = clamp(Math.floor((y0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bj1 = clamp(Math.ceil((y1 + ROAD / 2) / PITCH), 0, GRID - 1);

    // North Docks glow: sodium lamps, floodlights, the lighthouse beam.
    if (game.docks) drawDocksGlow(ctx, game.docks, { x0, x1, y0: Math.min(y0, 0), y1 });

    // Street lamps from the block corners: warm pools plus a wet vertical streak.
    const lamp = this.lampSprite();
    for (let i = bi0; i <= bi1; i++) {
      for (let j = bj0; j <= bj1; j++) {
        const block = game.city.blocks[i * GRID + j];
        for (const l of block.lamps) {
          ctx.save();
          ctx.translate(l.x, l.y);
          ctx.scale(1.65, 1.3);
          ctx.drawImage(lamp, -72, -72);
          ctx.restore();
          // Sheen: the lamp stretches into a long reflection on the wet road.
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.translate(l.x, l.y + 46);
          ctx.scale(0.42, 2.1);
          ctx.drawImage(lamp, -72, -72);
          ctx.restore();
        }
        // Traffic signal state dots across the crossing.
        const phase = (i + j + Math.floor(game.time / 9)) % 2;
        ctx.fillStyle = phase === 0 ? 'rgba(60,255,140,0.9)' : 'rgba(255,70,58,0.9)';
        ctx.beginPath(); ctx.arc(i * PITCH + ROAD / 2 + 6, j * PITCH - ROAD / 2 - 6, 3.4, 0, TAU); ctx.fill();
        ctx.fillStyle = phase === 0 ? 'rgba(255,70,58,0.9)' : 'rgba(60,255,140,0.9)';
        ctx.beginPath(); ctx.arc(i * PITCH - ROAD / 2 - 6, j * PITCH + ROAD / 2 + 6, 3.4, 0, TAU); ctx.fill();
      }
    }

    // Neon: halo around the tube, spill pool below, and a stretched reflection streak.
    for (let i = bi0; i <= bi1; i++) {
      for (let j = bj0; j <= bj1; j++) {
        const block = game.city.blocks[i * GRID + j];
        for (const s of block.signs) {
          const rgb = this.rgbOf(s.color);
          const flick = s.flicker ? Math.sin(game.time * 9 + s.seed) + Math.sin(game.time * 23 + s.seed * 2) : 1;
          const a = s.flicker && flick <= -0.4 ? 0.3 : 1;
          const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
          const rad = Math.max(s.w, s.h) * 1.4;
          const halo = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
          halo.addColorStop(0, `rgba(${rgb},${0.32 * a})`);
          halo.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = halo;
          ctx.beginPath(); ctx.arc(cx, cy, rad, 0, TAU); ctx.fill();
          // Spill on the ground the sign faces.
          const spillY = s.vertical ? cy : s.y + s.h + 26;
          const spill = ctx.createRadialGradient(cx, spillY, 4, cx, spillY, 74);
          spill.addColorStop(0, `rgba(${rgb},${0.2 * a})`);
          spill.addColorStop(1, `rgba(${rgb},0)`);
          ctx.save();
          ctx.translate(cx, spillY);
          ctx.scale(1.45, 0.9);
          ctx.beginPath(); ctx.arc(0, 0, 74, 0, TAU); ctx.fill();
          ctx.restore();
          // Wet reflection: a narrow vertical streak under the sign.
          ctx.save();
          ctx.globalAlpha = 0.3 * a;
          ctx.translate(cx, spillY + 34);
          ctx.scale(0.3, 2.4);
          const ref = ctx.createRadialGradient(0, 0, 2, 0, 0, 60);
          ref.addColorStop(0, `rgba(${rgb},0.5)`);
          ref.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = ref;
          ctx.beginPath(); ctx.arc(0, 0, 60, 0, TAU); ctx.fill();
          ctx.restore();
        }
        // Antenna beacons: a slow red blink pinned to the tallest roofs.
        for (const b of block.buildings) {
          if (!b.ant) continue;
          if (Math.floor(game.time * 1.6 + b.ant.x) % 4 !== 0) continue;
          const bx = b.ant.x - Math.min(28, 4 + b.floors * 2.7), by = b.ant.y - Math.min(28, 4 + b.floors * 2.7) - b.ant.h;
          const g2 = ctx.createRadialGradient(bx, by, 1, bx, by, 9);
          g2.addColorStop(0, 'rgba(255,64,64,0.85)');
          g2.addColorStop(1, 'rgba(255,64,64,0)');
          ctx.fillStyle = g2;
          ctx.beginPath(); ctx.arc(bx, by, 9, 0, TAU); ctx.fill();
        }
      }
    }

    // Cars: headlight cones with a hot core, road pool, tail glow, sirens, firelight.
    // Parked cars sit dark — only moving vehicles burn headlights.
    for (const v of game.cars) {
      if (v.x < x0 || v.x > x1 || v.y < y0 || v.y > y1 || v.wasted) continue;
      const s = v.spec;
      const moving = v.role === 'player' || v.role === 'cop' || v.role === 'traffic' || Math.abs(v.fwd) > 6;
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.ang);
      if (moving) {
        const cone = 320;
        for (const side of [-1, 1]) {
          const g = ctx.createLinearGradient(s.len / 2, 0, s.len / 2 + cone, side * s.wid * 0.55);
          g.addColorStop(0, 'rgba(255,240,200,0.55)');
          g.addColorStop(0.35, 'rgba(255,228,172,0.22)');
          g.addColorStop(1, 'rgba(255,222,160,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(s.len / 2 - 4, side * (s.wid / 2 - 9));
          ctx.lineTo(s.len / 2 + cone, side * s.wid * 1.6);
          ctx.lineTo(s.len / 2 + cone, side * s.wid * 0.16);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,252,232,0.95)';
          ctx.fillRect(s.len / 2 - 5, side * (s.wid / 2 - 12), 5, 7);
        }
        const pool = ctx.createRadialGradient(s.len / 2 + 74, 0, 8, s.len / 2 + 74, 0, 100);
        pool.addColorStop(0, 'rgba(255,234,192,0.38)');
        pool.addColorStop(1, 'rgba(255,234,192,0)');
        ctx.fillStyle = pool;
        ctx.beginPath(); ctx.arc(s.len / 2 + 74, 0, 100, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,72,60,0.85)';
      ctx.fillRect(-s.len / 2, -s.wid / 2 + 5, 3, 7);
      ctx.fillRect(-s.len / 2, s.wid / 2 - 12, 3, 7);
      // Brake flare: stopping or slowing burns a red pool across the wet road behind.
      const braking = v.brake > 0 || v.stopped;
      if (braking) {
        const bg = ctx.createRadialGradient(-s.len / 2 - 26, 0, 4, -s.len / 2 - 26, 0, 64);
        bg.addColorStop(0, 'rgba(255,58,46,0.34)');
        bg.addColorStop(1, 'rgba(255,58,46,0)');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(-s.len / 2 - 26, 0, 64, 0, TAU); ctx.fill();
      }
      // Reverse lamp: backing up shows the driver's intent with a clean white pool.
      if (moving && v.fwd < -20) {
        const rg = ctx.createRadialGradient(-s.len / 2 - 22, 0, 3, -s.len / 2 - 22, 0, 52);
        rg.addColorStop(0, 'rgba(255,255,245,0.4)');
        rg.addColorStop(1, 'rgba(255,255,245,0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(-s.len / 2 - 22, 0, 52, 0, TAU); ctx.fill();
      }
      // Turn signal: an overtaking car blinks amber on the side it is sliding toward.
      if (moving && (v.blinker ?? 0) > 0 && Math.floor(game.time * 3.2) % 2 === 0) {
        const side = (v.laneShift ?? 0) < 0 ? -1 : 1;
        ctx.fillStyle = 'rgba(255,178,60,0.95)';
        ctx.fillRect(side < 0 ? -s.len / 2 + 2 : s.len / 2 - 7, side * (s.wid / 2 + 1), 5, 5);
      }
      ctx.restore();

      // Wet-road throw: the headlights stretch into a streak ahead of a fast car.
      if (moving && Math.abs(v.fwd) > 120) {
        const nx = Math.cos(v.ang), ny = Math.sin(v.ang);
        const sx = v.x + nx * (s.len / 2 + 34), sy = v.y + ny * (s.len / 2 + 34);
        ctx.save();
        ctx.globalAlpha = Math.min(0.3, Math.abs(v.fwd) / s.top * 0.34);
        ctx.translate(sx, sy);
        ctx.rotate(v.ang);
        ctx.scale(3.4, 0.5);
        const st = ctx.createRadialGradient(0, 0, 4, 0, 0, 70);
        st.addColorStop(0, 'rgba(255,238,196,0.5)');
        st.addColorStop(1, 'rgba(255,238,196,0)');
        ctx.fillStyle = st;
        ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.fill();
        ctx.restore();
      }

      if (s.id === 'warden' && (v.siren || v.role === 'cop')) {
        const blue = Math.floor(game.time * 6) % 2 === 0;
        const rgb = blue ? '76,132,255' : '255,74,88';
        const g = ctx.createRadialGradient(v.x, v.y, 6, v.x, v.y, 112);
        g.addColorStop(0, `rgba(${rgb},0.32)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(v.x, v.y, 112, 0, TAU); ctx.fill();
        // Floodlight sweep: a narrow beam that swings across the street as the bar spins,
        // so a cruiser carving through traffic visibly searches for its suspect.
        if (v.siren) {
          const sweep = Math.sin(game.time * 4.6 + v.specIndex * 2.1) * 1.15;
          const beamLen = 190;
          ctx.save();
          ctx.translate(v.x, v.y);
          ctx.rotate(v.ang + sweep);
          const beam = ctx.createLinearGradient(0, 0, beamLen, 0);
          beam.addColorStop(0, `rgba(${rgb},0.22)`);
          beam.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = beam;
          ctx.beginPath();
          ctx.moveTo(0, -7);
          ctx.lineTo(beamLen, -46);
          ctx.lineTo(beamLen, 46);
          ctx.lineTo(0, 7);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      if (v.wreck) {
        const g = ctx.createRadialGradient(v.x, v.y, 4, v.x, v.y, 115);
        g.addColorStop(0, 'rgba(255,142,52,0.52)');
        g.addColorStop(1, 'rgba(255,142,52,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(v.x, v.y, 115, 0, TAU); ctx.fill();
      }
    }

    // People: phone screens; officers carry a flashlight pool.
    for (const p of game.people) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1 || p.mode === 'down') continue;
      if (p.phone) {
        ctx.fillStyle = 'rgba(120,170,255,0.5)';
        ctx.beginPath(); ctx.arc(p.x, p.y - 4, 5, 0, TAU); ctx.fill();
      }
      if (p.isCop) {
        const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 112);
        g.addColorStop(0, 'rgba(255,240,190,0.22)');
        g.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, 112, 0, TAU); ctx.fill();
      }
    }

    // The hero gets a small cool pool so he always reads.
    const hero = game.player;
    const gh = ctx.createRadialGradient(hero.x, hero.y, 4, hero.x, hero.y, 84);
    gh.addColorStop(0, 'rgba(188,198,238,0.2)');
    gh.addColorStop(1, 'rgba(188,198,238,0)');
    ctx.fillStyle = gh;
    ctx.beginPath(); ctx.arc(hero.x, hero.y, 84, 0, TAU); ctx.fill();

    // Mission marker beam: a pool on the ground and a soft pillar standing in the sky.
    const marker = game.missions.marker();
    if (marker && marker.x > x0 && marker.x < x1 && marker.y > y0 && marker.y < y1) {
      const gm = ctx.createRadialGradient(marker.x, marker.y, 6, marker.x, marker.y, 88);
      gm.addColorStop(0, this.hexA(marker.color, 0.3));
      gm.addColorStop(1, this.hexA(marker.color, 0));
      ctx.fillStyle = gm;
      ctx.beginPath(); ctx.arc(marker.x, marker.y, 88, 0, TAU); ctx.fill();
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.translate(marker.x, marker.y);
      ctx.scale(0.42, 4.2);
      ctx.fillStyle = this.hexA(marker.color, 0.3);
      ctx.beginPath(); ctx.arc(0, 0, 52, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // Pickups shimmer.
    for (const pk of game.pickups) {
      if (pk.dead || pk.x < x0 || pk.x > x1 || pk.y < y0 || pk.y > y1) continue;
      const c = pk.kind === 'pistol' ? '255,217,119' : pk.kind === 'health' ? '125,255,164' : pk.kind === 'armor' ? '111,183,255' : '199,255,125';
      const gk = ctx.createRadialGradient(pk.x, pk.y, 2, pk.x, pk.y, 18);
      gk.addColorStop(0, `rgba(${c},0.45)`);
      gk.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = gk;
      ctx.beginPath(); ctx.arc(pk.x, pk.y, 18, 0, TAU); ctx.fill();
    }

    // Bright particles: fire, muzzle, flash, sparks, cash.
    for (const pt of game.fx.pool) {
      if (!pt.live || pt.kind === 'smoke' || pt.kind === 'debris' || pt.kind === 'blood') continue;
      const a = clamp(pt.life / pt.max, 0, 1);
      if (pt.kind === 'flash') {
        const size = pt.size * (1.3 - a * 0.3);
        const rgb = '255,223,158';
        const gf = ctx.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, size);
        gf.addColorStop(0, `rgba(255,244,214,${0.85 * a})`);
        gf.addColorStop(0.4, `rgba(${rgb},${0.4 * a})`);
        gf.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = gf;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, size, 0, TAU); ctx.fill();
        continue;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------------------------------------------------------------- helpers

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  rgbOf(hex) {
    const h = hex.replace('#', '');
    return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
  }

  hexA(hex, a) { return `rgba(${this.rgbOf(hex)},${a})`; }

  brighten(hex, f) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`;
  }

  lampSprite() {
    if (this.lampCache) return this.lampCache;
    const c = document.createElement('canvas');
    c.width = 144; c.height = 144;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(72, 72, 4, 72, 72, 70);
    rg.addColorStop(0, 'rgba(255,216,142,0.42)');
    rg.addColorStop(0.5, 'rgba(255,202,122,0.14)');
    rg.addColorStop(1, 'rgba(255,202,122,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 144, 144);
    this.lampCache = c;
    return c;
  }
}
