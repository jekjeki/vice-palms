// Vice Palms — bootstrap: the canvas, the fixed-step loop, the title and pause menus, and the
// ?shot= staged-screenshot mode. Every system lives in its own module under src/.

import { Game } from './game.js';
import { Painter } from './render/paint.js';
import { Hud } from './render/hud.js';
import { Menus } from './render/menus.js';
import { Input } from './input.js';
import { stageShot } from './shots.js';
import { hasSave, readSave, wipeSave } from './systems/save.js';
import { clamp } from './util.js';
import { letterbox, subtitle, toast, silhouette, skipHint, stationWheel } from './render/overlays.js';
import { STATION_NAMES, STATION_COLORS } from './systems/radio.js';

// A stand-in for the frame's real input: while a cutscene owns the screen the world keeps
// stepping, but nobody punches, drives or honks on its own.
const NO_INPUT = { axis: () => ({ x: 0, y: 0 }), held: () => false, tap: () => false, endFrame() {} };

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed')) || 1337;

const canvas = document.getElementById('game');
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  painter.resize();
}
window.addEventListener('resize', resize);

const painter = new Painter(canvas);
const input = new Input();
const hud = new Hud();
const ui = {
  uiState: 'title',
  menuIndex: 0,
  hasSave: hasSave(),
  cameraOverride: null,
  freeze: false,
  seed,                       // shown on the title screen: the world the vista drifts across
};
const menus = new Menus(ui);

let game = null;
let gameSeed = seed;

function newGame(fromSave) {
  // Restore the saved world seed BEFORE anything builds on it, so CONTINUE lands back in
  // the city the player left rather than a fresh re-roll of the current URL seed.
  if (fromSave && fromSave.seed) gameSeed = fromSave.seed;
  const opts = { seed: gameSeed };
  if (fromSave) {
    opts.money = fromSave.money;
    opts.missionIndex = fromSave.missionIndex;
    opts.playerX = fromSave.x;
    opts.playerY = fromSave.y;
  }
  game = new Game(gameSeed, opts);
  if (fromSave) {
    const p = game.player;
    p.health = fromSave.health ?? 100;
    p.armor = fromSave.armor ?? 0;
    p.ammo = fromSave.ammo ?? 0;
    if ((fromSave.weapon ?? 'fist') === 'pistol') p.weapon = 'pistol';
    if (fromSave.sound != null) game.audio.enabled = fromSave.sound;
    game.radio.restore(fromSave.radio);   // the exact dial the player left on
  }
  hud.attach(game);
  ui.cameraOverride = null;
  ui.freeze = false;
  acc = 0;                    // no frame debt carried from the menu or a previous run
  window.__game = game; // debug and play-test handle
}

function titleItems() {
  const items = ['NEW GAME', ...(ui.hasSave ? ['CONTINUE'] : []), `SOUND: ${game ? (game.audio.enabled ? 'ON' : 'OFF') : 'ON'}`];
  if (ui.hasSave) items.push(ui.deleteArm ? 'DELETE SAVE — SURE?' : 'DELETE SAVE');
  return items;
}
ui.titleItems = titleItems();

function activateTitle(i) {
  const label = titleItems()[i];
  game?.audio.ensure();
  if (label === 'NEW GAME') {
    gameSeed = seed;
    ui.deleteArm = false;
    newGame(null);
    ui.uiState = 'play';
  } else if (label === 'CONTINUE') {
    ui.deleteArm = false;
    newGame(readSave());
    ui.uiState = 'play';
  } else if (label.startsWith('SOUND')) {
    const on = !(game ? game.audio.enabled : true);
    if (game) { game.audio.ensure(); game.audio.setEnabled(on); }
    ui.titleItems = titleItems();
  } else if (label.startsWith('DELETE SAVE')) {
    // Two activations inside the arm window before the wipe actually lands.
    if (!ui.deleteArm) {
      ui.deleteArm = true;
      setTimeout(() => { ui.deleteArm = false; ui.titleItems = titleItems(); }, 2600);
      ui.titleItems = titleItems();
      game?.audio.blip(300);
    } else {
      ui.deleteArm = false;
      wipeSave();
      ui.hasSave = hasSave();
      ui.titleItems = titleItems();
      game?.audio.blip(190);
    }
  }
}

function openPause() {
  const items = ['RESUME'];
  if (game.missions.active) items.push('RESTART JOB');
  items.push(`SOUND: ${game.audio.enabled ? 'ON' : 'OFF'}`, 'SAVE GAME', 'QUIT TO TITLE');
  ui.pauseItems = items;
  ui.uiState = 'pause';
  ui.menuIndex = 0;
  game.save();
}

