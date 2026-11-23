// ============================================================================
// VICE PALMS — render.js
// The night-lighting pipeline: a culled world-space base pass (ground, decals,
// structures, y-sorted buildings+entities), then a low-res additive lightmap
// (streetlights, neon, headlight cones, police strobes, muzzle flashes, fires,
// mission coronas) composited with multiply + a bloom pass, wet-road sheen
// streaks, explosion flash and vignette. Screen shake rides the camera.
// ============================================================================

import { RENDER, VIEW_W, VIEW_H, HELI, WORLD_X0, WORLD_Y0, CITY_H, CITY_W } from './config.js';
import { TAU, clamp, glow, rgbOf } from './util.js';
import { setNeonCull } from './world.js';

const ZBASE = 7.2; // world units -> px at zoom 1

export class Render {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Low-res lightmap for cheap bloom.
    const ls = RENDER.LIGHT_SCALE;
    this.light = document.createElement('canvas');
    this.light.width = Math.ceil(VIEW_W * ls);
    this.light.height = Math.ceil(VIEW_H * ls);
    this.lctx = this.light.getContext('2d');
    this.ls = ls;

    // Vignette overlay, prerendered once.
    this.vignette = document.createElement('canvas');
    this.vignette.width = VIEW_W; this.vignette.height = VIEW_H;
    const vc = this.vignette.getContext('2d');
    const g = vc.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.44, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.92);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(2,3,10,${RENDER.VIGNETTE})`);
    vc.fillStyle = g;
    vc.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  viewRect(cam) {
    const halfW = VIEW_W / 2 / (cam.z * ZBASE) + 6;
    const halfH = VIEW_H / 2 / (cam.z * ZBASE) + 6;
    return { x0: cam.x - halfW, y0: cam.y - halfH, x1: cam.x + halfW, y1: cam.y + halfH };
  }

  render(t, dt) {
    const g = this.game;
    const ctx = this.ctx;
    const cam = g.cam;
    const fx = g.fx;

    // Camera shake in world units.
    const shx = (Math.random() - 0.5) * fx.shake * 0.5;
    const shy = (Math.random() - 0.5) * fx.shake * 0.5;

    const view = this.viewRect(cam);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#04050c';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Distant skyline silhouette on the horizon band (behind the city).
    this.drawSkyline(ctx, cam, view);

    ctx.save();
    ctx.translate(VIEW_W / 2, VIEW_H / 2);
    ctx.scale(cam.z * ZBASE, cam.z * ZBASE);
    ctx.translate(-cam.x - shx, -cam.y - shy);

    this.lights = [];

    // ---- base pass --------------------------------------------------------
    g.world._gt = t;
    g.world.drawGround(ctx, view.x0, view.y0, view.x1, view.y1, t);
    fx.drawDecals(ctx, cam);
    g.world.drawStructures(ctx, view.x0, view.y0, view.x1, view.y1, t);

    // ---- gather light sources from the world -------------------------------
    this.worldLights(t, view);

    // ---- y-sorted entities & buildings -------------------------------------
    this.drawSorted(ctx, view, t);

    // ---- neon, particles, markers -------------------------------------------
    setNeonCull(view.x0, view.y0, view.x1, view.y1);
    g.world.drawNeon(ctx, t);
    this.drawBullets(ctx);
    this.drawPickups(ctx, t);
    g.missions.drawMarkerCoronas(ctx, t);
    this.drawAwnings(ctx, view);
    fx.drawParticles(ctx, cam);
    this.drawHeli(ctx, t);

    ctx.restore();

    // ---- lighting ------------------------------------------------------------
    this.compositeLights(cam, view, t);

    // ---- flash + vignette -----------------------------------------------------
    if (fx.flashAlpha > 0.01) {
      ctx.fillStyle = `rgba(255,235,200,${fx.flashAlpha})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    this.drawStormRain(dt);
    ctx.drawImage(this.vignette, 0, 0);
  }

  // Storm weather: rain streaks in screen space + rare lightning.
  drawStormRain(dt) {
    const w = this.game.world.weather;
    if (!w || w.id !== 'storm') return;
    const ctx = this.ctx;
    if (!this._rain) this._rain = [];
    const target = 130;
    while (this._rain.length < target) {
      this._rain.push({
        x: Math.random() * (VIEW_W + 200) - 100,
        y: Math.random() * (VIEW_H + 120) - 60,
        v: 780 + Math.random() * 420,
      });
    }
    ctx.strokeStyle = 'rgba(160,190,235,0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const r of this._rain) {
      r.y += r.v * dt;
      r.x -= r.v * dt * 0.18;
      if (r.y > VIEW_H + 20) { r.y = -20; r.x = Math.random() * (VIEW_W + 200) - 100; }
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - 2.2, r.y + 13);
    }
    ctx.stroke();
    // Lightning: rare double-flash + thunder.
    this._boltT = (this._boltT || 0) - dt;
    if (this._boltT <= 0 && Math.random() < 0.0035) {
      this._boltT = 6 + Math.random() * 10;
      this.game.fx.requestFlash(0.42);
      this.game.audio.thunder();
    }
  }

  // ---------------------------------------------------------------- lighting
  addLight(x, y, r, color, intensity) {
    this.lights.push({ x, y, r, color, i: intensity });
  }

  // Parallax skyline silhouette drawn behind the world edges.
  drawSkyline(ctx, cam, view) {
    const z = cam.z * 7.2;
    const horY = VIEW_H / 2 + (-WORLD_Y0 - 30 - cam.y) * z;
    if (horY < -80) return;
    if (!this._skyline) {
      // Build once: a jagged tower strip.
      const c = document.createElement('canvas');
      c.width = VIEW_W; c.height = 200;
      const cc = c.getContext('2d');
      let x = 0;
      let seed = 71;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      while (x < VIEW_W) {
        const w = 18 + rnd() * 46;
        const h = 30 + rnd() * 150;
        cc.fillStyle = `rgba(10,12,26,${0.5 + rnd() * 0.4})`;
        cc.fillRect(x, 200 - h, w, h);
        if (rnd() < 0.4) {
          cc.fillStyle = 'rgba(255,60,160,0.35)';
          cc.fillRect(x + w * 0.3, 200 - h - 6, 3, 4);
        }
        if (rnd() < 0.35) {
          cc.fillStyle = 'rgba(37,232,255,0.3)';
          cc.fillRect(x + w * 0.6, 200 - h + 8, 2, 2);
        }
        x += w + 2 + rnd() * 10;
      }
      this._skyline = c;
    }
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.drawImage(this._skyline, 0, horY - 200);
    ctx.restore();
  }

  worldLights(t, view) {
    const g = this.game;
    const w = g.world;

    // Streetlights
    for (const s of w.streetlights) {
      if (s.x < view.x0 - 20 || s.x > view.x1 + 20 || s.y < view.y0 - 20 || s.y > view.y1 + 20) continue;
      this.addLight(s.x, s.y, RENDER.STREETLIGHT_R, '#ffdf9e', 0.85);
    }
    // Neon signs
    for (const n of w.neon) {
      if (n._vx === undefined) { n._vx = n.x; n._vy = n.y; }
      if (n._vx < view.x0 - 20 || n._vx > view.x1 + 20 || n._vy < view.y0 - 20 || n._vy > view.y1 + 20) continue;
      let on = 1;
      if (n.flicker) on = (Math.sin(t * n.flicker + n.phase) > -0.82) ? 1 : 0.3;
      this.addLight(n._vx + n.w / 2, n._vy + n.h / 2, RENDER.NEON_R, n.color, 0.95 * on);
    }
    // Cars: headlights, taillights, strobes, fires.
    for (const car of g.cars) {
      if (car.x < view.x0 - 40 || car.x > view.x1 + 40 || car.y < view.y0 - 40 || car.y > view.y1 + 40) continue;
      if (car.wrecked) {
        if (car.smokeT > 0 && Math.random() < 0.5) this.addLight(car.x, car.y, 6, '#ff7a2e', 0.5);
        continue;
      }
      if (car.burning) this.addLight(car.x, car.y, 9, '#ff8b2e', 1.0);
      if (car.lightsOn && !car.inWater) {
        const c = Math.cos(car.angle), s2 = Math.sin(car.angle);
        const reach = RENDER.HEADLIGHT_LEN * clamp(car.speed() / 12 + 0.4, 0.4, 1);
        for (const hl of car.headlightCones()) {
          this.addLight(hl.x + c * reach * 0.45, hl.y + s2 * reach * 0.45, reach * 0.62, '#fff3cf', 1.05);
        }
        // Taillights
        const tl = car.tail();
        this.addLight(tl.x - c * 1.2, tl.y - s2 * 1.2, 2.4, car.brakeLight ? '#ff2222' : '#8a1414', car.brakeLight ? 0.8 : 0.4);
      }
      if (car.cop && car.sirenOn) {
        const ph = Math.floor(t * 8 + car.id) % 2;
        this.addLight(car.x, car.y, 14, ph === 0 ? '#ff3050' : '#3050ff', 1.0);
      }
    }
    // Muzzle flashes & fire particles
    for (const p of g.fx.particles) {
      if (p.kind === 'muzzle') this.addLight(p.x, p.y, 7, '#ffe9a0', 1.2);
      else if (p.kind === 'fire') this.addLight(p.x, p.y, 4.5, '#ff8b2e', 0.8);
    }
    this.trafficLightGlows(t, view);
    // Ship lights in the harbor.
    if (view.y0 < 40) {
      this.addLight(430, -40, 26, '#ffd9a0', 0.7);
      this.addLight(520, -50, 14, '#cfe6ff', 0.6);
    }
    // Dock floodlights — cold work lights.
    for (const f of g.world.floodlights) {
      if (f.x < view.x0 - 30 || f.x > view.x1 + 30 || f.y < view.y0 - 30 || f.y > view.y1 + 30) continue;
      this.addLight(f.x, f.y, 22, '#dfe9ff', 1.15);
    }
    // Runway edge lights.
    for (const r of g.world.runwayLights) {
      if (r.x < view.x0 - 10 || r.x > view.x1 + 10 || r.y < view.y0 - 10 || r.y > view.y1 + 10) continue;
      this.addLight(r.x, r.y, 2.2, r.color, 0.85);
    }
    // Ferris wheel glow.
    const fe = g.world.ferris;
    if (fe && fe.x > view.x0 - 40 && fe.x < view.x1 + 40 && fe.y > view.y0 - 40 && fe.y < view.y1 + 40) {
      this.addLight(fe.x, fe.y, fe.r * 1.6, '#ff3ca0', 0.9);
    }
    // Police helicopter searchlight (4+ stars).
    if (g.police.heli && g.police.heli.active) {
      const h = g.police.heli;
      this.addLight(h.sx, h.sy, HELI.LIGHT_R, '#eef4ff', 1.35);
    }
    // Mission coronas
    for (const m of g.missions.markers) {
      this.addLight(m.x, m.y, 9, m.color, 0.9);
    }
    for (const m of g.missions.activeTargets()) {
      this.addLight(m.x, m.y, 8, m.color, 0.9);
    }
    // Player visibility halo on foot
    const p = g.player;
    if (!p.inCar) this.addLight(p.x, p.y, 7, '#cfd8ff', 0.5);
  }

  trafficLightGlows(t, view) {
    const g = this.game;
    const w = g.world;
    const i0 = clamp(Math.floor(view.x0 / TILEg) - 1, 0, COLSg);
    const i1 = clamp(Math.ceil(view.x1 / TILEg) + 1, 0, COLSg);
    const j0 = clamp(Math.floor(view.y0 / TILEg) - 1, 0, ROWSg);
    const j1 = clamp(Math.ceil(view.y1 / TILEg) + 1, 0, ROWSg);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = i * TILEg, y = j * TILEg;
        if (y > CITY_H - 2 || (x > 860 && y < 390)) continue;
        const gd = w.greenDir(i, j, t);
        const yellow = w.isYellow(i, j, t);
        const s1 = gd === 'ns' ? '#2ecc71' : yellow ? '#f1c40f' : '#e74c3c';
        const s2 = gd === 'ew' ? '#2ecc71' : yellow ? '#f1c40f' : '#e74c3c';
        this.addLight(x - 11.4, y - 11.4, 2.6, s1, 0.8);
        this.addLight(x + 11.4, y + 11.4, 2.6, s2, 0.8);
      }
    }
  }

  compositeLights(cam, view, t) {
    const g = this.game;
    const lctx = this.lctx;
    const ls = this.ls;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    // Ambient night-blue, drifting violet before dawn (05:00–06:30).
    let [ar, ag, ab] = RENDER.AMBIENT;
    // 1 real second = 1 game minute; pre-dawn violet 05:00-06:30.
    const h = ((22 * 60 + this.game.time) / 60) % 24;
    if (h >= 5 && h < 6.5) {
      const k = 1 - Math.abs((h - 5.75) / 0.75);
      ar = ar + (70 - ar) * k * 0.6;
      ag = ag + (34 - ag) * k * 0.6;
      ab = ab + (84 - ab) * k * 0.6;
    }
    lctx.fillStyle = `rgb(${ar | 0},${ag | 0},${ab | 0})`;
    lctx.fillRect(0, 0, this.light.width, this.light.height);
    lctx.globalCompositeOperation = 'lighter';

    // World -> lightmap transform (same camera, scaled).
    lctx.save();
    lctx.setTransform(ls, 0, 0, ls, 0, 0);
    lctx.translate(VIEW_W / 2, VIEW_H / 2);
    lctx.scale(cam.z * ZBASE, cam.z * ZBASE);
    lctx.translate(-cam.x, -cam.y);

    for (const L of this.lights) {
      glow(lctx, L.x, L.y, L.r, L.color, L.i * 0.85);
    }
    // Headlight cones as wedges (brighter forward reach).
    for (const car of g.cars) {
      if (car.wrecked || !car.lightsOn || car.inWater) continue;
      const reach = RENDER.HEADLIGHT_LEN;
      for (const hl of car.headlightCones()) {
        const grad = lctx.createRadialGradient(hl.x, hl.y, 0.5, hl.x, hl.y, reach);
        grad.addColorStop(0, 'rgba(255,244,214,0.55)');
        grad.addColorStop(1, 'rgba(255,244,214,0)');
        lctx.fillStyle = grad;
        lctx.beginPath();
        lctx.moveTo(hl.x, hl.y);
        lctx.arc(hl.x, hl.y, reach, hl.angle - RENDER.HEADLIGHT_SPAN, hl.angle + RENDER.HEADLIGHT_SPAN);
        lctx.closePath();
        lctx.fill();
      }
    }
    lctx.restore();

    // Composite: multiply the lightmap over the scene, then bloom it.
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, 0, 0, VIEW_W, VIEW_H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = RENDER.BLOOM_ALPHA;
    ctx.drawImage(this.light, 0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    this.wetSheen(cam, view);
    this.fogVeil();
  }

  // Night fog rolled per seed — soft blue-grey veil.
  fogVeil() {
    const w = this.game.world.weather;
    if (!w || w.fog <= 0) return;
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(120,138,180,${w.fog})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // Shop awnings (drawn over the ground, under the light pass).
  drawAwnings(ctx, view) {
    for (const a of this.game.world.awnings) {
      if (a.x < view.x0 - 20 || a.x > view.x1 + 20 || a.y < view.y0 - 20 || a.y > view.y1 + 20) continue;
      ctx.fillStyle = a.color;
      ctx.fillRect(a.x, a.y, a.w, 2.2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(a.x, a.y, a.w, 0.5);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.14;
      ctx.strokeRect(a.x, a.y, a.w, 2.2);
      // Stripe teeth
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let x = a.x + 0.6; x < a.x + a.w - 0.5; x += 1.6) ctx.fillRect(x, a.y + 1.4, 0.7, 0.8);
    }
  }

  // The police helicopter at 4+ stars: hull, rotor disc and searchlight beam.
  drawHeli(ctx, t) {
    const g = this.game;
    const heli = g.police.heli;
    if (!heli || !heli.active) return;
    const bx = heli.x, by = heli.y - HELI.HEIGHT * 2.2;
    // Beam (from hull down to the searchlight target).
    ctx.save();
    ctx.globalAlpha = 0.13;
    const grad = ctx.createLinearGradient(bx, by, heli.sx, heli.sy);
    grad.addColorStop(0, 'rgba(230,240,255,0.9)');
    grad.addColorStop(1, 'rgba(230,240,255,0.05)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(bx - 0.8, by);
    ctx.lineTo(bx + 0.8, by);
    ctx.lineTo(heli.sx + HELI.LIGHT_R * 0.7, heli.sy);
    ctx.lineTo(heli.sx - HELI.LIGHT_R * 0.7, heli.sy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Hull
    ctx.save();
    ctx.translate(bx, by);
    ctx.fillStyle = '#1c2434';
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.6, 1.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#9fc6ef';
    ctx.beginPath();
    ctx.ellipse(1.2, -0.15, 1.0, 0.7, 0, 0, TAU);
    ctx.fill();
    // Tail + rotor
    ctx.fillStyle = '#1c2434';
    ctx.fillRect(-4.6, -0.3, 3.4, 0.5);
    const spin = t * 26;
    ctx.strokeStyle = 'rgba(220,230,240,0.4)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.ellipse(0, -1.2, 4.2, 0.8, 0, spin, spin + Math.PI);
    ctx.stroke();
    // Strobe
    const ph = Math.floor(t * 6) % 2;
    ctx.fillStyle = ph ? '#ff3050' : '#3050ff';
    ctx.fillRect(-0.4, -1.9, 0.8, 0.5);
    ctx.restore();
  }

  // Reflections: neon & streetlights drag long streaks across wet asphalt.
  wetSheen(cam, view) {
    const ctx = this.ctx;
    const wet = this.game.world.weather ? this.game.world.weather.wet : 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const L of this.lights) {
      if (L.i < 0.8) continue;
      if (!this.game.world.isRoad(L.x, L.y + L.r * 0.6)) continue;
      const sx = VIEW_W / 2 + (L.x - cam.x) * cam.z * ZBASE;
      const sy = VIEW_H / 2 + (L.y - cam.y) * cam.z * ZBASE;
      if (sx < -60 || sx > VIEW_W + 60 || sy < -60 || sy > VIEW_H + 160) continue;
      ctx.save();
      ctx.translate(sx, sy + 14);
      ctx.scale(0.28, 2.6);
      glow(ctx, 0, 0, L.r * 2.4, L.color, RENDER.WET_STREAK * L.i * wet);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------- sorted scene
  drawSorted(ctx, view, t) {
    const g = this.game;
    const list = [];
    // Buildings in view.
    const i0 = clamp(Math.floor((view.x0 - 8) / TILEg), 0, COLSg - 1);
    const i1 = clamp(Math.ceil((view.x1 + 8) / TILEg), 0, COLSg - 1);
    const j0 = clamp(Math.floor((view.y0 - 8) / TILEg), 0, ROWSg - 1);
    const j1 = clamp(Math.ceil((view.y1 + 30) / TILEg), 0, ROWSg - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const b = g.world.blocks[j][i];
        for (const bl of b.buildings) {
          list.push({ y: bl.y + bl.h, kind: 'building', ref: bl });
        }
      }
    }
    // Vehicles.
    for (const car of g.cars) {
      if (car.x < view.x0 - 12 || car.x > view.x1 + 12 || car.y < view.y0 - 12 || car.y > view.y1 + 12) continue;
      list.push({ y: car.y, kind: 'car', ref: car });
    }
    // Peds.
    for (const p of g.peds.list) {
      if (p.x < view.x0 - 4 || p.x > view.x1 + 4 || p.y < view.y0 - 4 || p.y > view.y1 + 4) continue;
      list.push({ y: p.y, kind: 'ped', ref: p });
    }
    // Foot cops.
    for (const f of g.police.foot) {
      if (f.x < view.x0 - 4 || f.x > view.x1 + 4 || f.y < view.y0 - 4 || f.y > view.y1 + 4) continue;
      list.push({ y: f.y, kind: 'cop', ref: f });
    }
    // Player.
    if (!g.player.inCar) {
      list.push({ y: g.player.y, kind: 'player', ref: g.player });
    }

    list.sort((a, b) => a.y - b.y);
    for (const d of list) {
      if (d.kind === 'building') g.world.drawBuilding(ctx, d.ref, g.cam, t);
      else if (d.kind === 'car') d.ref.draw(ctx, t);
      else if (d.kind === 'ped') d.ref.draw(ctx, t);
      else if (d.kind === 'cop') d.ref.draw(ctx, t);
      else if (d.kind === 'player') d.ref.draw(ctx, t);
    }
  }

  drawBullets(ctx) {
    ctx.lineCap = 'round';
    for (const b of this.game.bullets) {
      const nx = b.x - b.vx * 0.014, ny = b.y - b.vy * 0.014;
      ctx.strokeStyle = 'rgba(255,236,170,0.95)';
      ctx.lineWidth = 0.22;
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      this.addLight(b.x, b.y, 3, '#ffe9a0', 0.7);
    }
  }

  drawPickups(ctx, t) {
    for (const pk of this.game.pickups) {
      const bob = Math.sin(t * 3 + pk.x) * 0.3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'health') {
        ctx.fillStyle = '#1d5c33';
        ctx.fillRect(-0.9, -0.9, 1.8, 1.8);
        ctx.fillStyle = '#7dffa8';
        ctx.fillRect(-0.55, -0.18, 1.1, 0.36);
        ctx.fillRect(-0.18, -0.55, 0.36, 1.1);
      } else if (pk.kind === 'armor') {
        ctx.fillStyle = '#1d3a5c';
        ctx.fillRect(-0.9, -0.9, 1.8, 1.8);
        ctx.fillStyle = '#7db8ff';
        ctx.beginPath();
        ctx.moveTo(0, -0.6); ctx.lineTo(0.55, -0.2); ctx.lineTo(0, 0.6); ctx.lineTo(-0.55, -0.2);
        ctx.closePath(); ctx.fill();
      } else if (pk.kind === 'cash') {
        ctx.fillStyle = '#1d5c33';
        ctx.fillRect(-0.9, -0.6, 1.8, 1.2);
        ctx.fillStyle = '#7dffa8';
        ctx.font = '700 1.2px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 0.05);
      } else if (pk.kind === 'ammo') {
        ctx.fillStyle = '#5c4a1d';
        ctx.fillRect(-0.8, -0.6, 1.6, 1.2);
        ctx.fillStyle = '#ffd75e';
        ctx.fillRect(-0.55, -0.35, 1.1, 0.7);
      } else if (pk.kind === 'package') {
        ctx.fillStyle = '#3f6ab0';
        ctx.fillRect(-1, -1, 2, 2);
        ctx.fillStyle = '#a0c4ff';
        ctx.fillRect(-1, -0.18, 2, 0.36);
        ctx.fillRect(-0.18, -1, 0.36, 2);
      }
      ctx.restore();
      this.addLight(pk.x, pk.y, 3.4, pk.kind === 'package' ? '#a0c4ff' : '#9effc0', 0.55);
    }
  }
}

// grid constants duplicated for hot-loop culling (kept in sync with config.js)
const TILEg = 96, COLSg = 13, ROWSg = 10;
