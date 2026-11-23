// ---------------------------------------------------------------------------
// radio.js — Vice Palms FM. A tiny pattern-based chiptune sequencer riding on
// WebAudio: four stations (night-drive synthwave, flashbase electro, dusk
// jazz-ish, low-tide lo-fi), each with drum patterns, bass lines, chord pads
// and lead arps that vary every 8 bars. Stations cycle with R (game.js).
// ---------------------------------------------------------------------------

const STEPS_PER_BAR = 8;     // 8th notes
const BARS_PER_SECTION = 8;

// note helper: midi → Hz
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // radio sequencer progressions (a fourth station borrows 'flash')
const PROGS = {
  drive: [0, 0, -4, -4, 2, 2, -4, -4],      // i – VI – III …
  flash: [0, 3, 5, 3, 0, 5, 3, -2],
  dusk: [0, -2, 3, 5, 0, 3, -2, -4],
  tides: [0, 0, 5, 3, 0, -2, 3, 5],
};

const STATIONS = [
  {
    id: 'drive', name: 'WVP NIGHT DRIVE', bpm: 96,
    root: 45,                       // A2
    kick: [1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0],
    bass: [0, 0, 7, 0, 3, 0, 7, 10], // semitones over chord root
    arp: [12, 15, 19, 15, 12, 15, 19, 22],
    padEvery: 4,                    // pad chord every N steps
    leadFrom: 8,                    // lead enters in the 2nd section
    swing: 0.0,
  },
  {
    id: 'flash', name: 'FLASHBASE 103', bpm: 118,
    root: 43,                       // G2
    kick: [1, 0, 0, 0, 1, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1],
    hat: [1, 0, 1, 0, 1, 0, 1, 1],
    bass: [0, 12, 0, 7, 0, 12, 0, 10],
    arp: [12, 19, 24, 19, 12, 19, 24, 27],
    padEvery: 8,
    leadFrom: 4,
    swing: 0.06,
  },
  {
    id: 'dusk', name: 'DUSK 88.1', bpm: 78,
    root: 48,                       // C3
    kick: [1, 0, 0, 0, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1],
    bass: [0, 0, 3, 0, 5, 0, 3, 0],
    arp: [12, 16, 19, 16, 14, 16, 19, 16],
    padEvery: 2,
    leadFrom: 12,
    swing: 0.12,
  },
  {
    id: 'tides', name: 'LOW TIDE LO-FI', bpm: 68,
    root: 41,                       // F2
    kick: [1, 0, 0, 0, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 1],
    bass: [0, 0, 0, 5, 3, 3, 5, 7],
    arp: [12, 15, 17, 20, 19, 17, 15, 12],
    padEvery: 8,
    leadFrom: 16,
    swing: 0.16,
  },
];

export class Radio {
  constructor(audio) {
    this.audio = audio;            // AudioSys (master gain, noise, note)
    this.stationIdx = 0;
    this.on = false;
    this.nextTime = 0;
    this.step = 0;                 // global step counter
    this.bar = 0;
  }

  get station() {
    return STATIONS[this.stationIdx % STATIONS.length];
  }

  stationName() {
    return this.station.name;
  }

  next() {
    this.stationIdx = (this.stationIdx + 1) % STATIONS.length;
    this.step = 0;
    this.bar = 0;
    if (this.audio.ctx) this.nextTime = this.audio.ctx.currentTime + 0.05;
    return this.station;
  }

  start() {
    this.on = true;
    if (this.audio.ctx && this.nextTime < this.audio.ctx.currentTime) {
      this.nextTime = this.audio.ctx.currentTime + 0.08;
    }
  }

  stop() {
    this.on = false;
  }

  /**
   * call every frame; schedules a lookahead window of notes
   */
  update() {
    const A = this.audio;
    if (!this.on || !A.ready()) return;
    const st = this.station;
    // pads drift a few cents per station for character
    const padDetune = st.id === 'dusk' ? 6 : st.id === 'tides' ? 9 : 0;
    const stepLen = 60 / st.bpm / 2;

    while (this.nextTime < A.ctx.currentTime + 0.28) {
      const t = this.nextTime;
      const s = this.step % STEPS_PER_BAR;
      const section = Math.floor(this.bar / BARS_PER_SECTION);
      const swing = (s % 2 === 1 ? st.swing * stepLen : 0);
      const at = t + swing;

      // chord root for this bar (progression per station)
      const prog = PROGS[st.id];
      const chordRoot = st.root + prog[this.bar % prog.length];

      // drums
      if (st.kick[s]) A.drum(at, 'kick');
      if (st.snare[s]) A.drum(at, 'snare');
      if (st.hat[s]) A.drum(at, 'hat');

      // bass: root-following line
      const bn = chordRoot + st.bass[s];
      A._note(at, hz(bn), stepLen * 0.85, 'sawtooth', 0.09, 320);

      // pad: soft chord stab (with per-station detune character)
      if (s % st.padEvery === 0) {
        A._note(at, hz(chordRoot + 12) * (1 + padDetune / 12000), stepLen * st.padEvery * 0.9, 'triangle', 0.035, 900);
        A._note(at, hz(chordRoot + 15) * (1 - padDetune / 12000), stepLen * st.padEvery * 0.9, 'triangle', 0.028, 900);
      }

      // lead arp: enters after the intro section, drops in breaks
      if (section >= Math.floor(st.leadFrom / BARS_PER_SECTION)) {
        const intensity = section % 2 === 0 ? 1 : 0.7;
        if (intensity > 0.5 || s % 2 === 0) {
          const ln = chordRoot + 12 + st.arp[s];
          A._note(at, hz(ln), stepLen * 0.7, 'square', 0.022 * intensity, 2400);
        }
      }

      this.nextTime += stepLen;
      this.step++;
      if (this.step % STEPS_PER_BAR === 0) this.bar++;
    }
  }
}
