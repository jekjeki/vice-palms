// main.js — boot: canvas, error surface, game loop.

import { CFG, ctx } from './config.js';
import { CFG as _C } from './config.js';
import { Game } from './game.js';

const canvas = document.getElementById('game');
canvas.width = CFG.viewW;
canvas.height = CFG.viewH;

// surface boot errors on-screen (headless debugging + screenshot sanity)
function showError(msg) {
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(10,0,10,0.85)';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#ff7080';
  g.font = 'bold 22px monospace';
  g.textAlign = 'left';
  const lines = String(msg).split('\n').slice(0, 12);
  let y = 60;
  for (const l of lines) { g.fillText(l, 30, y); y += 26; }
}

window.addEventListener('error', (e) => {
  showError('ERROR: ' + e.message + '\n' + (e.filename || '') + ':' + (e.lineno || 0));
});
window.addEventListener('unhandledrejection', (e) => {
  showError('PROMISE REJECTION: ' + (e.reason && e.reason.message || e.reason));
});

// keep crisp on HiDPI
(function fit() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  const w = CFG.viewW, h = CFG.viewH;
  const aspect = w / h;
  const vw = window.innerWidth, vh = window.innerHeight;
  let cw = vw, ch = vw / aspect;
  if (ch > vh) { ch = vh; cw = vh * aspect; }
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  canvas.style.position = 'absolute';
  canvas.style.left = (vw - cw) / 2 + 'px';
  canvas.style.top = (vh - ch) / 2 + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
})();
// BUT: the renderer reads canvas.width for the view size — reset to logical size
// and scale via CSS only, keeping game math in 1280x720 space.
canvas.width = CFG.viewW;
canvas.height = CFG.viewH;

const game = new Game(canvas);
ctx.game = game;
window.__game = game;

let last = performance.now();
let ready = false;
let fpsAcc = 0, fpsN = 0, fpsShown = 0;
let showFps = false;

function loop(now) {
  try {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > CFG.dtMax) dt = CFG.dtMax;
    if (dt < 0) dt = 0;
    game.frame(dt);
    // F3 fps counter
    if (game.input.hit('F3')) {
      showFps = !showFps;
      const g2 = canvas.getContext('2d');
      if (!showFps) {
        g2.clearRect(0, 0, 90, 26);
      }
    }
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fpsShown = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    if (showFps) {
      const g2 = canvas.getContext('2d');
      g2.fillStyle = 'rgba(0,0,0,0.55)';
      g2.fillRect(0, 0, 84, 24);
      g2.fillStyle = fpsShown >= 55 ? '#7ae85a' : fpsShown >= 35 ? '#f5c04a' : '#ff5560';
      g2.font = 'bold 14px monospace';
      g2.textAlign = 'left';
      g2.fillText(fpsShown + ' fps', 10, 17);
    }
  } catch (e) {
    showError('LOOP ERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n'));
    // don't spam: stop the loop on hard failure
    return;
  }
  if (!ready) {
    ready = true;
    window.__ready = true;
  }
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

document.addEventListener('visibilitychange', () => {
  last = performance.now();
});
