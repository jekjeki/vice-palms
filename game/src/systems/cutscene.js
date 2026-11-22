// Mission cutscenes: letterboxed, camera-panned, subtitle-beat scenes that bookend every job.
// A scene is pure data — an opening and closing camera path, a list of staged actor marks and a
// timed subtitle script — so writers can add scenes without touching the engine. While a scene
// runs the world keeps breathing underneath (traffic, palms, neon), the camera is overridden,
// and Space or Enter skips to the end, firing the same completion hook the natural end uses.
//
// Integration: Game owns one Cutscenes; missions.js calls playIntro/playOutro at begin/payout;
// main.js drives update() and reads camera() while active, then draws via overlays.

import { PITCH, ROAD } from '../config.js';
import { clamp, lerp, easeOut, dist2 } from '../util.js';

/** How long the letterbox bars take to slide in, in seconds. */
const BAR_IN = 0.5;
/** Default camera hold before a pan begins. */
const HOLD = 1.1;

/** Helper: a sidewalk spot on the east side of block (i, j). */
function curb(i, j, side = 'south') {
  const x = (i + 0.5) * PITCH;
  const y = (j + 1) * PITCH - ROAD / 2 - 14;
  if (side === 'north') return { x, y: j * PITCH + ROAD / 2 + 14 };
  if (side === 'west') return { x: i * PITCH + ROAD / 2 + 14, y };
  if (side === 'east') return { x: (i + 1) * PITCH - ROAD / 2 - 14, y };
  return { x, y };
}

/** The actor palette: silhouettes drawn by overlays.js, keyed by role. */
const CAST = {
  rico: { color: '#e8ecf4', h: 30 },
  rosa: { color: '#ff6b9d', h: 28 },
  serge: { color: '#ffc042', h: 32 },
  marisol: { color: '#33e7ff', h: 28 },
  buyer: { color: '#7dffa4', h: 30 },
  cop: { color: '#5d8bff', h: 30 },
  vanta: { color: '#19c6d8', h: 12, car: true },
};

/** The six intro scenes, one per mission. Every scene: a camera path (from -> to), a cast
 *  standing at world marks, and beats of timed subtitles. */