function activatePause(i) {
  const label = ui.pauseItems[i];
  if (label === 'RESUME') ui.uiState = 'play';
  else if (label === 'RESTART JOB') { game.missions.fail('RESTARTED'); ui.uiState = 'play'; }
  else if (label.startsWith('SOUND')) {
    game.audio.setEnabled(!game.audio.enabled);
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

// Staged screenshot mode: build the scene, arrange the actors, freeze one frame.
let shotMode = false;
if (shotName) {
  shotMode = true;
  gameSeed = seed;
  game = new Game(gameSeed, { shotMode: true });
  hud.attach(game);
  stageShot(shotName, game, ui, seed);
  window.__game = game; // debug and play-test handle in shot mode too
}

// The title vista: a slow drift along the neon strip.
function titleCamera(t) {
  const y = 3200 + ((t * 46) % 11000);
  return { x: 40 * 420 - 150, y, zoom: 0.8 };
}

// Screen-space overlays shared by the new systems: cutscene letterbox and silhouettes, the
// subtitle strip, the radio toast and station wheel. Drawn after the HUD, before menus.
function drawOverlays(ctx, game, W, H) {
  const cs = game.cutscenes;
  if (cs && cs.active) {
    // Scene actors stand in world space; the painter's transform puts them on their marks.
    const cam = cs.camera();
    if (cam) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      for (const a of cs.actors()) silhouette(ctx, a.at.x, a.at.y, a);
      ctx.restore();
    }
    letterbox(ctx, W, H, cs.barAmount());
    const sub = cs.subtitle();
    if (sub) subtitle(ctx, W, H, 'SCENE', sub.line, sub.fade);
    if (cs.showSkipHint()) skipHint(ctx, W, 0.8);
  }
  const dl = game.dialog?.subtitle();
  if (dl && !(cs && cs.active)) {
    const color = dl.channel === 'cop' ? '#7aa2ff' : dl.channel === 'mission' ? '#7dffa4' : '#ffd977';
    subtitle(ctx, W, H, dl.speaker, dl.text, dl.fade, color);
  }
  const radio = game.radio;
  if (radio) {
    if (radio.toastT > 0) {
      toast(ctx, W, 118, radio.toast, radio.toastT, 4.2, radio.current.color);
    }
    if (radio.audible) stationWheel(ctx, W, H, STATION_NAMES, radio.station, STATION_COLORS);
  }
}

let last = performance.now();
let acc = 0;
let menuCooldown = 0;

function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  menuCooldown -= dt;

  if (ui.uiState === 'title') {
    const items = ui.titleItems;
    if (menuCooldown <= 0) {
      if (input.tap('ArrowUp') || input.tap('KeyW')) { ui.menuIndex = (ui.menuIndex - 1 + items.length) % items.length; menuCooldown = 0.18; game?.audio.blip(400); }
      if (input.tap('ArrowDown') || input.tap('KeyS')) { ui.menuIndex = (ui.menuIndex + 1) % items.length; menuCooldown = 0.18; game?.audio.blip(400); }
      if (input.tap('Enter') || input.tap('Space')) { activateTitle(ui.menuIndex); menuCooldown = 0.3; }
    }
  } else if (ui.uiState === 'pause') {
    game?.audio.pause();   // the engine and the sirens must stop while the menu is up
    const items = ui.pauseItems;
    if (input.tap('Escape')) ui.uiState = 'play';
    else if (menuCooldown <= 0) {
      if (input.tap('ArrowUp') || input.tap('KeyW')) { ui.menuIndex = (ui.menuIndex - 1 + items.length) % items.length; menuCooldown = 0.18; game?.audio.blip(400); }
      if (input.tap('ArrowDown') || input.tap('KeyS')) { ui.menuIndex = (ui.menuIndex + 1) % items.length; menuCooldown = 0.18; game?.audio.blip(400); }
      if (input.tap('Enter') || input.tap('Space')) { activatePause(ui.menuIndex); menuCooldown = 0.3; }
    }
  } else if (ui.uiState === 'play') {
    if (input.tap('Escape') && game && game.state === 'play' && !game.photoMode.active) {
      // The phone pockets before the pause menu opens: no accidental exits.
      if (game.phone?.state.open) game.phone.pocket();
      else openPause();
    }
    else if (game && !ui.freeze) {
      if (game.photoMode.active) {
        // The shutter is up: the world holds still, the camera is yours.
        game.photoMode.update(input, dt);
      } else if (game.cutscenes.active) {
        // A scene runs: the clock keeps ticking with real dt and the world breathes on a
        // no-op input, so traffic and neon stay alive behind the letterbox.
        game.cutscenes.update(dt);
        acc += dt;
        while (acc >= 1 / 60) {
          game.update(1 / 60, NO_INPUT);
          acc -= 1 / 60;
        }
        if (input.tap('Space') || input.tap('Enter')) game.cutscenes.skip();
      } else {
        acc += dt;
        while (acc >= 1 / 60) {
          game.update(1 / 60, input);
          acc -= 1 / 60;
        }
      }
      if (input.tap('KeyP') && game.state === 'play' && !game.cutscenes.active) game.photoMode.toggle();
    }
  }
  input.endFrame();

  const cam = ui.cameraOverride
    ?? (game?.photoMode.active ? game.photoMode.camera() : null)
    ?? (game?.cutscenes.active ? game.cutscenes.camera() : null)
    ?? (ui.uiState === 'title' ? titleCamera(now / 1000) : null);
  if (game) {
    const ctx = canvas.getContext('2d');
    if (game.interiors.inside) game.interiors.render(ctx, canvas.width, canvas.height);
    else painter.render(game, { cameraOverride: cam });
    // Photo mode frames the world, never the HUD: capture right after the world pass.
    if (game.photoMode.active) game.photoMode.maybeCapture(canvas);
    if (ui.uiState !== 'title') hud.draw(canvas.getContext('2d'), game, canvas.width, canvas.height);
    drawOverlays(ctx, game, canvas.width, canvas.height);
    if (game.photoMode.active) game.photoMode.draw(ctx, canvas.width, canvas.height);
    menus.draw(ctx, game, ui, canvas.width, canvas.height, dt);
  } else {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b0e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  requestAnimationFrame(frame);
}

window.addEventListener('keydown', () => { game?.audio.ensure(); });
// Switching tabs mid-chase should not be a death sentence: park on the pause menu.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ui.uiState === 'play' && game && game.state === 'play') openPause();
});
// Closing the tab mid-night still banks the progress: autosave on the way out.
window.addEventListener('pagehide', () => { if (game && !game.shotMode && game.state === 'play') game.save(); });

resize();
requestAnimationFrame(frame);

// A world for the title vista to drift across, built even before the menu is used.
if (!shotMode && !game) {
  game = new Game(seed, { shotMode: true });
  hud.attach(game);
  ui.uiState = 'title';
}
