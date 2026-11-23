// mapscreen.js — the full-map overlay. Hold or toggle M for a big, readable
// city map with every marker, your heading, the docks/airfield labels and a
// legend. North-up, built from the same prerendered minimap image.

import { CFG } from './config.js';
import { clamp, TAU } from './util.js';

export class MapScreen {
  constructor(game) {
    this.game = game;
    this.open = false;
  }

  toggle() {
    this.open = !this.open;
  }

  draw(ctx) {
    const game = this.game;
    const W = game.viewW, H = game.viewH;
    // dim the world behind
    ctx.fillStyle = 'rgba(4, 6, 10, 0.82)';
    ctx.fillRect(0, 0, W, H);

    const size = Math.min(W, H) * 0.86;
    const cx = W / 2, cy = H / 2 + 10;
    const scale = size / (CFG.WT * 2); // minimap image is 2px per tile

    ctx.save();
    // framed map
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(cx - size / 2 - 10, cy - size / 2 - 10, size + 20, size + 20);
    ctx.strokeStyle = 'rgba(255, 210, 90, 0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - size / 2 - 10, cy - size / 2 - 10, size + 20, size + 20);
    ctx.beginPath();
    ctx.rect(cx - size / 2, cy - size / 2, size, size);
    ctx.clip();
    ctx.drawImage(game.world.minimap, cx - size / 2, cy - size / 2, size, size);

    const toMap = (wx, wy) => ({
      x: cx - size / 2 + (wx / CFG.T) * 2 * scale,
      y: cy - size / 2 + (wy / CFG.T) * 2 * scale,
    });

    const p = game.player;
    // district labels
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const labels = [
      ['NORTH DOCKS', 48 * CFG.T, 9 * CFG.T],
      ['PALM AIRFIELD', 144 * CFG.T, 88 * CFG.T],
      ['FLAMINGO PARK', 80 * CFG.T, 112 * CFG.T],
      ['DOWNTOWN', 76 * CFG.T, 64 * CFG.T],
      ['PALM BEACH', 80 * CFG.T, 148 * CFG.T],
      ['OCEAN DRIVE', 40 * CFG.T, 146.5 * CFG.T],
    ];
    for (const [text, lx, ly] of labels) {
      const m = toMap(lx, ly);
      ctx.fillText(text, m.x, m.y);
    }

    // tokens (unfound ones only show when few remain — a mercy)
    if (game.tokens && game.tokens.total - game.tokens.collected <= 3) {
      for (let i = 0; i < game.tokens.spots.length; i++) {
        if (game.tokens.taken.has(i)) continue;
        const m = toMap(game.tokens.spots[i].x, game.tokens.spots[i].y);
        ctx.fillStyle = '#5cff8a';
        ctx.beginPath();
        ctx.arc(m.x, m.y, 3, 0, TAU);
        ctx.fill();
      }
    }

    // mission markers
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 5);
    for (const mk of game.missions.markers()) {
      const m = toMap(mk.pos.x, mk.pos.y);
      ctx.fillStyle = mk.kind === 'side' ? '#5cff8a' : mk.kind === 'checkpoint' ? '#37f5ff' : '#ffd23d';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4 + pulse * 2, 0, TAU);
      ctx.fill();
    }

    // cops
    if (game.police.wanted > 0) {
      for (const c of game.cars) {
        if (c.driver !== 'cop' || c.dead) continue;
        const m = toMap(c.x, c.y);
        ctx.fillStyle = '#5c9dff';
        ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
      }
      if (game.heli) {
        const m = toMap(game.heli.x, game.heli.y);
        ctx.fillStyle = '#5c9dff';
        ctx.beginPath();
        ctx.arc(m.x, m.y, 5, 0, TAU);
        ctx.stroke();
      }
    }

    // player arrow
    const pm = toMap(p.x, p.y);
    ctx.save();
    ctx.translate(pm.x, pm.y);
    ctx.rotate(p.ang);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // header + legend
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillStyle = '#ffd23d';
    ctx.fillText('VICE PALMS', cx, cy - size / 2 - 26);
    ctx.font = '12px "Courier New", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('M — close map', cx, cy - size / 2 - 10);
    ctx.textAlign = 'left';
    const lx = cx - size / 2;
    const ly = cy + size / 2 + 24;
    const legend = [
      ['#ffd23d', 'story mission'],
      ['#5cff8a', 'side job' + (game.tokens && game.tokens.total - game.tokens.collected <= 3 ? ' · token' : '')],
      ['#37f5ff', 'checkpoint'],
      ['#5c9dff', 'police'],
      ['#ffffff', 'you'],
    ];
    legend.forEach((row, i) => {
      ctx.fillStyle = row[0];
      ctx.beginPath();
      ctx.arc(lx + 6 + i * 108, ly - 3, 3.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '11px "Courier New", monospace';
      ctx.fillText(row[1], lx + 14 + i * 108, ly);
    });
    ctx.textAlign = 'center';
    void clamp;
  }
}
