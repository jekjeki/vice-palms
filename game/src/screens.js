// screens.js — title, pause (save/delete-save), WASTED/BUSTED, ending
import { CFG } from './config.js';
import { fmtMoney, clamp, TAU } from './util.js';

export function updateScreens(game, dt) {
  const input = game.input;
  switch (game.state) {
    case 'title': {
      if (input.anyPressed('ENTER', 'SPACE')) {
        game.startPlay();
        game.audio?.init();
        game.audio?.setMuted(game.startMuted);
        game.audio?.startMusic();
      }
      break;
    }
    case 'play': {
      if (input.pressed('ESC') || input.pressed('P')) { game.state = 'pause'; game.audio?.engine(0, false); }
      if (input.pressed('M')) {
        game.startMuted = !game.startMuted;
        game.audio?.setMuted(game.startMuted);
        game.hud.toast(game.startMuted ? 'Audio muted (M)' : 'Audio on (M)');
      }
      break;
    }
    case 'pause': {
      game.menuIndex = clamp(game.menuIndex ?? 0, 0, 4);
      if (input.anyPressed('UP', 'W')) game.menuIndex = (game.menuIndex + 4) % 5;
      if (input.anyPressed('DOWN', 'S')) game.menuIndex = (game.menuIndex + 1) % 5;
      if (input.pressed('ENTER') || input.pressed('SPACE')) {
        if (game.menuIndex === 0) game.state = 'play';
        else if (game.menuIndex === 1) { game.save(); game.hud.toast('Game saved'); game.state = 'play'; }
        else if (game.menuIndex === 2) { game.deleteSave(); game.hud.toast('Save deleted'); }
        else if (game.menuIndex === 3) { game.hud.toast('Controls shown on the right'); }
        else { game.state = 'title'; game.resetToTitle(); }
      }
      if (input.pressed('ESC')) game.state = 'play';
      break;
    }
    case 'wasted': case 'busted': {
      game.screenT += dt;
      if (game.screenT > 2.2 && (input.anyPressed('ENTER', 'SPACE') || game.screenT > 5)) game.respawn();
      break;
    }
    case 'end': {
      game.screenT += dt;
      if (input.anyPressed('ENTER')) { game.state = 'play'; }
      break;
    }
  }
}

export function drawScreens(game, ctx) {
  const W = CFG.VIEW_W, H = CFG.VIEW_H;
  switch (game.state) {
    case 'title': drawTitle(game, ctx); break;
    case 'pause': drawPause(game, ctx); break;
    case 'wasted': drawStateCard(game, ctx, 'WASTED', '#ff4a5d'); break;
    case 'busted': drawStateCard(game, ctx, 'BUSTED', '#4f8aff'); break;
    case 'end': drawEnd(game, ctx); break;
  }
}

// ---------------------------------------------------------------- title
function drawTitle(game, ctx) {
  const W = CFG.VIEW_W, H = CFG.VIEW_H, t = game.t;
  // skyline backdrop
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0a18');
  g.addColorStop(0.55, '#241a3a');
  g.addColorStop(1, '#3a1f3f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // sun
  ctx.fillStyle = 'rgba(255,93,162,0.8)';
  ctx.beginPath(); ctx.arc(W / 2, H * 0.52, 130, 0, TAU); ctx.fill();
  // sun stripes
  ctx.fillStyle = 'rgba(10,10,24,0.9)';
  for (let i = 0; i < 6; i++) ctx.fillRect(W / 2 - 140, H * 0.52 - 40 + i * 24, 280, 8 + i * 1.6);
  // skyline
  ctx.fillStyle = '#100c1c';
  for (let i = 0; i < 26; i++) {
    const bw = 40 + ((i * 37) % 60);
    const bh = 60 + ((i * 71) % 150);
    ctx.fillRect(i * 52 - 20, H * 0.62 - bh, bw, bh + 200);
  }
  // windows
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = i % 3 ? 'rgba(255,214,140,0.5)' : 'rgba(0,229,255,0.4)';
    ctx.fillRect((i * 97) % W, H * 0.62 - ((i * 53) % 140), 4, 6);
  }
  // palms silhouettes
  drawPalmSil(ctx, 120, H * 0.86, 1.2);
  drawPalmSil(ctx, W - 130, H * 0.9, 1.4);
  drawPalmSil(ctx, W * 0.5 - 60, H * 0.94, 1);

  // logo
  ctx.textAlign = 'center';
  const flick = Math.sin(t * 13) > -0.92;
  ctx.font = '900 92px "Segoe UI", sans-serif';
  ctx.shadowColor = '#ff5da2'; ctx.shadowBlur = 30;
  ctx.fillStyle = flick ? '#ffe9f2' : '#8a4a66';
  ctx.fillText('VICE PALMS', W / 2, H * 0.30);
  ctx.shadowBlur = 0;
  ctx.font = '700 20px "Segoe UI", sans-serif';
  ctx.fillStyle = '#00e5ff';
  ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 12;
  ctx.fillText('A NIGHT IN THE NEON CITY', W / 2, H * 0.35);
  ctx.shadowBlur = 0;

  ctx.font = '600 22px "Segoe UI", sans-serif';
  ctx.fillStyle = Math.sin(t * 4) > 0 ? '#ffffff' : '#c9c9d4';
  ctx.fillText('PRESS  ENTER  TO  PLAY', W / 2, H * 0.68);
  // rotating tip marquee
  const tips = [
    'RICO TIP: rain makes the roads slippery — respect the handbrake',
    'VPD TIP: spike strips pop tires. Pay \'n\' Spray fixes everything else.',
    'RADIO TIP: R surfs the dial. WAVE 101.3 owns the night.',
    'CAB TIP: the Palm Line bus rides the whole loop for five bucks.',
    'SECRET TIP: twelve green briefcases are tucked around town.',
    'STUNT TIP: ramps pay by the second. Bigger air, bigger money.',
  ];
  const tip = tips[Math.floor(t / 4) % tips.length];
  ctx.font = '600 14px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(140,200,255,0.8)';
  ctx.fillText(tip, W / 2, H * 0.74);
  ctx.font = '600 15px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(230,230,240,0.75)';
  ctx.fillText('WASD drive/walk · SHIFT sprint/nitro · SPACE handbrake · F enter/carjack', W / 2, H * 0.78);
  ctx.fillText('Mouse aim + click shoot · E punch · H siren · TAB map · M mute · ESC pause', W / 2, H * 0.82);
  ctx.fillStyle = 'rgba(255,209,102,0.85)';
  ctx.fillText('make.fun · gta6-01 · jekjeki', W / 2, H * 0.9);
  ctx.textAlign = 'left';
}

