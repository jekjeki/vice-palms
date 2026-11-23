// ---------------------------------------------------------------------------
// audio.js — everything is synthesised with WebAudio: engine, gunfire, siren,
// explosions, skids, pickups and a looping synthwave bed. Nothing is loaded
// from the network. `muted` hard-silences the master gain (tests use it).
// ---------------------------------------------------------------------------

import { CFG } from './config.js';
import { Radio } from './radio.js';

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engine = null;      // {osc, gain, filter}
    this.sirenNodes = null;
    this.radio = new Radio(this);
    this.station = 0;        // legacy index kept in sync with the radio
    this.music = { on: false, next: 0, step: 0, timer: 0 };
    this.rotorNodes = null;
    this._noiseBuf = null;
  }

  /** must be called from a user gesture (or ignored if blocked) */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(CFG.MUTE_KEY, m ? '1' : '0'); } catch (e) { /* private mode */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  ready() {
    return !!this.ctx && !this.muted;
  }

  noiseBuffer() {
    if (this._noiseBuf) return this._noiseBuf;
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }

  // ---------------------------------------------------------------- one-shots
  _env(node, t0, a, peak, dec, sustain = 0.0001) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(sustain, t0 + a + dec);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  gunshot() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.14);
    src.connect(f);
    this._env(f, t, 0.002, 0.9, 0.14);
    src.start(t);
    src.stop(t + 0.2);
    // crack
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.08);
    this._env(o, t, 0.001, 0.4, 0.09);
    o.start(t);
    o.stop(t + 0.12);
  }

  punch() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    this._env(o, t, 0.002, 0.5, 0.1);
    o.start(t); o.stop(t + 0.14);
  }

  explosion() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(60, t + 1.0);
    src.connect(f);
    this._env(f, t, 0.004, 1.4, 1.1);
    src.start(t);
    src.stop(t + 1.3);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    this._env(o, t, 0.004, 1.0, 0.8);
    o.start(t); o.stop(t + 0.9);
  }

  skid() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.playbackRate.value = 0.6;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 1.4;
    src.connect(f);
    this._env(f, t, 0.02, 0.16, 0.24);
    src.start(t);
    src.stop(t + 0.3);
  }

  pickup(coin = true) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const notes = coin ? [880, 1320] : [520, 780, 1040];
    notes.forEach((fr, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = fr;
      this._env(o, t + i * 0.07, 0.005, 0.22, 0.16);
      o.start(t + i * 0.07);
      o.stop(t + i * 0.07 + 0.2);
    });
  }

  hurt() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
    this._env(o, t, 0.003, 0.3, 0.2);
    o.start(t); o.stop(t + 0.24);
  }

  jack() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    [340, 260].forEach((fr, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = fr;
      this._env(o, t + i * 0.09, 0.004, 0.2, 0.12);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.16);
    });
  }

  honk() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 460;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.03);
    g.gain.setValueAtTime(0.16, t + 0.24);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.34);
  }

  /** deep sea freighter greeting — the m6 finale */
  shipHorn() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 65;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 97;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 240;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.35);
    g.gain.setValueAtTime(0.5, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 2);
    o2.start(t); o2.stop(t + 2);
  }

  footstep(swim = false) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.playbackRate.value = swim ? 1.6 : 2.8;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = swim ? 600 : 1500;
    src.connect(f);
    this._env(f, t, 0.002, swim ? 0.1 : 0.05, 0.06);
    src.start(t);
    src.stop(t + 0.09);
  }

  fail() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    [392, 311, 233].forEach((fr, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      this._env(o, t + i * 0.16, 0.01, 0.24, 0.3);
      o.start(t + i * 0.16);
      o.stop(t + i * 0.16 + 0.34);
    });
  }

  fanfare() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((fr, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = fr;
      this._env(o, t + i * 0.11, 0.01, 0.26, 0.35);
      o.start(t + i * 0.11);
      o.stop(t + i * 0.11 + 0.4);
    });
  }

  /** radio station switch: quick dial sweep */
  jingle() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(1760, t + 0.22);
    this._env(o, t, 0.01, 0.14, 0.26);
    o.start(t); o.stop(t + 0.3);
  }

  /** garage roller door rumble */
  door() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.playbackRate.value = 0.5;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 180;
    src.connect(f);
    this._env(f, t, 0.05, 0.3, 1.2);
    src.start(t);
    src.stop(t + 1.4);
  }

  // ---------------------------------------------------------------- engine
  engineStart() {
    if (!this.ready() || this.engine) return;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 60;
    const o2 = this.ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 30;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o.start(); o2.start();
    this.engine = { o, o2, f, g };
  }

  engineUpdate(speed01, rev01 = 0) {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    const e = this.engine;
    // idle is alive: a slow lumpy wobble around base pitch
    const idleWobble = speed01 < 0.05 ? Math.sin(t * 9) * 4 + Math.sin(t * 23) * 2 : 0;
    const base = 46 + speed01 * 150 + rev01 * 30 + idleWobble;
    e.o.frequency.setTargetAtTime(base, t, 0.06);
    e.o2.frequency.setTargetAtTime(base * 0.5, t, 0.06);
    e.f.frequency.setTargetAtTime(260 + speed01 * 900, t, 0.08);
    e.g.gain.setTargetAtTime(0.05 + speed01 * 0.1, t, 0.1);
  }

  engineStop() {
    if (!this.engine) return;
    try {
      const e = this.engine;
      e.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      setTimeout(() => { try { e.o.stop(); e.o2.stop(); } catch (err) { /* already stopped */ } }, 300);
    } catch (err) { /* context gone */ }
    this.engine = null;
  }

  // ---------------------------------------------------------------- siren
  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenNodes && this.ready()) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      const g = this.ctx.createGain();
      g.gain.value = 0;
      o.connect(g); g.connect(this.master);
      o.start();
      this.sirenNodes = { o, g, t0: this.ctx.currentTime };
    }
    if (!on && this.sirenNodes) {
      const s = this.sirenNodes;
      try {
        s.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        setTimeout(() => { try { s.o.stop(); } catch (e) { /* gone */ } }, 300);
      } catch (e) { /* gone */ }
      this.sirenNodes = null;
    }
    if (on && this.sirenNodes) {
      const s = this.sirenNodes;
      const ph = (this.ctx.currentTime - s.t0) % 1.4;
      const freq = ph < 0.7 ? 700 : 950;
      s.o.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.03);
      s.g.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.1);
    }
  }

  // ---------------------------------------------------------------- music
  /** stations sequenced by radio.js; R cycles them in game.js */
  setStation(s) {
    this.station = s % 2;
    while (this.radio.stationIdx !== this.station) this.radio.next();
  }

  nextStation() {
    this.radio.next();
    this.station = this.radio.stationIdx;
    return this.station;
  }

  stationName() {
    return this.radio.stationName();
  }

  /** drum voice for the radio sequencer */
  drum(t, kind) {
    if (!this.ctx) return;
    if (kind === 'kick') {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.11);
      this._env(o, t, 0.002, 0.5, 0.13);
      o.start(t); o.stop(t + 0.16);
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    if (kind === 'snare') {
      f.frequency.value = 1400;
      this._env(f, t, 0.002, 0.22, 0.12);
      src.start(t); src.stop(t + 0.16);
    } else { // hat
      f.frequency.value = 6500;
      this._env(f, t, 0.001, 0.08, 0.04);
      src.start(t); src.stop(t + 0.07);
    }
    src.connect(f);
  }

  /** call every frame; the radio sequencer schedules ahead */
  updateMusic() {
    if (!this.music.on || !this.ready()) return;
    this.radio.update();
  }

  /** call every frame; the radio sequencer schedules ahead */
  setMusic(on) {
    if (on && !this.music.on) {
      this.music.on = true;
      this.radio.start();
    } else if (!on && this.music.on) {
      this.music.on = false;
      this.radio.stop();
    }
  }

  _note(t, freq, dur, type, vol, filt = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let dst = g;
    if (filt) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filt;
      g.connect(f);
      dst = f;
    }
    o.connect(g);
    dst.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- heli/thunder
  /** helicopter rotor: looped thump; on=true with distance falloff */
  rotor(on, dx = 0, dy = 0) {
    if (!this.ctx) return;
    if (on && !this.rotorNodes && this.ready()) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer();
      src.loop = true;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 13;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.5;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 240;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
      lfo.start();
      this.rotorNodes = { src, lfo, g };
    }
    if (!on && this.rotorNodes) {
      const r = this.rotorNodes;
      try {
        r.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
        setTimeout(() => { try { r.src.stop(); r.lfo.stop(); } catch (e) { /* gone */ } }, 600);
      } catch (e) { /* gone */ }
      this.rotorNodes = null;
    }
    if (on && this.rotorNodes) {
      const d = Math.hypot(dx, dy);
      const vol = Math.max(0, 0.22 - d / 4000);
      this.rotorNodes.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.15);
    }
  }

  thunder() {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.playbackRate.value = 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(50, t + 2.2);
    src.connect(f);
    this._env(f, t, 0.06, 0.8, 2.4);
    src.start(t);
    src.stop(t + 2.6);
  }
}
