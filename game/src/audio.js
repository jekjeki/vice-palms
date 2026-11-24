// VICE PALMS — all audio is synthesized with WebAudio. No files, no network.
// Starts lazily after the first user gesture; every channel respects G.muted.

import { G } from './state.js';

let actx = null;
let master = null;
let engineOsc = null, engineGain = null, engineFilt = null;
let sirenOsc = null, sirenGain = null;
let bgmTimer = 0, bgmStep = 0;
let bgmOn = false;

const BASS = [55, 55, 82.4, 55, 55, 73.4, 82.4, 61.7]; // synthwave bass loop (Hz)

export function installAudio() {
  G.sfx = (name) => play(name);
}

function ensureCtx() {
  if (actx || !G.userGesture || G.muted) return false;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain();
    master.gain.value = 0.5;
    master.connect(actx.destination);
    // engine drone
    engineOsc = actx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineFilt = actx.createBiquadFilter();
    engineFilt.type = 'lowpass';
    engineFilt.frequency.value = 380;
    engineGain = actx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilt).connect(engineGain).connect(master);
    engineOsc.start();
    // siren
    sirenOsc = actx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenGain = actx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    bgmOn = true;
    return true;
  } catch { actx = null; return false; }
}

export function muteAudio() {
  G.muted = true;
  if (master) master.gain.value = 0;
}
export function unmuteAudio() {
  G.muted = false;
  if (master && actx) master.gain.value = 0.5;
}
export function toggleMute() {
  if (G.muted) unmuteAudio(); else { G.muted = true; if (master) master.gain.value = 0; }
}

function blip(freq, dur, type, vol, slideTo) {
  if (!actx || G.muted) return;
  const t = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol || 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, filterFrom, filterTo) {
  if (!actx || G.muted) return;
  const t = actx.currentTime;
  const n = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = actx.createBufferSource();
  src.buffer = buf;
  const f = actx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(filterFrom, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export function play(name) {
  if (!G.userGesture || G.muted) return;
  if (!actx && !ensureCtx()) return;
  switch (name) {
    case 'shot': noiseBurst(0.14, 0.5, 5200, 300); blip(180, 0.08, 'square', 0.12, 60); break;
    case 'punch': noiseBurst(0.08, 0.3, 900, 120); break;
    case 'boom': noiseBurst(0.9, 0.9, 900, 60); blip(70, 0.6, 'sine', 0.5, 30); break;
    case 'jack': blip(300, 0.1, 'square', 0.15, 140); noiseBurst(0.1, 0.2, 1400, 300); break;
    case 'cash': blip(880, 0.09, 'square', 0.18); setTimeout(() => blip(1320, 0.12, 'square', 0.18), 90); break;
    case 'blip': blip(660, 0.07, 'triangle', 0.2); break;
    case 'star': blip(220, 0.25, 'sawtooth', 0.22, 110); break;
    case 'pass': { const seq = [523, 659, 784, 1046]; seq.forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.22), i * 110)); break; }
    case 'fail': { const seq = [392, 330, 262]; seq.forEach((f, i) => setTimeout(() => blip(f, 0.22, 'sawtooth', 0.2), i * 150)); break; }
    case 'wasted': blip(220, 1.4, 'sawtooth', 0.3, 40); noiseBurst(0.6, 0.3, 400, 60); break;
    case 'siren2': break; // handled continuously
    case 'mission': blip(440, 0.12, 'triangle', 0.2); setTimeout(() => blip(660, 0.18, 'triangle', 0.2), 120); break;
    case 'checkpoint': blip(990, 0.12, 'triangle', 0.25, 1400); break;
    default: break;
  }
}

// called every frame from main loop: keeps engine/siren/bgm alive
export function updateAudio(dt) {
  if (!G.userGesture) return;
  if (!actx && !ensureCtx()) return;
  if (G.muted) return;
  if (actx.state === 'suspended') actx.resume().catch(() => {});

  // engine
  const p = G.player;
  if (p.car && G.screen === 'play' && !p.dead) {
    const spd = Math.hypot(p.car.vx, p.car.vy);
    const rev = 55 + Math.min(spd, 340) * 0.55 + (p.car.throttle > 0 ? 30 : 0);
    engineOsc.frequency.setTargetAtTime(rev, actx.currentTime, 0.08);
    engineGain.gain.setTargetAtTime(0.07 + Math.min(spd, 300) * 0.0002, actx.currentTime, 0.1);
  } else {
    engineGain.gain.setTargetAtTime(0, actx.currentTime, 0.15);
  }

  // siren when wanted and cops nearby
  const wanted = p.stars > 0;
  if (wanted && G.screen === 'play') {
    const t = actx.currentTime;
    const ph = (G.time % 1.4) < 0.7 ? 690 : 510;
    sirenOsc.frequency.setTargetAtTime(ph, t, 0.05);
    sirenGain.gain.setTargetAtTime(0.035, t, 0.1);
  } else {
    sirenGain.gain.setTargetAtTime(0, actx.currentTime, 0.1);
  }

  // synthwave bgm: simple bass sequencer
  if (bgmOn && G.screen === 'play') {
    bgmTimer -= dt;
    if (bgmTimer <= 0) {
      bgmTimer = 0.26;
      const f = BASS[bgmStep % BASS.length];
      bgmStep++;
      blip(f, 0.22, 'sawtooth', 0.05);
      if (bgmStep % 4 === 2) blip(f * 4, 0.1, 'triangle', 0.03);
    }
  }
}
