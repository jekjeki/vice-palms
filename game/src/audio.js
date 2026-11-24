// audio.js — fully synthesized WebAudio: engine, gunshots, sirens, explosions,
// and a little synthwave loop. Everything is gated on G.muted; the AudioContext
// is only created after a user gesture (or explicitly in staged shots when unmuted).

import { G } from './util.js';
import { clamp } from './util.js';

let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let engineNodes = null;
let sirenNodes = null;
let musicTimer = null;
let musicStep = 0;

export function initAudio() {
  if (ctx || G.muted) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { return; }
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.9;
  sfxGain.connect(master);

  musicGain = ctx.createGain();
  musicGain.gain.value = 0.34;
  musicGain.connect(master);
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function setMuted(m) {
  G.muted = m;
  if (master) master.gain.value = m ? 0 : 0.55;
  if (m && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (!m && G.state === 'playing') startMusic();
}

// ------------------------------------------------------------------ noise
let noiseBuf = null;
function noise() {
  if (!ctx) return null;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

// ------------------------------------------------------------------ engine
export function engineOn() {
  if (!ctx || engineNodes) return;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 55;
  const sub = ctx.createOscillator();
  sub.type = 'square';
  sub.frequency.value = 27;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 320;
  filt.Q.value = 2;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(filt); sub.connect(filt);
  filt.connect(gain); gain.connect(sfxGain);
  osc.start(); sub.start();
  engineNodes = { osc, sub, filt, gain };
}

export function engineOff() {
  if (!engineNodes) return;
  try { engineNodes.osc.stop(); engineNodes.sub.stop(); } catch {}
  engineNodes = null;
}

// speed 0..1, load 0..1 (throttle)
export function engineUpdate(speed, load) {
  if (!engineNodes || !ctx) return;
  const t = ctx.currentTime;
  const f = 42 + speed * 130;
  engineNodes.osc.frequency.setTargetAtTime(f, t, 0.06);
  engineNodes.sub.frequency.setTargetAtTime(f / 2, t, 0.06);
  engineNodes.filt.frequency.setTargetAtTime(240 + speed * 900 + load * 300, t, 0.08);
  engineNodes.gain.gain.setTargetAtTime(0.05 + speed * 0.10 + load * 0.05, t, 0.1);
}

// tire squeal while sliding — looped and tied to drift intensity
let skidNodes = null;
export function skidUpdate(intensity) {
  if (!ctx) return;
  if (intensity > 0.05 && !skidNodes) {
    const src = noise();
    if (!src) return;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 900;
    filt.Q.value = 6;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(filt); filt.connect(g); g.connect(sfxGain);
    src.start();
    skidNodes = { src, g };
  }
  if (skidNodes) {
    skidNodes.g.gain.setTargetAtTime(clamp(intensity, 0, 1) * 0.22, ctx.currentTime, 0.08);
    if (intensity <= 0.05) {
      try { skidNodes.src.stop(); } catch {}
      skidNodes = null;
    }
  }
}

// ------------------------------------------------------------------ one-shots
export function sfxShot() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = noise();
  if (!src) return;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 1400;
  filt.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  src.connect(filt); filt.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + 0.15);
  // low thump
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.35, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g2); g2.connect(sfxGain);
  o.start(t); o.stop(t + 0.13);
}

export function sfxBoom(big = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = noise();
  if (!src) return;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(900 * big, t);
  filt.frequency.exponentialRampToValueAtTime(60, t + 0.9 * big);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.0 * big);
  src.connect(filt); filt.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + 1.1 * big);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.8, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  o.connect(g2); g2.connect(sfxGain);
  o.start(t); o.stop(t + 0.85);
}

export function sfxCrash(v) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = noise();
  if (!src) return;
  const filt = ctx.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = 900;
  const g = ctx.createGain();
  const amp = clamp(v / 500, 0.05, 0.5);
  g.gain.setValueAtTime(amp, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  src.connect(filt); filt.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + 0.22);
}

export function sfxPickup() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [523, 659, 784].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const g = ctx.createGain();
    const s = t + i * 0.07;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.18, s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, s + 0.12);
    o.connect(g); g.connect(sfxGain);
    o.start(s); o.stop(s + 0.14);
  });
}

export function sfxMission(pass = true) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const seq = pass ? [392, 523, 659, 784, 1046] : [330, 311, 247, 185];
  seq.forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    const s = t + i * 0.11;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.22, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, s + 0.3);
    o.connect(g); g.connect(sfxGain);
    o.start(s); o.stop(s + 0.35);
  });
}

// ------------------------------------------------------------------ siren
export function sirenOn() {
  if (!ctx || sirenNodes) return;
  const o = ctx.createOscillator();
  o.type = 'square';
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 1.4;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 180;
  lfo.connect(lfoG);
  lfoG.connect(o.frequency);
  o.frequency.value = 700;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 1600;
  const g = ctx.createGain();
  g.gain.value = 0;
  o.connect(filt); filt.connect(g); g.connect(sfxGain);
  o.start(); lfo.start();
  sirenNodes = { o, lfo, g };
}

export function sirenVolume(v) {
  if (!sirenNodes || !ctx) return;
  sirenNodes.g.gain.setTargetAtTime(clamp(v, 0, 1) * 0.14, ctx.currentTime, 0.2);
}

