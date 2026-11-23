// audio.js — fully synthesized WebAudio: engines, sirens, gunfire, booms and
// a looping synthwave bed. The game runs muted in every automated test, and
// the mute flag silences the master bus so nothing ever reaches the speakers.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = true;      // starts muted; unmute on first real user gesture
    this.unlocked = false;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engines = new Map(); // car.id -> engine voice
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.noiseBuf = null;
  }

  /** Lazily build the graph; safe to call repeatedly. */
  ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.0; // muted until unlocked
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.5;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.master);
      this.noiseBuf = this.makeNoise(this.ctx);
      this.unlocked = true;
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }

  makeNoise(ctx) {
    const len = ctx.sampleRate * 1.2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x3fffffff) - 1;
    }
    return buf;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  /** Called from a real user gesture (keydown/click) to satisfy autoplay. */
  unlock() {
    if (!this.ensure()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.userUnlocked) {
      this.userUnlocked = true;
      this.setMuted(this.muted); // apply current mute policy
    }
  }

  /** Request an unmute (only honored after a gesture). */
  requestUnmute() {
    if (this.userUnlocked) this.setMuted(false);
    else this.muted = false;
  }

  // ---- engine voices -----------------------------------------------------

  engineVoice(car) {
    if (!this.ctx || this.muted) return null;
    let v = this.engines.get(car.id);
    if (!v) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const sub = this.ctx.createOscillator();
      sub.type = 'square';
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      lp.Q.value = 2;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      osc.connect(lp); sub.connect(lp); lp.connect(g); g.connect(this.sfxGain);
      osc.start(); sub.start();
      v = { osc, sub, lp, g, car };
      this.engines.set(car.id, v);
    }
    return v;
  }

  dropEngine(id) {
    const v = this.engines.get(id);
    if (v) {
      try { v.osc.stop(); v.sub.stop(); } catch { /* already stopped */ }
      this.engines.delete(id);
    }
  }

  /** Per-frame engine update: pitch follows speed, volume follows throttle. */
  updateEngines(cars, dt, boats) {
    if (!this.ctx) return;
    const live = new Set();
    for (const car of cars) {
      if (car.dead || car.exploded) continue;
      const hasDriver = car.driver === 'player' ||
        (car.driver === 'ai' && car.spec.kind !== 'truck') ||
        car.driver === 'cop';
      if (!hasDriver) continue;
      live.add(car.id);
      const v = this.engineVoice(car);
      if (!v) continue;
      const spd = Math.abs(car.speed);
      const t = this.ctx.currentTime;
      const f = 46 + spd * 0.55 + (car.spec.kind === 'sport' ? 26 : 8);
      v.osc.frequency.setTargetAtTime(f, t, 0.06);
      v.sub.frequency.setTargetAtTime(f * 0.5, t, 0.06);
      v.lp.frequency.setTargetAtTime(400 + spd * 5, t, 0.1);
      const near = car.driver === 'player' ? 1 : 0.25;
      const vol = this.muted ? 0 : 0.05 + Math.min(0.12, spd * 0.0006);
      v.g.gain.setTargetAtTime(vol * near, t, 0.08);
    }
    // the player's boat, if any: a deeper chug on the same voice system
    if (boats) {
      for (const b of boats) {
        if (b.dead || b.driver !== 'player') continue;
        live.add(b.id);
        let v = this.engines.get(b.id);
        if (!v) {
          const osc = this.ctx.createOscillator();
          osc.type = 'sawtooth';
          const sub = this.ctx.createOscillator();
          sub.type = 'sine';
          const lp = this.ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 420;
          const g = this.ctx.createGain();
          g.gain.value = 0;
          osc.connect(lp); sub.connect(lp); lp.connect(g); g.connect(this.sfxGain);
          osc.start(); sub.start();
          v = { osc, sub, lp, g, car: b };
          this.engines.set(b.id, v);
        }
        const spd = Math.abs(b.speed);
        const t = this.ctx.currentTime;
        const f = 30 + spd * 0.3;
        v.osc.frequency.setTargetAtTime(f, t, 0.1);
        v.sub.frequency.setTargetAtTime(f * 0.5, t, 0.1);
        const vol = this.muted ? 0 : 0.05 + Math.min(0.1, spd * 0.0005);
        v.g.gain.setTargetAtTime(vol, t, 0.12);
      }
    }
    for (const id of [...this.engines.keys()]) {
      if (!live.has(id)) this.dropEngine(id);
    }
  }

  // ---- one-shots ---------------------------------------------------------

  playNoise(dur, freq, gainNow, type) {
    if (!this.ctx || this.muted) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(gainNow, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  playTone(freq, dur, gainNow, type, slideTo) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    o.type = type || 'triangle';
    o.frequency.value = freq;
    if (slideTo !== undefined) {
      o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), this.ctx.currentTime + dur);
    }
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(gainNow, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  gunshot() { this.playNoise(0.16, 1400, 0.5, 'highpass'); this.playTone(210, 0.08, 0.3, 'square', 60); }
  punch() { this.playNoise(0.09, 300, 0.35, 'lowpass'); }
  crash(force) { this.playNoise(0.25, 500 + force * 400, Math.min(0.6, 0.2 + force * 0.5), 'bandpass'); }
  explosion() {
    this.playNoise(0.9, 90, 0.9, 'lowpass');
    this.playTone(60, 0.7, 0.6, 'sine', 28);
    this.playNoise(0.4, 1800, 0.3, 'highpass');
  }
  jack() { this.playNoise(0.2, 900, 0.25, 'bandpass'); }
  cash() { this.playTone(880, 0.09, 0.25, 'square'); this.playTone(1320, 0.12, 0.2, 'square'); }
  pass() {
    this.playTone(523, 0.14, 0.3, 'triangle');
    setTimeout(() => this.playTone(659, 0.14, 0.3, 'triangle'), 120);
    setTimeout(() => this.playTone(784, 0.2, 0.3, 'triangle'), 240);
  }
  fail() { this.playTone(220, 0.3, 0.3, 'sawtooth', 110); }
  wasted() { this.playTone(180, 1.2, 0.4, 'sawtooth', 40); }
  starUp() { this.playTone(990, 0.12, 0.3, 'square', 1240); }

  // ---- siren -------------------------------------------------------------

  siren(on, pitch) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 1.4;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      lfo.start();
      this.sirenLfo = lfo;
      this.sirenOsc.frequency.value = 720;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.sfxGain);
      this.sirenOsc.start();
    }
    if (this.sirenGain) {
      const t = this.ctx.currentTime;
      const target = on && !this.muted ? 0.12 : 0;
      this.sirenGain.gain.setTargetAtTime(target, t, 0.15);
      if (this.sirenOsc && pitch !== undefined) {
        this.sirenOsc.frequency.setTargetAtTime(560 + pitch * 160, t, 0.3);
      }
    }
    if (!on && this.sirenOsc) {
      const osc = this.sirenOsc, lfo = this.sirenLfo;
      this.sirenOsc = null; this.sirenLfo = null;
      setTimeout(() => { try { osc.stop(); lfo.stop(); } catch { /* fine */ } }, 600);
    }
  }

  // ---- music: a small synthwave sequencer --------------------------------

  /** 8-step bass + arp loop, stepped from update(). dt in seconds. */
  updateMusic(dt) {
    if (!this.ctx || this.muted) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer += 0.22; // ~136 bpm 8ths
    const step = this.musicStep++ % 16;
    // A minor-ish progression
    const roots = [55, 55, 65.4, 65.4, 49, 49, 58.3, 58.3]; // A1 A1 C2 C2 G1 G1 Bb1...
    const root = roots[Math.floor(step / 2) % 8];
    if (step % 2 === 0) this.playTone(root, 0.2, 0.16, 'sawtooth', root * 0.98);
    const arpTable = [1, 2, 3, 2, 4, 3, 2, 1];
    const mult = arpTable[step % 8];
    this.playTone(root * 4 * (mult / 2), 0.12, 0.045, 'square');
    if (step % 4 === 2) this.playNoise(0.06, 6000, 0.05, 'highpass'); // hats
    if (step % 8 === 0) this.playTone(root * 0.5, 0.3, 0.2, 'sine', root * 0.4); // kick-ish
  }

  silenceAll() {
    if (!this.ctx) return;
    for (const id of [...this.engines.keys()]) this.dropEngine(id);
    this.siren(false);
  }
}
