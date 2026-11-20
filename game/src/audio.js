// All sound is synthesized with WebAudio: an engine pitch tied to speed, gunshots, sirens,
// explosions, UI blips, and a soft synthwave chord pad that loops under everything. No audio
// files anywhere.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
    this.engine = null;
    this.siren = null;
    this.nextBar = 0;
    this.bar = 0;
  }

  /** Must be called from a user gesture (the title screen) to unlock audio. */
  ensure() {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 1.0;
      this.sfxGain.connect(this.master);
      this.noiseBuf = this.makeNoise();
      this.buildEngine();
      this.buildSiren();
      this.started = true;
      this.nextBar = this.ctx.currentTime + 0.1;
    } catch { this.ctx = null; }
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  buildEngine() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    osc.connect(lp); osc2.connect(lp);
    lp.connect(gain); gain.connect(this.sfxGain);
    osc.start(); osc2.start();
    osc2.detune.value = 14;
    this.engine = { osc, osc2, gain, lp };
  }

  buildSiren() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain); gain.connect(this.sfxGain);
    osc.start();
    this.siren = { osc, gain, t: 0 };
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  /** Per-frame: engine pitch by the player's car, siren wail by cop proximity. */
  update(dt, game) {
    if (!this.started || !this.enabled) return;
    const p = game.player;
    const car = p.inCar;
    if (car && !car.dead && !car.exploded) {
      const ratio = Math.min(1, Math.abs(car.speed) / car.def.top);
      const f = 55 + ratio * 190 + (Math.abs(car.speed) > 5 ? 12 : 0);
      this.engine.osc.frequency.value = f;
      this.engine.osc2.frequency.value = f * 0.5;
      this.engine.lp.frequency.value = 300 + ratio * 900;
      this.engine.gain.gain.value = 0.06 + ratio * 0.05;
    } else {
      this.engine.gain.gain.value = 0;
    }
    // Siren: two-tone wail, volume by the nearest working cruiser.
    let near = 1;
    for (const c of game.police.cars) {
      if (c.dead || c.exploded) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      near = Math.min(near, Math.max(0, (d - 140) / 1100));
    }
    const on = game.wanted.stars > 0 && near < 1;
    if (on) {
      this.siren.t += dt;
      const hi = Math.floor(this.siren.t * 2.4) % 2;
      this.siren.osc.frequency.value = hi ? 940 : 640;
      this.siren.gain.gain.value = 0.05 * (1 - near);
    } else {
      this.siren.gain.gain.value = 0;
    }
    this.scheduleMusic();
  }

  scheduleMusic() {
    const ctx = this.ctx;
    const BAR = 2.4;
    const CHORDS = [
      [110, 220.0, 261.6, 329.6],   // Am
      [87.3, 174.6, 261.6, 349.2],  // F
      [98, 196.0, 246.9, 329.6],    // G
      [130.8, 261.6, 329.6, 392],   // C
    ];
    while (this.nextBar < ctx.currentTime + 0.6) {
      const chord = CHORDS[this.bar % CHORDS.length];
      const t0 = this.nextBar;
      // Pad: soft detuned triangles through a slow attack.
      for (let i = 0; i < chord.length; i++) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = chord[i];
        o.detune.value = (i - 1.5) * 6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.05, t0 + 0.5);
        g.gain.linearRampToValueAtTime(0.03, t0 + BAR - 0.4);
        g.gain.linearRampToValueAtTime(0, t0 + BAR);
        o.connect(g); g.connect(this.musicGain);
        o.start(t0); o.stop(t0 + BAR);
      }
      // Bass pulse on the chord root, eighth notes.
      for (let n = 0; n < 8; n++) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = chord[0] / 2;
        const g = ctx.createGain();
        const t = t0 + n * (BAR / 8);
        g.gain.setValueAtTime(0.09, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 240;
        o.connect(lp); lp.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + 0.25);
      }
      this.nextBar += BAR;
      this.bar++;
    }
  }

  /** One-shot noise burst through a filter: the workhorse for shots, crashes and booms. */
  burst(freq, q, dur, vol, type = 'bandpass') {
    if (!this.started || !this.enabled) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
  }

  shot(prox = 1) { this.burst(1400, 1.2, 0.14, 0.35 * prox); this.burst(220, 0.7, 0.2, 0.28 * prox, 'lowpass'); }
  punch() { this.burst(300, 0.8, 0.09, 0.3, 'lowpass'); }
  crash(v) { this.burst(500, 0.6, 0.25, 0.25 * v + 0.05, 'lowpass'); }
  blip(f = 440) {
    if (!this.started || !this.enabled) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    o.connect(g); g.connect(this.sfxGain);
    o.start(); o.stop(ctx.currentTime + 0.14);
  }
  explosion(prox = 1) {
    if (!this.started || !this.enabled) return;
    this.burst(120, 0.4, 1.1, 0.55 * prox, 'lowpass');
    this.burst(900, 0.5, 0.4, 0.3 * prox);
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4 * prox, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    o.connect(g); g.connect(this.sfxGain);
    o.start(); o.stop(ctx.currentTime + 0.85);
  }
}
