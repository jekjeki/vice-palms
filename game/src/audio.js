// audio.js — everything synthesized in WebAudio: engine, sirens, gunshots,
// explosions, pickups, and a synthwave radio loop. Muted in tests via S.muted.
import { S, dist, clamp, RADIO } from './core.js';

export const Audio = {
  ctx: null, master: null, ready: false,
  engine: null, siren: null, musicT: 0, step: 0,
  init() {
    if (this.ready) return;
    try {
      const C = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = C;
      this.master = C.createGain();
      this.master.gain.value = S.muted ? 0 : 0.55;
      this.master.connect(C.destination);
      // engine voice: saw → lowpass → gain
      const osc = C.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 55;
      const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      const g = C.createGain(); g.gain.value = 0;
      osc.connect(lp); lp.connect(g); g.connect(this.master); osc.start();
      this.engine = { osc, lp, g };
      // siren voice: square alternating two tones
      const so = C.createOscillator(); so.type = 'square'; so.frequency.value = 700;
      const sg = C.createGain(); sg.gain.value = 0;
      so.connect(sg); sg.connect(this.master); so.start();
      this.siren = { osc: so, g: sg, t: 0 };
      this.ready = true;
      // shared noise buffer
      const len = C.sampleRate * 1.2, buf = C.createBuffer(1, len, C.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch { /* audio unavailable — play silent */ }
  },
  setMuted(m) { if (this.master) this.master.gain.value = m ? 0 : 0.55; },
  vol(x, y, base = 1, rad = 900) {
    const d = dist(x, y, S.cam.x, S.cam.y);
    return base * clamp(1 - d / rad, 0, 1);
  },
  blip(type, freq, dur, vol, freqEnd) {
    if (!this.ready) return;
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(), g = C.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  burst(dur, vol, lpStart, lpEnd) {
    if (!this.ready) return;
    const C = this.ctx, t = C.currentTime;
    const src = C.createBufferSource(); src.buffer = this.noise;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(lpStart, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(40, lpEnd), t + dur);
    const g = C.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },
  sfx(e) {
    if (!this.ready || S.muted) return;
    const v = this.vol(e.x ?? S.cam.x, e.y ?? S.cam.y);
    if (v <= 0.01) return;
    switch (e.name) {
      case 'shot': this.burst(0.13, 0.5 * v, 5200, 700); this.blip('square', 210, 0.06, 0.2 * v, 60); break;
      case 'explosion': this.burst(0.85, 0.85 * v, 900, 55); this.blip('sine', 110, 0.6, 0.7 * v, 30); break;
      case 'punch': this.burst(0.07, 0.3 * v, 900, 200); break;
      case 'hurt': this.blip('sawtooth', 240, 0.12, 0.18 * v, 90); break;
      case 'door': this.burst(0.06, 0.25 * v, 700, 180); break;
      case 'pickup': this.blip('square', 720, 0.09, 0.22 * v, 1180); this.blip('square', 1180, 0.09, 0.18 * v, 1560); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip('square', f, 0.22, 0.22), i * 110)); break;
      case 'fail': [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip('sawtooth', f, 0.3, 0.2), i * 160)); break;
      case 'mission': [440, 660].forEach((f, i) => setTimeout(() => this.blip('triangle', f, 0.18, 0.2), i * 90)); break;
      case 'crash': this.burst(0.14, 0.3 * v, 1400, 220); break;
      case 'splash': this.burst(0.25, 0.3 * v, 1200, 300); break;
      case 'smg': this.burst(0.08, 0.34 * v, 4200, 900); this.blip('square', 260, 0.04, 0.14 * v, 90); break;
      case 'horn': this.blip('square', 384, 0.34, 0.2 * v, 368); this.blip('sawtooth', 486, 0.34, 0.1 * v, 470); break;
      case 'rotor': { // helicopter blade thump: low square pulses
        if (!this.ready || S.muted) return;
        const C = this.ctx, t0 = C.currentTime;
        for (let k = 0; k < 3; k++) this.blip('square', 78, 0.1, 0.16 * v, 62);
        this.burst(0.2, 0.1 * v, 500, 120);
        break;
      }
      case 'zone': this.blip('triangle', 560, 0.14, 0.12 * v, 720); break;
      case 'thunder': { // rolling rumble
        if (!this.ready || S.muted) return;
        this.burst(1.4, 0.5 * v, 420, 40);
        setTimeout(() => this.burst(0.9, 0.3 * v, 300, 50), 350);
        break;
      }
    }
  },
  update(dt) {
    if (!this.ready) return;
    // engine follows the player's car
    const p = S.player;
    if (p && p.inCar && !p.inCar.dead && S.mode === 'playing') {
      const car = p.inCar;
      const f = Math.abs(car.fwd);
      const target = clamp(f / car.spec.max, 0, 1);
      // bigger engines idle lower and rev deeper
      const tone = { compact: 0.9, sedan: 1, sports: 1.35, muscle: 0.7, taxi: 1, van: 0.6, pickup: 0.65, police: 1.15 }[car.type] ?? 1;
      this.engine.osc.frequency.value = (40 + target * 210) * tone;
      this.engine.lp.frequency.value = 280 + target * 1900 * tone;
      this.engine.g.gain.value += (0.16 + target * 0.12 - this.engine.g.gain.value) * Math.min(1, 6 * dt);
    } else if (this.engine.g.gain.value > 0.001) {
      this.engine.g.gain.value *= 1 - Math.min(1, 8 * dt);
    }
    // siren from the nearest pursuing cruiser
    let near = null, nd = 1e9;
    for (const c of S.cars) if (c.ai === 'police' && !c.dead && c.siren) {
      const d = dist(c.x, c.y, S.cam.x, S.cam.y);
      if (d < nd) { nd = d; near = c; }
    }
    if (near && nd < 1100 && S.mode === 'playing') {
      this.siren.t += dt;
      const hi = Math.floor(this.siren.t * 2.4) % 2 === 0;
      this.siren.osc.frequency.value = hi ? 760 : 590;
      this.siren.g.gain.value += (0.055 * clamp(1 - nd / 1100, 0, 1) - this.siren.g.gain.value) * Math.min(1, 8 * dt);
    } else if (this.siren.g.gain.value > 0.001) {
      this.siren.g.gain.value *= 1 - Math.min(1, 6 * dt);
    }
    this.music(dt);
  },
  // synthwave radio: 3 stations (switchable with R), bass arpeggio, pad, hats, kick.
  music(dt) {
    if (!this.ready || S.muted || S.mode === 'title') return;
    const C = this.ctx;
    const station = RADIO[S.radio % RADIO.length];
    const BPM = station.bpm, stepDur = 60 / BPM / 4; // 16ths
    this.musicT -= dt;
    while (this.musicT <= 0) {
      const t = C.currentTime + 0.05;
      const chords = station.chords;
      const bar = Math.floor(this.step / 16) % 4, s16 = this.step % 16;
      const chord = chords[bar];
      // bass on every 16th (octave pattern)
      const bassNote = chord[0] / 2 * (s16 % 4 === 3 ? 2 : 1);
      this.voice('sawtooth', bassNote, stepDur * 0.9, 0.05, t, 500);
      // pad chord at bar start
      if (s16 === 0) for (const f of chord) this.voice('sawtooth', f, stepDur * 14, station.pad, t, 900, 0.008);
      // kick on 0 and 8
      if (s16 % 8 === 0) this.kick(t);
      // hats on odd 16ths
      if (s16 % 2 === 1) this.hat(t, s16 % 4 === 3 ? 0.03 : 0.02);
      // lead sparkle, flavor varies per station
      if (s16 === 4 * station.lead) this.voice('square', chord[2] * 2, stepDur * 6, 0.014, t, 4000);
      if (station.lead === 0 && s16 === 10) this.voice('triangle', chord[1] * 4, stepDur * 3, 0.012, t, 6000);
      this.step = (this.step + 1) % 64;
      this.musicT += stepDur;
    }
  },
  nextStation() {
    S.radio = (S.radio + 1) % RADIO.length;
    this.step = 0; this.musicT = 0;
    return RADIO[S.radio].name;
  },
  voice(type, freq, dur, vol, t, lp) {
    const C = this.ctx;
    const o = C.createOscillator(), g = C.createGain(), f = C.createBiquadFilter();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = lp;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  kick(t) {
    const C = this.ctx, o = C.createOscillator(), g = C.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
  },
  hat(t, vol) {
    const C = this.ctx;
    const src = C.createBufferSource(); src.buffer = this.noise;
    const hp = C.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
    const g = C.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(hp); hp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.08);
  },
};
