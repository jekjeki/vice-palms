// The spoken city: ambient pedestrian barks, cop radio chatter, mission line preemption and a
// subtitle strip with speaker names. Lines queue by priority — a chase bark displaces a stroll
// comment, a mission line displaces everything — and each channel has its own cadence so the
// streets never fall silent and never turn into a waterfall either.
//
// Channels:
//   ambient  pedestrians near Rico comment on the night, on Rico, on themselves
//   cop      officers bark at stars and at gunfire
//   radio    the DJ, ducked with the station
//   mission  job-critical lines — always wins the strip
//   cutscene scene beats, same priority band as mission
//
// Integration: Game owns one Dialog; radio, cutscenes and missions push through `push()`;
// game.js calls update(dt, player) once per fixed step; overlays draw `subtitle()`.

import { chance, randInt, rand } from '../rng.js';
import { dist2, clamp } from '../util.js';

/** Cadence per channel: minimum seconds between lines. */
const COOLDOWN = { ambient: 4.5, cop: 2.8, radio: 5.0, mission: 0.4, cutscene: 0.2 };
/** How far a speaker may stand from Rico and still be heard. */
const HEAR = 420;
/** Default strip hold per line, scaled by length in update(). */
const BASE_HOLD = 3.0;

/** Ambient bark deck, grouped by the mood of the moment. `mood` picks the deck. */
const AMBIENT = {
  calm: [
    'The palms do not rustle this far from the beach. Odd.',
    'Third night this week the neon has hummed like that.',
    'You want a real conch fritter, the diner off Camelot. Not the marina one.',
    'My cousin swears the pawn guy pays in expired coupons.',
    'This town used to close at two. Now it just glows at you.',
    'Careful crossing Camelot — the light has opinions.',
    'I love this street. I hate this street. It is complicated.',
  ],
  uneasy: [
    'Was that a siren? That was a siren.',
    'Walk fast. Do not run. Running invites questions.',
    'Somebody just ran a red with the lights OFF.',
    'That car has been parked there all week. All week.',
    'Do not look at the guys by the lot. Keep moving.',
  ],
  scared: [
    'GUN! GUN — everybody down!',
    'He has a pistol, call someone, call EVERYONE!',
    'Not again — not on MY block!',
    'Run! Just run!',
    'My windows! My poor windows!',
  ],
  heroNear: [
    'Nice jacket. Wrong night for it.',
    'You look like trouble on a schedule.',
    'Hey — walk, do not strut.',
    'I know you. Six years ago. Different hair.',
  ],
};

const COP_BARKS = {
  patrol: [
    'Dispatch, all quiet on the strip. Too quiet.',
    'Unit 12, rolling past the diner. Nothing yet.',
    'Eyes open — full moon brings out the poets.',
  ],
  pursuit: [
    'Suspect vehicle running hot on the beach road!',
    'All units, box the next intersection!',
    'Do not lose him on Camelot again!',
    'Roadblock crew, get the barricade up!',
  ],
  cornered: [
    'He is on foot — set the perimeter!',
    'Hands where I can see them!',
    'Nowhere left to run, pal.',
  ],
};

const MISSION_RADIO = {
  begin: [
    'Control: Copy the job. Keep the line clear.',
    'Control: Job is live. Channel is yours.',
  ],
  fail: [
    'Control: That is a no-go. Resetting the board.',
    'Control: Scratch that one. Try clean next time.',
  ],
  pass: [
    'Control: Payment sent. Do not spend it here.',
    'Control: Clean close. Next job is warming up.',
  ],
};

export class Dialog {
  constructor(game) {
    this.game = game;
    this.queue = [];            // pending {channel, speaker, text, priority}
    this.current = null;        // {channel, speaker, text, hold, t, priority}
    this.cool = {};             // channel -> seconds until it may speak again
    this.ambientSeedT = 0;      // scheduling tick for street casting
    this.copMode = 'patrol';
    this.lastStars = 0;
    this.linesSaid = 0;
  }

  /** Push a line onto the queue. Higher priority preempts; ties queue by channel order. */
  push(channel, speaker, text, hold = BASE_HOLD, priority = 2) {
    const line = { channel, speaker, text, hold, priority, t: 0 };
    const c = this.current;
    if (c && line.priority > c.priority) {
      // Preempt: park the current line back at the head only if it had life left.
      if (c.hold - c.t > 0.4) this.queue.unshift(c);
      this.current = line;
      this.linesSaid++;
      return;
    }
    this.queue.push(line);
    this.linesSaid++;
  }

