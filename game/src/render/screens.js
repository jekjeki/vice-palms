// Full-screen UI states: the neon title screen with the palm-silhouette logo, the pause menu,
// and the little helper that keeps menu navigation on the keyboard.

import { TAU } from '../util.js';

export class Screens {
  constructor(game0) {
    this.gameRef = game0;        // set by main.js: { uiState, menuIndex, hasSave, soundOn }
    this.logoSeed = Math.random() * 10;
  }

  draw(ctx, game, ui, W, H) {
    if (ui.uiState === 'title') this.title(ctx, W, H, ui);
    else if (ui.uiState === 'pause') this.pause(ctx, game, ui, W, H);
  }

  title(ctx, W, H, ui) {
    // Darken the vista behind the menu.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(6,8,20,0.55)');
    g.addColorStop(0.55, 'rgba(10,10,30,0.35)');
    g.addColorStop(1, 'rgba(4,5,14,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Palm silhouettes framing the logo.
    ctx.save();
    ctx.globalAlpha = 0.8;
    this.palmSilhouette(ctx, W * 0.13, H * 0.72, 1.5, 0.5);
    this.palmSilhouette(ctx, W * 0.87, H * 0.76, 1.9, -0.6);
    ctx.restore();

    // Logo: measured two-tone neon text.
    ctx.textAlign = 'center';
    const cx = W / 2, cy = H * 0.34;
    const logoSize = Math.min(110, W / 11);
    ctx.font = `bold ${logoSize}px Consolas, "Courier New", monospace`;
    const viceW = ctx.measureText('VICE ').width;
    const palmsW = ctx.measureText('PALMS').width;
    const total = viceW + palmsW;
    const lx = cx - total / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,63,164,0.28)';
    ctx.fillText('VICE PALMS', lx + 4, cy + 5);
    ctx.fillStyle = '#ff3fa4';
    ctx.fillText('VICE', lx, cy);
    ctx.fillStyle = '#33e7ff';
    ctx.fillText('PALMS', lx + viceW, cy);
    ctx.textAlign = 'center';
    ctx.font = '20px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#c9cfe0';
    ctx.fillText('AN OPEN-WORLD NIGHT IN THE PALM CITY', cx, cy + 40);

    // Menu
    const items = ui.titleItems;
    ctx.font = 'bold 26px Consolas, "Courier New", monospace';
    items.forEach((label, i) => {
      const y = H * 0.58 + i * 44;
      const selected = i === ui.menuIndex;
      ctx.fillStyle = selected ? '#ffd977' : 'rgba(220,225,240,0.6)';
      ctx.fillText((selected ? '▸ ' : '') + label, cx, y);
    });

    ctx.font = '14px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(200,205,225,0.55)';
    ctx.fillText('WASD / ARROWS move · SHIFT sprint · F steal a car · SPACE handbrake / punch · E shoot · H horn · ESC pause', cx, H - 28);
    ctx.fillStyle = 'rgba(160,166,190,0.4)';
    ctx.fillText('a make.fun gta6-01 entry · all code, art and sound original', cx, H - 10);
  }

  palmSilhouette(ctx, x, y, s, lean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#05060c';
    ctx.strokeStyle = '#05060c';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(0, 90);
    ctx.quadraticCurveTo(lean * 30, 30, lean * 44, -20);
    ctx.stroke();
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.55;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(lean * 44, -20);
      ctx.quadraticCurveTo(lean * 44 + Math.cos(a) * 26, -20 + Math.sin(a) * 26, lean * 44 + Math.cos(a) * 52, -20 + Math.sin(a) * 52 + 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  pause(ctx, game, ui, W, H) {
    ctx.fillStyle = 'rgba(4,6,16,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 54px Consolas, "Courier New", monospace';
    ctx.fillStyle = '#33e7ff';
    ctx.fillText('PAUSED', W / 2, H * 0.3);
    const items = ui.pauseItems;
    ctx.font = 'bold 24px Consolas, "Courier New", monospace';
    items.forEach((label, i) => {
      const y = H * 0.46 + i * 42;
      const selected = i === ui.menuIndex;
      ctx.fillStyle = selected ? '#ffd977' : 'rgba(220,225,240,0.6)';
      ctx.fillText((selected ? '▸ ' : '') + label, W / 2, y);
    });
    ctx.font = '15px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(200,205,225,0.5)';
    ctx.fillText('the game autosaves on missions and on this menu', W / 2, H * 0.46 + items.length * 42 + 30);
  }
}
