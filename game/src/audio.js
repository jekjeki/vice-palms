// Vice Palms — tiny WebAudio synth (muted by default; tests run muted)
export class AudioSys {
  constructor() { this.ctx = null; this.muted = true; this.engine = null; this.sirenT = 0; }
  ensure() {
    if (this.ctx || this.muted) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { this.muted = true; }
  }
  setMuted(m) { this.muted = m; if (!m) this.ensure(); if (m && this.ctx) { this.stopEngine(); } }
  blip(f = 660, dur = 0.07, type = 'square', vol = 0.08) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur = 0.2, vol = 0.3, lp = 4000) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.ctx.destination); src.start(t);
  }
  gunshot() { this.noise(0.12, 0.35, 5500); this.blip(180, 0.05, 'sawtooth', 0.1); }
  punch() { this.noise(0.08, 0.2, 900); }
  explosion() { this.noise(0.9, 0.6, 1400); this.blip(60, 0.5, 'sine', 0.3); }
  siren(dt, active) {
    this.sirenT += dt;
    if (active && !this.muted && this.ctx && this.sirenT > 0.6) {
      this.sirenT = 0;
      this.blip(active > 2 ? 920 : 720, 0.28, 'triangle', 0.05);
      setTimeout(() => this.blip(active > 2 ? 690 : 540, 0.28, 'triangle', 0.05), 300);
    }
  }
  engineSound(spd) {
    if (this.muted || !this.ctx) return;
    if (!this.engine) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sawtooth'; g.gain.value = 0.03; o.connect(g).connect(this.ctx.destination); o.start();
      this.engine = { o, g };
    }
    this.engine.o.frequency.setValueAtTime(55 + Math.abs(spd) * 0.35, this.ctx.currentTime);
  }
  stopEngine() {
    if (this.engine) { try { this.engine.o.stop(); } catch (e) { /* done */ } this.engine = null; }
  }
  update(dt, s) {
    if (!s.player) return;
    if (s.player.inCar) this.engineSound(s.player.inCar.spd); else this.stopEngine();
    this.siren(dt, s.wanted >= 1 && s.police.cops.length ? s.wanted : 0);
  }
}
