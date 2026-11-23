// ============================================================
// PAINT — the render pipeline. One canvas, one Painter.
//
//   1. Sky pass (screen space): the time-of-day gradient, stars,
//      moon, clouds, the distant silhouette ring on the horizon.
//   2. World transform, then the base pass in full colour:
//      ocean and bay, sand, the street grid with its roads and
//      blocks, the North Docks apron with its yards, piers and
//      rail spur, the Palm Airfield with its runway and apron,
//      then ground decals (gantries, taxi markers, door mats,
//      the ferry's schedule board).
//   3. The y-sorted actor pass: buildings, neon signs, palms,
//      docks structures, airfield structures, cars, people,
//      boats, the ferry — everything with a footprint sorts by
//      its south edge so overlap reads correctly.
//   4. Bullets and particles above the actors, gulls above that.
//   5. The light map: an ambient multiply with lights painted
//      into it (lamps, windows, neon spill, headlights, floods,
//      fires), so unlit ground falls into the night while lit
//      ground keeps its colour. The sky stays full strength:
//      the map is white above the horizon line.
//   6. The additive glow pass on top: warm lamp tints, sodium
//      orange, neon colour spill, headlight cones, brake and
//      reverse lamps, blinkers, police floods, the lighthouse
//      beam, wet-asphalt reflections, fire, the blast flash.
//   7. Weather overlays in screen space: rain streaks, fog,
//      lightning. The HUD and menus ride on top of all of it.
// ============================================================

import { GRID, PITCH, ROAD, WALK, SAND, OCEAN, SPAN, LIGHT } from '../config.js';
import { clamp, TAU, hash01 } from '../util.js';
import { paintSky, paintFarRing } from './skyline.js';
import { DOCKS_NORTH_Y, DOCKS_WATER_Y } from '../world/district.js';
import { drawScheduleBoard } from '../systems/ferry.js';

const OCEAN_X = SPAN + SAND;          // where the sea begins
const WORLD_E = SPAN + SAND + OCEAN;  // east edge of the painted world
const AMBIENT = `rgb(${LIGHT.ambient[0]},${LIGHT.ambient[1]},${LIGHT.ambient[2]})`;

// Road paint: the dashed centreline and the crosswalk ticks.
const LINE = 'rgba(201,195,154,0.34)';

