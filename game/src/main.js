// main.js — boot: canvas, input, fixed-timestep loop, shot integration
import { CFG } from './config.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { clamp } from './util.js';

const canvas = document.getElementById('game');
canvas.style.cursor = 'crosshair';
const boot = document.getElementById('boot');
if (boot) boot.remove();

const input = new Input(canvas);
const game = new Game(canvas, input);
const ctx = canvas.getContext('2d');

// first user gesture unlocks WebAudio
const unlock = () => {
  game.audio.init();
  game.audio.setMuted(game.startMuted);
  game.audio.startMusic();
  removeEventListener('keydown', unlock);
  removeEventListener('mousedown', unlock);
};
addEventListener('keydown', unlock);
addEventListener('mousedown', unlock);

// resize to window while keeping 16:9 letterbox feel
function resize() {
  const w = innerWidth, h = innerHeight;
  const scale = Math.min(w / CFG.VIEW_W, h / CFG.VIEW_H);
  canvas.style.width = Math.floor(CFG.VIEW_W * scale) + 'px';
  canvas.style.height = Math.floor(CFG.VIEW_H * scale) + 'px';
}
resize();
addEventListener('resize', resize);

// fixed-step updates + a single render per animation frame
let last = performance.now();
let acc = 0;
function loop(nowMs) {
  const now = Math.min(250, nowMs - last);
  last = nowMs;
  acc += now / 1000;
  let steps = 0;
  while (acc >= CFG.FIXDT && steps < 3) {
    game.update(CFG.FIXDT);
    acc -= CFG.FIXDT;
    steps++;
  }
  if (steps === 3) acc = 0; // spiral of death guard
  game.draw(ctx, now / 1000);
  game.input.endFrame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// expose for debugging
window.__vp = game;
