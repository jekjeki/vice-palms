// main.js — boot: canvas, loop, module wiring. Fixed-step sim, RAF render.

import { CFG } from './config.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { createGame, update, newGame } from './game.js';
import { applyShot } from './shots.js';
import { render } from './render.js';
import { drawHud } from './hud.js';
import { drawTitle, drawPause, drawControls, drawOverlays, drawFinale } from './screens.js';

function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = CFG.VIEW_W;
  canvas.height = CFG.VIEW_H;

  const params = new URLSearchParams(location.search);
  const muted = params.get('mute') === '1';
  const shot = params.get('shot');
  const seedStr = params.get('seed') || 'vice-palms';

  const audio = new AudioSys();
  const input = new Input(canvas);
  const g = createGame(audio, input, seedStr);
  window.G = g; // debugging hook

  // audio may only wake on a gesture; when muted from the start, never wake it
  let gestureSeen = muted;
  const wake = () => {
    if (gestureSeen) return;
    gestureSeen = true;
    audio.start(false);
    audio.ensure();
    if (g.state === 'play') audio.musicOn(true);
  };
  window.addEventListener('keydown', wake, { once: true });
  canvas.addEventListener('mousedown', wake, { once: true });
  if (muted) audio.start(true); // stays at gain 0 forever

  // staged screenshot scenes
  if (shot) {
    newGame(g, false);
    applyShot(g, shot, params.get('seed'));
  }

  // fixed-step loop
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > CFG.MAX_DT) dt = CFG.MAX_DT;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      update(g, STEP);
      acc -= STEP;
      steps++;
    }
    draw(g, ctx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function draw(g, ctx) {
  if (g.state === 'title') {
    drawTitle(g, ctx);
  } else if (g.state === 'controls') {
    drawControls(g, ctx);
  } else {
    render(g, ctx);
    drawHud(g, ctx);
    drawOverlays(g, ctx);
    if (g.state === 'pause') drawPause(g, ctx);
    if (g.state === 'end') drawFinale(g, ctx);
  }
}

boot();
