// Full-screen UI: the neon title with its palm silhouettes and animated shimmer, the pause
// menu, and the wording under each. Drawn over the live game render.

import { TAU, clamp } from '../util.js';

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
    // Dim the drifting vista behind the lettering, but keep the neon reading through it.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(6,8,20,0.42)');
    g.addColorStop(0.55, 'rgba(10,10,30,0.26)');
    g.addColorStop(1, 'rgba(4,5,14,0.8)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Palm silhouettes framing the logo, swaying gently.
    ctx.save();
    ctx.globalAlpha = 0.82;
    this.palm(ctx, W * 0.12, H * 0.74, 1.5, 0.5);
    this.palm(ctx, W * 0.88, H * 0.78, 1.95, -0.6);
    this.palm(ctx, W * 0.06, H * 0.9, 1.05, 0.25);
    this.palm(ctx, W * 0.95, H * 0.92, 1.25, -0.3);
    ctx.restore();

    // Horizon glow behind the wordmark.
    const hg = ctx.createRadialGradient(W / 2, H * 0.34, 10, W / 2, H * 0.34, W * 0.4);
    hg.addColorStop(0, 'rgba(255,63,164,0.14)');
    hg.addColorStop(0.6, 'rgba(51,231,255,0.07)');
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(W * 0.1, H * 0.1, W * 0.8, H * 0.45);

    // Wordmark: each letter its own neon tube, bobbing on a wave, glow stacked under it.
    ctx.textAlign = 'left';
    const size = Math.min(118, W / 10);
    ctx.font = `bold ${size}px Consolas, "Courier New", monospace`;
    const word = 'VICE PALMS';
    const widths = [...word].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let lx = W / 2 - total / 2;
    const cy = H * 0.33;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      if (ch === ' ') { lx += widths[i]; continue; }
      const bob = Math.sin(this.t * 1.7 + i * 0.85) * 5;
      const pink = i < 4;
      const hue = pink ? '#ff3fa4' : '#33e7ff';
      const glow = pink ? 'rgba(255,63,164,0.5)' : 'rgba(51,231,255,0.45)';
      ctx.fillStyle = 'rgba(2,3,9,0.9)';
      ctx.fillText(ch, lx + 6, cy + bob + 7);
      ctx.fillStyle = glow;
      ctx.fillText(ch, lx + 3, cy + bob + 4);
      ctx.fillStyle = glow;
      ctx.fillText(ch, lx + 1, cy + bob + 1);
      ctx.fillStyle = hue;
      ctx.fillText(ch, lx, cy + bob);
      lx += widths[i];
    }
    // A light sweep drifts across the wordmark once every few seconds.
    const sweep = ((this.t * 0.35) % 1.6) - 0.3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(W / 2 - total / 2 + sweep * total * 1.6, cy - size, Math.min(W * 0.05, total * 0.1), size * 1.4);
    ctx.restore();
    // Thin neon rule under the wordmark, its glow breathing with the sweep.
    const ruleY = cy + 26;
    ctx.strokeStyle = 'rgba(255,63,164,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - total / 2, ruleY);
    ctx.lineTo(W / 2 - total / 2 + total * clamp(sweep + 0.2, 0.06, 1), ruleY);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(51,231,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(W / 2 + total / 2 - total * clamp(1.1 - sweep, 0.06, 1), ruleY);
    ctx.lineTo(W / 2 + total / 2, ruleY);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = 'bold 19px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#ffd977';
    ctx.fillText('STEAL IT · DRIVE IT · OUTRUN THE NIGHT', W / 2, cy + 46);
    ctx.font = '17px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#c9cfe0';
    ctx.fillText('AN OPEN-WORLD NIGHT IN THE PALM CITY', W / 2, cy + 72);

    // Menu rows: the live one sits on a lit pill.
    const items = ui.titleItems;
    ctx.font = 'bold 27px Consolas, "Courier New", monospace';
    items.forEach((label, i) => {
      const y = H * 0.58 + i * 48;
      const on = i === ui.menuIndex;
      const w = ctx.measureText(label).width;
      if (on) {
        ctx.fillStyle = 'rgba(255,217,119,0.13)';
        this.pill(ctx, W / 2 - w / 2 - 26, y - 24, w + 52, 38);
        ctx.fill();
      }
      ctx.fillStyle = on ? '#ffd977' : 'rgba(220,225,240,0.62)';
      ctx.fillText((on ? '▸ ' : '') + label, W / 2, y);
    });

    ctx.font = '14px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(200,205,225,0.58)';
    ctx.fillText('WASD / ARROWS move · SHIFT sprint · F steal or enter a car · SPACE handbrake / punch', W / 2, H - 46);
    ctx.fillText('E or CLICK shoot · H horn · ESC pause', W / 2, H - 28);
    ctx.fillStyle = 'rgba(160,166,190,0.4)';
    ctx.fillText('a make.fun gta6-01 entry · every line of code, art and sound is original', W / 2, H - 8);
    // The world seed, bottom-left: the vista and every ?shot=&seed=N scene share it.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(120,126,150,0.5)';
    ctx.fillText(`WORLD SEED ${ui.seed}`, 16, H - 10);
  }

  pill(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.arc(x + h / 2, y + h / 2, h / 2, Math.PI / 2, Math.PI * 1.5);
    ctx.arc(x + w - h / 2, y + h / 2, h / 2, Math.PI * 1.5, Math.PI / 2);
    ctx.closePath();
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
    ctx.font = 'bold 20px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(255,63,164,0.8)';
    ctx.fillText('VICE PALMS', W / 2, H * 0.3 - 52);
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
