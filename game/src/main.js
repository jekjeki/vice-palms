// ---------------------------------------------------------------------------
// main.js — boot: canvas, game instance, RAF loop with fps meter, error
// surface, and the staged-shot URL contract handoff to shots.js.
// ---------------------------------------------------------------------------

import { VIEW } from './view.js';
import { Game } from './game.js';
import { readShotParams, applyShot } from './shots.js';

const canvas = document.getElementById('game');
canvas.width = VIEW.w;
canvas.height = VIEW.h;

function fit() {
  const w = window.innerWidth, h = window.innerHeight;
  const s = Math.min(w / VIEW.w, h / VIEW.h);
  canvas.style.width = Math.floor(VIEW.w * s) + 'px';
  canvas.style.height = Math.floor(VIEW.h * s) + 'px';
}
window.addEventListener('resize', fit);
fit();

const game = new Game(canvas);
window.game = game;              // tests + debugging hook
window.__VICE_READY = true;

// staged screenshot scene?
const shot = readShotParams();
if (shot) {
  try {
    applyShot(game, shot);
  } catch (e) {
    console.error('shot staging failed', e);
  }
}

let last = performance.now();
let fpsAcc = 0, fpsN = 0, fpsT = 0;
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  // fps meter (feeds the HUD once a second)
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT >= 1) {
    game.fps = fpsN / fpsAcc;
    fpsAcc = 0; fpsN = 0; fpsT = 0;
  }
  try {
    game.frame(dt);
  } catch (e) {
    console.error(e);
    const g = canvas.getContext('2d');
    g.fillStyle = '#300a0e';
    g.fillRect(0, 0, VIEW.w, 64);
    g.fillStyle = '#ffd7dc';
    g.font = 'bold 14px monospace';
    g.textAlign = 'left';
    g.fillText('error: ' + e.message, 12, 26);
    g.font = '12px monospace';
    g.fillText(String(e.stack).split('\n').slice(1, 4).join('  |  '), 12, 48);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// unlock audio on the first interaction (browsers require a gesture)
const unlock = () => {
  game.audio.unlock();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
