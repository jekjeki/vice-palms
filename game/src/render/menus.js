// Full-screen UI: the neon title with its palm silhouettes and animated shimmer, the pause
// menu, and the wording under each. Drawn over the live game render.

import { TAU } from '../util.js';

export class Menus {
  constructor(uiRef) {
    this.ui = uiRef;             // { uiState, menuIndex, titleItems, pauseItems }
    this.t = 0;
  }

  draw(ctx, game, ui, W, H, dt) {
    this.t += dt;
    if (ui.uiState === 'title') this.title(ctx, W, H, ui);
    else if (ui.uiState === 'pause') this.pause(ctx, game, ui, W, H);
  }

  title(ctx, W, H, ui) {
    // Dim the drifting vista behind the lettering.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(6,8,20,0.5)');
    g.addColorStop(0.55, 'rgba(10,10,30,0.34)');
    g.addColorStop(1, 'rgba(4,5,14,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Palm silhouettes framing the logo, swaying gently.
    ctx.save();
    ctx.globalAlpha = 0.82;
    this.palm(ctx, W * 0.12, H * 0.74, 1.5, 0.5);
    this.palm(ctx, W * 0.88, H * 0.78, 1.95, -0.6);
    ctx.restore();

    // Horizon glow behind the wordmark.
    const hg = ctx.createRadialGradient(W / 2, H * 0.34, 10, W / 2, H * 0.34, W * 0.4);
    hg.addColorStop(0, 'rgba(255,63,164,0.12)');
    hg.addColorStop(0.6, 'rgba(51,231,255,0.06)');
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(W * 0.1, H * 0.1, W * 0.8, H * 0.45);

    // Wordmark: pink VICE, cyan PALMS, layered glow and shimmer.
    ctx.textAlign = 'center';
    const cx = W / 2, cy = H * 0.34;
    const size = Math.min(112, W / 10.5);
    ctx.font = `bold ${size}px Consolas, "Courier New", monospace`;
    const viceW = ctx.measureText('VICE ').width;
    const palmsW = ctx.measureText('PALMS').width;
    const total = viceW + palmsW;
    const lx = cx - total / 2;
    ctx.textAlign = 'left';
    const shimmer = 0.24 + Math.sin(this.t * 2.2) * 0.08;
    ctx.fillStyle = `rgba(255,63,164,${shimmer})`;
    ctx.fillText('VICE PALMS', lx + 5, cy + 6);
    ctx.fillStyle = `rgba(51,231,255,${shimmer * 0.9})`;
    ctx.fillText('VICE PALMS', lx + 2, cy + 3);
    ctx.fillStyle = '#ff3fa4';
    ctx.fillText('VICE', lx, cy);
    ctx.fillStyle = '#33e7ff';
    ctx.fillText('PALMS', lx + viceW, cy);
    ctx.textAlign = 'center';
    ctx.font = '20px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#c9cfe0';
    ctx.fillText('AN OPEN-WORLD NIGHT IN THE PALM CITY', cx, cy + 42);

    // Menu with the highlighted row.
    const items = ui.titleItems;
    ctx.font = 'bold 27px Consolas, "Courier New", monospace';
    items.forEach((label, i) => {
      const y = H * 0.58 + i * 46;
      const on = i === ui.menuIndex;
      ctx.fillStyle = on ? '#ffd977' : 'rgba(220,225,240,0.62)';
      ctx.fillText((on ? '▸ ' : '') + label, cx, y);
      if (on) {
        ctx.strokeStyle = 'rgba(255,217,119,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - ctx.measureText(label).width / 2 - 8, y + 10);
        ctx.lineTo(cx + ctx.measureText(label).width / 2 + 8, y + 10);
        ctx.stroke();
      }
    });

    ctx.font = '14px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(200,205,225,0.58)';
    ctx.fillText('WASD / ARROWS move · SHIFT sprint · F steal or enter a car · SPACE handbrake / punch', cx, H - 46);
    ctx.fillText('E or CLICK shoot · H horn · ESC pause', cx, H - 28);
    ctx.fillStyle = 'rgba(160,166,190,0.4)';
    ctx.fillText('a make.fun gta6-01 entry · every line of code, art and sound is original', cx, H - 8);
  }

  palm(ctx, x, y, s, lean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#05060c';
    ctx.strokeStyle = '#05060c';
    ctx.lineWidth = 9;
    const sway = Math.sin(this.t * 0.8 + x) * 0.03;
    ctx.beginPath();
    ctx.moveTo(0, 92);
    ctx.quadraticCurveTo(lean * 30, 30, lean * 44, -20);
    ctx.stroke();
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.55 + sway;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(lean * 44, -20);
      ctx.quadraticCurveTo(lean * 44 + Math.cos(a) * 26, -20 + Math.sin(a) * 26, lean * 44 + Math.cos(a) * 52, -20 + Math.sin(a) * 52 + 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  pause(ctx, game, ui, W, H) {
    ctx.fillStyle = 'rgba(4,6,16,0.74)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 56px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#33e7ff';
    ctx.fillText('PAUSED', W / 2, H * 0.3);
    const items = ui.pauseItems;
    ctx.font = 'bold 24px Consolas, "Courier New", monospace';
    items.forEach((label, i) => {
      const y = H * 0.46 + i * 42;
      const on = i === ui.menuIndex;
      ctx.fillStyle = on ? '#ffd977' : 'rgba(220,225,240,0.62)';
      ctx.fillText((on ? '▸ ' : '') + label, W / 2, y);
    });
    ctx.font = '15px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(200,205,225,0.5)';
    ctx.fillText('the game autosaves on every mission payout and whenever this menu opens', W / 2, H * 0.46 + items.length * 42 + 30);
  }
}
