// screens.js — title, pause, wasted/busted overlays and the localStorage
// save system (continue / delete save).

import { CFG } from './config.js';
import { fmtMoney, clamp, TAU } from './util.js';
import { CONTROLS } from './input.js';
import { engineBannerLines } from './hud.js';

const SAVE_KEY = 'vicepalms_save_v1';

export function hasSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    return d && typeof d === 'object' && typeof d.money === 'number';
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

export function writeSave(game) {
  const p = game.player;
  const data = {
    v: 1,
    t: Date.now(),
    money: p.money,
    health: p.health,
    armor: p.armor,
    ammo: p.ammo,
    weapon: p.weapon,
    x: p.x,
    y: p.y,
    storyIndex: game.missions.storyIndex,
    sideDone: game.missions.sideDone,
    heat: game.police.heat,
    place: game.world.regionName(p.x, p.y),
    tokens: game.tokens ? game.tokens.serialize() : [],
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // storage full/blocked: saving is best-effort
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* nothing to delete */ }
}

// ---------------------------------------------------------------- title

export const TITLE_ITEMS = ['new', 'continue', 'delete', 'controls'];

export function drawTitle(ctx, game) {
  const W = game.viewW, H = game.viewH;
  const t = game.time;

  if (game.world && game.attractMode) {
    // live city pan behind the logo
    game.renderer.draw(ctx);
    ctx.fillStyle = 'rgba(8, 7, 18, 0.60)';
    ctx.fillRect(0, 0, W, H);
    drawSun(ctx, W, H, t, 0.85);
  } else {
    // backdrop: deep water gradient + palms silhouette
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0a0716');
    grad.addColorStop(0.55, '#16102a');
    grad.addColorStop(1, '#251436');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    drawSun(ctx, W, H, t, 1);
    // water strip
    ctx.fillStyle = '#0c1f3a';
    const sunY = H * 0.34, sunR = 110;
    ctx.fillRect(0, sunY + sunR * 0.72, W, H - (sunY + sunR * 0.72));
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.14)';
    for (let i = 0; i < 12; i++) {
      const y = sunY + sunR * 0.72 + 8 + i * 14;
      const wob = Math.sin(t * 1.8 + i * 1.7) * 40;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 190 + wob, y);
      ctx.lineTo(W / 2 + 190 + wob, y);
      ctx.stroke();
    }
    // palm silhouettes
    drawPalm(ctx, 150, H * 0.62, 1.4, t);
    drawPalm(ctx, W - 150, H * 0.62, 1.4, t + 3);
    drawPalm(ctx, 260, H * 0.7, 0.9, t + 1.4);
    drawPalm(ctx, W - 260, H * 0.7, 0.9, t + 2.2);
  }

  // logo
  drawTitleLogo(ctx, W, H, t);
  drawTitleMenu(ctx, game, W, H);
}