function drawPalmSil(ctx, x, y, s) {
  ctx.strokeStyle = '#0d0a16';
  ctx.lineWidth = 7 * s;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 8, y - 40 * s, x + 4, y - 70 * s); ctx.stroke();
  ctx.lineWidth = 5 * s;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI + (i / 6) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 70 * s);
    ctx.quadraticCurveTo(x + 4 + Math.cos(a) * 30 * s, y - 70 * s + Math.sin(a) * 22 * s - 10, x + 4 + Math.cos(a) * 48 * s, y - 70 * s + Math.sin(a) * 34 * s + 14);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- pause
const MENU = ['RESUME', 'SAVE GAME', 'DELETE SAVE', 'CONTROLS', 'QUIT TO TITLE'];
function drawPause(game, ctx) {
  const W = CFG.VIEW_W, H = CFG.VIEW_H;
  ctx.fillStyle = 'rgba(4,4,10,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = '900 46px "Segoe UI", sans-serif';
  ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 16;
  ctx.fillStyle = '#fff';
  ctx.fillText('PAUSED', W / 2, H * 0.3);
  ctx.shadowBlur = 0;
  MENU.forEach((item, i) => {
    const sel = i === (game.menuIndex ?? 0);
    ctx.font = sel ? '800 24px "Segoe UI", sans-serif' : '600 20px "Segoe UI", sans-serif';
    ctx.fillStyle = sel ? '#ffd166' : 'rgba(220,220,235,0.8)';
    if (sel) { ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 10; }
    ctx.fillText(item, W / 2, H * 0.42 + i * 38);
    ctx.shadowBlur = 0;
  });
  if ((game.menuIndex ?? 0) === 3) drawControlsCard(ctx);
  drawStatsPanel(game, ctx);
  ctx.font = '600 14px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(200,200,215,0.6)';
  ctx.fillText('UP/DOWN to choose · ENTER confirm · ESC resume · R next radio station in car · TAB city map', W / 2, H * 0.92);
  ctx.textAlign = 'left';
}

function drawControlsCard(ctx) {
  const W = CFG.VIEW_W;
  const lines = [
    ['WALK / DRIVE', 'WASD or arrow keys'],
    ['SPRINT / NITRO', 'SHIFT'],
    ['HANDBRAKE', 'SPACE'],
    ['ENTER / EXIT / CARJACK', 'F'],
    ['RIDE THE BUS (at a stop)', 'F near the Palm Line bus'],
    ['SHOOT', 'Mouse aim + click'],
    ['PUNCH', 'E'],
    ['SIREN (in a cruiser)', 'H'],
    ['RADIO NEXT STATION', 'R'],
    ['CITY MAP', 'TAB'],
    ['MUTE', 'M'],
    ['PAUSE', 'ESC or P'],
  ];
  const x0 = W * 0.56, y0 = CFG.VIEW_H * 0.20;
  ctx.fillStyle = 'rgba(6,6,12,0.85)';
  ctx.fillRect(x0 - 20, y0 - 26, 420, 330);
  ctx.strokeStyle = 'rgba(0,229,255,0.4)';
  ctx.strokeRect(x0 - 20, y0 - 26, 420, 330);
  ctx.textAlign = 'left';
  ctx.font = '800 15px "Segoe UI", sans-serif';
  ctx.fillStyle = '#00e5ff';
  ctx.fillText('CONTROLS', x0, y0);
  ctx.font = '600 13px "Segoe UI", sans-serif';
  lines.forEach(([act, key], i) => {
    ctx.fillStyle = 'rgba(220,220,235,0.85)';
    ctx.fillText(act, x0, y0 + 26 + i * 24);
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'right';
    ctx.fillText(key, x0 + 396, y0 + 26 + i * 24);
    ctx.textAlign = 'left';
  });
}

