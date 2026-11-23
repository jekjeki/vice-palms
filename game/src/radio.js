// radio.js — three procedurally sequenced stations for the night drive.
// Palm Wave (dreamy synth), Vice FM (electro-funk), Night Drive (ambient
// pads). R cycles stations; the audio engine renders whatever we feed it.

import { RNG, mixSeeds } from './rng.js';

// station definitions: bass root pattern (Hz), arp scale (ratios), tempo,
// waveforms and vibe
const STATIONS = [
  {
    name: 'PALM WAVE 88.3',
    tag: 'dream synth',
    tempo: 0.24,                 // seconds per 8th
    roots: [55, 55, 65.4, 65.4, 73.4, 73.4, 49, 49],
    scale: [1, 1.5, 2, 3, 2, 1.5, 2, 2.5],
    bassWave: 'sawtooth',
    arpWave: 'square',
    arpGain: 0.05,
    padEvery: 4,
    hatEvery: 2,
  },
  {
    name: 'VICE FM 103.7',
    tag: 'electro-funk',
    tempo: 0.19,
    roots: [43.7, 43.7, 58.3, 58.3, 51.9, 51.9, 43.7, 65.4],
    scale: [1, 1.19, 1.5, 1.78, 2, 2.38, 3, 2],
    bassWave: 'square',
    arpWave: 'sawtooth',
    arpGain: 0.04,
    padEvery: 8,
    hatEvery: 1,
  },
  {
    name: 'NIGHT DRIVE 96.1',
    tag: 'ambient',
    tempo: 0.42,
    roots: [49, 49, 55, 55, 41.2, 41.2, 61.7, 61.7],
    scale: [1, 2, 1.5, 2, 3, 2, 1.5, 1],
    bassWave: 'triangle',
    arpWave: 'sine',
    arpGain: 0.06,
    padEvery: 2,
    hatEvery: 0,
  },
];

export class Radio {
  constructor(game, seed) {
    this.game = game;
    this.station = 0;
    this.step = 0;
    this.timer = 0;
    this.displayT = 0;
    this.rng = new RNG(mixSeeds(seed === undefined ? 5 : seed, 0xFACE));
  }

  get current() {
    return STATIONS[this.station];
  }

  next() {
    this.station = (this.station + 1) % STATIONS.length;
    this.step = 0;
    this.displayT = 2.6;
    this.game.audio.cash();
  }

  prev() {
    this.station = (this.station + STATIONS.length - 1) % STATIONS.length;
    this.step = 0;
    this.displayT = 2.6;
    this.game.audio.cash();
  }

  /** Stepped from the game loop; mutes naturally through the audio engine. */
  update(dt) {
    const audio = this.game.audio;
    if (!audio.ctx || audio.muted) {
      this.displayT = Math.max(0, this.displayT - dt);
      return;
    }
    this.displayT = Math.max(0, this.displayT - dt);
    const st = this.current;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer += st.tempo;
    const s = this.step++ % 16;
    const t = audio.ctx.currentTime;

    // bass every other step
    if (s % 2 === 0) {
      const root = st.roots[(this.step >> 1) % 8] ?? st.roots[0];
      audio.playTone(root, st.tempo * 1.6, 0.14, st.bassWave, root * 0.99);
    }
    // arp sparkle
    const note = st.scale[s % 8];
    const root = st.roots[(this.step >> 1) % 8] ?? st.roots[0];
    audio.playTone(root * 4 * note, st.tempo * 0.9, st.arpGain, st.arpWave);
    // pad chord swell
    if (st.padEvery && s % st.padEvery === 0) {
      audio.playTone(root * 2, st.tempo * 3.2, 0.05, 'triangle');
      audio.playTone(root * 2.5, st.tempo * 3.2, 0.035, 'triangle');
    }
    // hats
    if (st.hatEvery && s % st.hatEvery === 0 && s % 4 !== 0) {
      audio.playNoise(0.05, 6800, 0.035, 'highpass');
    }
    // kick
    if (s % 8 === 0 && st.tempo < 0.3) {
      audio.playTone(root * 0.5, 0.3, 0.18, 'sine', root * 0.4);
    }
  }

  /** Station toast shown by the HUD. */
  toast() {
    if (this.displayT > 0) return this.current.name;
    return null;
  }
}

export { STATIONS };
