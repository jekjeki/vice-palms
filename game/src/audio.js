// audio.js — synthesized WebAudio: engine, gunshots, siren, explosions, synthwave loop
import { CFG } from './config.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineSub = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenT = 0;
    this.musicGain = null;
    this.musicTimer = null;
    this.step = 0;
    this.started = false;
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { this.ctx = null; return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    // engine: saw + sub
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineSub = this.ctx.createOscillator();
    this.engineSub.type = 'square';
    this.engineSub.frequency.value = 30;
    const engFilter = this.ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 700;
    this.engineOsc.connect(engFilter); this.engineSub.connect(engFilter);
    engFilter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineSub.start();
    // siren
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    // music bus
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
    if (!m && this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // engine follow: pitch by speed, audible only while driving
  engine(level, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 55 + level * 150 + (driving ? 8 : 0);
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(f / 2, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.10 + level * 0.10 : 0, t, 0.12);
  }

  siren(prox) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (prox <= 0) { this.sirenGain.gain.setTargetAtTime(0, t, 0.2); return; }
    this.sirenT += 1;
    const hi = (Math.floor(this.sirenT / 14) % 2) === 0;
    this.sirenOsc.frequency.setTargetAtTime(hi ? 720 : 520, t, 0.03);
    this.sirenGain.gain.setTargetAtTime(0.045 * prox, t, 0.1);
  }

  noiseBurst(dur, vol, freq, type = 'lowpass') {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }

  tone(freq, dur, vol, type = 'square', slide = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  tirePop() { this.noiseBurst(0.12, 0.5, 1200, 'bandpass'); this.tone(180, 0.1, 0.3, 'square', -120); }

  gunshot(v = 1) { this.noiseBurst(0.16, 0.5 * v, 2600, 'highpass'); this.tone(140, 0.09, 0.25 * v, 'square', -90); }
  explosion() { this.noiseBurst(1.1, 0.9, 320); this.tone(70, 0.7, 0.5, 'sawtooth', -40); }
  punch() { this.noiseBurst(0.09, 0.3, 900); }
  hurt() { this.tone(300, 0.12, 0.2, 'sawtooth', -160); }
  scream() { this.tone(660, 0.28, 0.08, 'sawtooth', 240); }
  carDoor() { this.noiseBurst(0.07, 0.25, 500); }
  carHorn() { this.tone(370, 0.28, 0.22, 'square'); this.tone(466, 0.28, 0.18, 'square'); }
  star(w) { this.tone(500 + w * 60, 0.18, 0.3, 'square'); this.tone(750 + w * 60, 0.18, 0.2, 'square'); }
  roadblock() { this.tone(220, 0.4, 0.3, 'sawtooth', 110); }
  alarm() { this.tone(880, 0.25, 0.25, 'square'); this.tone(660, 0.25, 0.25, 'square'); }
  missionStart() { this.tone(440, 0.15, 0.3, 'square'); this.tone(660, 0.2, 0.3, 'square'); }
  missionDone() { this.tone(523, 0.18, 0.3, 'square'); this.tone(659, 0.18, 0.3, 'square'); this.tone(784, 0.3, 0.35, 'square'); }
  missionFail() { this.tone(330, 0.3, 0.3, 'sawtooth', -120); }
  missionTick() { this.tone(880, 0.1, 0.25, 'square'); }
  thunder() { this.noiseBurst(1.6, 0.7, 220); this.tone(52, 1.1, 0.4, 'sawtooth', -18); }
  splash() { this.noiseBurst(0.5, 0.45, 900); }
  screech() { this.noiseBurst(0.22, 0.22, 3400, 'bandpass'); this.tone(1100, 0.18, 0.06, 'sawtooth', -240); }
  nitro() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    if (t - (this._lastNitro || 0) < 0.25) return;
    this._lastNitro = t;
    this.noiseBurst(0.3, 0.18, 1800, 'highpass');
    this.tone(90, 0.25, 0.12, 'sawtooth', 130);
  }

  // synthwave loop: bass + chords pattern depends on the tuned radio station
  setStation(id) { if (this.stationId !== id) this.stationId = id; }

  startMusic() {
    if (this.started || !this.ctx) return;
    this.started = true;
    const beat = 60 / 104 / 2; // eighth notes
    const waveBass = [55, 55, 82.4, 55, 65.4, 65.4, 49, 49];
    const waveChords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [146.8, 174.6, 220]];
    const pulseBass = [65.4, 65.4, 98, 65.4, 82.4, 82.4, 61.7, 61.7];
    const pulseChords = [[261.6, 329.6, 392], [207.6, 261.6, 311.1], [233, 293.7, 349.2], [174.6, 207.6, 261.6]];
    const jazzBass = [58.3, 58.3, 73.4, 58.3, 69.3, 69.3, 51.9, 51.9];
    const jazzChords = [[246.9, 293.7, 349.2], [196, 233, 293.7], [220, 261.6, 329.6], [164.8, 196, 246.9]];
    const playStep = () => {
      if (!this.ctx || this.muted) { this.musicTimer = setTimeout(playStep, beat * 1000); return; }
      const i = this.step++ % 8;
      const bar = Math.floor((this.step - 1) / 8) % 4;
      let bass = waveBass, chords = waveChords;
      if (this.stationId === 'pulse') { bass = pulseBass; chords = pulseChords; }
      else if (this.stationId === 'jazz') { bass = jazzBass; chords = jazzChords; }
      else if (this.stationId === 'off') { this.musicTimer = setTimeout(playStep, beat * 1000); return; }
      this.tone(bass[i], beat * 0.9, 0.22, 'sawtooth');
      this.tone(bass[i] * 2, beat * 0.5, 0.06, 'square');
      if (i === 0 || i === 3 || i === 6) for (const f of chords[bar]) this.tone(f, beat * 3, 0.05, 'triangle');
      if (i % 2 === 0) this.noiseBurst(0.04, 0.12, 6000, 'highpass');
      this.musicTimer = setTimeout(playStep, beat * 1000);
    };
    playStep();
  }

  stopMusic() {
    this.started = false;
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
  }
}
