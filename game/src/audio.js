// Vice Palms — all audio is synthesized with WebAudio; no files, no network.
// Everything no-ops safely when muted or before the first user gesture.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicGain = null;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.musicOn = false;
  }

  /** Create the context on first user gesture. Safe to call every frame. */
  ensure() {
    if (this.ctx || this.muted) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (m && this.ctx) {
      try { this.ctx.suspend(); } catch { /* ignore */ }
    }
    if (!m && this.ctx) {
      try { this.ctx.resume(); } catch { /* ignore */ }
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  ready() {
    return !this.muted && this.ctx && this.ctx.state === 'running';
  }

  // ------------------------------------------------------------- engine

  /** Continuous engine tone: on = driving, rate 0..1 maps to pitch. */
  engine(on, rate) {
    if (!this.ready()) return;
    try {
      if (on && !this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 700;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.05;
        this.engineOsc.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.master);
        this.engineOsc.start();
      }
      if (!on && this.engineOsc) {
        this.engineOsc.stop();
        this.engineOsc.disconnect();
        this.engineOsc = null;
        return;
      }
      if (on && this.engineOsc) {
        const t = this.ctx.currentTime;
        this.engineOsc.frequency.setTargetAtTime(58 + rate * 150, t, 0.06);
        this.engineGain.gain.setTargetAtTime(0.035 + rate * 0.05, t, 0.1);
      }
    } catch { /* ignore */ }
  }

  // ------------------------------------------------------------- siren

  /** Two-tone police siren while any cruiser is close. */
  siren(on) {
    if (!this.ready()) return;
    try {
      if (on && !this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'triangle';
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0.045;
        this.sirenLfo = this.ctx.createOscillator();
        this.sirenLfo.frequency.value = 1.4;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 190;
        this.sirenLfo.connect(lfoGain);
        lfoGain.connect(this.sirenOsc.frequency);
        this.sirenOsc.frequency.value = 700;
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.master);
        this.sirenOsc.start();
        this.sirenLfo.start();
      }
      if (!on && this.sirenOsc) {
        this.sirenOsc.stop();
        this.sirenLfo.stop();
        this.sirenOsc.disconnect();
        this.sirenOsc = null;
        return;
      }
    } catch { /* ignore */ }
  }

  // ------------------------------------------------------------- one-shots

  blip(freq, dur, type, vol, slide) {
    if (!this.ready()) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  }

  noiseBurst(dur, vol, filterFreq, slideTo) {
    if (!this.ready()) return;
    try {
      const t = this.ctx.currentTime;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(filterFreq, t);
      if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start(t);
    } catch { /* ignore */ }
  }

  gunshot() {
    this.noiseBurst(0.16, 0.5, 3200, 240);
    this.blip(160, 0.09, 'square', 0.12, 60);
  }

  explosion() {
    this.noiseBurst(0.9, 0.85, 900, 60);
    this.blip(70, 0.7, 'sine', 0.5, 28);
  }

  crash(v) {
    this.noiseBurst(0.22, Math.min(0.4, 0.1 + v * 0.003), 1400, 200);
  }

  pickup() {
    this.blip(660, 0.09, 'square', 0.12);
    setTimeout(() => this.blip(990, 0.12, 'square', 0.12), 70);
  }

  jingle(win) {
    if (win) {
      const seq = [392, 523, 659, 784];
      seq.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.16), i * 130));
    } else {
      const seq = [330, 262, 196];
      seq.forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.12), i * 170));
    }
  }

  // ------------------------------------------------------------- music

  /** Minimal radio: three stations, each a different synth pattern. */
  music(on) {
    this.musicOn = on;
    if (!on) return;
  }

  /** Cycle stations; returns the new one's name. */
  nextStation() {
    this.station = ((this.station || 0) + 1) % 3;
    this.musicStep = 0;
    return ['Vice Wave 103', 'Palm Funk', 'Night Drive FM'][this.station];
  }

  /** Called each frame; schedules notes a step at a time. */
  tickMusic(dt, t) {
    if (!this.musicOn || !this.ready()) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const station = this.station || 0;
    this.musicTimer = station === 2 ? 0.48 : 0.24;
    try {
      const bar = Math.floor(this.musicStep / 8) % 4;
      const step = this.musicStep % 8;
      const tt = this.ctx.currentTime;

      if (station === 0) {
        // Vice Wave 103: i-VI-III-VII arp + bass
        const roots = [110, 87.31, 130.81, 98];
        const root = roots[bar];
        const arp = [2, 3, 4, 3][step % 4];
        const freq = root * Math.pow(2, (arp * 3) / 12) * 2;
        this.note(freq, 'sawtooth', 0.05, 0.22);
        if (step % 4 === 0) this.note(root, 'triangle', 0.12, 0.4);
      } else if (station === 1) {
        // Palm Funk: sliding bass + off-beat stabs
        const roots = [98, 98, 130.81, 116.54];
        const root = roots[bar];
        if (step % 2 === 0) this.note(root * (step % 8 === 6 ? 1.5 : 1), 'square', 0.09, 0.18, 0.6);
        if (step === 3 || step === 7) this.note(root * 4, 'triangle', 0.05, 0.1);
      } else {
        // Night Drive FM: slow dark pads
        const chords = [[110, 130.81, 164.81], [87.31, 110, 130.81], [130.81, 155.56, 196], [98, 123.47, 146.83]];
        if (step === 0) {
          for (const f of chords[bar]) this.note(f, 'sine', 0.045, 1.7);
          this.note(chords[bar][0] / 2, 'triangle', 0.09, 1.7);
        }
      }
      this.musicStep++;
    } catch { /* ignore */ }
  }

  note(freq, type, vol, dur, slide) {
    if (!this.ready()) return;
    try {
      const tt = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, tt);
      if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, tt + dur);
      g.gain.setValueAtTime(vol, tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(tt);
      o.stop(tt + dur + 0.03);
    } catch { /* ignore */ }
  }

  /** Thunder: a long low rumble. */
  thunder() {
    this.noiseBurst(1.6, 0.4, 260, 45);
    this.blip(52, 1.1, 'sine', 0.22, 30);
  }

  /** Traffic horn: an irritated two-tone. */
  horn(far) {
    const v = far ? 0.05 : 0.12;
    this.blip(330, 0.18, 'triangle', v);
    this.blip(415, 0.18, 'triangle', v * 0.8);
  }
}
