// The HUD: a circular minimap over a pre-rendered city map, health and armor bars, a money
// counter, the wanted star row, weapon readout, mission objective and subtitles, and a
// speedometer gauge while driving. Every element is drawn on one canvas pass.

import { GRID, PITCH, SAND } from '../config.js';
import { clamp, dist, TAU } from '../util.js';
import { stampDocksMap, drawDocksBlips } from './districtMap.js';
import { stampAirportMap } from '../world/airport.js';
import { DOCKS_NORTH_Y } from '../world/district.js';

const MAP_PX = 760;
const MAP_SPAN = 1500;   // world units shown across the minimap circle

export class Hud {
  constructor() {
    this.underlay = this.bakeMap();
    this.lastMoney = null;      // drives the payout pulse on the money counter
    this.moneyPulse = 0;
    this.promptText = null;     // live "E — ..." interaction prompt
    this.promptT = 0;
    this.north = 0;             // docks depth added above the city on the map
    this.kx = 1; this.ky = 1;
  }

  /** Pre-render the static city map once: land, parks, lots, plaza, beach, roads. */
  bakeMap() {
    const c = document.createElement('canvas');
    c.width = MAP_PX; c.height = MAP_PX;
    const g = c.getContext('2d');
    const span = GRID * PITCH + SAND;
    const k = MAP_PX / span;
    g.fillStyle = '#0c1020';
    g.fillRect(0, 0, MAP_PX, MAP_PX);
    g.fillStyle = '#12273e';
    g.fillRect(GRID * PITCH * k, 0, (SAND + 2000) * k, MAP_PX);
    g.fillStyle = '#8a744c';
    g.fillRect(GRID * PITCH * k, 0, SAND * k, MAP_PX);
    return c;
  }

  /** Stamp block kinds and roads onto a fresh baked map for the newly generated city. */
  attach(game) {
    game.hud = this;             // district systems prompt through game.hud
    this.underlay = this.bakeMap(); // a second city must never double-stamp the first map
    // With the docks the map grows northward: world y is shifted by the
    // district depth so y = DOCKS_NORTH_Y lands on the map's top edge.
    this.north = game.docks ? -DOCKS_NORTH_Y + 300 : 0;
    const span = GRID * PITCH + SAND;
    this.kx = MAP_PX / span;
    this.ky = MAP_PX / (span + this.north);
    const g = this.underlay.getContext('2d');
    if (game.docks) stampDocksMap(g, game, this.kx, this.ky, this.north, MAP_PX);
    stampAirportMap(g, game.airport, this.kx, this.ky, this.north);
    for (const block of game.city.blocks) {
      const x = block.i * PITCH * this.kx, y = (block.j * PITCH + this.north) * this.ky, s = PITCH * this.kx;
      g.fillStyle = block.kind === 'park' ? '#1d4a2c'
        : block.kind === 'plaza' ? '#3d4358'
        : block.kind === 'lot' ? '#23262e'
        : block.kind === 'airfield' ? '#3a3d46'
        : '#2b2f3c';
      g.fillRect(x, y, s, s);
    }
    g.strokeStyle = '#8d93a8';
    g.lineWidth = Math.max(1, 90 * this.kx * 0.8);
    g.beginPath();
    for (let i = 0; i <= GRID; i++) {
      g.moveTo(i * PITCH * this.kx, this.north * this.ky); g.lineTo(i * PITCH * this.kx, (GRID * PITCH + this.north) * this.ky);
      g.moveTo(0, (i * PITCH + this.north) * this.ky); g.lineTo(GRID * PITCH * this.kx, (i * PITCH + this.north) * this.ky);
    }
    g.stroke();
    this.lastMoney = null;
  }