export class Painter {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lm = document.createElement('canvas');   // the light map
    this.scratch = [];
  }

  resize() {
    this.lm.width = this.canvas.width;
    this.lm.height = this.canvas.height;
  }

  // ---------------------------------------------------------- entry

  render(game, opts = {}) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const cam = opts.cameraOverride ?? game.camera
      ?? { x: game.player.x, y: game.player.y, zoom: 0.9 };
    const zoom = cam.zoom ?? 0.9;

    // Camera shake: the blast wash rocks the frame while it decays.
    const shake = game.shake ?? 0;
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;

    // Sky first, full strength, screen space.
    paintSky(ctx, game, W, H);

    // World transform. Everything from here to the light map is world space.
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);

    const view = {
      x0: cam.x - W / (2 * zoom) - 140,
      x1: cam.x + W / (2 * zoom) + 140,
      y0: cam.y - H / (2 * zoom) - 140,
      y1: cam.y + H / (2 * zoom) + 140,
    };

    // The far ring stands on the docks horizon, behind the whole city.
    paintFarRing(ctx, game, cam, view);

    this.basePass(ctx, game, view);
    this.decalPass(ctx, game, view);
    this.actorPass(ctx, game, view);
    this.effectPass(ctx, game, view);
    this.gullPass(ctx, game, view);

    ctx.restore();

    // Ambient multiply over the world, sky excepted: the light map is
    // white above the horizon line so the night sky keeps its palette.
    this.lightPass(ctx, game, cam, zoom, W, H, sx, sy);

    // Additive glow on top of the lit scene.
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);
    ctx.globalCompositeOperation = 'lighter';
    this.glowPass(ctx, game, view);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // Blast flash: a warm wash that decays with the shake.
    if (game.flash > 0.01) {
      ctx.fillStyle = `rgba(255,168,96,${(game.flash * 0.5).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Weather owns the last word in screen space.
    game.weather?.drawScreen?.(ctx, W, H, game.time, cam);
  }

  // ---------------------------------------------------------- ground

  basePass(ctx, game, view) {
    const city = game.city;

    // Asphalt everywhere first: the roads are what shows between blocks.
    ctx.fillStyle = LIGHT.asphalt;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);

    // ---- city blocks
    const bi0 = clamp(Math.floor((view.x0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bi1 = clamp(Math.ceil((view.x1 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bj0 = clamp(Math.floor((view.y0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bj1 = clamp(Math.ceil((view.y1 - ROAD / 2) / PITCH), 0, GRID - 1);
    for (let j = bj0; j <= bj1; j++) {
      for (let i = bi0; i <= bi1; i++) {
        const block = city.blocks[i * GRID + j];
        const bx = i * PITCH + ROAD / 2, by = j * PITCH + ROAD / 2;
        const bw = PITCH - ROAD, bh = PITCH - ROAD;
        if (block.kind === 'park') {
          ctx.fillStyle = LIGHT.grass;
          ctx.fillRect(bx, by, bw, bh);
          this.parkPatch(ctx, bx, by, bw, bh, block.i * 7 + block.j);
        } else if (block.kind === 'plaza') {
          ctx.fillStyle = LIGHT.paving;
          ctx.fillRect(bx, by, bw, bh);
          ctx.strokeStyle = 'rgba(255,255,255,0.05)';
          ctx.lineWidth = 2;
          for (let r = 60; r < 160; r += 50) {
            ctx.beginPath(); ctx.arc(bx + bw / 2, by + bh / 2, r, 0, TAU); ctx.stroke();
          }
        } else if (block.kind === 'lot') {
          ctx.fillStyle = LIGHT.asphaltJoint;
          ctx.fillRect(bx, by, bw, bh);
          ctx.strokeStyle = 'rgba(232,228,204,0.24)';
          ctx.lineWidth = 3;
          for (const s of block.stalls) {
            ctx.strokeRect(s.x - 23, s.y - 52, 46, 104);
          }
        } else if (block.kind === 'airfield') {
          // painted wholesale by the airfield ground pass below
        } else {
          // Sidewalk band, then the inner paving the buildings stand on.
          ctx.fillStyle = LIGHT.sidewalk;
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = LIGHT.paving;
          ctx.fillRect(bx + WALK, by + WALK, bw - WALK * 2, bh - WALK * 2);
        }
      }
    }

    // ---- road markings: dashed centrelines on every visible grid road.
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 34]);
    ctx.beginPath();
    for (let i = bi0; i <= bi1 + 1; i++) {
      const x = i * PITCH;
      if (x < view.x0 - 8 || x > view.x1 + 8) continue;
      const y0 = Math.max(view.y0, 0), y1 = Math.min(view.y1, SPAN);
      if (y1 > y0) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    }
    for (let j = bj0; j <= bj1 + 1; j++) {
      const y = j * PITCH;
      if (y < view.y0 - 8 || y > view.y1 + 8) continue;
      const x0 = Math.max(view.x0, 0), x1 = Math.min(view.x1, SPAN);
      if (x1 > x0) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // ---- beach and ocean east of the grid.
    if (view.x1 > SPAN) {
      const sandX = Math.max(SPAN, view.x0);
      const sandW = Math.min(OCEAN_X, view.x1) - sandX;
      if (sandW > 0) {
        ctx.fillStyle = LIGHT.sand;
        ctx.fillRect(sandX, Math.max(view.y0, 0), sandW, Math.min(view.y1, SPAN) - Math.max(view.y0, 0));
        // Wet sand near the waterline: the tide leaves a darker band.
        ctx.fillStyle = LIGHT.sandWet;
        ctx.fillRect(OCEAN_X - 70, Math.max(view.y0, 0), 70, Math.min(view.y1, SPAN) - Math.max(view.y0, 0));
      }
      if (view.x1 > OCEAN_X) {
        const wg = ctx.createLinearGradient(OCEAN_X, 0, WORLD_E, 0);
        wg.addColorStop(0, LIGHT.water);
        wg.addColorStop(0.25, '#10233a');
        wg.addColorStop(1, '#0a1526');
        ctx.fillStyle = wg;
        ctx.fillRect(Math.max(view.x0, OCEAN_X), Math.max(view.y0, -6000), view.x1 - Math.max(view.x0, OCEAN_X), view.y1 - Math.max(view.y0, -6000));
        // Foam at the waterline and lazy wave lines beyond it.
        ctx.fillStyle = LIGHT.foam;
        const foamX = OCEAN_X + Math.sin(game.time * 0.7) * 10;
        ctx.fillRect(foamX, Math.max(view.y0, 0), 26, Math.min(view.y1, SPAN) - Math.max(view.y0, 0));
        ctx.strokeStyle = 'rgba(140,190,225,0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let y = Math.max(view.y0, 0); y < Math.min(view.y1, SPAN); y += 64) {
          const off = Math.sin(game.time * 0.9 + y * 0.01) * 18;
          ctx.moveTo(OCEAN_X + 60 + off, y);
          ctx.lineTo(Math.min(view.x1, WORLD_E), y + 6);
        }
        ctx.stroke();
      }
      // Beach palms march down the sand.
      for (const p of city.beachPalms) {
        if (p.x < view.x0 - 60 || p.x > view.x1 + 60 || p.y < view.y0 - 60 || p.y > view.y1 + 60) continue;
        drawPalm(ctx, p.x, p.y, p.s, game.time);
      }
    }

    // ---- the bay and the North Docks apron cover everything north of y=0.
    if (view.y0 < 0) {
      const top = Math.max(view.y0, DOCKS_NORTH_Y - 400);
      // Bay water.
      const bw = ctx.createLinearGradient(0, top, 0, DOCKS_WATER_Y);
      bw.addColorStop(0, '#0a1728');
      bw.addColorStop(1, LIGHT.water);
      ctx.fillStyle = bw;
      ctx.fillRect(view.x0, top, view.x1 - view.x0, DOCKS_WATER_Y - top);
      if (view.y1 > DOCKS_WATER_Y) {
        // Bay continues east of the apron.
        if (view.x1 > SPAN) {
          ctx.fillRect(SPAN, DOCKS_WATER_Y, view.x1 - SPAN, Math.min(view.y1, 0) - DOCKS_WATER_Y);
        }
        // The apron: poured concrete, tide-stained at the seawall.
        const ax0 = Math.max(view.x0, 0), ax1 = Math.min(view.x1, SPAN);
        if (ax1 > ax0) {
          const ag = ctx.createLinearGradient(0, DOCKS_WATER_Y, 0, 0);
          ag.addColorStop(0, '#2e3138');
          ag.addColorStop(0.3, '#33353c');
          ag.addColorStop(1, '#2b2d33');
          ctx.fillStyle = ag;
          ctx.fillRect(ax0, DOCKS_WATER_Y, ax1 - ax0, Math.min(view.y1, 0) - DOCKS_WATER_Y);
          this.docksGround(ctx, game, view);
        }
        // The Bay Marina island rides the water.
        this.islandPass(ctx, game, view);
      }
    }

    // ---- the airfield lays its own ground over its claimed blocks.
    if (game.airport && view.x1 > 1200 && view.x0 < 3000 && view.y1 > 1200 && view.y0 < 2600) {
      this.airportGround(ctx, game.airport, view);
    }
  }

  parkPatch(ctx, x, y, w, h, seed) {
    // Two mown stripes and a dirt path give parks their depth.
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(x, y + h * 0.2, w, h * 0.18);
    ctx.fillStyle = 'rgba(90,70,40,0.25)';
    ctx.fillRect(x + w * 0.42, y, 26, h);
  }

  docksGround(ctx, game, view) {
    const D = game.docks;
    if (!D) return;
    // Coast and service roads.
    ctx.fillStyle = LIGHT.asphalt;
    for (const r of D.roads) {
      const x = r.kind === 'v' ? r.x - 45 : r.x;
      const y = r.kind === 'v' ? r.y : r.y;
      const w = r.kind === 'v' ? 90 : r.w;
      const h = r.kind === 'v' ? r.h : 90;
      const rx0 = Math.max(x, view.x0), rx1 = Math.min(x + w, view.x1);
      const ry0 = Math.max(y, view.y0), ry1 = Math.min(y + h, view.y1);
      if (rx1 > rx0 && ry1 > ry0) ctx.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
    }
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 3;
    ctx.setLineDash([24, 30]);
    ctx.beginPath();
    for (const r of D.roads) {
      if (r.kind === 'v') {
        if (r.x < view.x0 || r.x > view.x1) continue;
        ctx.moveTo(r.x, Math.max(r.y, view.y0)); ctx.lineTo(r.x, Math.min(0, view.y1));
      } else {
        if (r.y + 45 < view.y0 || r.y + 45 > view.y1) continue;
        ctx.moveTo(Math.max(r.x, view.x0), r.y + 45); ctx.lineTo(Math.min(r.x + r.w, view.x1), r.y + 45);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Yard aprons: slightly darker concrete with crane rails.
    for (const yd of D.yards) {
      if (yd.x1 < view.x0 || yd.x0 > view.x1 || yd.y1 < view.y0 || yd.y0 > view.y1) continue;
      ctx.fillStyle = 'rgba(12,14,20,0.28)';
      ctx.fillRect(yd.x0, yd.y0, yd.x1 - yd.x0, yd.y1 - yd.y0);
      ctx.strokeStyle = 'rgba(160,150,120,0.16)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(yd.x0 + 40, yd.y0 - 30); ctx.lineTo(yd.x1 - 40, yd.y0 - 30);
      ctx.stroke();
    }
    // Turf tints: the crews' colours bleed faintly into their ground.
    for (const t of D.gangTurf) {
      ctx.fillStyle = t.gang === 'tides' ? 'rgba(255,85,51,0.05)' : 'rgba(51,170,255,0.05)';
      ctx.fillRect(Math.max(t.x0, view.x0), Math.max(t.y0, view.y0), Math.min(t.x1, view.x1) - Math.max(t.x0, view.x0), Math.min(t.y1, view.y1) - Math.max(t.y0, view.y0));
    }
    // The promenade: paved walk with a bollard row.
    ctx.fillStyle = '#3a3d44';
    ctx.fillRect(Math.max(view.x0, 0), -1900, Math.min(view.x1, SPAN) - Math.max(view.x0, 0), 420);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let x = Math.max(view.x0, 60); x < Math.min(view.x1, SPAN); x += 90) {
      ctx.fillRect(x, -1660, 44, 6);
    }
    // Rail spur: two rails and ties, the flatcar parked on it.
    const R = D.railSpur;
    if (R && R.x1 > view.x0 && R.x0 < view.x1) {
      ctx.strokeStyle = 'rgba(120,116,104,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(Math.max(R.x0, view.x0), R.y - 6); ctx.lineTo(Math.min(R.x1, view.x1), R.y - 6);
      ctx.moveTo(Math.max(R.x0, view.x0), R.y + 6); ctx.lineTo(Math.min(R.x1, view.x1), R.y + 6);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(70,66,58,0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let x = Math.max(R.x0, view.x0); x < Math.min(R.x1, view.x1); x += 46) {
        ctx.moveTo(x, R.y - 12); ctx.lineTo(x, R.y + 12);
      }
      ctx.stroke();
    }
    // Piers: planked decks on their pilings.
    for (const p of D.piers) {
      if (p.x + p.w < view.x0 || p.x > view.x1 || p.y + p.h < view.y0 || p.y > view.y1) continue;
      ctx.fillStyle = '#5c4530';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = 'rgba(20,14,8,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let y = p.y + 22; y < p.y + p.h; y += 26) {
        ctx.moveTo(p.x, y); ctx.lineTo(p.x + p.w, y);
      }
      ctx.stroke();
      // Pilings: dark caps where the deck meets the water.
      ctx.fillStyle = '#241a10';
      for (let y = DOCKS_WATER_Y - 40; y > p.y; y -= 120) {
        ctx.fillRect(p.x + 8, y, 10, 10);
        ctx.fillRect(p.x + p.w - 18, y, 10, 10);
      }
    }
    // Fences: dark posts and mesh lines.
    ctx.fillStyle = '#1c1e24';
    for (const f of D.fences) {
      if (f.x + f.w < view.x0 || f.x > view.x1 || f.y + f.h < view.y0 || f.y > view.y1) continue;
      ctx.fillRect(f.x, f.y, f.w, f.h);
    }
    // The breakwater rocks.
    ctx.fillStyle = '#23262c';
    for (const b of D.breakwater) {
      if (b.x + b.w < view.x0 || b.x > view.x1) continue;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    // Rain puddles: dark ellipses that gleam once the light pass runs.
    const wet = game.weather?.state?.wetness ?? 0;
    if (wet > 0.15) {
      for (const p of D.puddles) {
        if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
        ctx.fillStyle = `rgba(10,14,22,${(0.4 * wet).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.rx, p.ry, p.a, 0, TAU);
        ctx.fill();
      }
    }
    // Bollards: small dark caps along the promenade and piers.
    ctx.fillStyle = '#15171c';
    for (const b of D.bollards) {
      if (b.x < view.x0 || b.x > view.x1 || b.y < view.y0 || b.y > view.y1) continue;
      ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, TAU); ctx.fill();
    }
    // Gate barrier base post.
    if (D.gate && D.gate.x + D.gate.w > view.x0 && D.gate.x < view.x1) {
      ctx.fillStyle = '#3a3e46';
      ctx.fillRect(D.gate.x - 14, D.gate.y - 10, 14, 34);
      ctx.fillRect(D.gate.x + D.gate.w, D.gate.y - 10, 14, 34);
    }
  }

  islandPass(ctx, game, view) {
    const isl = game.docks?.island;
    if (!isl) return;
    if (isl.x + isl.rx < view.x0 || isl.x - isl.rx > view.x1 || isl.y + isl.ry < view.y0 || isl.y - isl.ry > view.y1) return;
    // Sand ellipse with a rocky rim.
    ctx.fillStyle = '#23262c';
    ctx.beginPath(); ctx.ellipse(isl.x, isl.y, isl.rx + 26, isl.ry + 22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = LIGHT.sand;
    ctx.beginPath(); ctx.ellipse(isl.x, isl.y, isl.rx, isl.ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = LIGHT.sandWet;
    ctx.beginPath(); ctx.ellipse(isl.x, isl.y + isl.ry * 0.55, isl.rx * 0.9, isl.ry * 0.4, 0, 0, TAU); ctx.fill();
    // The marina landing: a short pier reaching south to meet the ferry.
    ctx.fillStyle = '#5c4530';
    ctx.fillRect(isl.x - 60, isl.y + isl.ry - 40, 120, 110);
    // A few island palms and the landing lamp.
    drawPalm(ctx, isl.x - isl.rx * 0.5, isl.y - 60, 1.1, game.time);
    drawPalm(ctx, isl.x + isl.rx * 0.45, isl.y - 110, 0.9, game.time + 2);
    drawPalm(ctx, isl.x + 40, isl.y + 40, 1.0, game.time + 4);
  }

  airportGround(ctx, A, view) {
    const { AIR, runway: R, taxiway: T, apron: AP } = A;
    if (AIR.x1 < view.x0 || AIR.x0 > view.x1 || AIR.y1 < view.y0 || AIR.y0 > view.y1) return;
    // Mowed grass: alternating stripes cover the claimed blocks.
    ctx.fillStyle = '#1e3323';
    ctx.fillRect(AIR.x0 - 40, AIR.y0 - 40, AIR.x1 - AIR.x0 + 80, AIR.y1 - AIR.y0 + 80);
    ctx.fillStyle = 'rgba(255,255,255,0.028)';
    for (let y = AIR.y0 - 40; y < AIR.y1 + 40; y += 84) {
      ctx.fillRect(AIR.x0 - 40, y, AIR.x1 - AIR.x0 + 80, 42);
    }
    // Runway: asphalt, centreline, aiming point bars, piano keys.
    ctx.fillStyle = '#24262c';
    ctx.fillRect(R.x, R.y, R.w, R.h);
    ctx.strokeStyle = 'rgba(232,228,204,0.75)';
    ctx.lineWidth = 4;
    ctx.setLineDash([46, 40]);
    ctx.beginPath();
    ctx.moveTo(R.x + 60, R.y + R.h / 2); ctx.lineTo(R.x + R.w - 60, R.y + R.h / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Threshold piano keys at both ends.
    ctx.fillStyle = 'rgba(232,228,204,0.6)';
    for (let k = 0; k < 6; k++) {
      ctx.fillRect(R.x + 14, R.y + 10 + k * 17, 34, 9);
      ctx.fillRect(R.x + R.w - 48, R.y + 10 + k * 17, 34, 9);
    }
    // Touch-down aiming bars.
    ctx.fillRect(R.x + 130, R.y + 24, 56, 12);
    ctx.fillRect(R.x + 130, R.y + R.h - 36, 56, 12);
    ctx.fillRect(R.x + R.w - 186, R.y + 24, 56, 12);
    ctx.fillRect(R.x + R.w - 186, R.y + R.h - 36, 56, 12);
    // Runway designators, painted big and faded.
    ctx.fillStyle = 'rgba(232,228,204,0.5)';
    ctx.font = 'bold 52px Consolas, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(R.x + 105, R.y + R.h / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('09', 0, 18);
    ctx.restore();
    ctx.save();
    ctx.translate(R.x + R.w - 105, R.y + R.h / 2); ctx.rotate(Math.PI / 2);
    ctx.fillText('27', 0, 18);
    ctx.restore();
    // Hold-short bars where the taxiway meets the runway.
    ctx.fillStyle = 'rgba(255,72,72,0.55)';
    for (const cx of [R.x + 260, R.x + 640, R.x + 1020]) {
      ctx.fillRect(cx - 3, T.y - 34, 6, 34);
    }
    // Taxiway and its yellow centreline.
    ctx.fillStyle = '#24262c';
    ctx.fillRect(T.x, T.y, T.w, T.h);
    ctx.strokeStyle = 'rgba(255,204,64,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(T.x, T.y + T.h / 2); ctx.lineTo(T.x + T.w, T.y + T.h / 2);
    ctx.stroke();
    // Connectors between runway and taxiway.
    ctx.fillStyle = '#24262c';
    for (const cx of [R.x + 260, R.x + 640, R.x + 1020]) {
      ctx.fillRect(cx - 24, R.y + R.h, 48, T.y - (R.y + R.h));
    }
    // Apron: stand markings and lead-in lines.
    ctx.fillStyle = '#2a2c33';
    ctx.fillRect(AP.x, AP.y, AP.w, AP.h);
    ctx.strokeStyle = 'rgba(232,228,204,0.4)';
    ctx.lineWidth = 3;
    for (const s of A.stands) {
      ctx.beginPath(); ctx.arc(s.x, s.y, 44, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x, AP.y); ctx.lineTo(s.x, s.y - 44);
      ctx.stroke();
    }
    // Cargo yard pad.
    ctx.fillStyle = '#2a2c33';
    ctx.fillRect(A.cargo.x, A.cargo.y, A.cargo.w, A.cargo.h);
    ctx.fillStyle = '#1c1e24';
    ctx.fillRect(A.cargo.x, A.cargo.y, 10, A.cargo.h);
    ctx.fillRect(A.cargo.x + A.cargo.w - 10, A.cargo.y, 10, A.cargo.h);
    ctx.fillRect(A.cargo.x, A.cargo.y + A.cargo.h - 10, A.cargo.w, 10);
  }

  // ---------------------------------------------------------- decals

  decalPass(ctx, game, view) {
    // Race start gantries and the live checkpoint ring.
    game.races?.drawWorld?.(ctx, view);
    // Taxi ranks, the waiting fare, the drop marker.
    game.taxi?.drawWorld?.(ctx, view);
    // Venue door mats: a pulsing pad where the night opens a door.
    this.doorMat(ctx, game.casino?.door, '#a86bff', game.time, view);
    this.doorMat(ctx, game.fightClub?.door, '#ff5a6e', game.time + 1.3, view);
    for (const d of game.interiors?.doors ?? []) {
      this.doorMat(ctx, d, d.color ?? '#33e7ff', game.time + d.x * 0.001, view);
    }
    // The ferry's painted schedule board at the slip.
    if (game.ferry && view.y0 < -1500) {
      drawScheduleBoard(ctx, game.ferry.slip.x, game.ferry.slip.y - 70, game.time, game.ferry.scheduleString(game.time));
    }
  }

  doorMat(ctx, door, color, t, view) {
    if (!door || door.x < view.x0 || door.x > view.x1 || door.y < view.y0 || door.y > view.y1) return;
    const pulse = 0.45 + 0.3 * Math.sin(t * 3.2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = pulse;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(door.x, door.y, 26, 0, TAU); ctx.stroke();
    ctx.globalAlpha = pulse * 0.5;
    ctx.beginPath(); ctx.arc(door.x, door.y, 15, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------- actors

  actorPass(ctx, game, view) {
    const list = this.scratch;
    list.length = 0;
    const push = (y, fn) => list.push({ y, fn });

    const city = game.city;
    const bi0 = clamp(Math.floor((view.x0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bi1 = clamp(Math.ceil((view.x1 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bj0 = clamp(Math.floor((view.y0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bj1 = clamp(Math.ceil((view.y1 - ROAD / 2) / PITCH), 0, GRID - 1);
    for (let j = bj0; j <= bj1; j++) {
      for (let i = bi0; i <= bi1; i++) {
        const block = city.blocks[i * GRID + j];
        if (block.kind === 'park' || block.kind === 'plaza') {
          for (const p of block.palms) push(p.y, () => drawPalm(ctx, p.x, p.y, p.s, game.time));
          continue;
        }
        for (const b of block.buildings) {
          push(b.y + b.h, () => drawBuilding(ctx, b, game.time));
        }
        for (const s of block.signs) push(s.y + s.h, () => drawSign(ctx, s, game.time));
        for (const p of block.palms) push(p.y, () => drawPalm(ctx, p.x, p.y, p.s, game.time));
        for (const l of block.lamps) push(l.y, () => drawLampHead(ctx, l.x, l.y));
      }
    }

    // ---- the docks district's standing structures.
    const D = game.docks;
    if (D && view.y0 < 200) {
      for (const w of D.warehouses) {
        if (cull(view, w.x, w.y, w.w, w.h)) continue;
        push(w.y + w.h, () => drawWarehouse(ctx, w, game.time));
      }
      for (const row of D.containers) {
        const base = row[0];
        if (cull(view, base.x, base.y, base.w, base.h + 40)) continue;
        push(base.y + base.h + 26, () => drawContainerStack(ctx, row, game.time));
      }
      for (const c of D.cranes) {
        if (cull(view, c.x - 260, c.y - 80, 520, 260)) continue;
        push(c.y + 40, () => drawCrane(ctx, c, game.time));
      }
      // The Coral Crown at anchor.
      const ship = D.ship;
      if (ship && !cull(view, ship.x - ship.len, ship.y - ship.wid, ship.len * 2, ship.wid * 2)) {
        push(ship.y + ship.wid / 2 + 10, () => drawShip(ctx, ship, game.time));
      }
      const lh = D.lighthouse;
      if (lh && !cull(view, lh.x - 60, lh.y - 120, 120, 200)) {
        push(lh.y + 40, () => drawLighthouse(ctx, lh, game.time));
      }
      for (const s of D.stalls) {
        if (cull(view, s.x - 40, s.y - 40, 80, 80)) continue;
        push(s.y + 20, () => drawMarketStall(ctx, s));
      }
      for (const d of D.drums) {
        if (d.x < view.x0 || d.x > view.x1 || d.y < view.y0 || d.y > view.y1) continue;
        push(d.y + 9, () => drawDrum(ctx, d));
      }
      if (D.flatcar && !cull(view, D.flatcar.x - 100, D.flatcar.y - 30, 200, 60)) {
        push(D.flatcar.y + 12, () => drawFlatcar(ctx, D.flatcar, game.time));
      }
      // The security gate: posts and the striped arm, raised when open.
      if (D.gate && !cull(view, D.gate.x - 60, D.gate.y - 60, D.gate.w + 120, 120)) {
        push(D.gate.y + 20, () => drawGate(ctx, D.gate, game.time));
      }
    }

    // ---- the airfield's structures.
    const A = game.airport;
    if (A && view.x1 > 1200 && view.x0 < 3000 && view.y1 > 1200 && view.y0 < 2600) {
      const T = A.terminal;
      push(T.y + T.h, () => drawTerminal(ctx, T, game.time));
      const TW = A.tower;
      push(TW.y + TW.h, () => drawTower(ctx, TW, A, game.time));
      for (const h of A.hangars) push(h.y + h.h, () => drawHangar(ctx, h));
      for (const t of A.fuelTanks) push(t.y + t.h, () => drawFuelTank(ctx, t));
      for (const b of A.cargoBoxes) {
        if (cull(view, b.x, b.y, b.w, b.h + 30)) continue;
        push(b.y + b.h + 14, () => drawCargoBox(ctx, b));
      }
      for (const p of A.planes) {
        if (cull(view, p.x - 60, p.y - 60, 120, 120)) continue;
        push(p.y + 30, () => drawPlane(ctx, p, game.time));
      }
      push(A.bowser.y + 16, () => drawBowser(ctx, A.bowser, game.time));
      push(A.marshaller.y + 8, () => drawMarshaller(ctx, A.marshaller, game.time));
      for (const w of A.windsocks) push(w.y + 8, () => drawWindsock(ctx, w, game.time));
    }

    // ---- pickups, bobbing on their own clocks.
    for (const pk of game.pickups) {
      if (pk.dead) continue;
      if (pk.x < view.x0 || pk.x > view.x1 || pk.y < view.y0 || pk.y > view.y1) continue;
      push(pk.y, () => drawPickup(ctx, pk, game.time));
    }

    // ---- boats and the ferry ride the y-sort with everything else.
    for (const b of game.boats?.boats ?? []) {
      if (cull(view, b.x - 90, b.y - 90, 180, 180)) continue;
      const bb = b;
      push(b.y + b.radius * 0.6, () => game.boats.drawBoat(ctx, bb));
    }
    if (game.ferry && !cull(view, game.ferry.x - 160, game.ferry.y - 60, 320, 120)) {
      push(game.ferry.y + 40, () => game.ferry.draw(ctx));
    }

    // ---- cars and people, the y-sorted heart of the street.
    for (const c of game.cars) {
      if (c.x < view.x0 - 90 || c.x > view.x1 + 90 || c.y < view.y0 - 90 || c.y > view.y1 + 90) continue;
      const cc = c;
      push(c.y + c.spec.len * 0.32, () => drawCar(ctx, cc, game.time));
    }
    for (const person of game.people) {
      if (person.x < view.x0 - 30 || person.x > view.x1 + 30 || person.y < view.y0 - 30 || person.y > view.y1 + 30) continue;
      const pp = person;
      push(person.y, () => drawPerson(ctx, pp, game.time));
    }
    const hero = game.player;
    if (hero && !hero.car) {
      push(hero.y, () => drawHero(ctx, hero, game.time));
    }

    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.fn();
    this.scratch = [];
  }

  // ---------------------------------------------------------- effects

  effectPass(ctx, game, view) {
    // Bullets: short bright tracers.
    ctx.lineCap = 'round';
    for (const b of game.bullets.list) {
      if (!b.live) continue;
      if (b.x < view.x0 || b.x > view.x1 || b.y < view.y0 || b.y > view.y1) continue;
      ctx.strokeStyle = 'rgba(255,233,163,0.9)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      ctx.stroke();
    }
    // Particles, kind by kind.
    for (const p of game.fx.pool) {
      if (!p.live) continue;
      if (p.x < view.x0 - 40 || p.x > view.x1 + 40 || p.y < view.y0 - 40 || p.y > view.y1 + 40) continue;
      const f = p.life / p.max;
      if (p.kind === 'smoke') {
        ctx.fillStyle = withAlpha(p.color, 0.34 * f);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      } else if (p.kind === 'fire') {
        ctx.fillStyle = withAlpha(p.color, 0.8 * f);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * f + 2, 0, TAU); ctx.fill();
      } else if (p.kind === 'spark' || p.kind === 'blood' || p.kind === 'cash' || p.kind === 'debris') {
        ctx.fillStyle = withAlpha(p.color, Math.min(1, f * 1.4));
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.kind === 'muzzle') {
        ctx.fillStyle = withAlpha('#fff2c9', 0.85 * f);
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU;
          ctx.lineTo(p.x + Math.cos(a) * p.size, p.y + Math.sin(a) * p.size);
          ctx.lineTo(p.x + Math.cos(a + 0.6) * p.size * 0.4, p.y + Math.sin(a + 0.6) * p.size * 0.4);
        }
        ctx.closePath(); ctx.fill();
      } else if (p.kind === 'flash') {
        // Flashes belong to the glow pass; skipped here.
      }
    }
  }

  gullPass(ctx, game, view) {
    const D = game.docks;
    if (!D || view.y0 > 0) return;
    ctx.strokeStyle = 'rgba(220,228,240,0.7)';
    ctx.lineWidth = 2;
    for (const g of D.gulls) {
      if (g.x < view.x0 || g.x > view.x1 || g.y < view.y0 || g.y > view.y1) continue;
      const w = Math.sin(g.flap) * 4;
      ctx.beginPath();
      ctx.moveTo(g.x - 6, g.y - w);
      ctx.lineTo(g.x, g.y);
      ctx.lineTo(g.x + 6, g.y - w);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------- light map

  lightPass(ctx, game, cam, zoom, W, H, sx, sy) {
    const lm = this.lm;
    if (lm.width !== W || lm.height !== H) this.resize();
    const g = lm.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = AMBIENT;
    g.fillRect(0, 0, W, H);

    // The sky keeps its own palette: everything above the horizon line
    // (the bay's far shore) stays white on the light map.
    const horizonY = (DOCKS_NORTH_Y - cam.y) * zoom + H / 2 + sy;
    if (horizonY > 0) {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, Math.min(H, horizonY));
    }

    // World-space lights, added over the ambient base.
    g.globalCompositeOperation = 'lighter';
    g.save();
    g.translate(W / 2 + sx, H / 2 + sy);
    g.scale(zoom, zoom);
    g.translate(-cam.x, -cam.y);
    const view = {
      x0: cam.x - W / (2 * zoom) - 140,
      x1: cam.x + W / (2 * zoom) + 140,
      y0: cam.y - H / (2 * zoom) - 140,
      y1: cam.y + H / (2 * zoom) + 140,
    };
    this.mapLights(g, game, view);
    g.restore();
    g.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(lm, 0, 0);
    ctx.restore();
  }

  mapLights(g, game, view) {
    // Street lamps: warm pools under every head.
    const city = game.city;
    const bi0 = clamp(Math.floor((view.x0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bi1 = clamp(Math.ceil((view.x1 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bj0 = clamp(Math.floor((view.y0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bj1 = clamp(Math.ceil((view.y1 - ROAD / 2) / PITCH), 0, GRID - 1);
    for (let j = bj0; j <= bj1; j++) {
      for (let i = bi0; i <= bi1; i++) {
        const block = city.blocks[i * GRID + j];
        for (const l of block.lamps) {
          if (l.x < view.x0 || l.x > view.x1 || l.y < view.y0 || l.y > view.y1) continue;
          lightBlob(g, l.x, l.y, 190, 'rgba(255,236,190,0.75)');
        }
        // Buildings: a soft window glow leaks from the lit ones.
        for (const b of block.buildings) {
          if (b.x > view.x1 || b.x + b.w < view.x0 || b.y > view.y1 || b.y + b.h < view.y0) continue;
          if (b.lit < 0.45) continue;
          lightBlob(g, b.x + b.w / 2, b.y + b.h * 0.7, Math.max(b.w, b.h) * 0.9, 'rgba(255,224,168,0.34)');
        }
      }
    }
    // Beach lamp posts? None — the strip hotels carry the sand.
    // Docks: sodium lamps, floodlight masts, pier lamps, the gate flood.
    const D = game.docks;
    if (D && view.y0 < 200) {
      for (const l of D.lamps) {
        if (l.x < view.x0 || l.x > view.x1 || l.y < view.y0 || l.y > view.y1) continue;
        lightBlob(g, l.x, l.y, l.kind === 'pier' ? 170 : 230, 'rgba(255,196,120,0.8)');
      }
      for (const f of D.floods) {
        if (f.x < view.x0 - 200 || f.x > view.x1 + 200 || f.y < view.y0 - 200 || f.y > view.y1 + 200) continue;
        lightBlob(g, f.x, f.y, 430, 'rgba(240,244,255,0.6)');
      }
      for (const s of D.stalls) lightBlob(g, s.x, s.y - 16, 120, 'rgba(255,214,150,0.5)');
      if (D.gate && !D.gate.open) lightBlob(g, D.gate.x + D.gate.w / 2, D.gate.y, 150, 'rgba(255,120,110,0.4)');
      // The ship's deck floods.
      const ship = D.ship;
      if (ship) {
        lightBlob(g, ship.x, ship.y, 300, 'rgba(255,224,170,0.4)');
      }
    }
    // Airfield: apron floods, a broad terminal glow, runway edge dots.
    const A = game.airport;
    if (A) {
      for (const f of A.apronFloods ?? []) lightBlob(g, f.x, f.y, 400, 'rgba(235,240,255,0.55)');
      lightBlob(g, A.terminal.x + A.terminal.w / 2, A.terminal.y + A.terminal.h / 2, 340, 'rgba(255,228,170,0.4)');
      if (view.x1 > 1100 && view.x0 < 3000 && view.y1 > 1100 && view.y0 < 2700) {
        for (const l of A.lights) {
          if (l.x < view.x0 || l.x > view.x1 || l.y < view.y0 || l.y > view.y1) continue;
          lightBlob(g, l.x, l.y, 30, l.kind === 'taxi' ? 'rgba(110,170,255,0.7)' : 'rgba(255,244,214,0.7)');
        }
      }
    }
    // Neon signs: their own colour on the map, so the spill tints.
    for (let j = bj0; j <= bj1; j++) {
      for (let i = bi0; i <= bi1; i++) {
        const block = city.blocks[i * GRID + j];
        for (const s of block.signs) {
          if (s.x > view.x1 || s.x + s.w < view.x0 || s.y > view.y1 || s.y + s.h < view.y0) continue;
          if (signLit(s, game.time) < 0.35) continue;
          const cx = s.style === 'blade' ? s.x + s.w / 2 : s.x + s.w / 2;
          const cy = s.style === 'board' ? s.y + s.h / 2 : s.y + s.h / 2;
          lightBlob(g, cx, cy, 110, withAlpha(s.color, 0.5));
        }
      }
    }
    // Vehicle lights: headlights, brakes, sirens.
    for (const c of game.cops.cruisers) {
      if (c.wreck || c.wasted) continue;
      if (c.x < view.x0 - 200 || c.x > view.x1 + 200 || c.y < view.y0 - 200 || c.y > view.y1 + 200) continue;
      const on = Math.floor(game.time * 5) % 2 === 0;
      lightBlob(g, c.x - 14, c.y, 190, on ? 'rgba(90,110,255,0.5)' : 'rgba(255,70,80,0.5)');
    }
    for (const c of game.cars) {
      if (c.wasted) continue;
      if (c.x < view.x0 - 240 || c.x > view.x1 + 240 || c.y < view.y0 - 240 || c.y > view.y1 + 240) continue;
      const moving = Math.abs(c.fwd) > 20;
      if (moving) headlightMap(g, c);
      if (c.brake > 0) lightBlob(g, c.x - Math.cos(c.ang) * c.spec.len * 0.48, c.y - Math.sin(c.ang) * c.spec.len * 0.48, 70, 'rgba(255,70,64,0.55)');
    }
    // Player pickup sparkle and the hero's own presence.
    const hero = game.player;
    if (hero && !hero.car) lightBlob(g, hero.x, hero.y, 120, 'rgba(210,220,255,0.22)');
    for (const pk of game.pickups) {
      if (pk.dead) continue;
      if (pk.x < view.x0 || pk.x > view.x1 || pk.y < view.y0 || pk.y > view.y1) continue;
      lightBlob(g, pk.x, pk.y, 66, 'rgba(190,255,220,0.5)');
    }
    // Fires glow hard on the map: burning wrecks light their street.
    for (const p of game.fx.pool) {
      if (!p.live || p.kind !== 'fire') continue;
      if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
      lightBlob(g, p.x, p.y, 90, 'rgba(255,150,60,0.5)');
    }
    // Mission and heist markers: a column of light you can drive to.
    const marker = game.heists?.marker?.() ?? game.missions.marker();
    if (marker) {
      lightBlob(g, marker.x, marker.y, 150, withAlpha(marker.color ?? '#ffd977', 0.4));
    }
  }

  // ---------------------------------------------------------- glow

  glowPass(ctx, game, view) {
    const city = game.city;
    const bi0 = clamp(Math.floor((view.x0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bi1 = clamp(Math.ceil((view.x1 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bj0 = clamp(Math.floor((view.y0 - ROAD / 2) / PITCH), 0, GRID - 1);
    const bj1 = clamp(Math.ceil((view.y1 - ROAD / 2) / PITCH), 0, GRID - 1);
    const wet = game.weather?.state?.wetness ?? 0;

    for (let j = bj0; j <= bj1; j++) {
      for (let i = bi0; i <= bi1; i++) {
        const block = city.blocks[i * GRID + j];
        // Lamp heads: warm halo.
        for (const l of block.lamps) {
          if (l.x < view.x0 || l.x > view.x1 || l.y < view.y0 || l.y > view.y1) continue;
          glowBlob(ctx, l.x, l.y, 60, 'rgba(255,210,140,0.35)');
          if (wet > 0.25) reflectionStreak(ctx, l.x, l.y + 6, 90, 'rgba(255,210,140,0.14)', wet);
        }
        // Neon tubes burn at full strength on top of the multiply.
        for (const s of block.signs) {
          if (s.x > view.x1 || s.x + s.w < view.x0 || s.y > view.y1 || s.y + s.h < view.y0) continue;
          drawSignGlow(ctx, s, game.time, wet);
        }
        // Antenna beacons blink red on the tall roofs.
        for (const b of block.buildings) {
          if (!b.ant) continue;
          if (b.x > view.x1 || b.x + b.w < view.x0 || b.y > view.y1 || b.y + b.h < view.y0) continue;
          const blink = (game.time * 1.1 + b.x * 0.01) % 1 < 0.24;
          if (blink) glowBlob(ctx, b.ant.x, b.ant.y - b.ant.h, 22, 'rgba(255,90,80,0.8)');
        }
      }
    }

    // Docks: sodium tint, flood cones, the lighthouse beam, the gate lamp.
    const D = game.docks;
    if (D && view.y0 < 200) {
      for (const l of D.lamps) {
        if (l.x < view.x0 || l.x > view.x1 || l.y < view.y0 || l.y > view.y1) continue;
        glowBlob(ctx, l.x, l.y, 70, 'rgba(255,180,110,0.4)');
        if (wet > 0.25) reflectionStreak(ctx, l.x, l.y + 8, 110, 'rgba(255,180,110,0.18)', wet);
      }
      for (const f of D.floods) {
        if (f.x < view.x0 - 300 || f.x > view.x1 + 300 || f.y < view.y0 - 300 || f.y > view.y1 + 300) continue;
        glowBlob(ctx, f.x, f.y, 150, 'rgba(220,232,255,0.3)');
      }
      // The lighthouse beam: a long rotating wedge over the water.
      const lh = D.lighthouse;
      if (lh && lh.x > view.x0 - 2600 && lh.x < view.x1 + 2600 && lh.y > view.y0 - 2600 && lh.y < view.y1 + 2600) {
        const a = lh.beam;
        ctx.fillStyle = 'rgba(190,255,220,0.10)';
        ctx.beginPath();
        ctx.moveTo(lh.x, lh.y);
        ctx.lineTo(lh.x + Math.cos(a) * 2400, lh.y + Math.sin(a) * 2400);
        ctx.lineTo(lh.x + Math.cos(a + 0.09) * 2400, lh.y + Math.sin(a + 0.09) * 2400);
        ctx.closePath(); ctx.fill();
        const a2 = a + Math.PI;
        ctx.beginPath();
        ctx.moveTo(lh.x, lh.y);
        ctx.lineTo(lh.x + Math.cos(a2) * 2400, lh.y + Math.sin(a2) * 2400);
        ctx.lineTo(lh.x + Math.cos(a2 + 0.09) * 2400, lh.y + Math.sin(a2 + 0.09) * 2400);
        ctx.closePath(); ctx.fill();
        glowBlob(ctx, lh.x, lh.y, 60, 'rgba(220,255,240,0.5)');
      }
      if (D.gate && !D.gate.open) glowBlob(ctx, D.gate.x + D.gate.w / 2, D.gate.y, 44, 'rgba(255,110,100,0.5)');
      // Puddle sheen: a faint moving shimmer across the apron when wet.
      if (wet > 0.3) {
        ctx.fillStyle = `rgba(160,190,230,${(0.05 * wet).toFixed(3)})`;
        for (const p of D.puddles) {
          if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.rx * 0.7, p.ry * 0.6, p.a, 0, TAU);
          ctx.fill();
        }
      }
      const ship = D.ship;
      if (ship) glowBlob(ctx, ship.x, ship.y, 130, 'rgba(255,214,150,0.22)');
    }

    // Airfield: edge light halos, thresholds, the rabbit march, beacon.
    const A = game.airport;
    if (A && view.x1 > 1100 && view.x0 < 3000 && view.y1 > 1100 && view.y0 < 2700) {
      for (const l of A.lights) {
        if (l.x < view.x0 || l.x > view.x1 || l.y < view.y0 || l.y > view.y1) continue;
        const color = l.kind === 'taxi' ? 'rgba(90,160,255,0.8)'
          : l.kind === 'thresh-green' ? 'rgba(90,255,140,0.85)'
          : l.kind === 'thresh-red' ? 'rgba(255,90,80,0.8)'
          : l.kind === 'tdz' ? 'rgba(255,244,214,0.6)'
          : 'rgba(255,248,225,0.85)';
        glowBlob(ctx, l.x, l.y, l.kind === 'edge' ? 14 : 10, color);
      }
      // The approach rabbit: one strobe burning at a time.
      const on = A.strobe;
      A.rabbit.forEach((r, k) => {
        if (k !== on || k >= A.rabbit.length) return;
        glowBlob(ctx, r.x, r.y, 26, 'rgba(230,255,250,0.9)');
      });
      // PAPI: two whites, two reds.
      glowBlob(ctx, A.papi.x, A.papi.y - 8, 10, 'rgba(255,255,255,0.8)');
      glowBlob(ctx, A.papi.x + 14, A.papi.y - 8, 10, 'rgba(255,255,255,0.8)');
      glowBlob(ctx, A.papi.x + 28, A.papi.y - 8, 10, 'rgba(255,80,70,0.8)');
      glowBlob(ctx, A.papi.x + 42, A.papi.y - 8, 10, 'rgba(255,80,70,0.8)');
      // Tower beacon: the white-green pulse the sky ring quotes.
      if (A.beacon < 0.22) glowBlob(ctx, A.tower.x + A.tower.w / 2, A.tower.y - 16, 30, 'rgba(190,255,220,0.8)');
      glowBlob(ctx, A.terminal.x + A.terminal.w / 2, A.terminal.y + A.terminal.h / 2, 120, 'rgba(255,228,170,0.2)');
      for (const f of A.apronFloods ?? []) glowBlob(ctx, f.x, f.y, 130, 'rgba(220,232,255,0.3)');
    }

    // Vehicle lights: headlight cones, brake and reverse lamps, blinkers,
    // the police lightbar and its sweeping flood.
    for (const c of game.cars) {
      if (c.wasted) continue;
      if (c.x < view.x0 - 300 || c.x > view.x1 + 300 || c.y < view.y0 - 300 || c.y > view.y1 + 300) continue;
      const moving = Math.abs(c.fwd) > 20;
      if (moving) headlightGlow(ctx, c);
      if (c.brake > 0) {
        glowBlob(ctx, c.x - Math.cos(c.ang) * c.spec.len * 0.48, c.y - Math.sin(c.ang) * c.spec.len * 0.48, 26, 'rgba(255,60,50,0.7)');
      }
      if (c.fwd < -6) {
        glowBlob(ctx, c.x - Math.cos(c.ang) * c.spec.len * 0.48, c.y - Math.sin(c.ang) * c.spec.len * 0.48, 20, 'rgba(230,240,255,0.5)');
      }
      if (c.blinker > 0) {
        const on = Math.floor(game.time * 3) % 2 === 0;
        if (on) glowBlob(ctx, c.x + Math.cos(c.ang + Math.PI / 2) * c.spec.wid * 0.5, c.y + Math.sin(c.ang + Math.PI / 2) * c.spec.wid * 0.5, 16, 'rgba(255,190,70,0.8)');
      }
      if (c.role === 'cop' && c.siren) {
        const on = Math.floor(game.time * 5) % 2 === 0;
        glowBlob(ctx, c.x, c.y, 60, on ? 'rgba(80,110,255,0.6)' : 'rgba(255,60,70,0.6)');
        // A floodlight sweeps ahead of the cruiser.
        const sweep = Math.sin(game.time * 2.4 + c.x * 0.01) * 0.6;
        const a = c.ang + sweep;
        ctx.fillStyle = 'rgba(200,220,255,0.08)';
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(a - 0.3) * 420, c.y + Math.sin(a - 0.3) * 420);
        ctx.lineTo(c.x + Math.cos(a + 0.3) * 420, c.y + Math.sin(a + 0.3) * 420);
        ctx.closePath(); ctx.fill();
      }
      if (c.wreck) {
        glowBlob(ctx, c.x, c.y, 60 + Math.sin(game.time * 9) * 8, 'rgba(255,120,50,0.4)');
      }
    }
    // Boats ride their own glow pass.
    for (const b of game.boats?.boats ?? []) {
      if (b.x < view.x0 - 200 || b.x > view.x1 + 200 || b.y < view.y0 - 200 || b.y > view.y1 + 200) continue;
      game.boats.drawGlow(ctx, b);
    }
    // Pickup halos.
    for (const pk of game.pickups) {
      if (pk.dead) continue;
      if (pk.x < view.x0 || pk.x > view.x1 || pk.y < view.y0 || pk.y > view.y1) continue;
      glowBlob(ctx, pk.x, pk.y, 26, 'rgba(160,255,220,0.4)');
    }
    // Particle flashes: muzzle and blast light.
    for (const p of game.fx.pool) {
      if (!p.live || p.kind !== 'flash') continue;
      if (p.x < view.x0 - 100 || p.x > view.x1 + 100 || p.y < view.y0 - 100 || p.y > view.y1 + 100) continue;
      const f = p.life / p.max;
      glowBlob(ctx, p.x, p.y, p.size * (2.2 - f), `rgba(255,224,150,${(0.5 * f).toFixed(3)})`);
    }
    // Mission marker: a soft pillar of colour on the goal.
    const marker = game.heists?.marker?.() ?? game.missions.marker();
    if (marker) {
      const pulse = 0.5 + 0.3 * Math.sin(game.time * 4);
      ctx.strokeStyle = withAlpha(marker.color ?? '#ffd977', pulse * 0.7);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(marker.x, marker.y, 34, 0, TAU); ctx.stroke();
      glowBlob(ctx, marker.x, marker.y, 40, withAlpha(marker.color ?? '#ffd977', 0.25));
    }
    // Wet reflections under the city's neon: vertical smears on asphalt.
    if (wet > 0.25) {
      for (let j = bj0; j <= bj1; j++) {
        for (let i = bi0; i <= bi1; i++) {
          for (const s of city.blocks[i * GRID + j].signs) {
            if (s.x > view.x1 || s.x + s.w < view.x0) continue;
            reflectionStreak(ctx, s.x + s.w / 2, s.y + s.h + 20, 120, withAlpha(s.color, 0.1), wet);
          }
        }
      }
    }
  }
}

// ============================================================
// Drawing helpers (pure functions over a context).
// ============================================================

function cull(view, x, y, w, h) {
  return x + w < view.x0 || x > view.x1 || y + h < view.y0 || y > view.y1;
}

function withAlpha(hex, a) {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function lightBlob(g, x, y, r, color) {
  const grad = g.createRadialGradient(x, y, r * 0.08, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

function glowBlob(ctx, x, y, r, color) {
  const grad = ctx.createRadialGradient(x, y, 1, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

/** A wet-road reflection: a soft vertical smear below a light. */
function reflectionStreak(ctx, x, y, len, color, wet) {
  const grad = ctx.createLinearGradient(x, y, x, y + len);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x - 12, y, 24, len * Math.min(1, 0.4 + wet));
}

function headlightMap(g, c) {
  const cos = Math.cos(c.ang), sin = Math.sin(c.ang);
  const nx = c.x + cos * c.spec.len * 0.5, ny = c.y + sin * c.spec.len * 0.5;
  const reach = 300;
  const tx = nx + cos * reach, ty = ny + sin * reach;
  const grad = g.createRadialGradient(nx, ny, 10, tx, ty, reach * 0.8);
  grad.addColorStop(0, 'rgba(255,244,214,0.5)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(nx, ny);
  g.lineTo(tx - sin * reach * 0.34, ty + cos * reach * 0.34);
  g.lineTo(tx + sin * reach * 0.34, ty - cos * reach * 0.34);
  g.closePath(); g.fill();
}

function headlightGlow(ctx, c) {
  const cos = Math.cos(c.ang), sin = Math.sin(c.ang);
  const nx = c.x + cos * c.spec.len * 0.5, ny = c.y + sin * c.spec.len * 0.5;
  glowBlob(ctx, nx + cos * 12, ny + sin * 12, 30, 'rgba(255,244,214,0.5)');
  glowBlob(ctx, nx + cos * 60, ny + sin * 60, 90, 'rgba(255,240,200,0.16)');
}

function signLit(s, t) {
  if (!s.flicker) return 1;
  const wave = Math.sin(t * 13 + s.seed) + Math.sin(t * 7.3 + s.seed * 2);
  return wave > 1.6 ? 0.25 : 1;
}

// ---------------------------------------------------------------- buildings

function drawBuilding(ctx, b, t) {
  const lift = Math.min(64, 8 + b.floors * 5.2);
  // Ground footprint shadow.
  ctx.fillStyle = 'rgba(5,6,12,0.45)';
  ctx.fillRect(b.x + 5, b.y + 7, b.w, b.h);
  // South wall band (the extruded face) with its window grid.
  ctx.fillStyle = b.wall;
  ctx.fillRect(b.x, b.y + b.h - lift, b.w, lift);
  const cols = Math.max(2, Math.floor(b.w / 26));
  const rows = Math.max(1, Math.floor(lift / 20));
  for (let r = 0; r < rows; r++) {
    for (let c2 = 0; c2 < cols; c2++) {
      const lit = hash01(b.x + c2 * 13.7, b.y + b.h + r * 7.3) < b.lit;
      ctx.fillStyle = lit ? withAlpha('#ffe9b0', 0.5 + 0.3 * Math.sin(t * 0.7 + r + c2)) : 'rgba(10,12,20,0.55)';
      ctx.fillRect(b.x + 8 + c2 * (b.w - 16) / cols, b.y + b.h - lift + 7 + r * (lift - 10) / rows, (b.w - 16) / cols - 6, (lift - 12) / rows - 3);
    }
  }
  // Roof slab, floated up by the extrusion.
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x, b.y - lift, b.w, b.h);
  ctx.strokeStyle = LIGHT.roofTrim;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(b.x + 3, b.y - lift + 3, b.w - 6, b.h - 6);
  // Roof furniture: AC units, stacks, water tank, antenna.
  ctx.fillStyle = 'rgba(8,9,14,0.55)';
  for (const ac of b.acs) ctx.fillRect(ac.x, ac.y - lift, ac.s, ac.s);
  for (const s of b.stacks) {
    ctx.fillStyle = '#171a20';
    ctx.beginPath(); ctx.arc(s.x, s.y - lift, s.r, 0, TAU); ctx.fill();
  }
  if (b.tank) {
    ctx.fillStyle = '#2c2f36';
    ctx.beginPath(); ctx.arc(b.tank.x, b.tank.y - lift, b.tank.r + 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#43464e';
    ctx.beginPath(); ctx.arc(b.tank.x, b.tank.y - lift, b.tank.r, 0, TAU); ctx.fill();
  }
  if (b.ant) {
    ctx.strokeStyle = '#0d0f14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.ant.x, b.ant.y - lift);
    ctx.lineTo(b.ant.x, b.ant.y - lift - b.ant.h);
    ctx.stroke();
  }
  // Signs hang off this building: blades on the street wall, bars along it,
  // billboards crowning the roof.
  void t;
}

function drawSign(ctx, s, t) {
  const lit = signLit(s, t);
  ctx.save();
  ctx.globalAlpha = lit;
  if (s.style === 'blade') {
    ctx.fillStyle = '#0d0f16';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = s.color;
    ctx.font = 'bold 13px Consolas, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(s.text, 0, 4.5);
  } else {
    ctx.fillStyle = '#0d0f16';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = s.color;
    ctx.font = s.style === 'board' ? 'bold 13px Consolas, "Courier New", monospace' : 'bold 12px Consolas, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(s.text, s.x + s.w / 2, s.y + s.h / 2 + 4.5);
  }
  ctx.restore();
}

function drawSignGlow(ctx, s, t, wet) {
  const lit = signLit(s, t);
  if (lit < 0.4) return;
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
  glowBlob(ctx, cx, cy, s.style === 'blade' ? 44 : 60, withAlpha(s.color, 0.4 * lit));
  // The tube itself, re-drawn bright.
  ctx.save();
  ctx.globalAlpha = lit;
  ctx.translate(cx, cy);
  if (s.style === 'blade') ctx.rotate(-Math.PI / 2);
  ctx.font = 'bold 13px Consolas, "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(s.text, 0, 4.5);
  ctx.fillStyle = withAlpha(s.color, 0.85);
  ctx.fillText(s.text, 0, 4.2);
  ctx.restore();
  if (wet > 0.3) reflectionStreak(ctx, cx, cy + s.h, 100, withAlpha(s.color, 0.12), wet);
}

function drawPalm(ctx, x, y, s, t) {
  const sway = Math.sin(t * 0.9 + x * 0.01) * 0.06;
  ctx.fillStyle = 'rgba(5,6,12,0.4)';
  ctx.beginPath(); ctx.ellipse(x + 6, y + 5, 16 * s, 7 * s, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4a3620';
  ctx.lineWidth = 5 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + sway * 20, y - 22 * s, x + sway * 34, y - 40 * s);
  ctx.stroke();
  const tipX = x + sway * 34, tipY = y - 40 * s;
  ctx.strokeStyle = '#2f6b3a';
  ctx.lineWidth = 3.4 * s;
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.52 + sway;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(
      tipX + Math.cos(a) * 20 * s, tipY + Math.sin(a) * 20 * s,
      tipX + Math.cos(a) * 40 * s, tipY + Math.sin(a) * 40 * s + 10 * s,
    );
    ctx.stroke();
  }
}

function drawLampHead(ctx, x, y) {
  ctx.fillStyle = 'rgba(5,6,12,0.4)';
  ctx.beginPath(); ctx.ellipse(x, y + 3, 7, 3.4, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#101318';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 22); ctx.stroke();
  ctx.fillStyle = '#ffe9b0';
  ctx.beginPath(); ctx.arc(x, y - 24, 3.4, 0, TAU); ctx.fill();
}

// ---------------------------------------------------------------- docks

function drawWarehouse(ctx, w, t) {
  const lift = 26;
  ctx.fillStyle = 'rgba(5,6,12,0.4)';
  ctx.fillRect(w.x + 5, w.y + 6, w.w, w.h);
  ctx.fillStyle = w.col ?? '#4a4e56';
  ctx.fillRect(w.x, w.y + w.h - lift, w.w, lift);
  // Ribbed roll-up doors on the south face.
  if (w.door) {
    const dw = Math.min(120, w.w * 0.3);
    const dx = w.x + w.w / 2 - dw / 2;
    ctx.fillStyle = '#2b2e35';
    ctx.fillRect(dx, w.y + w.h - lift + 4, dw, lift - 8);
    ctx.strokeStyle = 'rgba(160,164,172,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = w.y + w.h - lift + 8; y < w.y + w.h - 6; y += 7) {
      ctx.moveTo(dx, y); ctx.lineTo(dx + dw, y);
    }
    ctx.stroke();
  }
  if (w.office) {
    ctx.fillStyle = 'rgba(255,224,168,0.5)';
    for (let x = w.x + 14; x < w.x + w.w - 20; x += 40) {
      ctx.fillRect(x, w.y + w.h - lift + 8, 16, 10);
    }
  }
  // Roof with skylight strips.
  ctx.fillStyle = shade(w.col ?? '#4a4e56', 0.8);
  ctx.fillRect(w.x, w.y - lift, w.w, w.h);
  ctx.fillStyle = 'rgba(255,236,190,0.14)';
  for (let x = w.x + 20; x < w.x + w.w - 30; x += 64) {
    ctx.fillRect(x, w.y - lift + 18, 26, w.h - 36);
  }
  void t;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

function drawContainerStack(ctx, row, t) {
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    const f = 1 - i / (row.length + 1);
    ctx.fillStyle = 'rgba(5,6,12,0.35)';
    ctx.fillRect(c.x + 3, c.y + 4, c.w, c.h);
    ctx.fillStyle = shade(c.color, 0.55 + 0.45 * f);
    ctx.fillRect(c.x, c.y - i * 12, c.w, c.h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(c.x, c.y - i * 12, c.w, 5);
    ctx.strokeStyle = 'rgba(10,12,16,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(c.x, c.y - i * 12, c.w, c.h);
  }
  void t;
}

function drawCrane(ctx, c, t) {
  const x = c.slide ?? c.x;
  // Rails and legs.
  ctx.strokeStyle = '#1b1d23';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(c.rail.x0, c.y + 14); ctx.lineTo(c.rail.x1, c.y + 14);
  ctx.stroke();
  ctx.fillStyle = '#26292f';
  ctx.fillRect(x - 30, c.y - 26, 16, 46);
  ctx.fillRect(x + 14, c.y - 26, 16, 46);
  // A-frame and boom, swinging slowly.
  ctx.fillStyle = '#33363e';
  ctx.fillRect(x - 12, c.y - 64, 24, 44);
  ctx.save();
  ctx.translate(x, c.y - 58);
  ctx.rotate(Math.sin(t * 0.3 + c.boom) * 0.35);
  ctx.fillStyle = '#3c4048';
  ctx.fillRect(-7, -14, 14, 210);
  ctx.fillStyle = '#e0b13c';
  ctx.fillRect(-7, -14, 14, 10);
  // Trolley + hook line.
  const trolleyX = Math.sin(t * 0.17 + c.boom * 2) * 70;
  ctx.fillStyle = '#20232a';
  ctx.fillRect(trolleyX - 8, 176, 16, 12);
  ctx.strokeStyle = 'rgba(200,204,214,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(trolleyX, 188); ctx.lineTo(trolleyX, 240); ctx.stroke();
  ctx.restore();
  // Cab window.
  ctx.fillStyle = 'rgba(255,224,168,0.6)';
  ctx.fillRect(x - 6, c.y - 60, 12, 8);
}

function drawShip(ctx, ship, t) {
  const roll = ship.roll ?? 0;
  ctx.save();
  ctx.translate(ship.x, ship.y + (ship.bob ?? 0));
  ctx.rotate(roll);
  const L = ship.len, Wd = ship.wid;
  // Water shadow.
  ctx.fillStyle = 'rgba(3,8,14,0.5)';
  ctx.beginPath(); ctx.ellipse(0, 14, L * 0.55, Wd * 0.7, 0, 0, TAU); ctx.fill();
  // Hull: dark topsides, red boot.
  ctx.fillStyle = '#232a33';
  roundedHull(ctx, L, Wd);
  ctx.fill();
  ctx.fillStyle = '#6e2a26';
  ctx.fillRect(-L / 2, Wd * 0.32, L, 9);
  // Deck line + hatch covers.
  ctx.fillStyle = '#333c46';
  ctx.fillRect(-L * 0.42, -Wd * 0.3, L * 0.84, Wd * 0.6);
  ctx.fillStyle = '#8a4a2c';
  for (const hx of [-L * 0.28, -L * 0.05, L * 0.18]) {
    ctx.fillRect(hx, -Wd * 0.2, L * 0.14, Wd * 0.4);
  }
  // Superstructure aft.
  ctx.fillStyle = '#d8dce2';
  ctx.fillRect(L * 0.3, -Wd * 0.26, L * 0.16, Wd * 0.52);
  ctx.fillStyle = 'rgba(255,224,168,0.75)';
  for (let wy = -Wd * 0.16; wy <= Wd * 0.16; wy += 10) {
    ctx.fillRect(L * 0.31, wy - 3, L * 0.14, 5);
  }
  // Funnel with the line's colours.
  ctx.fillStyle = '#1d232b';
  ctx.fillRect(L * 0.2, -8, 14, 16);
  ctx.fillStyle = '#c94a4a';
  ctx.fillRect(L * 0.2, -8, 14, 6);
  ctx.restore();
}

function roundedHull(ctx, L, Wd) {
  ctx.beginPath();
  ctx.moveTo(-L / 2, -Wd / 2);
  ctx.lineTo(L / 2 - Wd * 0.4, -Wd / 2);
  ctx.quadraticCurveTo(L / 2 + Wd * 0.25, -Wd * 0.2, L / 2 + Wd * 0.3, 0);
  ctx.quadraticCurveTo(L / 2 + Wd * 0.25, Wd * 0.2, L / 2 - Wd * 0.4, Wd / 2);
  ctx.lineTo(-L / 2, Wd / 2);
  ctx.closePath();
}

function drawLighthouse(ctx, lh, t) {
  ctx.fillStyle = 'rgba(5,6,12,0.45)';
  ctx.beginPath(); ctx.ellipse(lh.x + 4, lh.y + 8, 26, 12, 0, 0, TAU); ctx.fill();
  // Tapered white tower with two red bands.
  ctx.fillStyle = '#d8d4c8';
  ctx.beginPath();
  ctx.moveTo(lh.x - 20, lh.y + 16);
  ctx.lineTo(lh.x - 12, lh.y - 64);
  ctx.lineTo(lh.x + 12, lh.y - 64);
  ctx.lineTo(lh.x + 20, lh.y + 16);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b3402e';
  ctx.fillRect(lh.x - 15, lh.y - 30, 30, 9);
  ctx.fillRect(lh.x - 17, lh.y + 2, 34, 9);
  // Lantern room.
  ctx.fillStyle = '#1d212a';
  ctx.fillRect(lh.x - 11, lh.y - 80, 22, 17);
  ctx.fillStyle = '#ffe9b0';
  ctx.fillRect(lh.x - 7, lh.y - 77, 14, 11);
  ctx.fillStyle = '#2b2f38';
  ctx.beginPath(); ctx.arc(lh.x, lh.y - 82, 8, Math.PI, 0); ctx.fill();
}

function drawMarketStall(ctx, s) {
  ctx.fillStyle = 'rgba(5,6,12,0.4)';
  ctx.fillRect(s.x - 30, s.y + 8, 64, 14);
  // Table with the catch on it.
  ctx.fillStyle = '#54443a';
  ctx.fillRect(s.x - 32, s.y - 12, 68, 26);
  ctx.fillStyle = '#8fa2ad';
  for (let k = 0; k < 4; k++) ctx.fillRect(s.x - 24 + k * 14, s.y - 8, 10, 5);
  // Awning: striped, crew-coloured.
  ctx.fillStyle = s.c ?? '#c94a4a';
  ctx.fillRect(s.x - 36, s.y - 30, 76, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let x = s.x - 36; x < s.x + 40; x += 16) ctx.fillRect(x, s.y - 30, 8, 14);
  ctx.fillStyle = '#3a3126';
  ctx.fillRect(s.x - 34, s.y - 16, 4, 34);
  ctx.fillRect(s.x + 32, s.y - 16, 4, 34);
}

function drawDrum(ctx, d) {
  ctx.fillStyle = 'rgba(5,6,12,0.4)';
  ctx.beginPath(); ctx.ellipse(d.x + 2, d.y + 4, 10, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = d.c ?? '#8a4a3b';
  ctx.beginPath(); ctx.arc(d.x, d.y, 9, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(10,12,16,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, TAU); ctx.stroke();
}

function drawFlatcar(ctx, fc, t) {
  ctx.fillStyle = '#26292f';
  ctx.fillRect(fc.x - 84, fc.y - 10, 168, 20);
  ctx.fillStyle = '#15171c';
  ctx.beginPath(); ctx.arc(fc.x - 60, fc.y + 12, 7, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(fc.x + 60, fc.y + 12, 7, 0, TAU); ctx.fill();
  // The load: crates strapped down.
  for (let k = 0; k < fc.boxes; k++) {
    ctx.fillStyle = k % 2 ? '#6b4f33' : '#54443a';
    ctx.fillRect(fc.x - 60 + k * 42, fc.y - 26, 36, 18);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(fc.x - 60 + k * 42, fc.y - 26, 36, 18);
  }
  void t;
}

function drawGate(ctx, gate, t) {
  // Posts stand on both sides; the striped arm lifts when open.
  const open = gate.open;
  for (const px of [gate.x - 10, gate.x + gate.w + 2]) {
    ctx.fillStyle = '#3a3e46';
    ctx.fillRect(px, gate.y - 12, 8, 30);
    ctx.fillStyle = open ? '#4ae08a' : '#ff5a4a';
    ctx.beginPath(); ctx.arc(px + 4, gate.y - 16, 3.4, 0, TAU); ctx.fill();
  }
  ctx.save();
  ctx.translate(gate.x - 6, gate.y - 4);
  ctx.rotate(open ? -1.15 : 0);
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = k % 2 ? '#e8e4d4' : '#c9302c';
    ctx.fillRect(k * 20, -5, 20, 10);
  }
  ctx.restore();
  void t;
}

// ---------------------------------------------------------------- airfield

function drawTerminal(ctx, T, t) {
  const lift = 30;
  ctx.fillStyle = 'rgba(5,6,12,0.4)';
  ctx.fillRect(T.x + 5, T.y + 6, T.w, T.h);
  // Glass frontage faces the apron (west): a lit band on the left wall.
  ctx.fillStyle = '#3c4048';
  ctx.fillRect(T.x, T.y, T.w, T.h);
  ctx.fillStyle = 'rgba(255,228,170,0.75)';
  for (let y = T.y + 18; y < T.y + T.h - 14; y += 30) {
    ctx.fillRect(T.x + 4, y, 12, 18);
  }
  // Roof with the wordmark.
  ctx.fillStyle = '#4a4e56';
  ctx.fillRect(T.x - 4, T.y - lift, T.w + 8, T.h);
  ctx.fillStyle = 'rgba(232,228,204,0.75)';
  ctx.font = 'bold 22px Consolas, "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PALM AIRFIELD', T.x + T.w / 2, T.y - lift + T.h / 2 + 8);
  void t;
}

function drawTower(ctx, TW, A, t) {
  // Shaft then cab.
  ctx.fillStyle = '#3c4048';
  ctx.fillRect(TW.x + 12, TW.y, TW.w - 24, TW.h);
  ctx.fillStyle = '#2b2e35';
  ctx.fillRect(TW.x, TW.y + TW.h - 26, TW.w, 26);
  // Cab: glazed ring, darker glass, the beacon above.
  ctx.fillStyle = '#4a4e56';
  ctx.fillRect(TW.x - 8, TW.y - 26, TW.w + 16, 30);
  ctx.fillStyle = 'rgba(140,210,255,0.5)';
  ctx.fillRect(TW.x - 4, TW.y - 22, TW.w + 8, 20);
  // Rotating radar dish on the cab roof.
  ctx.save();
  ctx.translate(TW.x + TW.w / 2, TW.y - 34);
  ctx.rotate(A.radar);
  ctx.fillStyle = '#c8cdd6';
  ctx.fillRect(0, -2.4, 16, 4.8);
  ctx.restore();
  void t;
}

function drawHangar(ctx, h) {
  const lift = 22;
  ctx.fillStyle = 'rgba(5,6,12,0.4)';
  ctx.fillRect(h.x + 4, h.y + 5, h.w, h.h);
  // Arch roof: a rounded slab with a seam.
  ctx.fillStyle = '#565a62';
  ctx.beginPath();
  ctx.moveTo(h.x, h.y + h.h - lift);
  ctx.quadraticCurveTo(h.x + h.w / 2, h.y - lift - 34, h.x + h.w, h.y + h.h - lift);
  ctx.lineTo(h.x + h.w, h.y + h.h);
  ctx.lineTo(h.x, h.y + h.h);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(20,22,28,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(h.x + h.w / 2, h.y - lift - 22);
  ctx.lineTo(h.x + h.w / 2, h.y + h.h);
  ctx.stroke();
  // Mouth of the hangar, faintly lit inside.
  ctx.fillStyle = 'rgba(255,224,168,0.2)';
  ctx.fillRect(h.x + h.w * 0.2, h.y + h.h - lift + 2, h.w * 0.6, lift - 4);
}

function drawFuelTank(ctx, t) {
  ctx.fillStyle = 'rgba(5,6,12,0.4)';
  ctx.beginPath(); ctx.ellipse(t.x + t.w / 2 + 4, t.y + t.h / 2 + 5, t.w / 2, t.h / 2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8a8f98';
  ctx.beginPath(); ctx.ellipse(t.x + t.w / 2, t.y + t.h / 2, t.w / 2, t.h / 2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#a8adb6';
  ctx.beginPath(); ctx.ellipse(t.x + t.w / 2, t.y + t.h / 2 - 4, t.w / 2 - 6, t.h / 2 - 6, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(30,32,40,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(t.x + 6, t.y + t.h / 2); ctx.lineTo(t.x + t.w - 6, t.y + t.h / 2); ctx.stroke();
}

function drawCargoBox(ctx, b) {
  ctx.fillStyle = 'rgba(5,6,12,0.35)';
  ctx.fillRect(b.x + 3, b.y + 4, b.w, b.h);
  ctx.fillStyle = b.c;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(b.x, b.y, b.w, 5);
  ctx.strokeStyle = 'rgba(10,12,16,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(b.x, b.y, b.w, b.h);
}

function drawPlane(ctx, p, t) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.ang);
  const L = p.len, Wd = p.wid;
  ctx.fillStyle = 'rgba(5,6,12,0.4)';
  ctx.beginPath(); ctx.ellipse(2, 4, L * 0.5, Wd * 0.4, 0, 0, TAU); ctx.fill();
  // Fuselage.
  ctx.fillStyle = p.livery.body;
  ctx.beginPath();
  ctx.moveTo(L * 0.5, 0);
  ctx.quadraticCurveTo(L * 0.2, -7, -L * 0.34, -6);
  ctx.lineTo(-L * 0.5, 0);
  ctx.lineTo(-L * 0.34, 6);
  ctx.quadraticCurveTo(L * 0.2, 7, L * 0.5, 0);
  ctx.closePath(); ctx.fill();
  // High wing across the body.
  ctx.fillStyle = shade(p.livery.body, 0.85);
  ctx.fillRect(-L * 0.1, -Wd / 2, 20, Wd);
  // Tail.
  ctx.fillStyle = p.livery.trim;
  ctx.beginPath();
  ctx.moveTo(-L * 0.36, 0);
  ctx.lineTo(-L * 0.5, -Wd * 0.3);
  ctx.lineTo(-L * 0.46, 0);
  ctx.lineTo(-L * 0.5, Wd * 0.3);
  ctx.closePath(); ctx.fill();
  // Cockpit glass and the spinning propeller disc.
  ctx.fillStyle = 'rgba(60,90,120,0.8)';
  ctx.fillRect(L * 0.22, -4, 10, 8);
  const spin = p.propSpin;
  ctx.strokeStyle = 'rgba(200,206,214,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(L * 0.5 + 2, 0, 3, 16 + Math.sin(spin) * 2, 0, 0, TAU); ctx.stroke();
  ctx.restore();
  void t;
}

function drawBowser(ctx, b, t) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.ang);
  ctx.fillStyle = 'rgba(5,6,12,0.4)';
  ctx.fillRect(-16, -9, 34, 20);
  ctx.fillStyle = '#c8b48c';
  ctx.fillRect(-18, -10, 36, 20);
  ctx.fillStyle = '#8a7a3b';
  ctx.fillRect(-10, -8, 16, 16);
  ctx.fillStyle = '#20242c';
  ctx.fillRect(10, -8, 7, 16);
  ctx.restore();
  void t;
}

function drawMarshaller(ctx, m, t) {
  ctx.fillStyle = 'rgba(5,6,12,0.4)';
  ctx.beginPath(); ctx.ellipse(m.x, m.y + 3, 8, 3.6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e0803a';
  ctx.fillRect(m.x - 4, m.y - 12, 8, 14);
  ctx.fillStyle = '#e0b48a';
  ctx.beginPath(); ctx.arc(m.x, m.y - 16, 4, 0, TAU); ctx.fill();
  // Two batons sweeping with the wave.
  const a = m.arm * 0.8;
  ctx.strokeStyle = '#ffe14a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(m.x - 3, m.y - 10);
  ctx.lineTo(m.x - 3 + Math.cos(-1.4 + a) * 14, m.y - 10 + Math.sin(-1.4 + a) * 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(m.x + 3, m.y - 10);
  ctx.lineTo(m.x + 3 + Math.cos(1.4 - a) * 14, m.y - 10 + Math.sin(1.4 - a) * 14);
  ctx.stroke();
  void t;
}

function drawWindsock(ctx, w, t) {
  ctx.fillStyle = '#3a3e46';
  ctx.fillRect(w.x - 2, w.y - 30, 4, 32);
  const dir = w.dir ?? 0;
  const flutter = Math.sin(w.flap ?? 0) * 0.25;
  ctx.save();
  ctx.translate(w.x, w.y - 30);
  ctx.rotate(dir + Math.PI);
  ctx.fillStyle = '#ff8a3c';
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(26, -9 + flutter * 6);
  ctx.lineTo(26, 9 + flutter * 6);
  ctx.lineTo(0, 5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(18, -8 + flutter * 5, 5, 16);
  ctx.restore();
}

// ---------------------------------------------------------------- actors

function drawCar(ctx, c, t) {
  const s = c.spec;
  ctx.save();
  ctx.translate(c.x, c.y);
  // Ground shadow.
  ctx.fillStyle = 'rgba(4,6,12,0.42)';
  ctx.beginPath(); ctx.ellipse(3, 5, s.len * 0.52, s.wid * 0.62, c.ang, 0, TAU); ctx.fill();
  ctx.rotate(c.ang);
  const L = s.len, Wd = s.wid;
  const burnt = c.wreck || c.wasted;
  // Body: rounded slab with a darker cabin inset.
  ctx.fillStyle = burnt ? '#1c1a18' : s.tone;
  roundRect(ctx, -L / 2, -Wd / 2, L, Wd, Math.min(10, Wd * 0.3));
  ctx.fill();
  if (!burnt) {
    ctx.fillStyle = shade(s.tone, 0.72);
    roundRect(ctx, -L * 0.18, -Wd / 2 + 3, L * 0.42, Wd - 6, 6);
    ctx.fill();
    // Windshield and rear glass.
    ctx.fillStyle = 'rgba(140,190,225,0.6)';
    ctx.fillRect(L * 0.16, -Wd / 2 + 5, L * 0.1, Wd - 10);
    ctx.fillRect(-L * 0.3, -Wd / 2 + 5, L * 0.08, Wd - 10);
    // Trim stripe along the flank.
    ctx.fillStyle = s.trim;
    ctx.fillRect(-L * 0.36, -Wd / 2, L * 0.5, 3);
    ctx.fillRect(-L * 0.36, Wd / 2 - 3, L * 0.5, 3);
    // Racer livery: a door number on the roof.
    if (c.role === 'racer') {
      ctx.fillStyle = c.trim ?? '#e8e4d4';
      ctx.font = 'bold 13px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c.driver?.[0] ?? 'R', 0, 5);
    }
  } else {
    // A burned-out shell: charred roof, broken glass.
    ctx.fillStyle = '#0e0d0c';
    roundRect(ctx, -L * 0.2, -Wd / 2 + 4, L * 0.44, Wd - 8, 5);
    ctx.fill();
  }
  // Police livery: white doors, navy flanks, a lightbar up top.
  if (c.specIndex === -1 && !burnt) {
    ctx.fillStyle = '#e9ecf4';
    ctx.fillRect(-L * 0.1, -Wd / 2, L * 0.3, Wd);
    ctx.fillStyle = '#1c2c54';
    ctx.fillRect(-L / 2, -Wd / 2, L * 0.18, Wd);
    const on = Math.floor(t * 5) % 2 === 0;
    ctx.fillStyle = on ? '#ff4a55' : '#4a7dff';
    ctx.fillRect(-L * 0.06, -Wd * 0.32, 8, 6);
    ctx.fillStyle = on ? '#4a7dff' : '#ff4a55';
    ctx.fillRect(-L * 0.06, Wd * 0.32 - 6, 8, 6);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawPerson(ctx, p, t) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.mode === 'down') {
    // Lying still: an elongated shadow-body on the ground.
    ctx.fillStyle = 'rgba(4,6,12,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 2, 12, 5, p.heading ?? 0, 0, TAU); ctx.fill();
    ctx.fillStyle = p.shirt;
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 4.4, p.heading ?? 0, 0, TAU); ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(Math.cos(p.heading ?? 0) * 9, Math.sin(p.heading ?? 0) * 9, 3, 0, TAU); ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin((p.phase ?? 0) * 2) * 1.4;
  ctx.fillStyle = 'rgba(4,6,12,0.35)';
  ctx.beginPath(); ctx.ellipse(1, 3, 7, 3.2, 0, 0, TAU); ctx.fill();
  // Legs stepping with the walk phase.
  ctx.fillStyle = '#23262e';
  const step = Math.sin(p.phase ?? 0) * 3;
  ctx.fillRect(-3, -4 + step * 0.4, 2.6, 8);
  ctx.fillRect(1, -4 - step * 0.4, 2.6, 8);
  // Torso in the shirt colour; cops and gang members wear their own.
  ctx.fillStyle = p.shirt;
  roundRect(ctx, -4, -14 + bob * 0.2, 8, 12, 3);
  ctx.fill();
  // Head and hair.
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(0, -17 + bob * 0.2, 4.2, 0, TAU); ctx.fill();
  ctx.fillStyle = p.hair;
  ctx.beginPath(); ctx.arc(0, -18.4 + bob * 0.2, 4.2, Math.PI, 0); ctx.fill();
  // Phone glow for the scrollers.
  if (p.phone && p.mode === 'stroll') {
    glowBlob(ctx, 3, -8, 7, 'rgba(140,210,255,0.35)');
  }
  void t;
  ctx.restore();
}

function drawHero(ctx, hero, t) {
  ctx.save();
  ctx.translate(hero.x, hero.y);
  const bob = Math.sin(hero.walkPhase * 2) * 1.6;
  ctx.fillStyle = 'rgba(4,6,12,0.4)';
  ctx.beginPath(); ctx.ellipse(1, 3, 7.5, 3.4, 0, 0, TAU); ctx.fill();
  ctx.rotate(hero.heading + Math.PI / 2);
  // Legs.
  ctx.fillStyle = '#1d2027';
  const step = Math.sin(hero.walkPhase) * 3.2;
  ctx.fillRect(-3.4, -3 + step * 0.4, 3, 9);
  ctx.fillRect(0.6, -3 - step * 0.4, 3, 9);
  // Jacket: Rico wears the light one.
  ctx.fillStyle = '#e8ecf4';
  roundRect(ctx, -4.6, -15 + bob * 0.2, 9.2, 13, 3);
  ctx.fill();
  ctx.fillStyle = '#c9cfe0';
  ctx.fillRect(-4.6, -8 + bob * 0.2, 9.2, 2);
  // Head, hair, and the pistol when he carries one.
  ctx.fillStyle = '#d9b091';
  ctx.beginPath(); ctx.arc(0, -18 + bob * 0.2, 4.4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#241a10';
  ctx.beginPath(); ctx.arc(0, -19.4 + bob * 0.2, 4.4, Math.PI, 0); ctx.fill();
  if (hero.weapon === 'pistol') {
    ctx.fillStyle = '#15171c';
    ctx.fillRect(4, -13, 3, 7);
  }
  ctx.restore();
  void t;
}

function drawPickup(ctx, pk, t) {
  const bob = Math.sin(t * 2.4 + pk.phase) * 3;
  ctx.save();
  ctx.translate(pk.x, pk.y + bob);
  ctx.fillStyle = 'rgba(4,6,12,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 8 - bob, 8, 3.4, 0, 0, TAU); ctx.fill();
  if (pk.kind === 'pistol') {
    ctx.fillStyle = '#2b2e35';
    ctx.fillRect(-7, -3, 14, 5);
    ctx.fillRect(2, -3, 4, 9);
  } else if (pk.kind === 'health') {
    ctx.fillStyle = '#e8ecf4';
    roundRect(ctx, -8, -7, 16, 14, 3); ctx.fill();
    ctx.fillStyle = '#e04848';
    ctx.fillRect(-2, -5, 4, 10);
    ctx.fillRect(-6, -1, 12, 4);
  } else if (pk.kind === 'armor') {
    ctx.fillStyle = '#5db3ff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(8, -4); ctx.lineTo(6, 7); ctx.lineTo(0, 9); ctx.lineTo(-6, 7); ctx.lineTo(-8, -4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-1.4, -6, 2.8, 12);
  } else {
    ctx.fillStyle = '#7dffa4';
    for (let k = 0; k < 3; k++) ctx.fillRect(-7, -2 + k * 3.4, 14, 2.6);
    ctx.fillStyle = 'rgba(20,40,26,0.6)';
    ctx.fillRect(-7, -2, 3, 9);
  }
  ctx.restore();
}
