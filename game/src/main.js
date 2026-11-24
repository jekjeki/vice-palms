// main.js — boot: canvas, query params (?shot=start|play|end|chaos &seed=N
// &mute=1), fixed-timestep loop, and the draw order: world → HUD → screens.

import { G } from './util.js';
import { initInput, endFrame } from './input.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { drawHUD } from './hud.js';
import { drawScreens, updateScreens, initScreens } from './screens.js';
import { setupShot } from './shots.js';
import { setMuted } from './audio.js';

const canvas = document.getElementById('game');
canvas.width = 1280;
canvas.height = 720;
G.w = 1280;
G.h = 720;

// ------------------------------------------------------------- query params
const q = new URLSearchParams(location.search);
if (q.get('mute') === '1' || q.get('mute') === 'true') {
  setMuted(true);
}
const shotName = q.get('shot');
const seedParam = parseInt(q.get('seed') || '', 10);

// ------------------------------------------------------------- boot
initInput(canvas);
initScreens();

const game = new Game(canvas);
const renderer = new Renderer(canvas);

let shotOk = false;
if (shotName) {
  shotOk = setupShot(shotName, Number.isFinite(seedParam) ? seedParam : 7, game);
}
if (!shotOk) {
  // fresh world behind the title menu
  game.newGame(Number.isFinite(seedParam) ? seedParam : 7, { silent: true });
  game.toTitle();
  G.t = 0;
}

// ------------------------------------------------------------- loop
const DT = 1 / 60;
let last = performance.now();
let acc = 0;

function frame(now) {
  try {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;         // tab-switch guard
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 4) {
      game.update(DT);
      acc -= DT;
      steps++;
    }
    if (steps === 0) acc = Math.min(acc, DT);

    updateScreens(game);
    renderer.updateCamera(dt);
    renderer.frame();

    const c = renderer.c;
    if (G.state !== 'title' && G.world && !G.photo) drawHUD(c);
    drawScreens(c);
  } catch (err) {
    // one bad frame must not kill the night — log it and keep rolling
    console.error('VP frame error:', err && err.message, err && err.stack ? String(err.stack).split('\n')[1] : '');
  }

  endFrame();
  requestAnimationFrame(frame);
}

// test hook: lets the build agent (and curious players) inspect the sim
window.__VP = { G, game };
requestAnimationFrame(frame);