const INTROS = [
  {
    id: 'm0-intro',
    place: 'Rosa’s Garage, Palmetto Ward',
    cam: { from: { x: 12.2 * PITCH, y: 27.4 * PITCH, zoom: 1.15 }, to: { x: 12.5 * PITCH, y: 26.8 * PITCH, zoom: 1.0 }, hold: HOLD, pan: 4.6 },
    actors: [
      { who: 'rosa', at: curb(12, 26) },
      { who: 'rico', at: { x: curb(12, 26).x - 60, y: curb(12, 26).y + 20 } },
    ],
    beats: [
      { t: 0.4, line: 'Rosa: “Six years, Rico. Six years and not one postcard.”' },
      { t: 2.6, line: 'Rosa: “Get to my garage before this town remembers why it ate you the first time.”' },
      { t: 5.0, line: 'Rico: “Some memories are load-bearing, Rosa.”' },
    ],
  },
  {
    id: 'm1-intro',
    place: 'The Sunset Lot',
    cam: { from: { x: 26.6 * PITCH, y: 14.4 * PITCH, zoom: 1.3 }, to: { x: 27 * PITCH, y: 14 * PITCH, zoom: 1.05 }, hold: 0.8, pan: 4.2 },
    actors: [
      { who: 'vanta', at: { x: 27 * PITCH, y: 14 * PITCH } },
      { who: 'rico', at: { x: 27 * PITCH - 70, y: 14 * PITCH + 40 } },
    ],
    beats: [
      { t: 0.4, line: 'Rosa (radio): “A client quit paying on a Vanta GT.”' },
      { t: 2.4, line: 'Rosa (radio): “The car still sits at the Sunset lot, laughing at the paperwork.”' },
      { t: 4.8, line: 'Rico: “Then I will take the laugh with the car.”' },
    ],
  },
  {
    id: 'm2-intro',
    place: 'Rosa’s Garage, after hours',
    cam: { from: { x: 12 * PITCH, y: 26.2 * PITCH, zoom: 1.0 }, to: { x: 12.5 * PITCH, y: 26.9 * PITCH, zoom: 1.2 }, hold: 1.0, pan: 4.4 },
    actors: [
      { who: 'rosa', at: curb(12, 26) },
      { who: 'rico', at: { x: curb(12, 26).x - 50, y: curb(12, 26).y + 16 } },
    ],
    beats: [
      { t: 0.4, line: 'Rosa: “A case waits in my garage. A buyer waits at the plaza.”' },
      { t: 2.7, line: 'Rosa: “Ninety seconds, Rico. Ninety.”' },
      { t: 4.9, line: 'Rico: “Whatever is ticking in there, I will not open it. Probably.”' },
    ],
  },
  {
    id: 'm3-intro',
    place: 'Serge’s Pawn Window',
    cam: { from: { x: 23.7 * PITCH, y: 7.6 * PITCH, zoom: 1.25 }, to: { x: 24 * PITCH, y: 7.2 * PITCH, zoom: 1.0 }, hold: 0.9, pan: 4.2 },
    actors: [
      { who: 'serge', at: curb(24, 7) },
      { who: 'rico', at: { x: curb(24, 7).x - 55, y: curb(24, 7).y + 18 } },
    ],
    beats: [
      { t: 0.4, line: 'Serge: “My ledger is split across three cases, held by ex-partners.”' },
      { t: 2.7, line: 'Serge: “Collect them before somebody honest does.”' },
      { t: 4.9, line: 'Rico: “Honesty would ruin you, Serge.”' },
      { t: 6.4, line: 'Serge: “It would bankrupt me twice. Go.”' },
    ],
  },
  {
    id: 'm4-intro',
    place: 'The Coral Yard',
    cam: { from: { x: 32.4 * PITCH, y: 29.6 * PITCH, zoom: 1.3 }, to: { x: 33 * PITCH, y: 29 * PITCH, zoom: 1.0 }, hold: 1.0, pan: 4.6 },
    actors: [
      { who: 'serge', at: curb(33, 29, 'north') },
      { who: 'rico', at: { x: curb(33, 29, 'north').x + 60, y: curb(33, 29, 'north').y - 20 } },
    ],
    beats: [
      { t: 0.4, line: 'Serge: “Three Tramline vans carry everything that owes me.”' },
      { t: 2.6, line: 'Serge: “Turn them into what the fire marshal writes up.”' },
      { t: 4.8, line: 'Rico: “Your insurance man sends his regards?”' },
      { t: 6.3, line: 'Serge: “He sends his invoice. Same thing.”' },
    ],
  },
  {
    id: 'm5-intro',
    place: 'Plaza del Sol, pre-dawn',
    cam: { from: { x: 18.6 * PITCH, y: 20.6 * PITCH, zoom: 1.0 }, to: { x: 19.4 * PITCH, y: 20.9 * PITCH, zoom: 1.15 }, hold: 1.2, pan: 5.0 },
    actors: [
      { who: 'marisol', at: curb(19, 20) },
      { who: 'rico', at: { x: curb(19, 20).x - 60, y: curb(19, 20).y + 22 } },
    ],
    beats: [
      { t: 0.4, line: 'Marisol: “There is a warrant with your name in fresh ink.”' },
      { t: 2.7, line: 'Marisol: “Every cruiser in the city is out learning it by heart.”' },
      { t: 5.0, line: 'Marisol: “A boat waits at the marina gate. Dawn does not wait at all.”' },
      { t: 7.2, line: 'Rico: “Then let us not keep dawn standing.”' },
    ],
  },
];

