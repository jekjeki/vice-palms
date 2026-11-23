// ============================================================================
// VICE PALMS — screens.js
// Discrete screen states: neon title with menu (new / continue / delete save
// / mute), pause menu with save, the WASTED and BUSTED cards with fees, the
// mission-passed banner and the end card. Saves live in localStorage.
// ============================================================================

import { VIEW_W, VIEW_H, SAVE_KEY, VERSION, NEON, WORLD_X0, WORLD_Y0 } from './config.js';
import { money, clockStr, TAU } from './util.js';

export class Screens {
  constructor(game) {
    this.game = game;
    this.menuIdx = 0;
    this.confirmDelete = false;
    this.bannerPulse = 0;
  }

  // ------------------------------------------------------------------ saves
  hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch (e) {
      return false;
    }
  }

  writeSave(data) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.v !== 2) return null;
      return d;
    } catch (e) {
      return null;
    }
  }

  deleteSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  saveCurrent() {
    const g = this.game;
    const p = g.player;
    const ok = this.writeSave({
      v: 2,
      seed: g.seed,
      money: p.money,
      storyIdx: g.missions.storyIdx,
      hp: p.hp,
      armor: p.armor,
      ammo: p.pistolAmmo,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      time: Math.round(g.time),
      radio: g.radio || 0,
      stats: g.stats,
      achievements: [...g.achievements],
    });
    g.hud.toast(ok ? 'GAME SAVED' : 'SAVE FAILED');
    if (ok) g.audio.pickup();
  }

  // ------------------------------------------------------------------ title
  titleItems() {
    const items = ['START NEW GAME'];
    const save = this.readSave();
    if (save) {
      items.push('CONTINUE — ' + money(save.money || 0) + ' · ' + (save.storyIdx || 0) + ' MISSIONS');
    }
    items.push('DELETE SAVE' + (this.confirmDelete ? '  (PRESS AGAIN)' : ''));
    items.push('MUSIC & SFX: ' + (this.game.audio.muted ? 'OFF' : 'ON'));
    return items;
  }

  update(dt) {
    const g = this.game;
    this.bannerPulse += dt;
    if (g.state === 'title') {
      const items = this.titleItems();
      const dir = g.input.menuDir();
      if (dir !== 0) {
        this.menuIdx = (this.menuIdx + dir + items.length) % items.length;
        g.audio.sirenBlip();
      }
      if (g.input.confirm()) {
        const pick = items[this.menuIdx];
        if (pick === 'START NEW GAME') { this.confirmDelete = false; g.startNewGame(); }
        else if (pick.startsWith('CONTINUE')) { this.confirmDelete = false; g.continueGame(); }
        else if (pick.startsWith('DELETE SAVE')) {
          if (this.confirmDelete) { this.deleteSave(); this.confirmDelete = false; this.menuIdx = 0; g.hud.toast('SAVE DELETED'); }
          else this.confirmDelete = true;
        } else if (pick.startsWith('MUSIC')) {
          g.audio.setMuted(!g.audio.muted);
        }
      }
      if (g.input.cancel()) this.confirmDelete = false;
    } else if (g.state === 'paused') {
      const items = this.pauseItems();
      const dir = g.input.menuDir();
      if (dir !== 0) {
        this.menuIdx = (this.menuIdx + dir + items.length) % items.length;
        g.audio.sirenBlip();
      }
      if (g.input.confirm()) {
        const pick = items[this.menuIdx];
        if (pick === 'RESUME') g.togglePause();
        else if (pick === 'SAVE GAME') this.saveCurrent();
        else if (pick === 'RESTART MISSION') { g.missions.fail('RESTARTED'); g.togglePause(); }
        else if (pick === 'MUSIC & SFX: ON' || pick === 'MUSIC & SFX: OFF') g.audio.setMuted(!g.audio.muted);
        else if (pick === 'QUIT TO TITLE') g.quitToTitle();
      }
    } else if (g.state === 'wasted' || g.state === 'busted') {
      if (g.input.confirm()) g.respawnNow();
    } else if (g.state === 'end') {
      if (g.input.confirm()) g.quitToTitle();
    }
  }

  pauseItems() {
    const g = this.game;
    const items = ['RESUME', 'SAVE GAME'];
    if (g.missions.active) items.push('RESTART MISSION');
    items.push('MUSIC & SFX: ' + (g.audio.muted ? 'OFF' : 'ON'));
    items.push('QUIT TO TITLE');
    return items;
  }

  // Full city map: TAB in game. Uses the prerendered minimap, upscaled,
  // with landmark labels, live markers and the player's blip.
  drawCityMap(ctx) {
    const g = this.game;
    const mm = g.world.minimap;
    ctx.fillStyle = 'rgba(3,4,10,0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const scale = 1.62;
    const w = mm.width * scale, h = mm.height * scale;
    const ox = 250, oy = (VIEW_H - h) / 2;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mm, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const w2s = (x, y) => [ox + (x - WORLD_X0) * 0.26, oy + (y - WORLD_Y0) * 0.26];
    // Markers
    for (const m of g.missions.markers) {
      const [sx, sy] = w2s(m.x, m.y);
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(sx, sy, 4.4, 0, TAU); ctx.fill();
    }
    for (const m of g.missions.activeTargets()) {
      const [sx, sy] = w2s(m.x, m.y);
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(sx, sy, 4.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    // Player
    const p = g.player;
    const [px, py] = w2s(p.x, p.y);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    // Labels
    ctx.font = '700 11px "Consolas", monospace';
    const labelLoc = (name, text) => {
      const loc = g.world.locations[name];
      const [sx, sy] = [ox + (loc.x - WORLD_X0) * 0.26, oy + (loc.y - WORLD_Y0) * 0.26];
      ctx.fillStyle = 'rgba(232,230,223,0.85)';
      ctx.fillText(text, sx + 7, sy + 3);
    };
    labelLoc('hospital', 'HOSPITAL');
    labelLoc('policeSt', 'VCPD');
    labelLoc('plaza', 'PLAZA');
    labelLoc('club', 'MALIBU CLUB');
    labelLoc('hotel', 'PALMS HOTEL');
    labelLoc('market', 'MARKET');
    labelLoc('garage', 'RICO’S GARAGE');
    labelLoc('docksGate', 'NORTH DOCKS');
    labelLoc('hangar', 'AIRFIELD HANGAR');
    labelLoc('beachShack', 'BEACH SHACK');
    labelLoc('mansion', 'RICO’S MANSION');
    labelLoc('taxiDepot', 'CAB CO');
    labelLoc('ferris', 'PALMS WHEEL');

    // Legend
    ctx.font = '700 15px "Consolas", monospace';
    ctx.fillStyle = '#37e6ff';
    ctx.fillText('VICE PALMS — CITY MAP', 40, 60);
    ctx.font = '12px "Consolas", monospace';
    ctx.fillStyle = 'rgba(232,230,223,0.75)';
    ctx.fillText('cyan dot — story work', 40, 90);
    ctx.fillText('white dot — you', 40, 110);
    ctx.fillText('TAB — back to the night', 40, 130);
    const s = g.stats;
    ctx.fillStyle = 'rgba(232,230,223,0.5)';
    ctx.fillText('bank ' + money(g.player.money) + ' · ' + s.missionsPassed + ' missions · ' + s.jacked + ' cars jacked', 40, 160);
  }

  // ------------------------------------------------------------------ drawing
  drawTitle(ctx, t) {
    ctx.fillStyle = 'rgba(3,4,10,0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.textAlign = 'center';
    // Neon main title
    const pulse = 0.85 + Math.sin(t * 1.8) * 0.15;
    ctx.font = '700 84px "Consolas", monospace';
    ctx.shadowColor = NEON.pink;
    ctx.shadowBlur = 34 * pulse;
    ctx.fillStyle = '#ff9ad2';
    ctx.fillText('VICE PALMS', VIEW_W / 2, 218);
    ctx.shadowBlur = 0;

    ctx.font = '700 21px "Consolas", monospace';
    ctx.shadowColor = NEON.cyan;
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#9beeff';
    ctx.fillText('—  N E O N   N I G H T S   ·   R I C O   R E T U R N S  —', VIEW_W / 2, 258);
    ctx.shadowBlur = 0;

    // Menu
    const items = this.titleItems();
    ctx.font = '700 24px "Consolas", monospace';
    for (let i = 0; i < items.length; i++) {
      const y = 356 + i * 46;
      const sel = i === this.menuIdx;
      if (sel) {
        ctx.fillStyle = 'rgba(37,232,255,0.12)';
        ctx.fillRect(VIEW_W / 2 - 240, y - 30, 480, 40);
        ctx.fillStyle = '#37e6ff';
        ctx.fillText('▶ ' + items[i] + ' ◀', VIEW_W / 2, y);
      } else {
        ctx.fillStyle = 'rgba(232,230,223,0.8)';
        ctx.fillText(items[i], VIEW_W / 2, y);
      }
    }

    ctx.font = '13px "Consolas", monospace';
    ctx.fillStyle = 'rgba(232,230,223,0.55)';
    ctx.fillText('ARROWS/WASD MOVE · MOUSE AIM · CLICK FIRE · F ENTER/CARJACK · SPACE HANDBRAKE · ESC PAUSE', VIEW_W / 2, 612);
    ctx.fillStyle = 'rgba(232,230,223,0.35)';
    ctx.fillText('v' + VERSION + ' · an original neon-night driving game · no assets, no network', VIEW_W / 2, 640);
    ctx.textAlign = 'left';
  }

  drawPaused(ctx) {
    const g = this.game;
    ctx.fillStyle = 'rgba(3,4,10,0.66)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.font = '700 52px "Consolas", monospace';
    ctx.shadowColor = NEON.cyan;
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#9beeff';
    ctx.fillText('PAUSED', VIEW_W / 2, 170);
    ctx.shadowBlur = 0;

    const items = this.pauseItems();
    ctx.font = '700 21px "Consolas", monospace';
    for (let i = 0; i < items.length; i++) {
      const y = 240 + i * 44;
      const sel = i === this.menuIdx;
      if (sel) {
        ctx.fillStyle = 'rgba(37,232,255,0.12)';
        ctx.fillRect(VIEW_W / 2 - 220, y - 28, 440, 38);
        ctx.fillStyle = '#37e6ff';
        ctx.fillText('▶ ' + items[i] + ' ◀', VIEW_W / 2, y);
      } else {
        ctx.fillStyle = 'rgba(232,230,223,0.85)';
        ctx.fillText(items[i], VIEW_W / 2, y);
      }
    }

    // Night log — the stats.
    const s = g.stats;
    const km = (s.distance / 1000).toFixed(1);
    const lines = [
      'NIGHT LOG',
      'distance driven  ' + km + ' km',
      'missions passed  ' + s.missionsPassed,
      'cars jacked      ' + s.jacked,
      'cars wrecked     ' + s.carsWrecked,
      'civilians harmed ' + s.pedsHarmed,
      'peak heat        ' + s.maxStars + ' stars',
    ];
    ctx.textAlign = 'left';
    ctx.font = '700 14px "Consolas", monospace';
    ctx.fillStyle = '#ffd23c';
    ctx.fillText(lines[0], 40, 250);
    ctx.font = '13px "Consolas", monospace';
    ctx.fillStyle = 'rgba(232,230,223,0.8)';
    for (let i = 1; i < lines.length; i++) ctx.fillText(lines[i], 40, 250 + i * 20);
    ctx.textAlign = 'left';
  }

  drawWasted(ctx) {
    ctx.fillStyle = 'rgba(40,0,6,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    const pulse = 0.8 + Math.sin(this.bannerPulse * 2) * 0.2;
    ctx.font = '700 110px "Consolas", monospace';
    ctx.shadowColor = '#ff2038';
    ctx.shadowBlur = 40 * pulse;
    ctx.fillStyle = '#ff4d5e';
    ctx.fillText('WASTED', VIEW_W / 2, VIEW_H / 2 - 20);
    ctx.shadowBlur = 0;
    ctx.font = '700 20px "Consolas", monospace';
    ctx.fillStyle = '#ffd0d5';
    ctx.fillText('Vice Palms General took you in — fee ' + money(this.game.lastFee) + '.', VIEW_W / 2, VIEW_H / 2 + 46);
    ctx.fillText('Press ENTER to dust yourself off.', VIEW_W / 2, VIEW_H / 2 + 82);
    ctx.textAlign = 'left';
  }

  drawBusted(ctx) {
    ctx.fillStyle = 'rgba(4,10,34,0.75)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    const pulse = 0.8 + Math.sin(this.bannerPulse * 2) * 0.2;
    ctx.font = '700 100px "Consolas", monospace';
    ctx.shadowColor = '#2e6bff';
    ctx.shadowBlur = 40 * pulse;
    ctx.fillStyle = '#7aa2ff';
    ctx.fillText('BUSTED', VIEW_W / 2, VIEW_H / 2 - 20);
    ctx.shadowBlur = 0;
    ctx.font = '700 20px "Consolas", monospace';
    ctx.fillStyle = '#cfe0ff';
    ctx.fillText('The VCPD impounded your evening — bail ' + money(this.game.lastFee) + '.', VIEW_W / 2, VIEW_H / 2 + 46);
    ctx.fillText('Press ENTER to walk it off.', VIEW_W / 2, VIEW_H / 2 + 82);
    ctx.textAlign = 'left';
  }

  drawEnd(ctx, t) {
    ctx.fillStyle = 'rgba(3,4,10,0.78)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    const pulse = 0.85 + Math.sin(t * 1.6) * 0.15;
    ctx.font = '700 64px "Consolas", monospace';
    ctx.shadowColor = NEON.pink;
    ctx.shadowBlur = 30 * pulse;
    ctx.fillStyle = '#ff9ad2';
    ctx.fillText('RICO IS GONE. THE CITY STAYS.', VIEW_W / 2, 250);
    ctx.shadowBlur = 0;
    ctx.font = '700 24px "Consolas", monospace';
    ctx.fillStyle = '#9beeff';
    ctx.fillText('ALL SIX STORY MISSIONS PASSED', VIEW_W / 2, 320);
    ctx.font = '18px "Consolas", monospace';
    ctx.fillStyle = '#e8e6df';
    ctx.fillText('Final bank: ' + money(this.game.player.money) + '   ·   City clock ' + clockStr(this.game.time), VIEW_W / 2, 370);
    ctx.fillStyle = 'rgba(232,230,223,0.6)';
    ctx.fillText('TO BE CONTINUED — press ENTER for the title', VIEW_W / 2, 460);
    ctx.textAlign = 'left';
  }

  // Mission-passed banner floating over live gameplay.
  drawPassedBanner(ctx) {
    const g = this.game;
    const b = g.missions.passedBanner;
    if (!b) return;
    const t = b.t;
    const a = t < 0.3 ? t / 0.3 : t > 3.8 ? Math.max(0, 1 - (t - 3.8) / 0.7) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(4,6,12,0.8)';
    ctx.fillRect(VIEW_W / 2 - 330, 240, 660, 130);
    ctx.strokeStyle = '#ffd23c';
    ctx.lineWidth = 3;
    ctx.strokeRect(VIEW_W / 2 - 330, 240, 660, 130);
    ctx.font = '700 40px "Consolas", monospace';
    ctx.shadowColor = '#ffd23c';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffe28a';
    ctx.fillText('MISSION PASSED!', VIEW_W / 2, 296);
    ctx.shadowBlur = 0;
    ctx.font = '700 22px "Consolas", monospace';
    ctx.fillStyle = '#7dffa8';
    ctx.fillText('“' + b.name + '”  —  ' + money(b.payout), VIEW_W / 2, 340);
    ctx.restore();
    ctx.textAlign = 'left';
  }
}
