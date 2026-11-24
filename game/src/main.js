// Vice Palms — boot + game loop
import { S, makeState, updateGame, handleKey } from './game.js';
import { setupShot } from './shots.js';
import { drawWorld } from './render.js';
import { drawHUD } from './hud.js';
import { drawScreens } from './screens.js';

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const q = new URLSearchParams(location.search);
const seed = (parseInt(q.get('seed') || '0', 10) || (Date.now() % 1e9)) >>> 0;

makeState(seed);
window.__state = S;
window.__errors = S.errors;

if (q.get('shot')) setupShot(q.get('shot'), q);
if (q.get('audio') === '1') S.audioOn = true;

// ---- input ----
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']);
addEventListener('keydown', (e) => {
  if (PREVENT.has(e.code)) e.preventDefault();
  if (!e.repeat) { S.keys[e.code] = true; S.pressed.add(e.code); handleKey(e.code); }
});
addEventListener('keyup', (e) => { S.keys[e.code] = false; });
cv.addEventListener('mousemove', (e) => {
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return;
  S.mouse.x = (e.clientX - r.left) * (cv.width / r.width);
  S.mouse.y = (e.clientY - r.top) * (cv.height / r.height);
});
cv.addEventListener('mousedown', (e) => { if (e.button === 0) S.mouse.down = true; });
addEventListener('mouseup', () => { S.mouse.down = false; });
addEventListener('blur', () => { S.keys = {}; S.mouse.down = false; });

// ---- error capture (for QA) ----
addEventListener('error', (e) => { S.errors.push(String(e.message || e.error)); });
const ce = console.error.bind(console);
console.error = (...a) => { S.errors.push(a.map(String).join(' ')); ce(...a); };

// ---- main loop: fixed 60 Hz sim, uncapped draw ----
const STEP = 1 / 60;
let last = performance.now(), acc = 0;

function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    updateGame(S);
    acc -= STEP; steps++; S.frame++;
    if (S.shot && !S.shotReady && S.frame >= S.shotAt) {
      S.shotReady = true; window.__shotReady = true;
    }
  }
  if (steps > 0) S.pressed.clear();

  drawWorld(S, ctx);
  drawHUD(S, ctx);
  drawScreens(S, ctx);
}
requestAnimationFrame(loop);
