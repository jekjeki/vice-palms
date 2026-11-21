// Every sound is synthesized in the browser with WebAudio — zero audio files. A saw/square
// engine follows the player's throttle, a two-tone siren follows the nearest cruiser, one-shot
// noise bursts handle gunfire, crashes and explosions, and a slow synthwave pad with a bass
// pulse and hats loops under the whole night.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.live = false;
    this.engine = null;
    this.siren = null;
    this.barAt = 0;
    this.barNo = 0;
  }

  /** Call from a user gesture (any keydown or menu click) to unlock the context. */
  ensure() {
    if (this.live) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.15;
      this.music.connect(this.master);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 1;
      this.sfx.connect(this.master);
      this.noise = this.bakeNoise();
      this.makeEngine();
      this.makeSiren();
      this.live = true;
      this.barAt = this.ctx.currentTime + 0.12;
    } catch { this.ctx = null; }
  }

  bakeNoise() {
    const n = Math.floor(this.ctx.sampleRate * 1.2);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeEngine() {
    const c = this.ctx;
    const saw = c.createOscillator(); saw.type = 'sawtooth';
    const sq = c.createOscillator(); sq.type = 'square'; sq.detune.value = 16;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0;
    saw.connect(lp); sq.connect(lp); lp.connect(g); g.connect(this.sfx);
    saw.start(); sq.start();
    this.engine = { saw, sq, lp, g };
  }

  makeSiren() {
    const c = this.ctx;
    const osc = c.createOscillator(); osc.type = 'triangle';
    const g = c.createGain(); g.gain.value = 0;
    osc.connect(g); g.connect(this.sfx);
    osc.start();
    this.siren = { osc, g, t: 0 };
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  /** Per-frame: engine pitch from the player's car, siren wail by cruiser proximity. */
  update(dt, game) {
    if (!this.live || !this.enabled) return;
    const p = game.player;
    const car = p.car;
    if (car && !car.dead && !car.wreck) {
      const f = Math.min(1, Math.abs(car.fwd) / car.spec.top);
      const hz = 58 + f * 195 + (Math.abs(car.fwd) > 4 ? 10 : 0);
      this.engine.saw.frequency.value = hz;
      this.engine.sq.frequency.value = hz * 0.5;
      this.engine.lp.frequency.value = 320 + f * 950;
      this.engine.g.gain.value = 0.055 + f * 0.05;
    } else {
      this.engine.g.gain.value = 0;
    }
    let closeness = 1;
    for (const c of game.cops.cruisers) {
      if (c.dead || c.wreck) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      closeness = Math.min(closeness, Math.max(0, (d - 150) / 1150));
    }
    if (game.wanted.stars > 0 && closeness < 1) {
      this.siren.t += dt;
      this.siren.osc.frequency.value = Math.floor(this.siren.t * 2.3) % 2 ? 920 : 630;
      this.siren.g.gain.value = 0.05 * (1 - closeness);
    } else {
      this.siren.g.gain.value = 0;
    }
    this.playMusic();
  }

  playMusic() {
    const c = this.ctx;
    const BAR = 2.4;
    // i–VI–III–VII in A minor: the classic neon-noir lift.
    const CHORDS = [
      [110.0, 220.0, 261.6, 329.6],  // Am
      [87.3, 174.6, 261.6, 349.2],   // F
      [130.8, 261.6, 329.6, 392.0],  // C
      [98.0, 196.0, 246.9, 293.7],   // G
    ];
    while (this.barAt < c.currentTime + 0.6) {
      const chord = CHORDS[this.barNo % CHORDS.length];
      const t0 = this.barAt;
      for (let i = 0; i < chord.length; i++) {
        const o = c.createOscillator(); o.type = 'triangle';
        o.frequency.value = chord[i];
        o.detune.value = (i - 1.5) * 7;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.05, t0 + 0.55);
        g.gain.linearRampToValueAtTime(0.028, t0 + BAR - 0.45);
        g.gain.linearRampToValueAtTime(0, t0 + BAR);
        o.connect(g); g.connect(this.music);
        o.start(t0); o.stop(t0 + BAR);
      }
      for (let n = 0; n < 8; n++) {
        const t = t0 + n * (BAR / 8);
        // Bass pulse.
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = chord[0] / 2;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 250;
        const g = c.createGain();
        g.gain.setValueAtTime(0.085, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.21);
        o.connect(lp); lp.connect(g); g.connect(this.music);
        o.start(t); o.stop(t + 0.24);
        // Hat tick on the off-beats.
        if (n % 2 === 1) {
          const h = c.createBufferSource(); h.buffer = this.noise;
          const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
          const hg = c.createGain();
          hg.gain.setValueAtTime(0.035, t);
          hg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          h.connect(hp); hp.connect(hg); hg.connect(this.music);
          h.start(t); h.stop(t + 0.06);
        }
      }
      this.barAt += BAR;
      this.barNo++;
    }
  }

  /** One filtered noise burst — the workhorse behind shots, crashes and booms. */
  burst(freq, q, dur, vol, kind = 'bandpass') {
    if (!this.live || !this.enabled) return;
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = kind; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(); src.stop(c.currentTime + dur + 0.05);
  }

  shot(prox = 1) { this.burst(1500, 1.2, 0.13, 0.34 * prox); this.burst(230, 0.7, 0.19, 0.27 * prox, 'lowpass'); }
  punch() { this.burst(310, 0.8, 0.09, 0.3, 'lowpass'); }
  crash(v) { this.burst(520, 0.6, 0.24, 0.24 * v + 0.05, 'lowpass'); }

  tone(freq, dur = 0.12, vol = 0.12) {
    if (!this.live || !this.enabled) return;
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(this.sfx);
    o.start(); o.stop(c.currentTime + dur + 0.02);
  }

  blip(f = 440) { this.tone(f); }

  boom(prox = 1) {
    if (!this.live || !this.enabled) return;
    this.burst(115, 0.4, 1.1, 0.55 * prox, 'lowpass');
    this.burst(880, 0.5, 0.4, 0.3 * prox);
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(88, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(28, c.currentTime + 0.7);
    const g = c.createGain();
    g.gain.setValueAtTime(0.4 * prox, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.8);
    o.connect(g); g.connect(this.sfx);
    o.start(); o.stop(c.currentTime + 0.85);
  }
}