/** The six outro scenes, shown when a job pays out. */
const OUTROS = [
  {
    id: 'm0-outro',
    place: 'Rosa’s Garage',
    cam: { from: { x: 12.6 * PITCH, y: 26.6 * PITCH, zoom: 1.1 }, to: { x: 12.3 * PITCH, y: 27.1 * PITCH, zoom: 1.0 }, hold: 0.6, pan: 3.8 },
    actors: [{ who: 'rosa', at: curb(12, 26) }],
    beats: [
      { t: 0.4, line: 'Rosa: “Still walking like you own the sidewalk. Good.”' },
      { t: 2.6, line: 'Rosa: “Because I have work, and the work has teeth.”' },
    ],
  },
  {
    id: 'm1-outro',
    place: 'The Garage, bay two',
    cam: { from: { x: 12.2 * PITCH, y: 26.3 * PITCH, zoom: 1.2 }, to: { x: 12.6 * PITCH, y: 26.9 * PITCH, zoom: 1.05 }, hold: 0.6, pan: 3.8 },
    actors: [
      { who: 'rosa', at: curb(12, 26) },
      { who: 'vanta', at: { x: 12.5 * PITCH, y: 26.4 * PITCH } },
    ],
    beats: [
      { t: 0.4, line: 'Rosa: “Knew it would still be there. Nobody in this city trusts anybody.”' },
      { t: 2.8, line: 'Rosa: “I build my whole ledger on that.”' },
    ],
  },
  {
    id: 'm2-outro',
    place: 'Plaza del Sol',
    cam: { from: { x: 19 * PITCH, y: 20.4 * PITCH, zoom: 1.05 }, to: { x: 19.5 * PITCH, y: 20.8 * PITCH, zoom: 1.2 }, hold: 0.7, pan: 4.0 },
    actors: [{ who: 'buyer', at: curb(19, 20) }],
    beats: [
      { t: 0.4, line: 'Buyer: “Clean work.”' },
      { t: 1.6, line: 'Buyer: “Rosa sends her best people and her worst apologies.”' },
    ],
  },
  {
    id: 'm3-outro',
    place: 'The Pawn Window',
    cam: { from: { x: 24.3 * PITCH, y: 7.4 * PITCH, zoom: 1.15 }, to: { x: 23.9 * PITCH, y: 7.1 * PITCH, zoom: 1.0 }, hold: 0.6, pan: 3.6 },
    actors: [{ who: 'serge', at: curb(24, 7) }],
    beats: [
      { t: 0.4, line: 'Serge: “Now the numbers only embarrass me instead of bankrupting me.”' },
      { t: 2.6, line: 'Serge: “Progress, Rico. Progress.”' },
    ],
  },
  {
    id: 'm4-outro',
    place: 'The Coral Yard, burning',
    cam: { from: { x: 33.4 * PITCH, y: 28.8 * PITCH, zoom: 1.0 }, to: { x: 32.9 * PITCH, y: 29.3 * PITCH, zoom: 1.1 }, hold: 0.7, pan: 4.2 },
    actors: [{ who: 'serge', at: curb(33, 29, 'north') }],
    beats: [
      { t: 0.4, line: 'Serge: “Beautiful. Terrible, but beautiful.”' },
      { t: 2.6, line: 'Serge: “Here — and do not spend it all on smoke.”' },
    ],
  },
  {
    id: 'm5-outro',
    place: 'The Marina Gate',
    cam: { from: { x: 39.3 * PITCH, y: 6.6 * PITCH, zoom: 1.0 }, to: { x: 39.6 * PITCH, y: 6.5 * PITCH, zoom: 1.15 }, hold: 0.8, pan: 4.4 },
    actors: [{ who: 'marisol', at: { x: 39.4 * PITCH, y: 6.5 * PITCH } }],
    beats: [
      { t: 0.4, line: 'Marisol: “Welcome to the water, Rico.”' },
      { t: 2.4, line: 'Marisol: “Vice Palms never lets you go — that is the trouble with loving it.”' },
    ],
  },
];

export class Cutscenes {
  constructor(game) {
    this.game = game;
    this.scene = null;          // the def currently playing
    this.t = 0;                 // seconds elapsed in the scene
    this.cameraNow = null;      // smoothed camera handed to the painter
    this.skippable = true;
    this.beatShown = -1;
    this.onDone = null;         // optional completion callback (fired on skip AND natural end)
    this.history = [];          // ids of scenes played this session
    this.skippedOnce = false;   // the skip hint only teaches the key once
  }

  /** Whether a scene owns the camera right now. */
  get active() { return this.scene !== null; }

