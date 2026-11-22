// The Vice Palms FM dial: four stations of fully procedural music, each with its own chord
// palette, tempo, groove and DJ persona. Songs rotate through a per-station play list, the DJ
// talks over intros and outros with patter lines pulled from a seeded deck, switching stations
// costs a beat of static, and a live ducking rule pulls the whole radio down whenever a siren
// closes on the player so the chase always owns its own mix.
//
// Integration: constructed by Game, updated once per fixed step, audible only while Rico is in
// a car (a car radio with no car is just ambient hum). Nothing touches the DOM and no audio
// nodes are created until the shared AudioContext is live — a muted game still runs the dial,
// it simply stays silent until `ensure()` unlocks the bus.

import { randRange, randInt, chance } from '../rng.js';
import { clamp } from '../util.js';

/** Seconds one song holds the dial before the next one cues up. */
const SONG_SPAN = 26;
/** Seconds of DJ patter that replace the opening bars of a fresh song. */
const PATTER_SPAN = 7.5;
/** How long the static bed plays after a station switch. */
const STATIC_SPAN = 0.55;
/** The nearest a cruiser can be before ducking starts to bite. */
const DUCK_NEAR = 420;
/** The far edge where ducking lets go completely. */
const DUCK_FAR = 1500;

/** One station on the dial. `chords` are note names over MIDI numbers so each station sounds
 *  like its own record label; `wave` picks the lead oscillator, `swing` the off-beat push. */
const STATIONS = [
  {
    id: 'flamingo-fm',
    name: 'FLAMINGO FM',
    tag: 'Smooth solid-gold soft rock',
    color: '#ff3fa4',
    wave: 'triangle',
    tempo: 96,
    swing: 0.18,
    bass: 'square',
    lead: 0.16,
    chords: [
      [58, 65, 69, 72],   // Bbmaj7
      [55, 62, 65, 69],   // Ebmaj7
      [53, 60, 64, 67],   // Fmaj7
      [51, 58, 62, 65],   // Dm7
    ],
    djs: ['Marisol Vega'],
    patter: [
      'You are locked into Flamingo FM — the sound the palms grew up on.',
      'Coming to you from a rooftop above the strip, where the humidity is a lifestyle.',
      'This next one goes out to everyone parked on the beach road with the windows down.',
      'Somebody just called in asking for a longer sunset. Marisol hears you.',
      'The tide is in, the neon is on, and the ballads are bottomless.',
    ],
    songs: [
      ['Palm Shadows', 'The Lido Four'],
      ['Velvet Hours', 'Casa Luna Social'],
      ['Salt on the Radio', 'Marisol Vega'],
      ['Last Cab to Miramar', 'The Dune Diners'],
      ['Gator Waltz', 'Bayou Blanc'],
    ],
  },
  {
    id: 'pulse-103',
    name: 'PULSE 103',
    tag: 'Warehouse synth, all night',
    color: '#33e7ff',
    wave: 'sawtooth',
    tempo: 124,
    swing: 0.04,
    bass: 'sawtooth',
    lead: 0.2,
    chords: [
      [57, 60, 64, 67],   // Am add spin
      [60, 63, 67, 70],   // Cm7
      [53, 57, 60, 63],   // Fm7
      [55, 58, 62, 65],   // Gm7
    ],
    djs: ['DJ ROXY'],
    patter: [
      'Pulse 103 — turn it up until the dashboard buzzes.',
      'This one was cut in a garage off Vespa Lane at four in the morning. It shows.',
      'Roxy here. If you can hear the sub over your exhaust, you are doing it right.',
      'Shout to the valet crew working the Cabana tonight — they request the fast ones.',
      'Do not slow down for the bridge. The bridge is a dare.',
    ],
    songs: [
      ['Neon Tide (Extended)', 'ROXY'],
      ['Warehouse 9', 'Sub Meridian'],
      ['Static Bloom', 'The Grotto Crew'],
      ['Run the Boardwalk', 'Kilo Wok'],
      ['Glass Elevator', 'Storm Palace'],
    ],
  },
  {
    id: 'coral-classics',
    name: 'CORAL CLASSICS',
    tag: 'Big band from the golden coast',
    color: '#ffc042',
    wave: 'square',
    tempo: 138,
    swing: 0.34,
    bass: 'triangle',
    lead: 0.17,
    chords: [
      [62, 65, 69, 72],   // Dmaj
      [57, 61, 64, 67],   // Amaj
      [59, 62, 66, 69],   // Bm
      [54, 58, 61, 64],   // F#m
    ],
    djs: ['Nate Cora'],
    patter: [
      'Coral Classics — where the brass never checks its coat.',
      'Nate Cora broadcasting from the marina, where the gulls have opinions about tempo.',
      'A request came in from a man who says he just repossessed a GT. This one is for you.',
      'They do not write horn sections like this anymore. Mostly because they cannot.',
      'Swing is a legal defence on this station. Ask your mechanic.',
    ],
    songs: [
      ['Brass Over the Breakwater', 'The Coral Yard Seven'],
      ['Pawnshop Shuffle', 'Serge and the Ledgers'],
      ['Marina Lights', 'Nate Cora Orchestra'],
      ['The Ripcurrent Rag', 'Dune Diners Brass'],
      ['Two Bits at the Plaza', 'Casa Luna Social'],
    ],
  },
  {
    id: 'nightwire',
    name: 'NIGHTWIRE',
    tag: 'Dark wave for late freeways',
    color: '#a86bff',
    wave: 'sawtooth',
    tempo: 108,
    swing: 0.0,
    bass: 'square',
    lead: 0.22,
    chords: [
      [52, 55, 59, 62],   // Em
      [50, 53, 57, 60],   // Dm
      [48, 52, 55, 59],   // Cm
      [55, 58, 62, 65],   // Gm
    ],
    djs: ['SIREN-7'],
    patter: [
      'Nightwire. Broadcasting from under the city, or possibly inside it.',
      'SIREN-7 with you until the sun does something unprofessional.',
      'This track was found on a cassette left in a wrecked Howler. We kept the tape.',
      'Drive slower for this one. The lows need room to find you.',
      'If the sirens sound musical tonight, that is the mix. Probably.',
    ],
    songs: [
      ['Under the Wires', 'SIREN-7'],
      ['Mirage Protocol', 'Velvet Room'],
      ['Harbor Static', 'La Sirena'],
      ['Blue Iguana Dub', 'Reef Records Collective'],
      ['The Long Egress', 'Palm & Pistol'],
    ],
  },
];

