// audio.js — all-synthesized WebAudio: engine, sirens, guns, explosions, synthwave loop.
// Audio only ever starts after a user gesture; ?mute=1 keeps the master gain at 0 forever.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.started = false;
    this.engine = null;   // { osc, gain, filter }
    this.siren = null;    // { osc, gain, lfo }
    this.musicGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.engineActive = false;
  }

  /** Must be called from a user gesture or after ?shot= boot when explicitly allowed. */
  start(muted) {
    if (this.started) return;
    this.started = true;
    this.muted = !!muted;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.34;
      this.musicGain.connect(this.master);
    } catch (e) {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  toggle() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  ensure() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ------------------------------------------------------------- engine
  engineOn(on, rpm) {
    if (!this.ctx || this.muted) return;
    if (on && !this.engine) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const sub = this.ctx.createOscillator();
      sub.type = 'square';
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start();
      sub.start();
      this.engine = { osc, sub, gain, filter };
    }
    if (!on && this.engine) {
      try { this.engine.osc.stop(); this.engine.sub.stop(); } catch (e) { /* already stopped */ }
      this.engine = null;
      return;
    }
    if (on && this.engine) {
      const f = 42 + rpm * 130;
      const t = this.ctx.currentTime;
      this.engine.osc.frequency.setTargetAtTime(f, t, 0.05);
      this.engine.sub.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      this.engine.filter.frequency.setTargetAtTime(400 + rpm * 900, t, 0.08);
      this.engine.gain.gain.setTargetAtTime(0.05 + rpm * 0.05, t, 0.08);
    }
  }

  // ------------------------------------------------------------- one-shots
  blip(freq, dur, type, vol, slide) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, filterFrom, filterTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFrom, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, filterTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  gunshot() {
    this.noiseBurst(0.16, 0.5, 5200, 300);
    this.blip(210, 0.1, 'square', 0.16, 60);
  }

  punch() {
    this.noiseBurst(0.09, 0.28, 900, 180);
  }

  explosion() {
    this.noiseBurst(1.4, 0.9, 2400, 40);
    this.blip(90, 0.9, 'sine', 0.5, 28);
  }

  crash(force) {
    this.noiseBurst(0.22, Math.min(0.7, 0.18 + force * 0.4), 1800, 160);
  }

  pickup() {
    this.blip(660, 0.09, 'square', 0.18);
    setTimeout(() => this.blip(990, 0.12, 'square', 0.18), 90);
  }

  cash() {
    this.blip(880, 0.08, 'triangle', 0.2);
    setTimeout(() => this.blip(1175, 0.09, 'triangle', 0.2), 80);
    setTimeout(() => this.blip(1568, 0.14, 'triangle', 0.2), 160);
  }

  fail() {
    this.blip(320, 0.25, 'sawtooth', 0.2, 110);
  }

  star() {
    this.blip(1200, 0.06, 'square', 0.14);
    setTimeout(() => this.blip(1500, 0.08, 'square', 0.14), 70);
  }

  wasted() {
    this.blip(300, 1.4, 'sawtooth', 0.3, 40);
  }

  horn() {
    this.blip(340, 0.3, 'square', 0.12);
    this.blip(425, 0.3, 'square', 0.12);
  }

  // ------------------------------------------------------------- siren (shared)
  sirenOn(on) {
    if (!this.ctx || this.muted) {
      if (this.siren) {
        try { this.siren.osc.stop(); } catch (e) { /* noop */ }
        this.siren = null;
      }
      return;
    }
    if (on && !this.siren) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const gain = this.ctx.createGain();
      gain.gain.value = 0.05;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 1.6;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.frequency.value = 700;
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      lfo.start();
      this.siren = { osc, lfo, gain };
    } else if (!on && this.siren) {
      try { this.siren.osc.stop(); this.siren.lfo.stop(); } catch (e) { /* noop */ }
      this.siren = null;
    }
  }

  // ------------------------------------------------------------- synthwave loop
  musicOn(on) {
    if (!this.ctx || !this.musicGain) return;
    if (on && !this.musicTimer) {
      this.nextBeat = this.ctx.currentTime + 0.1;
      this.musicStep = 0;
      this.musicTimer = setInterval(() => this.scheduleMusic(), 400);
    } else if (!on && this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  scheduleMusic() {
    if (!this.ctx || this.muted) return;
    const bpm = 104;
    const beat = 60 / bpm / 2; // eighth notes
    while (this.nextBeat < this.ctx.currentTime + 1.2) {
      const s = this.musicStep % 32;
      const bar = Math.floor(this.musicStep / 32) % 4;
      const t = this.nextBeat;
      // bass line (A minor-ish progression)
      const roots = [55, 55, 65.4, 73.4]; // A1 A1 C2 D2
      if (s % 4 === 0 || s % 8 === 3) {
        this.musicNote(roots[Math.floor(s / 8)] * 2, t, beat * 1.8, 'sawtooth', 0.16, 480);
      }
      // lead arp every other bar
      if (bar % 2 === 1 && (s % 2 === 0)) {
        const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
        const n = scale[(s * 3 + bar) % scale.length];
        this.musicNote(n * 2, t, beat * 0.9, 'square', 0.05, 2200);
      }
      // pad chord at each bar
      if (s % 8 === 0) {
        const root = roots[Math.floor(s / 8)];
        this.musicNote(root * 4, t, beat * 7, 'triangle', 0.035, 900);
        this.musicNote(root * 6, t, beat * 7, 'triangle', 0.03, 900);
      }
      // hats
      if (s % 2 === 1) this.musicHat(t);
      // kick
      if (s % 4 === 0) this.musicKick(t);
      this.nextBeat += beat;
      this.musicStep++;
    }
  }

  musicNote(freq, t, dur, type, vol, cutoff) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  musicHat(t) {
    const n = Math.floor(this.ctx.sampleRate * 0.05);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6500;
    const g = this.ctx.createGain();
    g.gain.value = 0.06;
    src.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    src.start(t);
  }

  musicKick(t) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}
