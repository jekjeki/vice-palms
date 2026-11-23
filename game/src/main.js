// main.js — boot: canvas, input, URL params (seed/mute/shot), fixed-timestep loop,
// mode routing between gameplay, title, pause and death screens.
import { S, Input, VW, VH, clamp, Rng } from './core.js';
import { render, drawBigMap } from './render.js';
import { drawHud, drawZoneCard } from './hud.js';
import { titleUpdate, drawTitle, pauseUpdate, drawPause, drawDead, pauseToggle, toggleBigMap, bigMapUpdate } from './screens.js';
import { setupShot } from './shots.js';
import { newGame, update } from './game.js';
import { Audio } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
S.input = input;

// ---------------------------------------------------------------- params
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || 1337;
const shot = params.get('shot');
const mute = params.get('mute') === '1' || params.get('mute') === 'true';
S.muted = mute;

// ---------------------------------------------------------------- boot
if (shot) {
  const hold = setupShot(shot, seed);
  S.shotHold = hold;
} else {
  newGame(seed);
  S.mode = 'title';
  S.demo = 0;
}

// unlock audio on first gesture
const unlock = () => { if (!S.muted) Audio.init(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); };
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

// ---------------------------------------------------------------- loop
const STEP = 1 / 60;
let last = performance.now(), acc = 0, holdLeft = S.shotHold || 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = clamp(dt, 0, 0.1);

  // staged shots: live sim for `hold` seconds, then freeze for a crisp frame
  if (S.shot && holdLeft > 0) {
    holdLeft -= dt;
    if (holdLeft <= 0) { S.freeze = true; S.shotHold = 0; }
  }

  const active = !S.freeze;
  if (active) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      acc -= STEP;
      steps++;
      tick(STEP);
      // press-edge events are consumed by the first sim step they reach
      input.pressed.clear();
      input.mclicked = false;
    }
  }

  draw();
  input.endFrame();
}

function tick(dt) {
  S.time += dt;
  switch (S.mode) {
    case 'title':
      titleUpdate(dt, input);
      break;
    case 'playing':
      if (S.bigMap) { bigMapUpdate(dt, input); break; }
      update(dt);
      if (input.hit('Escape', 'KeyP')) pauseToggle();
      if (input.hit('Tab')) toggleBigMap(true);
      if (input.hit('KeyM')) { S.muted = !S.muted; Audio.setMuted(S.muted); }
      if (input.hit('KeyR')) { const st = Audio.nextStation(); S.toasts.push({ text: '📻 ' + st, t: 0, dur: 2.5 }); }
      break;
    case 'paused':
      pauseUpdate(dt, input);
      if (input.hit('KeyM')) { S.muted = !S.muted; Audio.setMuted(S.muted); }
      break;
    case 'wasted':
    case 'busted':
      update(dt); // runs its own dead-state branch + respawn timer
      if (input.hit('KeyM')) { S.muted = !S.muted; Audio.setMuted(S.muted); }
      break;
  }
  Audio.update(dt);
}

// Note: S.time is advanced inside game.update as well; avoid double counting there.
function draw() {
  render(ctx);
  if (S.mode === 'title') drawTitle(ctx);
  else {
    if (S.bigMap && S.mode === 'playing') { drawBigMap(ctx); return; }
    if (S.mode !== 'paused') drawHud(ctx);
    drawZoneCard(ctx);
    if (S.mode === 'paused') { drawPause(ctx); }
    if (S.mode === 'wasted' || S.mode === 'busted') drawDead(ctx);
  }
}

requestAnimationFrame(frame);

// expose for headless debugging
window.VP = Object.assign(window.VP || {}, { S, canvas });