/** MIDI note number to Hz. */
function hz(note) { return 440 * Math.pow(2, (note - 69) / 12); }

export class Radio {
  constructor(game) {
    this.game = game;
    this.station = 0;
    this.on = true;               // the dial is powered even before a car is
    this.songT = 0;               // seconds into the current song
    this.songIndex = 0;
    this.patterT = 0;             // countdown of the current DJ line, when open
    this.patter = null;           // { line, dj, t }
    this.staticT = 0;             // static bed after a switch
    this.duck = 0;                // smoothed siren duck, 0 open .. 1 fully pulled down
    this.nodes = null;            // lazily built per AudioContext
    this.builtFor = null;         // which ctx the nodes were built on
    this.scheduleAt = 0;          // next bar's start on the audio clock
    this.barNo = 0;
    this.toastT = 0;              // now-playing toast lifetime
    this.toast = '';
    this.switchFlashT = 0;
    this.playCount = 0;
    this.vu = 0;                  // visual VU wobble for the HUD badge
  }

  /** The station object currently tuned. */
  get current() { return STATIONS[this.station]; }

  /** Whether the radio is audible right now: powered, in a car, and not mid-static. */
  get audible() {
    const g = this.game;
    return this.on && !!g.player.car && !g.player.car.wreck && !g.player.car.wasted;
  }

  /** Spin the dial: next station, a burst of static, and a toast naming the new home. */
  cycle() {
    const prev = this.current.name;
    this.station = (this.station + 1) % STATIONS.length;
    this.songIndex = randInt(this.current.songs.length);
    this.songT = 0;
    this.patterT = 0;
    this.patter = null;
    this.staticT = STATIC_SPAN;
    this.switchFlashT = 0.6;
    this.barNo = 0;
    this.scheduleAt = 0;
    this.nodes = null;          // the graph is per-station; rebuild cheaply
    this.sayToast(`${this.current.name} — ${this.current.tag}`);
    this.game.audio.blip(240);
    this.game.dialog?.push('radio', 'DJ', `${prev} is gone. ${this.current.name} takes the wheel.`, 3, 4);
  }

  /** Power toggle from the pause menu or a key chord. */
  toggle() {
    this.on = !this.on;
    this.sayToast(this.on ? 'RADIO ON' : 'RADIO OFF');
    if (this.nodes) this.nodes.gain.gain.value = 0;
  }

