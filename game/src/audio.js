// ============================================================================
// VICE PALMS — audio.js
// 100% synthesized WebAudio: engine drone tied to speed, gunshots, sirens,
// explosions, pickups, UI stings and a looping synthwave backing track
// (sequenced from the game loop — no timers, no files, no network).
// Everything is created lazily after the first user gesture and can be
// globally muted (tests run muted).
// ============================================================================

import { AUDIO } from './config.js';
import { clamp, lerp } from './util.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi -> Hz

// 16-step synthwave basslines, one per radio station (midi, -1 = rest)
const BASS_PATTERNS = [
  [33, -1, 33, 45, -1, 33, 31, -1, 28, -1, 28, 40, -1, 31, 33, -1],
  [36, -1, 36, 43, -1, 36, 41, -1, 36, -1, 36, 43, 45, -1, 43, -1],
  [31, 31, -1, 31, 38, -1, 31, -1, 29, 29, -1, 29, 36, -1, 29, -1],
];
const BASS = BASS_PATTERNS[0];
const CHORDS = [ // per-bar triads (midi)
  [57, 60, 64],   // A minor
  [53, 57, 60],   // F major
  [48, 52, 55],   // C major
  [55, 59, 62],   // G major
];

export class AudioSys {
  constructor(game, muted) {
    this.game = game;
    this.muted = !!muted;
    this.ctx = null;
    this.master = null;
    this.engine = null;      // {osc1, osc2, gain, filter}
    this.siren = null;       // {osc, gain, lfo}
    this.sirenOn = false;
    this.musicStep = 0;
    this.nextNoteTime = 0;
    this.musicOn = false;
    this.started = false;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : AUDIO.MASTER, this.ctx.currentTime, 0.05);
    }
  }

  // Create the context on first gesture; safe to call every frame.
  ensure() {
    if (this.started) return;
    if (this.muted) return; // tests: never build the graph
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.muted = true;
      return;
    }
    if (this.ctx.state === 'suspended') { this.ctx.resume().catch(() => {}); }
    this.master = this.ctx.createGain();
    this.master.gain.value = AUDIO.MASTER;
    this.master.connect(this.ctx.destination);
    this.started = true;
    this.buildEngine();
    this.buildSiren();
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ------------------------------------------------------------------ engine
  buildEngine() {
    const ctx = this.ctx;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 50;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 25;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc1.start();
    osc2.start();
    this.engine = { osc1, osc2, gain, filter };
  }

  buildSiren() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 700;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 1.1;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    lfo.start();
    this.siren = { osc, gain };
  }

  setSiren(on) {
    this.sirenOn = on;
  }

  // Per-frame mix: engine follows the player's car, siren follows proximity.
  update(dt) {
    const g = this.game;
    if (!this.ctx || this.muted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    // Engine
    const p = g.player;
    const car = p.inCar;
    if (this.engine) {
      if (car && !car.wrecked) {
        const sp = car.speed();
        const rev = car.forwardSpeed() < -0.5 ? 0.7 : 1;
        const f = lerp(AUDIO.ENGINE_FLOOR, AUDIO.ENGINE_CEIL, clamp(sp / 34, 0, 1)) * rev;
        this.engine.osc1.frequency.setTargetAtTime(f, this.now(), 0.06);
        this.engine.osc2.frequency.setTargetAtTime(f / 2, this.now(), 0.06);
        this.engine.filter.frequency.setTargetAtTime(260 + sp * 22, this.now(), 0.1);
        this.engine.gain.gain.setTargetAtTime(0.11 + clamp(sp / 40, 0, 0.1), this.now(), 0.08);
      } else {
        this.engine.gain.gain.setTargetAtTime(0, this.now(), 0.2);
      }
    }

    // Siren: volume by nearest active cruiser distance.
    if (this.siren) {
      let nearest = Infinity;
      for (const c of g.police.cruisers) {
        if (c.remove || c.wrecked || !c.sirenOn) continue;
        nearest = Math.min(nearest, Math.hypot(c.x - p.x, c.y - p.y));
      }
      if (this.sirenOn && nearest < AUDIO.SIREN_R) {
        const v = (1 - nearest / AUDIO.SIREN_R) * 0.14;
        this.siren.gain.gain.setTargetAtTime(v, this.now(), 0.15);
      } else {
        this.siren.gain.gain.setTargetAtTime(0, this.now(), 0.3);
      }
    }

    // Music
    if (this.musicOn && g.state === 'playing') this.scheduleMusic();
  }

  // ------------------------------------------------------------------ music
  startMusic() {
    this.musicOn = true;
    if (this.ctx) this.nextNoteTime = this.ctx.currentTime + 0.1;
  }

  // Police helicopter rotor: a looping band-passed noise bed.
  rotor(on) {
    if (!this.ctx || this.muted) return;
    if (on && !this._rotor) {
      const ctx = this.ctx;
      const len = ctx.sampleRate; // 1 s loop
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 120;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.value = 0.0;
      // Chop the noise with an LFO — whump-whump.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 12;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.1;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start();
      lfo.start();
      this._rotor = { src, g, lfo };
    }
    if (this._rotor) {
      const t = this.ctx.currentTime;
      this._rotor.g.gain.setTargetAtTime(on ? 0.14 : 0, t, 0.5);
      if (!on) {
        const r = this._rotor;
        setTimeout(() => {
          try { r.src.stop(); r.lfo.stop(); } catch (e) { /* already stopped */ }
        }, 1200);
        this._rotor = null;
      }
    }
  }

  scheduleMusic() {
    const ctx = this.ctx;
    const stepDur = (60 / AUDIO.MUSIC_BPM) / 2; // 8th notes
    while (this.nextNoteTime < ctx.currentTime + 0.3) {
      this.scheduleStep(this.musicStep, this.nextNoteTime);
      this.nextNoteTime += stepDur;
      this.musicStep = (this.musicStep + 1) % 64;
    }
  }

  scheduleStep(step, when) {
    const ctx = this.ctx;
    const s16 = step % 16;
    const bar = Math.floor(step / 16) % 4;

    // Kick on beats
    if (s16 % 4 === 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, when);
      o.frequency.exponentialRampToValueAtTime(42, when + 0.11);
      g.gain.setValueAtTime(0.5, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
      o.connect(g); g.connect(this.master);
      o.start(when); o.stop(when + 0.2);
    }
    // Hat on off-8ths
    if (s16 % 2 === 1) {
      const b = this.noiseBurst(when, 0.035, 6000, 0.06 + (s16 % 4 === 3 ? 0.03 : 0));
    }
    // Bass
    const pat = BASS_PATTERNS[this.game.radio % BASS_PATTERNS.length];
    const bn = pat[s16];
    if (bn >= 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900;
      o.type = 'sawtooth';
      o.frequency.value = NOTE(bn);
      g.gain.setValueAtTime(0.16, when);
      g.gain.exponentialRampToValueAtTime(0.01, when + stepDur_() * 0.9);
      o.connect(f); f.connect(g); g.connect(this.master);
      o.start(when); o.stop(when + stepDur_());
    }
    // Pad chord each bar
    if (s16 === 0) {
      for (const n of CHORDS[bar]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = NOTE(n + 12);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(0.05, when + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, when + stepDur_() * 14);
        o.connect(g); g.connect(this.master);
        o.start(when); o.stop(when + stepDur_() * 15);
      }
    }
  }

  noiseBurst(when, dur, hp, vol) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(when);
    return src;
  }

  // -------------------------------------------------------------------- sfx
  shot(cop) {
    if (!this.ctx || this.muted) return;
    const when = this.now();
    this.noiseBurst(when, 0.09, 900, cop ? 0.16 : 0.22);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(280, when);
    o.frequency.exponentialRampToValueAtTime(60, when + 0.08);
    g.gain.setValueAtTime(0.2, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.09);
    o.connect(g); g.connect(this.master);
    o.start(when); o.stop(when + 0.1);
  }

  explosion() {
    if (!this.ctx || this.muted) return;
    const when = this.now();
    this.noiseBurst(when, 0.9, 60, 0.5);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, when);
    o.frequency.exponentialRampToValueAtTime(30, when + 0.7);
    g.gain.setValueAtTime(0.6, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.8);
    o.connect(g); g.connect(this.master);
    o.start(when); o.stop(when + 0.9);
  }

  horn() {
    if (!this.ctx || this.muted) return;
    const when = this.now();
    for (const f of [392, 466]) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.05, when);
      g.gain.setTargetAtTime(0.0001, when + 0.18, 0.05);
      o.connect(g); g.connect(this.master);
      o.start(when); o.stop(when + 0.4);
    }
  }

  sirenBlip() {
    if (!this.ctx || this.muted) return;
    const when = this.now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(500, when);
    o.frequency.linearRampToValueAtTime(900, when + 0.25);
    g.gain.setValueAtTime(0.08, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.3);
    o.connect(g); g.connect(this.master);
    o.start(when); o.stop(when + 0.32);
  }

  thunder() {
    if (!this.ctx || this.muted) return;
    const when = this.now();
    this.noiseBurst(when, 1.6, 90, 0.4);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(52, when);
    o.frequency.exponentialRampToValueAtTime(24, when + 1.4);
    g.gain.setValueAtTime(0.4, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 1.6);
    o.connect(g); g.connect(this.master);
    o.start(when); o.stop(when + 1.7);
  }

  pickup() {
    if (!this.ctx || this.muted) return;
    const when = this.now();
    [660, 880, 1320].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const t0 = when + i * 0.07;
      g.gain.setValueAtTime(0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + 0.14);
    });
  }

  hurt() {
    if (!this.ctx || this.muted) return;
    const when = this.now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, when);
    o.frequency.exponentialRampToValueAtTime(70, when + 0.18);
    g.gain.setValueAtTime(0.16, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.2);
    o.connect(g); g.connect(this.master);
    o.start(when); o.stop(when + 0.22);
  }

  swing() {
    if (!this.ctx || this.muted) return;
    this.noiseBurst(this.now(), 0.06, 2400, 0.06);
  }

  punchHit() {
    if (!this.ctx || this.muted) return;
    const when = this.now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, when);
    o.frequency.exponentialRampToValueAtTime(50, when + 0.09);
    g.gain.setValueAtTime(0.3, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.1);
    o.connect(g); g.connect(this.master);
    o.start(when); o.stop(when + 0.12);
  }

  doorSlam() {
    if (!this.ctx || this.muted) return;
    this.noiseBurst(this.now(), 0.05, 300, 0.14);
  }

  // Tire-skid hiss while the player drifts: a looping filtered noise, gain
  // driven each frame by the car's lateral slip.
  setSkid(on) {
    if (!this.ctx || this.muted) return;
    if (on && !this._skid) {
      const ctx = this.ctx;
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start();
      this._skid = { src, g };
    }
    if (this._skid) {
      this._skid.g.gain.setTargetAtTime(on ? 0.12 : 0, this.now(), 0.08);
    }
  }

  pass() {
    if (!this.ctx || this.muted) return;
    const when = this.now();
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const t0 = when + i * 0.12;
      g.gain.setValueAtTime(0.16, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + 0.55);
    });
  }

  fail() {
    if (!this.ctx || this.muted) return;
    const when = this.now();
    [392, 330, 262].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const t0 = when + i * 0.16;
      g.gain.setValueAtTime(0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + 0.45);
    });
  }
}

function stepDur_() {
  return (60 / AUDIO.MUSIC_BPM) / 2;
}