  /** The scene's total running time: hold, pan, then the last beat's tail. */
  durationOf(def) {
    const last = def.beats[def.beats.length - 1];
    const tail = last ? last.t + 2.6 : 2;
    return def.cam.hold + def.cam.pan + Math.max(0, tail - def.cam.hold - def.cam.pan) + 1.2;
  }

  /** Start a mission's intro scene (index 0..5). Ignores a repeat inside the same session. */
  playIntro(index) {
    const def = INTROS[index];
    if (!def) return;
    this.play(def);
  }

  /** Start a mission's outro scene. */
  playOutro(index) {
    const def = OUTROS[index];
    if (!def) return;
    this.play(def);
  }

  play(def) {
    if (this.scene === def) return;
    this.scene = def;
    this.t = 0;
    this.beatShown = -1;
    this.history.push(def.id);
    const c = def.cam.from;
    this.cameraNow = { x: c.x, y: c.y, zoom: c.zoom };
    this.game.audio.blip(220);
    this.game.dialog?.push('mission', 'DIRECTOR', `— ${def.place} —`, 2.4, 6);
  }

  /** Skip to the end: the scene finishes instantly and fires its hook once. */
  skip() {
    if (!this.active || !this.skippable) return;
    this.skippedOnce = true;
    this.game.audio.blip(300);
    this.t = this.durationOf(this.scene) + 1;
  }

  // ---------------------------------------------------------------- per frame

  /** Drive the scene from the frame loop (real dt, not the fixed step, so skips stay crisp). */
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const def = this.scene;
    const total = this.durationOf(def);
    // Subtitle beats fire as their time passes; one pass each.
    while (this.beatShown + 1 < def.beats.length && def.beats[this.beatShown + 1].t <= this.t) {
      this.beatShown++;
      const b = def.beats[this.beatShown];
      this.game.dialog?.push('cutscene', 'SCENE', b.line, 2.8, 7);
    }
    // Camera: hold at `from`, then ease across to `to`.
    const { hold, pan, from, to } = def.cam;
    const panT = clamp((this.t - hold) / Math.max(0.01, pan), 0, 1);
    const e = easeOut(panT);
    this.cameraNow = {
      x: lerp(from.x, to.x, e),
      y: lerp(from.y, to.y, e),
      zoom: lerp(from.zoom, to.zoom, e),
    };
    if (this.t >= total) this.finish();
  }

  finish() {
    const def = this.scene;
    this.scene = null;
    this.cameraNow = null;
    if (this.onDone) { const cb = this.onDone; this.onDone = null; cb(def); }
  }

  /** The camera override the painter should use while a scene runs. */
  camera() { return this.cameraNow; }

  /** The letterbox fraction, 0..1, driven by the bar slide-in/out. */
  barAmount() {
    if (!this.active) return 0;
    const def = this.scene;
    const total = this.durationOf(def);
    const inA = clamp(this.t / BAR_IN, 0, 1);
    const outA = clamp((total - this.t) / BAR_IN, 0, 1);
    return Math.min(inA, outA);
  }

  /** The current subtitle line, or null between beats. */
  subtitle() {
    if (!this.active) return null;
    const b = this.scene.beats[this.beatShown];
    if (!b) return null;
    const shown = this.t - b.t;
    if (shown < 0 || shown > 2.9) return null;
    return { line: b.line, fade: clamp(Math.min(shown / 0.25, (2.9 - shown) / 0.4), 0, 1) };
  }

  /** Actor marks for overlays to draw as standing silhouettes, in world space. */
  actors() {
    if (!this.active) return [];
    return this.scene.actors.map((a) => ({ ...CAST[a.who], ...a }));
  }

  /** A skip hint the overlay shows until the player has skipped one scene this session. */
  showSkipHint() {
    return this.active && !this.skippedOnce && this.t > 0.8 && this.t < this.durationOf(this.scene) - 0.4;
  }
}

/** Test hook: scene defs as plain data (used by the developer console, not the runtime). */
export const SCENE_INDEX = { intro: INTROS, outro: OUTROS, cast: CAST };