  sayToast(text) {
    this.toast = text;
    this.toastT = 4.2;
  }

  // ---------------------------------------------------------------- per step

  update(dt) {
    const g = this.game;
    this.toastT = Math.max(0, this.toastT - dt);
    this.switchFlashT = Math.max(0, this.switchFlashT - dt);
    this.staticT = Math.max(0, this.staticT - dt);
    this.vu = clamp(this.vu - dt * 2.4, 0, 1);
    if (!this.audible) {
      if (this.nodes) this.nodes.gain.gain.value = 0;
      return;
    }
    this.songT += dt;
    this.vu = clamp(0.35 + Math.sin(g.time * 7.3) * 0.2 + this.current.tempo / 400, 0, 1);

    // DJ patter: fires at the top of each song, holds a beat, then the record takes over.
    if (this.patterT <= 0 && this.patter === null && this.songT < 1 && this.playCount > 0) {
      if (chance(0.85)) {
        const station = this.current;
        const line = station.patter[randInt(station.patter.length)];
        this.patter = { line, dj: station.djs[0], t: PATTER_SPAN };
        this.patterT = PATTER_SPAN;
        g.dialog?.push('radio', station.djs[0], line, PATTER_SPAN, 3);
      }
    }
    if (this.patter) {
      this.patter.t -= dt;
      if (this.patter.t <= 0) this.patter = null;
    }
    if (this.patterT > 0) this.patterT -= dt;
    if (this.songT >= SONG_SPAN) {
      this.songT = 0;
      this.songIndex = (this.songIndex + 1) % this.current.songs.length;
      this.playCount++;
      const [title, artist] = this.current.songs[this.songIndex];
      this.sayToast(`${title} — ${artist}`);
    }

    // Siren ducking: the closest active cruiser pulls the radio down under the wail.
    let near = DUCK_FAR;
    for (const c of g.cops.cruisers) {
      if (c.wreck || c.wasted) continue;
      near = Math.min(near, Math.hypot(c.x - g.player.x, c.y - g.player.y));
    }
    const raw = clamp(1 - (near - DUCK_NEAR) / (DUCK_FAR - DUCK_NEAR), 0, 1);
    this.duck += (raw - this.duck) * Math.min(1, dt * 3.2);
    this.applyGain();
    this.schedule();
  }

  /** The station's share of the master bus: base level minus ducking, zero when muted. */
  applyGain() {
    const nodes = this.nodes;
    if (!nodes) return;
    const g = this.game;
    if (!g.audio.enabled) { nodes.gain.gain.value = 0; return; }
    const base = 0.24;
    const open = this.staticT > 0 ? 0 : 1;
    const level = open * base * (1 - this.duck * 0.85) * (this.patter ? 0.55 : 1);
    nodes.gain.gain.value = level;
  }

  // ---------------------------------------------------------------- audio graph

