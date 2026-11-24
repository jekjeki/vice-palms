// audio.js — fully synthesized WebAudio: engine, siren, gunshots, explosions,
// pickups, and a looping synthwave bed. Starts muted when ?mute=1 or when the
// stored preference says so; M toggles.

import { CFG, ctx } from './config.js';
import { clamp } from './util.js';

const MUTE_KEY = 'vp_mute';

export class AudioSys {
  constructor() {
    this.ac = null;
    this.master = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1' ||
        new URLSearchParams(location.search).get('mute') === '1';
      if (new URLSearchParams(location.search).get('mute') === '1') {
        localStorage.setItem(MUTE_KEY, '1');
      }
    } catch { /* private mode */ }

    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicGain = null;
    this.nextBeat = 0;
    this.beatIdx = 0;
    this.noiseBuf = null;
    this.lastShot = 0;
    this.sirenLevel = 0;
  }

  // must be called from a user-gesture handler
  init() {
    if (this.ac) return;
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    this.master = this.ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ac.destination);

    // shared noise buffer
    const len = this.ac.sampleRate * 1.2;
    this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // engine: saw → lowpass → gain
    this.engineOsc = this.ac.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineFilter = this.ac.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 500;
    this.engineGain = this.ac.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    // siren: sine sweepable
    this.sirenOsc = this.ac.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ac.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();

    // music bed
    this.musicGain = this.ac.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);

    // rain ambience: looped filtered noise
    this.rainGain = this.ac.createGain();
    this.rainGain.gain.value = 0;
    const rainSrc = this.ac.createBufferSource();
    rainSrc.buffer = this.noiseBuf;
    rainSrc.loop = true;
    const rainF = this.ac.createBiquadFilter();
    rainF.type = 'lowpass';
    rainF.frequency.value = 1100;
    rainSrc.connect(rainF).connect(this.rainGain).connect(this.master);
    rainSrc.start();
    this.nextBeat = this.ac.currentTime + 0.1;
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    ctx.subtitle(this.muted ? 'Audio muted' : 'Audio on', 1.2);
  }

  // ------------------------------------------------------------- update ---
  update(dt, S) {
    if (!this.ac || this.muted) return;
    const t = this.ac.currentTime;
    const p = S.player;

    // engine follows the player's car
    if (p.inCar && !p.inCar.dead) {
      const car = p.inCar;
      const f = clamp(car.speed / car.spec.max, 0, 1);
      this.engineOsc.frequency.value = 55 + f * 190 + Math.sin(t * 30) * 3;
      this.engineFilter.frequency.value = 380 + f * 1400;
      this.engineGain.gain.value = 0.10 + f * 0.10;
    } else {
      this.engineGain.gain.value = Math.max(0, this.engineGain.gain.value - dt * 3);
    }

    // siren: nearest cruiser proximity + alternating tone
    let near = 1e9;
    for (const car of ctx.cars) {
      if (car.ai === 'police' && !car.dead) {
        const d = Math.hypot(car.x - p.x, car.y - p.y);
        if (d < near) near = d;
      }
    }
    if (near < 1200 && ctx.police.level > 0) {
      const ph = Math.floor(t * 3.2) % 2;
      this.sirenOsc.frequency.value = ph ? 690 : 940;
      this.sirenGain.gain.value = clamp(1 - near / 1200, 0, 1) * 0.12;
    } else {
      this.sirenGain.gain.value = Math.max(0, this.sirenGain.gain.value - dt * 2);
    }

    // rain ambience follows the storm
    if (this.rainGain) {
      const rain = ctx.weather ? ctx.weather.rain : 0;
      this.rainGain.gain.value = clamp(rain, 0, 1) * 0.05;
    }

    // helicopter rotor thump when air support is up
    if (!this.heliOsc && this.ac) {
      this.heliOsc = this.ac.createOscillator();
      this.heliOsc.type = 'triangle';
      this.heliOsc.frequency.value = 26;
      this.heliLfo = this.ac.createOscillator();
      this.heliLfo.type = 'sine';
      this.heliLfo.frequency.value = 11;
      this.heliLfoGain = this.ac.createGain();
      this.heliLfoGain.gain.value = 14;
      this.heliLfo.connect(this.heliLfoGain).connect(this.heliOsc.frequency);
      this.heliGain = this.ac.createGain();
      this.heliGain.gain.value = 0;
      this.heliOsc.connect(this.heliGain).connect(this.master);
      this.heliOsc.start();
      this.heliLfo.start();
    }
    if (this.heliGain) {
      const heli = ctx.police && ctx.police.heli;
      if (heli) {
        const d = Math.hypot(heli.x - p.x, heli.y - p.y);
        this.heliGain.gain.value = clamp(1 - d / 1100, 0, 1) * 0.22;
      } else {
        this.heliGain.gain.value = Math.max(0, this.heliGain.gain.value - dt * 2);
      }
    }

    // synthwave sequencer (look-ahead scheduling)
    this.scheduleMusic(t, S);
  }

  scheduleMusic(t, S) {
    const bpm = 104;
    const beat = 60 / bpm;
    const step = beat / 2;                    // 8th notes
    // A-minor-ish progression: Am F C G
    const chords = [
      [110.0, 130.81, 164.81],   // A2 C3 E3
      [87.31, 110.0, 130.81],    // F2 A2 C3
      [130.81, 164.81, 196.0],   // C3 E3 G3
      [98.0, 123.47, 146.83],    // G2 B2 D3
    ];
    while (this.nextBeat < t + 0.25) {
      const bt = this.nextBeat;
      const i = this.beatIdx;
      const bar = (i / 8) | 0;
      const chord = chords[bar % 4];
      const inBar = i % 8;

      // bass on every 8th, gated
      if (inBar % 2 === 0) {
        this.note(chord[0] / 2, bt, step * 0.9, 'sawtooth', 0.16, 300);
      }
      // pad chord at bar start
      if (inBar === 0) {
        for (const f of chord) this.note(f, bt, beat * 2.1, 'sawtooth', 0.035, 900, true);
      }
      // arp sparkle
      const arpN = chord[(i * 2) % 3] * 4;
      if (inBar % 1 === 0 && (i % 3) !== 2) {
        this.note(arpN, bt, step * 0.5, 'square', 0.018, 2400);
      }
      // kick on quarters
      if (inBar % 2 === 0) this.kick(bt);
      // hats on off-8ths
      if (inBar % 2 === 1) this.hat(bt);

      this.nextBeat += step;
      this.beatIdx++;
    }
  }

  note(freq, t, dur, type, vol, cutoff, detune = false) {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (detune) o.detune.value = (Math.random() - 0.5) * 12;
    const f = this.ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.musicGain || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  kick(t) {
    const o = this.ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.34, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(this.musicGain || this.master);
    o.start(t);
    o.stop(t + 0.2);
  }

  hat(t) {
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6500;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f).connect(g).connect(this.musicGain || this.master);
    src.start(t);
    src.stop(t + 0.08);
  }

  // ---------------------------------------------------------------- sfx ---
  play(name, x, y) {
    if (!this.ac || this.muted) return;
    const t = this.ac.currentTime;
    const p = ctx.player;
    let vol = 1;
    if (p && x !== undefined) {
      const d = Math.hypot(x - p.x, y - p.y);
      vol = clamp(1 - d / 900, 0.05, 1);
    }
    switch (name) {
      case 'shot': {
        const src = this.ac.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = this.ac.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1400 + Math.random() * 600;
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0.35 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        src.connect(f).connect(g).connect(this.master);
        src.start(t); src.stop(t + 0.13);
        // crack
        const o = this.ac.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(60, t + 0.05);
        const g2 = this.ac.createGain();
        g2.gain.setValueAtTime(0.16 * vol, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        o.connect(g2).connect(this.master);
        o.start(t); o.stop(t + 0.08);
        break;
      }
      case 'shotgun': {
        // wide boom: noise blast + low thump
        const src = this.ac.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = this.ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(3200, t);
        f.frequency.exponentialRampToValueAtTime(300, t + 0.22);
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0.55 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
        src.connect(f).connect(g).connect(this.master);
        src.start(t); src.stop(t + 0.3);
        const o = this.ac.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
        const g2 = this.ac.createGain();
        g2.gain.setValueAtTime(0.3 * vol, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g2).connect(this.master);
        o.start(t); o.stop(t + 0.2);
        break;
      }
      case 'thunder': {
        // distant rolling rumble
        const src = this.ac.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const f = this.ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(220, t);
        f.frequency.exponentialRampToValueAtTime(60, t + 2.4);
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.35, t + 0.25);
        g.gain.exponentialRampToValueAtTime(0.001, t + 2.6);
        src.connect(f).connect(g).connect(this.master);
        src.start(t); src.stop(t + 2.8);
        break;
      }
      case 'explode': {
        const src = this.ac.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = this.ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(2600, t);
        f.frequency.exponentialRampToValueAtTime(90, t + 1.1);
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0.8 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.25);
        src.connect(f).connect(g).connect(this.master);
        src.start(t); src.stop(t + 1.3);
        const o = this.ac.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(70, t);
        o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
        const g2 = this.ac.createGain();
        g2.gain.setValueAtTime(0.6 * vol, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        o.connect(g2).connect(this.master);
        o.start(t); o.stop(t + 0.75);
        break;
      }
      case 'crash': {
        const src = this.ac.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = this.ac.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 900 + Math.random() * 500;
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0.3 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        src.connect(f).connect(g).connect(this.master);
        src.start(t); src.stop(t + 0.25);
        break;
      }
      case 'pickup': {
        const o = this.ac.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(620, t);
        o.frequency.setValueAtTime(930, t + 0.07);
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(g).connect(this.master);
        o.start(t); o.stop(t + 0.22);
        break;
      }
      case 'mission': {
        // little fanfare
        const notes = [392, 523.25, 659.25, 783.99];
        notes.forEach((n, i) => {
          const o = this.ac.createOscillator();
          o.type = 'triangle';
          o.frequency.value = n;
          const g = this.ac.createGain();
          const st = t + i * 0.13;
          g.gain.setValueAtTime(0.001, st);
          g.gain.linearRampToValueAtTime(0.22, st + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, st + 0.5);
          o.connect(g).connect(this.master);
          o.start(st); o.stop(st + 0.55);
        });
        break;
      }
      case 'star': {
        const o = this.ac.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(196, t);
        o.frequency.setValueAtTime(247, t + 0.09);
        o.frequency.setValueAtTime(330, t + 0.18);
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        o.connect(g).connect(this.master);
        o.start(t); o.stop(t + 0.5);
        break;
      }
      case 'punch':
      case 'door': {
        const src = this.ac.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = this.ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = name === 'punch' ? 420 : 800;
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        src.connect(f).connect(g).connect(this.master);
        src.start(t); src.stop(t + 0.1);
        break;
      }
      case 'hurt': {
        const o = this.ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(80, t + 0.12);
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.connect(g).connect(this.master);
        o.start(t); o.stop(t + 0.16);
        break;
      }
      case 'fire': {
        const src = this.ac.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = this.ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 500;
        const g = this.ac.createGain();
        g.gain.setValueAtTime(0.25 * vol, t);
        g.gain.linearRampToValueAtTime(0.001, t + 0.6);
        src.connect(f).connect(g).connect(this.master);
        src.start(t); src.stop(t + 0.65);
        break;
      }
      default: break; // horn, splash, siren-start, star-down: soft no-ops
    }
  }
}
