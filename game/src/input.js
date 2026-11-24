// VICE PALMS — keyboard input with edge detection. Mouse reserved for menus.

import { G } from './state.js';

const down = new Set();
const pressed = new Set();   // consumed once per frame

const MAP = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  hand: ['Space'],
  attack: ['Space', 'KeyJ'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  enter: ['Enter', 'NumpadEnter', 'KeyF'],
  pause: ['Escape', 'KeyP'],
  horn: ['KeyH'],
  switch: ['KeyQ'],
};

const ACTION_OF = new Map();
for (const [act, keys] of Object.entries(MAP)) for (const k of keys) ACTION_OF.set(k, act);

export function isDown(act) {
  for (const k of MAP[act]) if (down.has(k)) return true;
  return false;
}
export function wasPressed(act) { return pressed.has(act); }
export function consumeAll() { pressed.clear(); }

function keyOf(e) { return e.code; }

export function installInput() {
  window.addEventListener('keydown', (e) => {
    const act = ACTION_OF.get(e.code);
    if (act && ['up', 'down', 'left', 'right', 'hand', 'attack', 'sprint', 'enter', 'pause', 'horn', 'switch'].includes(act)) e.preventDefault();
    if (e.repeat) return;
    down.add(e.code);
    pressed.add(act);
    G.userGesture = true;
  });
  window.addEventListener('keyup', (e) => { down.delete(e.code); });
  window.addEventListener('blur', () => { down.clear(); });
}

// fake-input channel used by shots.js to stage scenes deterministically
export function injectAction(act) { pressed.add(act); }
export function injectHold(act, on) {
  const k = MAP[act] && MAP[act][0];
  if (!k) return;
  if (on) down.add(k); else down.delete(k);
}
export function clearInput() { down.clear(); pressed.clear(); }