  draw(ctx, game, W, H) {
    const p = game.player;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.hurtVignette(ctx, p, W, H);
    this.minimap(ctx, game, p, H);
    this.money(ctx, p, W);
    this.stars(ctx, game, W);
    this.weapon(ctx, p);
    this.speedo(ctx, p, W, H);
    this.objective(ctx, game, W, H);
    this.banner(ctx, game, W, H);
    this.endState(ctx, game, p, W, H);
    this.toasts(ctx, game, W);
    this.interactPrompt(ctx, game, W, H);
    // This build's live panels: the race plate and the taxi meter.
    game.races?.drawHud(ctx, W, H);
    game.taxi?.drawHud(ctx, W, H);
    if (game.phone?.state.open) this.phonePanel(ctx, game, W, H);
    if (this.lastMoney !== null && p.money > this.lastMoney) this.moneyPulse = 1;
    this.lastMoney = p.money;
    this.moneyPulse = Math.max(0, this.moneyPulse - 0.016 * 2.2);
  }

  /** The live "E — ..." prompt above the objective plate. */
  setPrompt(text) {
    if (text) {
      this.promptText = text;
      this.promptT = 0.35;   // refreshed every frame while a system is near
    }
  }

  interactPrompt(ctx, game, W, H) {
    this.promptT -= 1 / 60;
    if (this.promptT <= 0 || !this.promptText) return;
    ctx.save();
    ctx.globalAlpha = clamp(this.promptT / 0.35, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px Consolas, "Courier New", monospace';
    const w = ctx.measureText(this.promptText).width;
    ctx.fillStyle = 'rgba(5,7,15,0.7)';
    this.rounded(ctx, W / 2 - w / 2 - 16, H - 96, w + 32, 30, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(123,255,212,0.5)';
    ctx.lineWidth = 1.5;
    this.rounded(ctx, W / 2 - w / 2 - 16, H - 96, w + 32, 30, 8);
    ctx.stroke();
    ctx.fillStyle = '#7bffd4';
    ctx.fillText(this.promptText, W / 2, H - 76);
    ctx.restore();
  }

  /** Toast queue drained from game.toastQueue. */
  toasts(ctx, game, W) {
    let y = 148;
    for (const t of game.toastQueue ?? []) {
      const a = clamp(t.t / 0.6, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px Consolas, "Courier New", monospace';
      const w = Math.min(W * 0.8, ctx.measureText(t.text).width + 40);
      ctx.fillStyle = 'rgba(5,7,15,0.72)';
      this.rounded(ctx, W / 2 - w / 2, y - 18, w, 28, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.stroke();
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, W / 2, y + 1);
      ctx.restore();
      y += 36;
    }
  }

  /** A red breath on the frame edges while Rico is close to flatlining. */
  hurtVignette(ctx, p, W, H) {
    const f = p.dead ? 1 : clamp(1 - p.health / 35, 0, 1);
    if (f <= 0.01) return;
    const pulse = 0.65 + 0.35 * Math.sin(p.dead ? 0 : performance.now() / 240);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, 'rgba(140,10,20,0)');
    g.addColorStop(1, `rgba(140,10,20,${(0.4 * f * pulse).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  minimap(ctx, game, p, H) {
    const r = 90;
    const mx = 26 + r, my = H - 26 - r;
    const span = GRID * PITCH + SAND;
    const kx = this.kx, ky = this.ky;
    const mapSpanY = span + this.north;
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(mx - r, my - r, r * 2, r * 2);
    const viewPx = MAP_SPAN * kx;
    const viewPy = MAP_SPAN * ky;
    const sx = clamp(p.x * kx - viewPx / 2, 0, MAP_PX - viewPx);
    const sy = clamp((p.y + this.north) * ky - viewPy / 2, 0, MAP_PX - viewPy);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.underlay, sx, sy, viewPx, viewPy, mx - r, my - r, r * 2, r * 2);
    const toMini = (wx, wy) => [mx + ((wx * kx - sx) / viewPx) * r * 2 - r, my + (((wy + this.north) * ky - sy) / viewPy) * r * 2 - r];

    // Mission marker, clamped to the rim so off-screen goals still show direction.
    const marker = game.missions.marker();
    if (marker) {
      const [ax, ay] = toMini(marker.x, marker.y);
      const cx = clamp(ax, mx - r + 10, mx + r - 10);
      const cy = clamp(ay, my - r + 10, my + r - 10);
      ctx.fillStyle = marker.color;
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // District blips: the ferry, the heist marker, turf skirmishes, hideouts,
    // and the weather's fog-of-war shading.
    drawDocksBlips(ctx, game, toMini, mx, my, r);
    // This build's blips: race starts, the casino, the pit, the boat shop,
    // taxi ranks and the airfield.
    const blips = [];
    for (const c of game.races?.circuits ?? []) blips.push([c.start.x, c.start.y, '#ffd977']);
    if (game.casino) blips.push([game.casino.door.x, game.casino.door.y, '#a86bff']);
    if (game.fightClub) blips.push([game.fightClub.door.x, game.fightClub.door.y, '#ff5a6e']);
    if (game.boats) blips.push([game.boats.shop.x, game.boats.shop.y, '#33e7ff']);
    for (const rk of game.taxi?.ranks ?? []) blips.push([rk.x, rk.y, '#f2cf47']);
    for (const [wx, wy, col] of blips) {
      const [bx, by] = toMini(wx, wy);
      if (Math.hypot(bx - mx, by - my) < r - 5) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(bx, by, 3.4, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
    // Police blips.
    for (const c of game.cops.cruisers) {
      if (c.wreck || c.wasted) continue;
      const [bx, by] = toMini(c.x, c.y);
      if (Math.hypot(bx - mx, by - my) < r - 6) {
        ctx.fillStyle = Math.floor(game.time * 6) % 2 ? '#4a7dff' : '#ff4a55';
        ctx.beginPath(); ctx.arc(bx, by, 4, 0, TAU); ctx.fill();
      }
    }
    // Player arrow, pointing along the heading.
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(p.heading + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    // Double ring: warm inner glow, cool outer halo, dark rim.
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx, my, r + 2.5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,222,160,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(64,196,255,0.22)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(mx, my, r + 6, 0, TAU); ctx.stroke();
    // North tick so the map reads at a glance.
    ctx.fillStyle = '#ffd977';
    ctx.font = 'bold 12px Consolas, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', mx, my - r - 8);

    // Health and armor sit above the minimap.
    this.bar(ctx, mx - r, my - r - 28, r * 2, 13, p.health / 100, '#3dff7a', '#173a22');
    if (p.armor > 0) this.bar(ctx, mx - r, my - r - 46, r * 2, 13, p.armor / 100, '#5db3ff', '#16303f');
  }

  bar(ctx, x, y, w, h, f, color, back) {
    ctx.fillStyle = back;
    this.rounded(ctx, x, y, w, h, 4);
    ctx.fill();
    ctx.fillStyle = color;
    if (f > 0.02) { this.rounded(ctx, x + 2, y + 2, Math.max(6, (w - 4) * clamp(f, 0, 1)), h - 4, 3); ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    this.rounded(ctx, x, y, w, h, 4);
    ctx.stroke();
  }

  rounded(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  money(ctx, p, W) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 27px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(`$${p.money.toLocaleString()}`, W - 27 + 2, 45 + 2);
    // A payout flashes the counter white-hot, then settles back to mint green.
    const hot = this.moneyPulse > 0 ? this.moneyPulse : 0;
    ctx.fillStyle = hot > 0
      ? `rgba(255,255,${180 + 60 * (1 - hot) | 0},1)`
      : '#9dffb0';
    ctx.fillText(`$${p.money.toLocaleString()}`, W - 27, 45);
  }

  stars(ctx, game, W) {
    const lit = game.wanted.stars;
    for (let s = 0; s < 5; s++) {
      const x = W - 43 - s * 31, y = 76;
      this.star(ctx, x, y, 11, s < lit, s < lit && Math.floor(game.time * 4) % 2 === 0);
    }
    // The meter cooling: when no officer has you in sight for a few seconds, say so —
    // it reads as "keep driving, this is working".
    if (lit > 0 && game.wanted.unseen > 2.5) {
      ctx.textAlign = 'right';
      ctx.font = '12px Consolas, "Courier New", monospace';
      ctx.fillStyle = 'rgba(160,220,255,0.75)';
      ctx.fillText('OUT OF SIGHT — HEAT COOLING', W - 27, 100);
    }
  }

  weapon(ctx, p) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px Consolas, "Courier New", monospace';
    const label = p.weapon === 'pistol' ? `PISTOL ${p.ammo}` : 'FISTS';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(label, 29, 43);
    ctx.fillStyle = '#ffe9a3';
    ctx.fillText(label, 27, 41);
  }

  speedo(ctx, p, W, H) {
    const car = p.car;
    if (!car) return;
    const kmh = (Math.abs(car.fwd) * 0.42) | 0;
    const cx = W - 112, cy = H - 98, r = 58;
    ctx.strokeStyle = 'rgba(10,14,24,0.75)';
    ctx.lineWidth = 13;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
    const f = clamp(Math.abs(car.fwd) / car.spec.top, 0, 1);
    ctx.strokeStyle = f > 0.85 ? '#ff5f4a' : f > 0.6 ? '#ffd24a' : '#59e0ff';
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * f); ctx.stroke();
    // A needle rides the same sweep, tipped past the arc like a real dial.
    const na = Math.PI * 0.75 + Math.PI * 1.5 * f;
    ctx.strokeStyle = 'rgba(232,236,244,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(na) * (r - 16), cy + Math.sin(na) * (r - 16));
    ctx.lineTo(cx + Math.cos(na) * (r + 9), cy + Math.sin(na) * (r + 9));
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = 'bold 25px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#e8ecf4';
    ctx.fillText(`${kmh}`, cx, cy + 9);
    ctx.font = '12px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#9aa3b8';
    ctx.fillText('KM/H', cx, cy + 27);
    const gear = car.fwd < -6 ? 'R' : String(1 + Math.min(4, Math.floor((Math.abs(car.fwd) / car.spec.top) * 5)));
    ctx.font = 'bold 13px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#c8cede';
    ctx.fillText(`${car.spec.name.toUpperCase()} · ${gear}`, cx, cy - r - 13);
  }

  objective(ctx, game, W, H) {
    // The heist owns the plate while it runs; missions otherwise.
    let text = game.heists?.objectiveText() ?? game.missions.objectiveText();
    const marker = game.heists?.marker() ?? game.missions.marker();
    if (marker) {
      const m = Math.round(dist(game.player.x, game.player.y, marker.x, marker.y) / 8);
      text += ` · ${m}m`;
    }
    ctx.font = 'bold 17px Consolas, "Courier New", monospace';
    // Backing plate keeps the objective readable over neon spill and smoke; the thin gold
    // rim ties it to the marker colour without shouting.
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(5,7,15,0.62)';
    this.rounded(ctx, W / 2 - w / 2 - 14, H - 52, w + 28, 30, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,217,119,0.35)';
    ctx.lineWidth = 1.5;
    this.rounded(ctx, W / 2 - w / 2 - 14, H - 52, w + 28, 30, 8);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(text, W / 2 + 1, H - 34 + 1);
    ctx.fillStyle = '#ffd977';
    ctx.fillText(text, W / 2, H - 34);
  }

  banner(ctx, game, W, H) {
    const m = game.missions;
    if (m.bannerT <= 0) return;
    const a = clamp(m.bannerT, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '3px';
    ctx.font = 'bold 46px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(m.bannerText, W / 2 + 2, H * 0.2 + 2);
    ctx.fillStyle = m.bannerColor;
    ctx.fillText(m.bannerText, W / 2, H * 0.2);
    ctx.letterSpacing = '0px';
    ctx.font = '18px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#dfe4ee';
    this.wrap(ctx, m.bannerSub ?? '', W / 2, H * 0.2 + 42, W * 0.7, 24);
    ctx.globalAlpha = 1;
  }

  endState(ctx, game, p, W, H) {
    if (game.state !== 'wasted' && game.state !== 'busted') return;
    ctx.fillStyle = game.state === 'wasted' ? 'rgba(90,8,16,0.45)' : 'rgba(10,20,80,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 86px Consolas, "Courier New", monospace';
    ctx.fillStyle = game.state === 'wasted' ? '#ff5a5a' : '#7aa2ff';
    ctx.fillText(game.state === 'wasted' ? 'WASTED' : 'BUSTED', W / 2, H / 2);
    const fee = Math.max(50, Math.floor(p.money * (game.state === 'busted' ? 0.2 : 0.15)));
    ctx.font = '20px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#e8ecf4';
    ctx.fillText(game.state === 'wasted' ? `Hospital bill: -$${fee}` : `Bail: -$${fee}`, W / 2, H / 2 + 46);
  }

  wrap(ctx, text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW) {
        ctx.fillText(line, x, yy);
        line = w; yy += lineH;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
  }

  star(ctx, x, y, r, on, blink) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rad = k % 2 === 0 ? r : r * 0.44;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (on) {
      ctx.fillStyle = blink ? '#ffffff' : '#ffd24a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,160,40,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- phone

  /** The pocket phone: a tall plate on the right with pages and a cursor. */
  phonePanel(ctx, game, W, H) {
    const phone = game.phone;
    const st = phone.state;
    const pw = 320, ph = 470;
    const px = W - pw - 42, py = H - ph - 90;
    ctx.save();
    // Backing plate with a warm rim.
    ctx.fillStyle = 'rgba(8,10,18,0.88)';
    this.rounded(ctx, px, py, pw, ph, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(123,255,212,0.4)';
    ctx.lineWidth = 2;
    this.rounded(ctx, px, py, pw, ph, 18);
    ctx.stroke();
    // Status bar.
    ctx.font = 'bold 13px Consolas, "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7bffd4';
    ctx.fillText('VICE PALMS PHONE', px + 20, py + 28);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9aa3b8';
    ctx.fillText(`${Math.round(st.battery)}%  Tab`, px + pw - 20, py + 28);
    // Header line.
    ctx.textAlign = 'left';
    ctx.font = '12px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#6f7788';
    ctx.fillText(pageTitle(st.page), px + 20, py + 52);

    // An active call takes over the panel.
    if (st.inCall) {
      const call = st.inCall;
      ctx.fillStyle = call.contact.color ?? '#ffd977';
      ctx.font = 'bold 19px Consolas, "Courier New", monospace';
      ctx.fillText(call.contact.name, px + 20, py + 96);
      ctx.fillStyle = '#9aa3b8';
      ctx.font = '12px Consolas, "Courier New", monospace';
      ctx.fillText('CALL IN PROGRESS — SPACE to continue', px + 20, py + 116);
      ctx.fillStyle = '#dfe4ee';
      ctx.font = '14px Consolas, "Courier New", monospace';
      this.wrap(ctx, call.lines[Math.min(call.step, call.lines.length - 1)], px + 20, py + 150, pw - 40, 20);
      ctx.restore();
      return;
    }

    // Page items with the cursor row.
    const items = phone.pageItems();
    const rowH = 44;
    const listTop = py + 68;
    const rows = Math.floor((ph - 100) / rowH);
    const first = Math.max(0, Math.min(st.cursor - rows + 1, items.length - rows));
    ctx.font = 'bold 15px Consolas, "Courier New", monospace';
    for (let i = first; i < Math.min(items.length, first + rows); i++) {
      const it = items[i];
      const ry = listTop + (i - first) * rowH;
      const sel = i === st.cursor;
      if (sel) {
        ctx.fillStyle = 'rgba(123,255,212,0.14)';
        this.rounded(ctx, px + 10, ry - 6, pw - 20, rowH - 6, 8);
        ctx.fill();
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = sel ? '#ffffff' : it.color ?? '#c8cede';
      ctx.fillText(it.label, px + 24, ry + 12);
      ctx.font = '11px Consolas, "Courier New", monospace';
      ctx.fillStyle = '#8a92a4';
      const sub = it.sub ?? '';
      ctx.fillText(sub.length > 40 ? sub.slice(0, 39) + '…' : sub, px + 24, ry + 28);
      ctx.font = 'bold 15px Consolas, "Courier New", monospace';
    }
    // Footer hint.
    ctx.textAlign = 'center';
    ctx.font = '11px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#6f7788';
    ctx.fillText('↑↓ move · ENTER pick · Q back', px + pw / 2, py + ph - 16);
    ctx.restore();
  }
}

function pageTitle(page) {
  switch (page) {
    case 'contacts': return 'CONTACTS';
    case 'messages': return 'MESSAGES';
    case 'property': return 'PROPERTY LEDGER';
    case 'radio': return 'FM DIAL';
    default: return 'HOME';
  }
}