  /** Build (or rebuild) the station graph on the shared context. Cheap: a few nodes. */
  build() {
    const ctx = this.game.audio.ctx;
    if (!ctx) return;
    if (this.nodes && this.builtFor === ctx) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.game.audio.music);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4200;
    filter.Q.value = 0.4;
    filter.connect(gain);
    this.nodes = { gain, filter };
    this.builtFor = ctx;
    this.scheduleAt = ctx.currentTime + 0.05;
    this.barNo = 0;
  }

  /** Bar scheduler: one bar at a time, ahead of the clock, per-station style. */
  schedule() {
    if (this.staticT > 0) { this.playStatic(); return; }
    this.build();
    const ctx = this.game.audio.ctx;
    if (!ctx || !this.nodes) return;
    const station = this.current;
    const BAR = 60 / station.tempo * 4;
    if (this.scheduleAt < ctx.currentTime) this.scheduleAt = ctx.currentTime + 0.06;
    let guard = 0;
    while (this.scheduleAt < ctx.currentTime + 0.75 && guard++ < 8) {
      const t0 = this.scheduleAt;
      const chord = station.chords[(this.barNo + this.songIndex) % station.chords.length];
      this.padBar(t0, BAR, chord, station);
      this.bassBar(t0, BAR, chord, station);
      this.hatBar(t0, BAR, station);
      if (this.barNo % 4 === 3) this.riser(t0, BAR, station);
      this.scheduleAt += BAR;
      this.barNo++;
    }
  }

  /** The pad: soft detuned chord bed with a per-station attack shape. */
  padBar(t0, bar, chord, station) {
    const ctx = this.game.audio.ctx;
    for (let i = 0; i < chord.length; i++) {
      const o = ctx.createOscillator();
      o.type = station.wave;
      o.frequency.value = hz(chord[i]);
      o.detune.value = (i - chord.length / 2) * 6;
      const g = ctx.createGain();
      const peak = station.lead * (0.5 + 0.25 * Math.sin(this.barNo * 0.7 + i));
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + bar * 0.22);
      g.gain.linearRampToValueAtTime(peak * 0.6, t0 + bar * 0.8);
      g.gain.linearRampToValueAtTime(0, t0 + bar);
      o.connect(g); g.connect(this.nodes.filter);
      o.start(t0); o.stop(t0 + bar + 0.02);
    }
  }

  /** The bass: station-voiced pulse on the chord root with swing-shuffled steps. */
  bassBar(t0, bar, chord, station) {
    const ctx = this.game.audio.ctx;
    const steps = 8;
    for (let n = 0; n < steps; n++) {
      const swingPush = n % 2 === 1 ? station.swing * (bar / steps) : 0;
      const t = t0 + n * (bar / steps) + swingPush;
      if (n === 2 || n === 6) continue;             // leave holes: rhythm needs gaps
      const o = ctx.createOscillator();
      o.type = station.bass;
      const root = chord[0] - 12 + (n === 5 ? 5 : 0);
      o.frequency.value = hz(root);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 340;
      const g = ctx.createGain();
      const peak = 0.1 * (n === 0 ? 1.3 : 1);
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      o.connect(lp); lp.connect(g); g.connect(this.nodes.filter);
      o.start(t); o.stop(t + 0.22);
    }
  }

  /** Hats on the off-beats, softer while the DJ talks. */
  hatBar(t0, bar, station) {
    const ctx = this.game.audio.ctx;
    const noise = this.game.audio.noise;
    if (!noise) return;
    const ducked = this.patter ? 0.5 : 1;
    for (let n = 0; n < 8; n++) {
      if (n % 2 === 0 && station.tempo < 120) continue;   // slow stations skip downbeat hats
      const swingPush = n % 2 === 1 ? station.swing * (bar / 8) : 0;
      const t = t0 + n * (bar / 8) + swingPush;
      const h = ctx.createBufferSource(); h.buffer = noise;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05 * ducked, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      h.connect(hp); hp.connect(g); g.connect(this.nodes.filter);
      h.start(t); h.stop(t + 0.06);
    }
  }

  /** Every fourth bar: a rising filter sweep that cues the next section. */
  riser(t0, bar, station) {
    const ctx = this.game.audio.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(hz(station.chords[0][3]) * 2, t0);
    o.frequency.exponentialRampToValueAtTime(hz(station.chords[0][3]) * 4, t0 + bar);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.045, t0 + bar * 0.8);
    g.gain.linearRampToValueAtTime(0, t0 + bar);
    o.connect(g); g.connect(this.nodes.filter);
    o.start(t0); o.stop(t0 + bar + 0.02);
  }

  /** The static bed between stations: band-passed noise, crackle envelope, no pitch. */
  playStatic() {
    const ctx = this.game.audio.ctx;
    const noise = this.game.audio.noise;
    if (!ctx || !noise || !this.game.audio.enabled) return;
    const now = ctx.currentTime;
    if (now < (this.staticUntil ?? 0)) return;
    this.staticUntil = now + 0.09;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = randRange(900, 2600); bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.008, now + 0.09);
    src.connect(bp); bp.connect(g); g.connect(this.game.audio.music);
    src.start(); src.stop(now + 0.12);
  }

  // ---------------------------------------------------------------- save glue

  /** What a save needs to restore the exact dial. */
  snapshot() {
    return { station: this.station, on: this.on, songIndex: this.songIndex };
  }

  restore(snap) {
    if (!snap) return;
    if (typeof snap.station === 'number' && snap.station >= 0 && snap.station < STATIONS.length) this.station = snap.station;
    if (typeof snap.songIndex === 'number') this.songIndex = snap.songIndex % this.current.songs.length;
    this.on = snap.on !== false;
  }
}

/** Station list for the HUD wheel and the pause menu. */
export const STATION_NAMES = STATIONS.map((s) => s.name);
/** Matching tube colours, same order, for the wheel's lit chip. */
export const STATION_COLORS = STATIONS.map((s) => s.color);
