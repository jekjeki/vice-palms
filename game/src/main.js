// main.js — boot, resize, the requestAnimationFrame loop and the camera host.
// The Game class owns simulation; this file owns the canvas and the clock.

import { CFG } from './config.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { stageShot, SHOT_NAMES } from './shots.js';

const canvas = document.getElementById('game');
if (!canvas) throw new Error('no #game canvas');
const ctx = canvas.getContext('2d', { alpha: false });

const game = new Game(canvas);
game.state = 'boot';

// ------------------------------------------------------------------ sizing

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  game.viewW = w;
  game.viewH = h;
  game.viewScale = dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------- input

game.input = new Input(canvas);
// any real gesture unlocks the audio graph (browsers require it)
const unlock = () => game.audio.unlock();
window.addEventListener('keydown', unlock, { once: false });
window.addEventListener('mousedown', unlock, { once: false });
// unmute on first gesture unless the URL asks for quiet
const params = new URLSearchParams(location.search);
const wantsMute = params.has('mute') || params.get('mute') === '1' || params.has('shot');
if (!wantsMute) {
  const unmuteOnce = () => { game.audio.requestUnmute(); };
  window.addEventListener('keydown', unmuteOnce, { once: true });
  window.addEventListener('mousedown', unmuteOnce, { once: true });
}

// -------------------------------------------------------------------- boot

// the city takes a moment to generate; do it synchronously, it is fast
try {
  game.state = 'boot';
  requestAnimationFrame(() => {
    if (params.has('shot')) {
      const shot = params.get('shot') || 'start';
      const seed = parseInt(params.get('seed') || '7', 10) || 7;
      if (!SHOT_NAMES.includes(shot)) throw new Error(`unknown shot ${shot}`);
      game.pendingSteps = stageShot(game, shot, seed);
      game.pendingShot = shot;
    } else {
      // attract mode: build a living city and pan over it behind the title
      game.buildSession();
      game.attractMode = true;
      game.toTitle();
    }
  });
} catch (err) {
  fatal(err);
}

function fatal(err) {
  console.error(err);
  game.state = 'boot';
  ctx.fillStyle = '#200404';
  ctx.fillRect(0, 0, game.viewW, game.viewH);
  ctx.fillStyle = '#ff8f8f';
  ctx.font = '14px monospace';
  const lines = String(err && err.stack || err).split('\n');
  lines.slice(0, 14).forEach((l, i) => ctx.fillText(l, 24, 40 + i * 18));
}

// -------------------------------------------------------------------- loop

let last = performance.now();
let fpsAcc = 0, fpsN = 0, fpsTimer = 0;

function frame(now) {
  try {
    let dt = (now - last) / 1000;
    last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;

    // staged shots: run their pending fixed steps without input influence
    if (game.pendingSteps > 0 && game.state === 'play') {
      game.acc = 0;
      const budget = Math.min(game.pendingSteps, 12);
      for (let i = 0; i < budget; i++) {
        game.simulate(1 / 60);
      }
      game.pendingSteps -= budget;
      game.time += 0; // simulate advances time
      game.updateCamera(1 / 60);
      game.hud.update(1 / 60);
    } else if (game.pendingSteps > 0) {
      // staged title screens just tick the clock for animation
      game.time += dt;
      game.pendingSteps = 0;
    } else {
      game.update(dt);
    }

    game.draw();

    // smoothed fps for the optional meter
    if (dt > 0) {
      fpsAcc += dt;
      fpsN++;
      fpsTimer += dt;
      if (fpsTimer > 0.5) {
        game.fps = fpsN / fpsAcc;
        fpsAcc = 0; fpsN = 0; fpsTimer = 0;
      }
    }
  } catch (err) {
    fatal(err);
    return; // stop the loop on crash; the error screen stays visible
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// test hooks: let automated tests poke at the running game
window.game = game;
window.VICE_READY = true;
