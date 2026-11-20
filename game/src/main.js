// Vice Palms — bootstrap: canvas setup, the main loop, menus (title / pause) and the
// ?shot= staged-screenshot mode. Everything else lives in its own module under src/.

import { Game } from './game.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './render/hud.js';
import { Screens } from './render/screens.js';
import { Input } from './input.js';
import { stageShot } from './shots.js';
import { hasSave, loadSave } from './systems/save.js';
import { clamp } from './util.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed')) || 1337;

const canvas = document.getElementById('game');
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.resize();
}
window.addEventListener('resize', resize);

const renderer = new Renderer(canvas);
const input = new Input();
const hud = new Hud();
const ui = {
  uiState: 'title',
  menuIndex: 0,
  hasSave: hasSave(),
  cameraOverride: null,
  freeze: false,
};

const screens = new Screens(ui);
let game = null;
let gameSeed = seed;

function newGame(fromSave) {
  const opts = { seed: gameSeed };
  if (fromSave) {
    const s = fromSave;
    opts.money = s.money;
    opts.missionIndex = s.missionIndex;
    opts.playerX = s.x;
    opts.playerY = s.y;
    if (s.seed) gameSeed = s.seed;
  }
  game = new Game(gameSeed, opts);
  if (fromSave) {
    const p = game.player;
    p.health = fromSave.health ?? 100;
    p.armor = fromSave.armor ?? 0;
    p.ammo = fromSave.ammo ?? 0;
    if ((fromSave.weapon ?? 'fist') === 'pistol') p.weapon = 'pistol';
    if (fromSave.sound != null) game.audio.enabled = fromSave.sound;
  }
  hud.attach(game);
  ui.cameraOverride = null;
  window.__game = game; // debug/play-test handle
}

function titleItems() {
  return ['NEW GAME', ...(ui.hasSave ? ['CONTINUE'] : []), ui.soundLabel ?? 'SOUND: ON'];
}
ui.titleItems = titleItems();

function activateTitleItem(i) {
  const items = titleItems();
  const label = items[i];
  game?.audio.ensure();
  if (label === 'NEW GAME') {
    gameSeed = seed;
    newGame(null);
    ui.uiState = 'play';
  } else if (label === 'CONTINUE') {
    newGame(loadSave());
    ui.uiState = 'play';
  } else if (label.startsWith('SOUND')) {
    ui.soundLabel = label === 'SOUND: ON' ? 'SOUND: OFF' : 'SOUND: ON';
    if (game) { game.audio.ensure(); game.audio.setEnabled(label === 'SOUND: OFF' ? false : true); }
    ui.titleItems = titleItems();
  }
}

function openPause() {
  const items = ['RESUME'];
  if (game.missions.active) items.push('RESTART MISSION');
  items.push(game.audio.enabled ? 'SOUND: OFF' : 'SOUND: ON', 'SAVE GAME', 'QUIT TO TITLE');
  ui.pauseItems = items;
  ui.uiState = 'pause';
  ui.menuIndex = 0;
  game.save();
}

function activatePauseItem(i) {
  const label = ui.pauseItems[i];
  if (label === 'RESUME') ui.uiState = 'play';
  else if (label === 'RESTART MISSION') { game.missions.fail('RESTARTED'); ui.uiState = 'play'; }
  else if (label === 'SOUND: OFF' || label === 'SOUND: ON') {
    const on = label === 'SOUND: ON';
    game.audio.setEnabled(on);
    openPause();
  } else if (label === 'SAVE GAME') { game.save(); ui.uiState = 'play'; }
  else if (label === 'QUIT TO TITLE') {
    game.save();
    ui.uiState = 'title';
    ui.menuIndex = 0;
    ui.hasSave = hasSave();
    ui.titleItems = titleItems();
  }
}

// Staged screenshot mode: build the scene and hold the frame.
let shotMode = false;
if (shotName) {
  shotMode = true;
  gameSeed = seed;
  game = new Game(gameSeed, { shotMode: true });
  hud.attach(game);
  stageShot(shotName, game, ui, seed);
}

// A slow drift along the neon strip for the title vista.
function titleCamera(t) {
  const y = 3200 + ((t * 46) % 11000);
  return { x: 40 * 420 - 150, y, zoom: 0.8 };
}

let last = performance.now();
let acc = 0;
let menuCooldown = 0;

function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  menuCooldown -= dt;

  if (ui.uiState === 'title') {
    // Menu input
    const items = ui.titleItems;
    if (menuCooldown <= 0) {
      if (input.hit('ArrowUp') || input.hit('KeyW')) { ui.menuIndex = (ui.menuIndex - 1 + items.length) % items.length; menuCooldown = 0.18; game?.audio.blip(400); }
      if (input.hit('ArrowDown') || input.hit('KeyS')) { ui.menuIndex = (ui.menuIndex + 1) % items.length; menuCooldown = 0.18; game?.audio.blip(400); }
      if (input.hit('Enter') || input.hit('Space')) { activateTitleItem(ui.menuIndex); menuCooldown = 0.3; }
    }
  } else if (ui.uiState === 'pause') {
    const items = ui.pauseItems;
    if (input.hit('Escape')) { ui.uiState = 'play'; }
    else if (menuCooldown <= 0) {
      if (input.hit('ArrowUp') || input.hit('KeyW')) { ui.menuIndex = (ui.menuIndex - 1 + items.length) % items.length; menuCooldown = 0.18; game?.audio.blip(400); }
      if (input.hit('ArrowDown') || input.hit('KeyS')) { ui.menuIndex = (ui.menuIndex + 1) % items.length; menuCooldown = 0.18; game?.audio.blip(400); }
      if (input.hit('Enter') || input.hit('Space')) { activatePauseItem(ui.menuIndex); menuCooldown = 0.3; }
    }
  } else if (ui.uiState === 'play') {
    if (input.hit('Escape') && game && game.state === 'play') openPause();
    else if (game && !ui.freeze) {
      acc += dt;
      while (acc >= 1 / 60) {
        game.update(1 / 60, input);
        acc -= 1 / 60;
      }
    }
  }
  input.endFrame();

  const cam = ui.cameraOverride ?? (ui.uiState === 'title' ? titleCamera(now / 1000) : null);
  if (game) {
    renderer.render(game, { cameraOverride: cam });
    if (ui.uiState !== 'title') hud.draw(canvas.getContext('2d'), game, canvas.width, canvas.height);
    screens.draw(canvas.getContext('2d'), game, ui, canvas.width, canvas.height);
  } else {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0d1022';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (game && game.missions.finished && ui.uiState === 'play') {
    // Finale keeps playing in free roam; nothing more to do.
  }

  requestAnimationFrame(frame);
}

window.addEventListener('keydown', () => { game?.audio.ensure(); }, { once: false });

resize();
requestAnimationFrame(frame);

// Title screen with no game yet: build a vista world so the strip glows behind the menu.
if (!shotMode && !game) {
  game = new Game(seed, { shotMode: true });
  hud.attach(game);
  ui.uiState = 'title';
}