export function sirenOff() {
  if (!sirenNodes) return;
  try { sirenNodes.o.stop(); sirenNodes.lfo.stop(); } catch {}
  sirenNodes = null;
}

// ------------------------------------------------------------------ synthwave
const BASS = [0, 0, 7, 5];       // semitone offsets per bar over root A1
const root = 55;                  // A1
const CHORDS = [
  [0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2],
];
const STEP_S = 0.24;

function note(freq, when, dur, type, vol, dest) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g); g.connect(dest);
  o.start(when); o.stop(when + dur + 0.05);
}

export function startMusic() {
  if (!ctx || musicTimer) return;
  musicStep = 0;
  const tick = () => {
    if (!ctx || G.muted) return;
    const t0 = ctx.currentTime + 0.05;
    const bar = Math.floor(musicStep / 8) % 4;
    const inBar = musicStep % 8;
    // bass on each 8th
    const semi = BASS[bar] + (inBar % 2 === 1 ? 12 : 0);
    note(root * Math.pow(2, semi / 12), t0, STEP_S * 0.9, 'sawtooth', 0.20, musicGain);
    // chord stab on the 1 and the 5
    if (inBar === 0 || inBar === 4) {
      for (const c of CHORDS[bar]) {
        note(root * 4 * Math.pow(2, c / 12), t0, STEP_S * 2.2, 'square', 0.05, musicGain);
      }
    }
    // hat noise on off-beats
    if (inBar % 2 === 1) {
      const src = noise();
      if (src) {
        const f = ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 6500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.06, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
        src.connect(f); f.connect(g); g.connect(musicGain);
        src.start(t0); src.stop(t0 + 0.08);
      }
    }
    musicStep++;
  };
  musicTimer = setInterval(tick, STEP_S * 1000);
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

// ------------------------------------------------------------------ radio
export const STATIONS = [
  { name: 'WAVE 103', root: 55, bass: [0, 0, 7, 5], chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]], hat: true, bpmMul: 1 },
  { name: 'FLASH FM', root: 65.4, bass: [0, 0, 5, 7], chords: [[0, 4, 7], [2, 5, 9], [-3, 0, 4], [-1, 2, 6]], hat: true, bpmMul: 1.25 },
  { name: 'EMOTION 98.3', root: 49, bass: [0, 0, 3, 5], chords: [[0, 3, 7], [-4, 0, 3], [-2, 1, 5], [-5, -2, 2]], hat: false, bpmMul: 0.85 },
  { name: 'RADIO OFF', root: 55, bass: [0, 0, 7, 5], chords: [[0, 3, 7]], hat: false, bpmMul: 1 },
];
export let station = 0;

export function cycleStation() {
  station = (station + 1) % STATIONS.length;
  if (musicTimer) { stopMusic(); startMusic(); }
  return STATIONS[station].name;
}
export function stationName() { return STATIONS[station].name; }

// ------------------------------------------------------------------ rotor
let rotorNodes = null;
export function rotorOn() {
  if (!ctx || rotorNodes) return;
  const src = noise();
  if (!src) return;
  const chop = ctx.createGain();
  chop.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 13;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.5;
  lfo.connect(lfoG);
  // amplitude is modulated by an LFO through gain.gain
  const lfoOff = ctx.createConstantSource ? ctx.createConstantSource() : null;
  if (lfoOff) {
    lfoOff.offset.value = 0.5;
    lfoOff.connect(chop.gain);
    lfoOff.start();
  }
  lfoG.connect(chop.gain);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 420;
  src.connect(filt); filt.connect(chop); chop.connect(sfxGain);
  src.start(); lfo.start();
  rotorNodes = { src, lfo, chop, lfoOff };
}
export function rotorUpdate(v) {
  if (!rotorNodes || !ctx) return;
  rotorNodes.chop.gain.setTargetAtTime(clamp(v, 0, 1) * 0.5, ctx.currentTime, 0.25);
}
export function rotorOff() {
  if (!rotorNodes) return;
  try { rotorNodes.src.stop(); rotorNodes.lfo.stop(); if (rotorNodes.lfoOff) rotorNodes.lfoOff.stop(); } catch {}
  rotorNodes = null;
}

// ------------------------------------------------------------------ thunder & rain
export function sfxThunder() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = noise();
  if (!src) return;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(400, t);
  filt.frequency.exponentialRampToValueAtTime(50, t + 1.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.7, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
  src.connect(filt); filt.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + 2.3);
}

let rainNodes = null;
export function rainUpdate(intensity) {
  if (!ctx) return;
  if (intensity > 0.04 && !rainNodes) {
    const src = noise();
    if (!src) return;
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start();
    rainNodes = { src, g };
  }
  if (rainNodes) {
    rainNodes.g.gain.setTargetAtTime(clamp(intensity, 0, 1) * 0.14, ctx.currentTime, 0.5);
    if (intensity <= 0.04) {
      try { rainNodes.src.stop(); } catch {}
      rainNodes = null;
    }
  }
}

export function sfxHorn() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const f of [370, 466]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.setValueAtTime(0.12, t + 0.28);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.36);
  }
}