function drawSun(ctx, W, H, t, alpha) {
  const sunY = H * 0.34;
  const sunR = 110;
  const sg = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
  sg.addColorStop(0, '#ff4fd8');
  sg.addColorStop(0.5, '#a45bff');
  sg.addColorStop(1, '#37f5ff');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(W / 2, sunY, sunR, 0, TAU);
  ctx.clip();
  ctx.fillStyle = sg;
  ctx.fillRect(W / 2 - sunR, sunY - sunR, sunR * 2, sunR * 2);
  // sun slats
  ctx.fillStyle = 'rgba(10, 7, 22, 0.9)';
  for (let i = 0; i < 7; i++) {
    const y = sunY + 8 + i * 16;
    ctx.fillRect(W / 2 - sunR, y, sunR * 2, 4 + i);
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(W / 2, sunY, sunR * 0.4, W / 2, sunY, sunR * 2.1);
  glow.addColorStop(0, `rgba(255, 79, 216, ${0.16 * alpha})`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}

function drawTitleLogo(ctx, W, H, t) {
  ctx.textAlign = 'center';
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
  ctx.font = 'bold 88px "Courier New", monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText('VICE PALMS', W / 2 + 4, H * 0.26 + 4);
  ctx.fillStyle = '#ff4fd8';
  ctx.fillText('VICE PALMS', W / 2, H * 0.26);
  ctx.font = 'bold 20px "Courier New", monospace';
  ctx.fillStyle = `rgba(55, 245, 255, ${0.6 + pulse * 0.4})`;
  ctx.fillText('AN OPEN CITY OF NEON AND BAD DECISIONS', W / 2, H * 0.26 + 34);
}

function drawTitleMenu(ctx, game, W, H) {
  // menu
  const items = menuItems(game);
  ctx.font = 'bold 22px "Courier New", monospace';
  items.forEach((it, i) => {
    const y = H * 0.56 + i * 34;
    const sel = i === game.menuIndex;
    ctx.fillStyle = sel ? '#ffd23d' : 'rgba(255,255,255,0.62)';
    const label = sel ? `\u25B8 ${it.label} \u25C2` : it.label;
    ctx.fillText(label, W / 2, y);
  });

  // overlays: controls sheet or the how-to-play spread
  if (game.howToOpen) {
    drawHowTo(ctx, game, W, H);
  } else if (game.menuIndex === items.length - 1 || game.showControls) {
    drawControls(ctx, W / 2, H * 0.56 + items.length * 34 + 10);
  } else {
    ctx.font = '12px "Courier New", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('Up/Down to choose · Enter to select · H for how to play', W / 2, H - 16);
  }

  // save hint
  if (hasSave()) {
    const s = readSave();
    ctx.font = '12px "Courier New", monospace';
    ctx.fillStyle = 'rgba(125, 255, 138, 0.55)';
    ctx.textAlign = 'right';
    ctx.fillText(`saved: ${fmtMoney(s.money)} · ${s.place || 'Vice Palms'}`, W - 20, H - 16);
    ctx.textAlign = 'center';
  }
  // colophon
  ctx.font = '10px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.textAlign = 'left';
  ctx.fillText('VICE PALMS v1.0 · make.fun gta6-01 · a fresh full rebuild · no libs, no network', 14, H - 32);
  // rotating street wisdom, bottom-right
  ctx.textAlign = 'right';
  ctx.font = 'italic 11px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255, 210, 90, 0.45)';
  ctx.fillText(titleTip(game.time), W - 20, H - 32);
  ctx.textAlign = 'center';
}

function menuItems(game) {
  const list = [{ key: 'new', label: 'START NEW GAME' }];
  if (hasSave()) list.push({ key: 'continue', label: 'CONTINUE' });
  if (hasSave()) list.push({ key: 'delete', label: 'DELETE SAVE' });
  list.push({ key: 'controls', label: 'CONTROLS' });
  return list;
}

/** Rebuild the menu list fresh each frame and clamp the index. */
export function updateMenu(game) {
  const items = menuItems(game);
  if (game.menuIndex >= items.length) game.menuIndex = items.length - 1;
  if (game.menuIndex < 0) game.menuIndex = 0;
  return items;
}

export function activateMenuItem(game) {
  const items = menuItems(game);
  const key = items[game.menuIndex].key;
  if (key === 'new') {
    deleteSave();
    game.startNewGame();
  } else if (key === 'continue') {
    game.continueGame();
  } else if (key === 'delete') {
    deleteSave();
    game.menuIndex = 0;
  }
  // 'controls' just highlights the sheet
}

function drawControls(ctx, cx, y0) {
  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(55, 245, 255, 0.85)';
  ctx.fillText('CONTROLS', cx, y0);
  ctx.font = '12px "Courier New", monospace';
  CONTROLS.forEach((row, i) => {
    const y = y0 + 18 + i * 16;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'right';
    ctx.fillText(row[0], cx - 10, y);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'left';
    ctx.fillText(row[1], cx + 10, y);
  });
  ctx.textAlign = 'center';
}

/** Two-column survival guide behind the H key. */
export function drawHowTo(ctx, game, W, H) {
  ctx.fillStyle = 'rgba(4, 5, 10, 0.86)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px "Courier New", monospace';
  ctx.fillStyle = '#ffd23d';
  ctx.fillText('HOW TO PLAY', W / 2, 64);
  ctx.font = '13px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('H or Esc to close', W / 2, 88);

  const cols = [
    {
      title: 'THE CITY', color: '#37f5ff', lines: [
        'Yellow marker — story job. Green — side work.',
        'Blue ring — Ammu-Nation: walk in to buy ammo,',
        'then armor. Green box — courier runs.',
        'Pay \u2019n\u2019 Spray bays: sit still, $300 fixes the',
        'car and cools the heat.',
        'Ten palm tokens hide across town. Find all 10',
        'for a thousand bucks and full armor.',
        'Save at Esc. The map is on M.',
      ],
    },
    {
      title: 'THE HEAT', color: '#ff5c5c', lines: [
        'Crimes raise the stars; cops converge.',
        '1 star: one cruiser. 2+: they shoot on foot.',
        '3+: roadblocks. 4+: Enforcer SUVs and the',
        'searchlight chopper. 5: spike strips.',
        'Break line of sight and the heat decays.',
        'Busted: bail is $150. Wasted: hospital is $100.',
        'Tip: the handbrake (Space) is a lifestyle.',
      ],
    },
  ];
  cols.forEach((col, c) => {
    const x = W / 2 + (c === 0 ? -240 : 240);
    ctx.font = 'bold 17px "Courier New", monospace';
    ctx.fillStyle = col.color;
    ctx.fillText(col.title, x, 140);
    ctx.font = '13px "Courier New", monospace';
    ctx.textAlign = 'left';
    col.lines.forEach((line, i) => {
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.fillText(line, x - 150, 172 + i * 22);
    });
    ctx.textAlign = 'center';
  });

  // story teaser + the full roster
  ctx.font = 'bold 15px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255, 79, 216, 0.9)';
  ctx.fillText('THE STORY: Rico is back in Vice Palms, and the city owes him money.', W / 2, H - 200);
  const roster = [
    '1 · Homecoming — meet Rico at Dock 4',
    '2 · Container Run — a Banshee out of the yard',
    '3 · Palm Beach Pickup — the package on the sand',
    '4 · Airfield Run — a briefcase behind Gate 2',
    '5 · Dock Wars — three Vegas cars, one message',
    '6 · The Last Palm — stop the traitor on the runway',
  ];
  ctx.font = '12px "Courier New", monospace';
  ctx.textAlign = 'left';
  roster.forEach((line, i) => {
    ctx.fillStyle = i < 3 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)';
    ctx.fillText(line, W / 2 - 220, H - 174 + i * 19);
  });
  ctx.textAlign = 'center';
  ctx.font = '13px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('…plus Taxi Rush, Vigilante, Beach Dash and the Bank Run for spare cash.', W / 2, H - 46);
}

/** Rotating street wisdom for the title's bottom-right corner. */
export const TITLE_TIPS = [
  'TIP: tap Space mid-corner to swing the tail out.',
  'TIP: cops lose you faster in the park. Trees help.',
  'TIP: spike strips at 5 stars — swerve the belt.',
  'TIP: the chopper counts as eyes. Break the beam.',
  'TIP: courier streaks stack. Do not crash the package.',
  'TIP: a respray is cheaper than a funeral.',
  'TIP: boats live at the pier ends. Bring nothing you love.',
  'TIP: buses stop for nothing. Especially not for you.',
];

export function titleTip(t) {
  return TITLE_TIPS[Math.floor(t / 4) % TITLE_TIPS.length];
}

function drawPalm(ctx, x, y, s, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const sway = Math.sin(t * 1.1) * 4;
  ctx.strokeStyle = '#0a0d16';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(8, -40, 14 + sway * 0.4, -78);
  ctx.stroke();
  ctx.lineWidth = 5;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.15 - (i / 6) * Math.PI * 0.7 + sway * 0.01;
    ctx.beginPath();
    ctx.moveTo(14, -78);
    ctx.quadraticCurveTo(14 + Math.cos(a) * 34, -78 + Math.sin(a) * 26 - 10, 14 + Math.cos(a) * 58, -70 + Math.sin(a) * 34 + 8);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- pause

export const PAUSE_ITEMS = ['resume', 'save', 'sound', 'delete', 'title'];

export function pauseAction(game, key) {
  if (key === 'resume') {
    game.state = 'play';
  } else if (key === 'save') {
    writeSave(game);
    game.hud.subtitle('Game saved.', 2);
    game.state = 'play';
  } else if (key === 'sound') {
    if (game.audio.muted) game.audio.requestUnmute();
    else game.audio.setMuted(true);
  } else if (key === 'delete') {
    deleteSave();
    game.hud.subtitle('Save deleted.', 2);
  } else if (key === 'title') {
    game.toTitle();
  }
}

export function drawPause(ctx, game) {
  const W = game.viewW, H = game.viewH;
  ctx.fillStyle = 'rgba(4, 5, 9, 0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 52px "Courier New", monospace';
  ctx.fillStyle = '#37f5ff';
  ctx.fillText('PAUSED', W / 2, H * 0.3);
  ctx.font = 'bold 20px "Courier New", monospace';
  const items = [
    { key: 'resume', label: 'RESUME' },
    { key: 'save', label: 'SAVE GAME' },
    { key: 'sound', label: game.audio.muted ? 'SOUND: OFF' : 'SOUND: ON' },
    { key: 'delete', label: 'DELETE SAVE' },
    { key: 'title', label: 'QUIT TO TITLE' },
  ];
  items.forEach((it, i) => {
    const y = H * 0.42 + i * 32;
    const sel = i === game.menuIndex;
    ctx.fillStyle = sel ? '#ffd23d' : 'rgba(255,255,255,0.62)';
    ctx.fillText(sel ? `\u25B8 ${it.label} \u25C2` : it.label, W / 2, y);
  });
  ctx.font = '12px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('Esc resumes · M opens the city map · progress autosaves after each mission', W / 2, H - 30);
  // engine banner, bottom-left of the pause card
  ctx.textAlign = 'left';
  ctx.font = '10px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText(engineBannerLines().join('  '), 24, H - 12);
  ctx.textAlign = 'center';
  drawStatsPanel(ctx, game, W, H);
}

/** Night-report stats card on the right edge of the pause screen. */
function drawStatsPanel(ctx, game, W, H) {
  if (!game.stats) return;
  const rows = game.stats.rows();
  const px = W - 250, py = H * 0.2;
  const w = 218, rh = 17;
  const h = rows.length * rh + 40;
  ctx.fillStyle = 'rgba(8, 10, 16, 0.85)';
  ctx.fillRect(px, py, w, h);
  ctx.strokeStyle = 'rgba(255, 210, 90, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px "Courier New", monospace';
  ctx.fillStyle = '#ffd23d';
  ctx.fillText('THE NIGHT SO FAR', px + 12, py + 20);
  ctx.font = '11px "Courier New", monospace';
  rows.forEach((row, i) => {
    const y = py + 40 + i * rh;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(row[0], px + 12, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(row[1], px + w - 12, y);
    ctx.textAlign = 'left';
  });
  ctx.textAlign = 'center';
}

// ------------------------------------------------------- wasted / busted

export function drawWasted(ctx, game) {
  const W = game.viewW, H = game.viewH;
  const t = game.wastedT;
  const a = clamp(t * 1.4, 0, 0.82);
  ctx.fillStyle = `rgba(30, 0, 0, ${a})`;
  ctx.fillRect(0, 0, W, H);
  if (t > 0.4) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 76px "Courier New", monospace';
    ctx.globalAlpha = clamp((t - 0.4) * 2, 0, 1);
    ctx.fillStyle = '#0a0202';
    ctx.fillText('WASTED', W / 2 + 3, H / 2 + 3);
    ctx.fillStyle = '#ff5c5c';
    ctx.fillText('WASTED', W / 2, H / 2);
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`Hospital fees: ${fmtMoney(Math.min(game.player.money, CFG.FEE_WASTED))}`, W / 2, H / 2 + 44);
    ctx.globalAlpha = 1;
  }
}

export function drawBusted(ctx, game) {
  const W = game.viewW, H = game.viewH;
  const t = game.wastedT;
  const a = clamp(t * 1.4, 0, 0.82);
  ctx.fillStyle = `rgba(0, 8, 30, ${a})`;
  ctx.fillRect(0, 0, W, H);
  if (t > 0.4) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 76px "Courier New", monospace';
    ctx.globalAlpha = clamp((t - 0.4) * 2, 0, 1);
    ctx.fillStyle = '#02060f';
    ctx.fillText('BUSTED', W / 2 + 3, H / 2 + 3);
    ctx.fillStyle = '#5c9dff';
    ctx.fillText('BUSTED', W / 2, H / 2);
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`Bail: ${fmtMoney(Math.min(game.player.money, CFG.FEE_BUSTED))}`, W / 2, H / 2 + 44);
    ctx.globalAlpha = 1;
  }
}
