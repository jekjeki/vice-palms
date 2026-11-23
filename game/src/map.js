// ---------------------------------------------------------------------------
// map.js — TAB opens the full-city chart. North-up, legend, every marker the
// game knows about: missions, pickups (collected ones dim), the safehouse
// garage, hospital, police HQ, and the player's arrow. Zoom follows the mouse
// wheel; drag pans. ESC/TAB closes.
// ---------------------------------------------------------------------------

import { CFG } from './config.js';
import { VIEW } from './view.js';
import { clamp } from './util.js';

export class CityMap {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.zoom = 0.62;              // map px per world px
    this.cx = 2048; this.cy = 2048; // world point at view centre
  }

  openMap() {
    this.open = true;
  }

  closeMap() {
    this.open = false;
  }

  toggle() {
    this.open = !this.open;
  }

  update(input) {
    if (!this.open) return false;
    if (input.wasPressed('Tab', 'Escape', 'KeyM2')) { this.closeMap(); return true; }
    // wheel zoom around the cursor
    if (input.wheelDelta) {
      const before = this.screenToWorld(input.mouse.x, input.mouse.y);
      this.zoom = clamp(this.zoom * (input.wheelDelta > 0 ? 1.15 : 0.87), 0.14, 1.6);
      const after = this.screenToWorld(input.mouse.x, input.mouse.y);
      this.cx += before.x - after.x;
      this.cy += before.y - after.y;
      input.wheelDelta = 0;
    }
    // drag pan
    if (input.mouse.down && input.mouse.moved) {
      this.cx -= input.mouse.dx || 0;
      this.cy -= input.mouse.dy || 0;
    }
    // keyboard pan
    const k = 24;
    if (input.isDown('KeyW', 'ArrowUp')) this.cy -= k;
    if (input.isDown('KeyS', 'ArrowDown')) this.cy += k;
    if (input.isDown('KeyA', 'ArrowLeft')) this.cx -= k;
    if (input.isDown('KeyD', 'ArrowRight')) this.cx += k;
    this.cx = clamp(this.cx, 0, CFG.WORLD);
    this.cy = clamp(this.cy, 0, CFG.WORLD);
    return true;
  }

  screenToWorld(sx, sy) {
    return {
      x: this.cx + (sx - VIEW.w / 2) / this.zoom,
      y: this.cy + (sy - VIEW.h / 2) / this.zoom,
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.cx) * this.zoom + VIEW.w / 2,
      y: (wy - this.cy) * this.zoom + VIEW.h / 2,
    };
  }

  draw(g) {
    const game = this.game;
    const mm = game.world.minimap;
    if (!mm) return;
    g.fillStyle = 'rgba(4,6,10,0.88)';
    g.fillRect(0, 0, VIEW.w, VIEW.h);
    // the map itself
    g.imageSmoothingEnabled = false;
    const w = CFG.WORLD * this.zoom;
    const tl = this.worldToScreen(0, 0);
    g.drawImage(mm, tl.x, tl.y, w, w);

    const blip = (wx, wy, color, size = 6, ring = false) => {
      const p = this.worldToScreen(wx, wy);
      if (ring) {
        g.strokeStyle = color;
        g.lineWidth = 2;
        g.beginPath(); g.arc(p.x, p.y, size + 4, 0, 7); g.stroke();
      }
      g.fillStyle = color;
      g.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    };

    // garage / hospital / HQ
    blip(game.world.hospital.x, game.world.hospital.y, '#ff5e7a', 7);
    blip(game.world.policeHQ.x, game.world.policeHQ.y, '#4d6bff', 7);
    if (game.garage) blip(game.garage.x, game.garage.y, '#7ce8a0', 7, true);

    // pickups (dim when collected)
    for (const pk of game.pickups.list) {
      blip(pk.x, pk.y, pk.alive ? '#ffd23e' : 'rgba(120,120,120,0.25)', 4);
    }

    // mission markers with labels
    for (const m of game.missions.markers()) {
      blip(m.x, m.y, m.kind === 'story' ? '#3fd9ff' : m.kind === 'side' ? '#8bff5e' : m.kind === 'checkpoint' ? '#ffd23e' : '#ff4d9d', 9, true);
      const p = this.worldToScreen(m.x, m.y);
      g.font = 'bold 11px "Segoe UI", Arial, sans-serif';
      g.fillStyle = 'rgba(240,244,250,0.9)';
      g.textAlign = 'center';
      g.fillText(m.label, p.x, p.y - 12);
      g.textAlign = 'left';
    }

    // police contacts during heat
    if (game.police.wanted > 0) {
      for (const c of game.police.cruisers) {
        if (!c.wrecked) blip(c.x, c.y, '#4d6bff', 5);
      }
      for (const c of game.police.cops) blip(c.x, c.y, '#4d9bff', 4);
    }

    // player arrow
    const p = this.worldToScreen(game.player.x, game.player.y);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(game.player.angle + Math.PI / 2);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.restore();

    // frame + legend + hints
    g.strokeStyle = 'rgba(120,160,220,0.4)';
    g.lineWidth = 2;
    g.strokeRect(tl.x, tl.y, w, w);
    g.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    g.fillStyle = '#3fd9ff';
    g.fillText('VICE PALMS — CITY CHART', 26, 34);
    g.font = '12px "Segoe UI", Arial, sans-serif';
    g.fillStyle = 'rgba(220,228,240,0.75)';
    const legend = [
      ['cyan', 'story mission'], ['green', 'side hustle / garage'], ['yellow', 'pickups & checkpoints'],
      ['pink', 'objective'], ['red', 'hospital'], ['blue', 'police HQ / cruisers'],
    ];
    let ly = 62;
    for (const [col, label] of legend) {
      g.fillStyle = { cyan: '#3fd9ff', green: '#8bff5e', yellow: '#ffd23e', pink: '#ff4d9d', red: '#ff5e7a', blue: '#4d6bff' }[col];
      g.fillRect(28, ly - 8, 10, 10);
      g.fillStyle = 'rgba(220,228,240,0.75)';
      g.fillText(label, 46, ly + 1);
      ly += 20;
    }
    g.fillStyle = 'rgba(200,212,230,0.45)';
    g.textAlign = 'center';
    g.fillText('wheel zoom · drag / WASD pan · TAB close', VIEW.w / 2, VIEW.h - 24);
    g.textAlign = 'left';
  }
}