function drawStatsPanel(game, ctx) {
  const W = CFG.VIEW_W, H = CFG.VIEW_H;
  const s = game.stats;
  if (!s) return;
  ctx.textAlign = 'left';
  ctx.font = '700 16px "Segoe UI", sans-serif';
  ctx.fillStyle = '#00e5ff';
  ctx.fillText('STATS', W * 0.72, H * 0.36);
  ctx.font = '600 13px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(220,220,235,0.85)';
  const lines = [
    'Time played: ' + Math.floor(s.time / 60) + 'm ' + Math.floor(s.time % 60) + 's',
    'Distance: ' + (s.dist / 500).toFixed(1) + ' km',
    'Cars jacked: ' + s.carsJacked,
    'Peds wasted: ' + s.pedsWasted,
    'Max wanted: ' + '★'.repeat(s.maxWanted),
    'Packages: ' + (s.packages ?? 0) + '/' + (game.world.hidden ? game.world.hidden.length : 12),
    'Missions: ' + game.missions.storyIndex + '/6',
    'Stunt jumps: ' + (s.jumps ?? 0) + ' (best ' + (game.jumps ? game.jumps.best.toFixed(1) : '0.0') + 's)',
    'Rain: ' + Math.round((game.weather ? game.weather.intensity : 0) * 100) + '%',
  ];
  lines.forEach((l, i) => ctx.fillText(l, W * 0.72, H * 0.36 + 24 + i * 20));
}

// ---------------------------------------------------------------- wasted/busted
function drawStateCard(game, ctx, word, color) {
  const W = CFG.VIEW_W, H = CFG.VIEW_H;
  const k = clamp(game.screenT / 0.7, 0, 1);
  ctx.fillStyle = 'rgba(2,2,6,' + 0.55 * k + ')';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(0.6 + k * 0.4, 0.6 + k * 0.4);
  ctx.textAlign = 'center';
  ctx.font = '900 100px "Segoe UI", sans-serif';
  ctx.shadowColor = color; ctx.shadowBlur = 26;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.4 + k * 0.6;
  ctx.fillText(word, 0, 20);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  const fee = word === 'WASTED' ? CFG.WASTED_FEE : CFG.BUST_FEE * Math.max(1, game.police.wanted);
  if (game.screenT > 1.2) {
    ctx.textAlign = 'center';
    ctx.font = '600 18px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText('Hospital and repair fees: ' + fmtMoney(fee), W / 2, H / 2 + 90);
    if (game.screenT > 2.2) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('Press ENTER', W / 2, H / 2 + 130);
    }
    ctx.textAlign = 'left';
  }
}

// ---------------------------------------------------------------- ending
function drawEnd(game, ctx) {
  const W = CFG.VIEW_W, H = CFG.VIEW_H;
  ctx.fillStyle = 'rgba(3,3,8,0.8)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  const t = game.t;
  ctx.font = '900 64px "Segoe UI", sans-serif';
  ctx.shadowColor = '#ff5da2'; ctx.shadowBlur = 24;
  ctx.fillStyle = '#fff';
  ctx.fillText('VICE PALMS IS YOURS', W / 2, H * 0.38);
  ctx.shadowBlur = 0;
  ctx.font = '600 22px "Segoe UI", sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText('Rico: "Told you, baby. This town was always ours."', W / 2, H * 0.48);
  ctx.font = '700 20px "Segoe UI", sans-serif';
  ctx.fillStyle = '#8cff5d';
  ctx.fillText('Bank: ' + fmtMoney(game.player.money) + '  ·  Missions: ' + game.missions.storyIndex + '/6', W / 2, H * 0.58);
  ctx.font = '600 16px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(230,230,240,0.8)';
  ctx.fillText('Side missions and the whole strip stay open — keep driving.', W / 2, H * 0.66);
  ctx.fillText('Press ENTER to continue', W / 2, H * 0.74);
  ctx.textAlign = 'left';
}
