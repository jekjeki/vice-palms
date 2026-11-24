// screens.js — title, pause (save/delete-save), WASTED / BUSTED overlays.
// Keyboard-driven menus, localStorage persistence.

import { CFG, ctx, VERSION } from './config.js';
import { clamp, fmtMoney, TAU } from './util.js';

const SAVE_KEY = 'vp_save1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function writeSave(S) {
  try {
    const d = {
      v: 1, when: Date.now(),
      money: S.money,
      x: S.player.x, y: S.player.y,
      health: S.player.health, armor: S.player.armor, ammo: S.player.ammo,
      missions: S.missions.saveData(),
      weapons: ctx.weapons ? ctx.weapons.saveData() : null,
      playTime: S.playTime,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    return true;
  } catch { return false; }
}

export function deleteSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export class Screens {
  constructor() {
    this.menuIdx = 0;
    this.menuItems = [];
    this.respT = 0;           // wasted/busted countdown
    this.mode = null;         // 'wasted' | 'busted'
    this.fee = 0;
    this.t = 0;
  }

  buildMenu(S) {
    const save = loadSave();
    const items = [];
    if (S.mode === 'title') {
      if (save) items.push({ label: 'CONTINUE', act: 'continue' });
      items.push({ label: 'NEW GAME', act: 'new' });
    } else {
      items.push({ label: 'RESUME', act: 'resume' });
      items.push({ label: 'SAVE GAME', act: 'save' });
      items.push({ label: 'DELETE SAVE', act: 'del' });
    }
    this.menuItems = items;
    this.menuIdx = clamp(this.menuIdx, 0, items.length - 1);
  }

  update(dt, S, input) {
    this.t += dt;
    if (input.hit('F1')) this.help = !this.help;
    if (S.mode === 'title' || S.mode === 'pause') {
      this.buildMenu(S);
      if (input.hit('ArrowUp') || input.hit('KeyW')) this.menuIdx--;
      if (input.hit('ArrowDown') || input.hit('KeyS')) this.menuIdx++;
      this.menuIdx = clamp(this.menuIdx, 0, this.menuItems.length - 1);
      if (input.hit('Enter')) {
        const it = this.menuItems[this.menuIdx];
        if (it) this.activate(it.act, S);
      }
      return;
    }
    if (S.mode === 'wasted' || S.mode === 'busted') {
      this.respT -= dt;
      if (this.respT <= 0 || input.hit('Enter')) {
        ctx.game.respawn(this.mode);
      }
    }
  }

  activate(act, S) {
    switch (act) {
      case 'new': ctx.game.startNewGame(); break;
      case 'continue': ctx.game.continueGame(); break;
      case 'resume': S.mode = 'play'; break;
      case 'save': {
        const ok = writeSave(S);
        ctx.subtitle(ok ? 'Game saved.' : 'Save failed.', 2);
        S.mode = 'play';
        break;
      }
      case 'del':
        deleteSave();
        ctx.subtitle('Save deleted.', 2);
        this.buildMenu(S);
        break;
    }
  }

  startOverlay(mode, fee) {
    this.mode = mode;
    this.respT = 3.4;
    this.fee = fee;
  }

  draw(g, S) {
    const W = CFG.viewW, H = CFG.viewH;
    if (S.mode === 'title') this.drawTitle(g, S);
    else if (S.mode === 'pause') this.drawPause(g, S);
    else if (S.mode === 'wasted' || S.mode === 'busted') this.drawDeath(g, S);
    if (this.help && S.mode === 'play') this.drawHelp(g, S);
  }

  drawTitle(g, S) {
    const W = CFG.viewW, H = CFG.viewH;
    // darkened backdrop of the live world
    g.fillStyle = 'rgba(4,6,14,0.82)';
    g.fillRect(0, 0, W, H);

    // logo
    g.textAlign = 'center';
    g.font = 'bold 92px "Arial Black", sans-serif';
    const grad = g.createLinearGradient(0, H * 0.28, 0, H * 0.44);
    grad.addColorStop(0, '#ff6ad5');
    grad.addColorStop(0.5, '#c86af5');
    grad.addColorStop(1, '#5ad8f5');
    g.fillStyle = grad;
    g.shadowColor = '#c86af5';
    g.shadowBlur = 26;
    g.fillText('VICE PALMS', W / 2, H * 0.38);
    g.shadowBlur = 0;
    g.font = '20px monospace';
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText('a neon-soaked night in the palms · v' + VERSION, W / 2, H * 0.44);

    // palm silhouette
    this.drawPalm(g, W * 0.16, H * 0.62, 1.2);
    this.drawPalm(g, W * 0.85, H * 0.66, 0.9, true);

    // menu
    const items = this.menuItems;
    g.font = 'bold 26px monospace';
    for (let i = 0; i < items.length; i++) {
      const y = H * 0.56 + i * 44;
      const sel = i === this.menuIdx;
      g.fillStyle = sel ? '#f5c04a' : 'rgba(255,255,255,0.55)';
      if (sel) g.fillText('▶ ' + items[i].label + ' ◀', W / 2, y);
      else g.fillText(items[i].label, W / 2, y);
    }

    // controls
    g.font = '14px monospace';
    g.fillStyle = 'rgba(255,255,255,0.5)';
    const lines = [
      'WASD drive/walk · SPACE handbrake · SHIFT sprint',
      'F jack/enter/exit car · MOUSE aim · LMB shoot',
      'M mute · ESC pause · follow the markers for missions',
    ];
    let y = H - 78;
    for (const l of lines) { g.fillText(l, W / 2, y); y += 20; }
  }

  drawPause(g, S) {
    const W = CFG.viewW, H = CFG.viewH;
    g.fillStyle = 'rgba(4,6,14,0.72)';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.font = 'bold 54px "Arial Black", sans-serif';
    g.fillStyle = '#5ad8f5';
    g.fillText('PAUSED', W / 2, H * 0.3);
    g.font = 'bold 24px monospace';
    for (let i = 0; i < this.menuItems.length; i++) {
      const y = H * 0.46 + i * 44;
      const sel = i === this.menuIdx;
      g.fillStyle = sel ? '#f5c04a' : 'rgba(255,255,255,0.55)';
      g.fillText((sel ? '▶ ' : '') + this.menuItems[i].label + (sel ? ' ◀' : ''), W / 2, y);
    }
    const save = loadSave();
    g.font = '13px monospace';
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillText(save ? `save: ${fmtMoney(save.money)} · missions ${save.missions ? save.missions.storyIdx : 0}/6` : 'no save on this machine', W / 2, H - 40);

    // session stats card
    const st = S.stats;
    if (st) {
      const rows = [
        ['MISSIONS PASSED', st.missions],
        ['MONEY EARNED', fmtMoney(st.earned)],
        ['DISTANCE DRIVEN', Math.round(st.distance / 100) / 10 + ' km'],
        ['CARS JACKED', st.jacked],
        ['CIVILIANS DOWN', st.pedsDown],
        ['COPS DOWN', st.copsDown],
        ['BUSTED / WASTED', st.busted + ' / ' + st.wasted],
      ];
      g.font = 'bold 15px monospace';
      g.fillStyle = '#5ad8f5';
      g.textAlign = 'left';
      g.fillText('SESSION LEDGER', 96, H * 0.40);
      g.font = '14px monospace';
      let ry = H * 0.40 + 26;
      for (const [k, v] of rows) {
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillText(k, 96, ry);
        g.fillStyle = '#f0f0f0';
        g.textAlign = 'right';
        g.fillText(String(v), 380, ry);
        g.textAlign = 'left';
        ry += 22;
      }
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.font = '12px monospace';
      g.fillText('F1 toggles the controls overlay in game', 96, ry + 8);
    }
  }

  drawHelp(g, S) {
    const W = CFG.viewW, H = CFG.viewH;
    g.fillStyle = 'rgba(6,8,16,0.85)';
    g.fillRect(W / 2 - 250, H / 2 - 190, 500, 380);
    g.strokeStyle = 'rgba(245,192,74,0.6)';
    g.lineWidth = 2;
    g.strokeRect(W / 2 - 250, H / 2 - 190, 500, 380);
    g.textAlign = 'center';
    g.font = 'bold 22px "Arial Black", sans-serif';
    g.fillStyle = '#f5c04a';
    g.fillText('CONTROLS', W / 2, H / 2 - 150);
    g.font = '15px monospace';
    g.textAlign = 'left';
    const lines = [
      'WASD / arrows ........ move · drive',
      'SHIFT ................ sprint',
      'SPACE ................ handbrake (car) · fire (foot)',
      'F .................... jack / enter / exit a car',
      'MOUSE ................ aim',
      'LMB .................. shoot · punch',
      '1-4 / Q .............. select / cycle weapon',
      'M .................... mute',
      'ESC .................. pause (save · delete save)',
      'F1 ................... this overlay',
      '',
      'Yellow markers ...... start missions',
      'Pink markers ........ current objective',
      '',
      'Gamepad: stick move · A handbrake · X jack',
    ];
    let y = H / 2 - 116;
    for (const l of lines) {
      g.fillStyle = 'rgba(235,238,246,0.85)';
      g.fillText(l, W / 2 - 225, y);
      y += 24;
    }
  }

  drawDeath(g, S) {
    const W = CFG.viewW, H = CFG.viewH;
    g.fillStyle = S.mode === 'wasted' ? 'rgba(60,0,10,0.66)' : 'rgba(6,10,40,0.66)';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.font = 'bold 88px "Arial Black", sans-serif';
    g.shadowColor = S.mode === 'wasted' ? '#ff2050' : '#3050ff';
    g.shadowBlur = 30;
    g.fillStyle = S.mode === 'wasted' ? '#ff5560' : '#7aa0ff';
    g.fillText(S.mode === 'wasted' ? 'WASTED' : 'BUSTED', W / 2, H * 0.42);
    g.shadowBlur = 0;
    g.font = '20px monospace';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText(this.mode === 'wasted'
      ? `Hospital fees: ${fmtMoney(this.fee)}`
      : `Bail & impound: ${fmtMoney(this.fee)}`, W / 2, H * 0.52);
    const secs = Math.max(0, Math.ceil(this.respT));
    g.fillText(`Respawning in ${secs}…`, W / 2, H * 0.58);
  }

  drawPalm(g, x, y, s, flip = false) {
    g.save();
    g.translate(x, y);
    if (flip) g.scale(-s, s); else g.scale(s, s);
    g.strokeStyle = '#4a3826';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(10, -60, 2, -120);
    g.stroke();
    g.strokeStyle = '#2f7a3d';
    g.lineWidth = 6;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.5;
      g.beginPath();
      g.moveTo(2, -120);
      g.quadraticCurveTo(Math.cos(a) * 40, -120 + Math.sin(a) * 34, Math.cos(a) * 74, -120 + Math.sin(a) * 56 + 26);
      g.stroke();
    }
    g.restore();
  }
}