  /** Convenience for mission hooks. */
  mission(kind) {
    const deck = MISSION_RADIO[kind];
    if (!deck) return;
    this.push('mission', 'CONTROL', deck[randInt(deck.length)], 3.2, 6);
  }

  // ---------------------------------------------------------------- per step

  update(dt, player) {
    const g = this.game;
    // Cooldowns tick always so a silent channel recovers even mid-line.
    for (const k of Object.keys(this.cool)) this.cool[k] = Math.max(0, this.cool[k] - dt);
    if (this.current) {
      this.current.t += dt;
      if (this.current.t >= this.current.hold) this.current = null;
    }
    // Promote from queue when the strip is free.
    if (!this.current && this.queue.length > 0) {
      this.queue.sort((a, b) => b.priority - a.priority);
      const next = this.queue.shift();
      this.current = next;
      this.cool[next.channel] = COOLDOWN[next.channel] ?? 3;
    }
    this.streetCast(dt, player);
    this.copChatter(dt, player);
  }

  /** Ambient casting: pick a nearby stroller, give them a line that fits the moment. */
  streetCast(dt, player) {
    const g = this.game;
    if ((this.cool.ambient ?? 0) > 0) return;
    this.ambientSeedT -= dt;
    if (this.ambientSeedT > 0) return;
    this.ambientSeedT = 1.6;
    if (!chance(0.45)) return;
    if (g.wanted.stars >= 3) { this.cool.ambient = 3; return; }   // chaos owns the airwaves
    // Find someone actually near enough to matter.
    let pick = null, best = HEAR * HEAR;
    for (const person of g.people) {
      if (person.isCop || person.mode === 'down') continue;
      const d = dist2(person.x, person.y, player.x, player.y);
      if (d < best) { best = d; pick = person; }
    }
    if (!pick) return;
    const deck = pick.mode === 'bolt' ? AMBIENT.scared
      : g.wanted.stars >= 1 ? AMBIENT.uneasy
      : dist2(pick.x, pick.y, player.x, player.y) < 130 * 130 && chance(0.5) ? AMBIENT.heroNear
      : AMBIENT.calm;
    if (!deck.length) return;
    const line = deck[randInt(deck.length)];
    this.push('ambient', 'Pedestrian', line, 2.6 + line.length * 0.02, 1);
  }

  /** Cop chatter keyed to the pursuit state machine. */
  copChatter(dt, player) {
    const g = this.game;
    const stars = g.wanted.stars;
    if ((this.cool.cop ?? 0) > 0) return;
    const mode = stars === 0 ? 'patrol' : stars >= 4 ? 'cornered' : 'pursuit';
    // Only re-evaluate the mode when the meter moves, else bark sparsely.
    if (stars !== this.lastStars) {
      this.lastStars = stars;
      if (mode !== 'patrol' && chance(0.8)) {
        const deck = COP_BARKS[mode];
        this.push('cop', 'DISPATCH', deck[randInt(deck.length)], 3.0, 4);
        this.cool.cop = 3.2;
        return;
      }
    }
    if (mode === 'patrol') {
      if (chance(dt * 0.06)) {
        const deck = COP_BARKS.patrol;
        this.push('cop', 'DISPATCH', deck[randInt(deck.length)], 3.0, 2);
        this.cool.cop = 9;
      }
    } else if (chance(dt * 0.16)) {
      const deck = COP_BARKS[mode];
      this.push('cop', 'DISPATCH', deck[randInt(deck.length)], 3.0, 4);
      this.cool.cop = 6 + rand() * 4;
    }
  }

  // ---------------------------------------------------------------- readout

  /** The line the subtitle strip should draw, with a fade envelope. */
  subtitle() {
    const c = this.current;
    if (!c) return null;
    const fade = clamp(Math.min(c.t / 0.22, (c.hold - c.t) / 0.4), 0, 1);
    return { speaker: c.speaker, text: c.text, channel: c.channel, fade };
  }

  /** Whether a line is playing right now (chatter systems poll this to avoid overlap). */
  get busy() { return this.current !== null; }

  /** Drop everything: used when a cutscene takes over the strip. */
  clear() {
    this.queue.length = 0;
    this.current = null;
  }
}
