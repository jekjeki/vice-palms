// Vice Palms — boot + main loop.

import { Game } from './game.js';
import { Render } from './render.js';
import { drawHUD } from './hud.js';
import { drawScreens } from './screens.js';
import { setupShot, SHOT_SIM } from './shots.js';
import { VIEW_W, VIEW_H } from './config.js';

const canvas = document.getElementById('c');
const params = new URLSearchParams(location.search);

const opts = {
  seed: params.has('seed') ? (Number(params.get('seed')) || 7) : 7,
  shot: params.get('shot') || null,
};

const game = new Game(canvas, opts);
const render = new Render(canvas);
game.setRender(render);

// mute before anything can make a sound
let startMuted = params.get('mute') === '1';
try {
  if (localStorage.getItem('vicepalms.mute') === '1') startMuted = true;
  if (params.get('mute') === '0') startMuted = false;
} catch { /* ignore */ }
if (startMuted) game.audio.setMuted(true);

// staged screenshot mode: deterministic, input disabled
if (opts.shot) {
  game.input.enabled = false;
  setupShot(game, opts.shot);
}

// audio unlocks on the first gesture
game.input.onAny = () => game.audio.ensure();
game.audio.music(true);

let last = performance.now();
let acc = 0;
let frames = 0;

function loop(now) {
  const real = Math.min(0.6, (now - last) / 1000);
  last = now;

  // fixed-step catch-up: sim time tracks wall time even in throttled tabs
  acc += real;
  let steps = 0;
  while (acc > 0.0005 && steps < 14) {
    const dt = Math.min(0.05, acc);
    game.update(dt);
    acc -= dt;
    steps++;
  }
  if (acc > 0.25) acc = 0; // drop the backlog instead of spiraling

  render.draw(game, real);
  drawHUD(game, render);
  drawScreens(game, render);

  frames++;
  if (opts.shot && (game.time >= (SHOT_SIM[opts.shot] || 1.2))) {
    window.__shotReady = true;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// exposed for the play-test harness
window.game = game;
window.VIEW = { W: VIEW_W, H: VIEW_H };
