// VICE PALMS — boot: canvas setup, query params (?shot=&seed=&mute=), fixed
// timestep loop.

import { G } from './state.js';
import { installInput } from './input.js';
import { installAudio, updateAudio } from './audio.js';
import { initGame, update, renderGame } from './game.js';
import { stageShot, updateShot } from './shots.js';

function boot() {
  const canvas = document.getElementById('game');
  G.canvas = canvas;
  G.ctx = canvas.getContext('2d');

  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  const seed = parseInt(q.get('seed') || '1337', 10) >>> 0 || 1337;
  if (q.get('mute') === '1' || q.get('mute') === 'true') G.muted = true;
  if (shot) G.shotMode = shot;

  installInput();
  installAudio();

  fitCanvas(canvas);
  window.addEventListener('resize', () => fitCanvas(canvas));

  initGame(seed);
  if (shot && ['start', 'play', 'end', 'chaos'].includes(shot)) stageShot(shot, seed);

  const loader = document.getElementById('boot');
  if (loader) loader.remove();

  G.running = true;
  window.VP = G;   // debug/testing handle
  last = performance.now();
  acc = 0;
  requestAnimationFrame(frame);
}

let last = 0, acc = 0;
const STEP = 1 / 60;

function frame(now) {
  if (!G.running) return;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    update(STEP);
    updateShot(STEP);
    acc -= STEP;
    steps++;
  }
  renderGame();
  requestAnimationFrame(frame);
}

function fitCanvas(canvas) {
  const ww = window.innerWidth, wh = window.innerHeight;
  const s = Math.min(ww / G.W, wh / G.H);
  canvas.style.width = Math.floor(G.W * s) + 'px';
  canvas.style.height = Math.floor(G.H * s) + 'px';
}

boot();
