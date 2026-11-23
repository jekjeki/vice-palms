// ============================================================================
// VICE PALMS — main.js
// Boot: parse URL params (shot / seed / mute), build the Game, start the
// loop, and expose a few window hooks for headless tooling. All local —
// the game makes zero network requests.
// ============================================================================

import { Game } from './game.js';
import { parseShotParams, ShotDirector } from './shots.js';

function fitCanvas(canvas) {
  const fit = () => {
    const s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    canvas.style.width = Math.floor(1280 * s) + 'px';
    canvas.style.height = Math.floor(720 * s) + 'px';
  };
  window.addEventListener('resize', fit);
  fit();
}

function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  fitCanvas(canvas);

  const { shot, seed, mute } = parseShotParams(window.location.search);
  const qs = new URLSearchParams(window.location.search);
  const fps = qs.get('fps') === '1';
  const weather = qs.get('weather');
  const spawn = qs.get('spawn');

  const game = new Game(canvas, {
    seed: seed != null ? seed : undefined,
    mute,
    fps,
    weather: weather || undefined,
    spawn: spawn || undefined,
  });

  if (shot && ShotDirector && shot !== 'none') {
    game.shot = new ShotDirector(game, shot);
    game.shot.setup();
  }

  // Headless tooling hooks (used by the screenshot rig and play-tests).
  try {
    window.__game = game;
    window.__shotReady = false;
    game.onFirstFrame = () => {
      window.__ready = true;
      console.log('[vice-palms] ready — seed=' + game.seed + ' shot=' + (shot || 'none') + ' muted=' + game.audio.muted);
    };
  } catch (e) { /* ignore */ }

  game.start();
}

boot();
