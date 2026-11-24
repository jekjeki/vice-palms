// missions.js — 6 chained story missions (Rico returns to Vice Palms) +
// 3 side missions. Marker-driven, staged, with timers, fail/retry, payouts.

import { CFG, ctx, VERSION } from './config.js';
import { clamp, dist, fmtMoney, TAU } from './util.js';
import { makeCar, TYPES } from './cars.js';

// --------------------------------------------------------------- helpers ---
function G(x, y, label) { return { x, y, label }; }

// stage factories
const st = {
  goto: (x, y, text, opts = {}) => ({ type: 'goto', x, y, r: opts.r || 46, text, ...opts }),
  drive: (x, y, text, opts = {}) => ({ type: 'drive', x, y, r: opts.r || 52, text, ...opts }),
  collect: (points, text, opts = {}) => ({ type: 'collect', points, text, ...opts }),
  kill: (x, y, n, text, opts = {}) => ({ type: 'kill', x, y, n, text, ...opts }),
  survive: (x, y, time, text, opts = {}) => ({ type: 'survive', x, y, time, text, ...opts }),
  escape: (text, opts = {}) => ({ type: 'escape', text, ...opts }),
};

// -------------------------------------------------------------- missions ---
// Story: Rico returns to Vice Palms after the events upstate.
export const STORY = [
  {
    id: 'm1', title: 'Welcome Back, Rico',
    giver: G(2600, 3905, 'Rico — diner'),
    payout: 500,
    intro: 'RICO: "Long time, cousin. The docks smell like trouble again. Grab a car."',
    stages: [
      st.goto(3305, 1685, 'Meet the contact at the docks gate', {}),
      st.collect([[5150, 760], [5480, 290], [4620, 900]], 'Collect the 3 crates around the docks'),
      st.drive(2215, 4415, 'Deliver the crates to the lockup', { needVehicle: true }),
    ],
    outro: 'RICO: "Clean run. The Palms missed you."',
  },
  {
    id: 'm2', title: "Rico's Ride",
    giver: G(2215, 4415, 'Lockup'),
    payout: 800,
    intro: 'RICO: "A collector wants a Banshee. There\'s one rusting at the airfield."',
    stages: [
      st.goto(950, 2250, 'Steal the Banshee from the airfield', {}),
      st.escape('Shake the security response', {}),
      st.drive(3610, 1330, 'Deliver the Banshee to the downtown garage', { needVehicle: true }),
    ],
    onStart: () => {
      // spawn the mission Banshee at the airfield pad
      const car = makeCar('sports', 950, 2250, 0);
      car.color = '#e8d830';
      car.tag = 'm2-banshee';
      ctx.cars.push(car);
    },
    outro: 'RICO: "Purists, I swear. Cash is cash."',
  },
  {
    id: 'm3', title: 'Beach Party Crash',
    giver: G(3610, 1330, 'Garage'),
    payout: 700,
    intro: 'RICO: "Some cargo washed up on the beach. Beachgoers first, collectors second. Deal with the crew guarding it."',
    stages: [
      st.goto(4030, 5900, 'Go to the beach stash', {}),
      st.kill(4030, 5900, 4, 'Take out the 4 stash guards'),
    ],
    outro: 'RICO: "Brutal. Efficient. Very family."',
  },
  {
    id: 'm4', title: 'Courier Heat',
    giver: G(4030, 5850, 'Beach stash'),
    payout: 900,
    intro: 'RICO: "One last package runs tonight. The docks to the tower. Cops are twitchy — move fast."',
    stages: [
      st.goto(5480, 290, 'Pick up the package on the pier', { time: 70 }),
      st.drive(3040, 1010, 'Deliver to the tower — keep it rolling', { needVehicle: true, time: 95 }),
    ],
    onStart: () => { ctx.police.forceLevel(2); },
    onEnd: () => { ctx.police.clearForced(); },
    outro: 'RICO: "The tower pays through the nose for punctuality."',
  },
  {
    id: 'm5', title: 'Break the Blockade',
    giver: G(3040, 1010, 'Tower'),
    payout: 1200,
    intro: 'RICO: "The Palms PD locked the whole harbor. Break their blockade and vanish. Make it loud."',
    stages: [
      st.goto(4000, 900, 'Get to the harbor mouth', { needVehicle: true }),
      st.escape('Lose the heat — duck the roadblocks', {}),
    ],
    onStart: () => { ctx.police.forceLevel(3); },
    onEnd: () => { ctx.police.clearForced(); },
    outro: 'RICO: "They will write about that one. The good kind of story."',
  },
  {
    id: 'm6', title: "Rico's Payback",
    giver: G(2215, 4415, 'Lockup'),
    payout: 3000,
    intro: 'RICO: "Everything ends where it started. The airfield. Hold the line 60 seconds and the Palms are ours."',
    stages: [
      st.goto(700, 2760, 'Reach the airfield control tower', {}),
      st.survive(700, 2760, 60, 'Hold the airfield — survive the wave'),
    ],
    outro: 'RICO: "Vice Palms is ours, cousin. TO BE CONTINUED…"',
    final: true,
  },
];

// side missions (independent, repeatable after finish? — once each)
export const SIDE = [
  {
    id: 's1', title: 'Beach Sweep', side: true,
    giver: G(4620, 5850, 'Beach clean-up board'),
    payout: 300,
    intro: 'BOARD: "Glass and gulls everywhere. Grab the 6 litter bags before the tide — 90 seconds."',
    stages: [
      st.collect([[4500, 5760], [4900, 5820], [5250, 5750], [4700, 5950], [5400, 5900], [4300, 5900]],
        'Collect the 6 litter bags on the beach', { time: 90 }),
    ],
    outro: 'BOARD: "The Palms sparkle again. Small money, good karma."',
  },
  {
    id: 's2', title: 'Dock Sweep', side: true,
    giver: G(5300, 1700, 'Foreman'),
    payout: 350,
    intro: 'FOREMAN: "Night shift walked off with my inventory. Recover 4 crates in 75 seconds."',
    stages: [
      st.collect([[5150, 760], [5480, 290], [4620, 900], [5900, 800]],
        'Recover the 4 crates in the docks', { time: 75 }),
    ],
    outro: 'FOREMAN: "Union dues: paid. Gratitude: implied."',
  },
  {
    id: 's3', title: 'Airfield Sprint', side: true,
    giver: G(950, 2200, 'Runway club hut'),
    payout: 600,
    intro: 'CLUB: "Midnight time trial. 5 checkpoints, 80 seconds. Bring something fast."',
    stages: [
      st.collect([[400, 2400], [1100, 2400], [1400, 2800], [700, 2900], [900, 2350]],
        'Hit the 5 checkpoints on the runway', { time: 80, needVehicle: true }),
    ],
    outro: 'CLUB: "Clean lines, cousin. The club approves."',
  },
  {
    id: 's4', title: 'Neon Run', side: true,
    giver: G(3040, 1010, 'Tower concierge'),
    payout: 500,
    intro: 'CONCIERGE: "The strip lights go out in 70 seconds. Tag all 5 neon corners before they do."',
    stages: [
      st.collect([[2500, 900], [4700, 900], [4700, 3100], [2500, 3100], [3600, 2000]],
        'Tag the 5 neon corners of downtown', { time: 70 }),
    ],
    outro: 'CONCIERGE: "All corners lit. The strip will remember tonight."',
  },
  {
    id: 's5', title: 'Pier Prowler', side: true,
    giver: G(4300, 420, 'Pier night watch'),
    payout: 450,
    intro: 'WATCH: "Crates keep washing against the pier legs. Bring me 3 before the tide takes them — 80 seconds."',
    stages: [
      st.collect([[4500, 300], [5450, 300], [4300, 320]],
        'Collect the 3 beached crates on the piers', { time: 80 }),
    ],
    outro: 'WATCH: "Good haul. The sea pays in salvage, cousin."',
  },
  {
    id: 's6', title: 'Ferry Flare', side: true,
    giver: G(5450, 300, 'Harbormaster skiff'),
    payout: 550,
    intro: 'HARBORMASTER: "The night ferry lost power. Grab 2 flares and hold the pier head for 30 seconds while it limps in."',
    stages: [
      st.collect([[4520, 300], [5380, 300]], 'Grab the 2 flares from the pier heads', { time: 60 }),
      st.survive(5450, 300, 30, 'Hold the pier head while the ferry docks'),
    ],
    outro: 'HARBORMASTER: "She docked clean. The crew drinks on you tonight."',
  },
];

// ---------------------------------------------------------------- manager --
export class Missions {
  constructor() {
    this.storyIdx = 0;               // next story mission to offer
    this.sideIdx = 0;                // next side mission to offer
    this.done = new Set();           // completed ids
    this.active = null;              // mission def currently running
    this.stage = 0;
    this.stageTime = -1;             // countdown, -1 = no timer
    this.collectLeft = [];
    this.killTargets = [];
    this.surviveT = 0;
    this.banner = null;              // {title, sub, t}
    this.failMsg = 0;
    this.retryable = true;
    this.rewardFx = 0;
    this.missionVehicles = [];
  }

  // all defs not yet done, in offering order (story first)
  available() {
    const out = [];
    if (this.storyIdx < STORY.length) out.push(STORY[this.storyIdx]);
    if (this.sideIdx < SIDE.length) out.push(SIDE[this.sideIdx]);
    return out;
  }

  giverMarkers() {
    const out = [];
    if (!this.active) {
      for (const m of this.available()) out.push({ x: m.giver.x, y: m.giver.y, kind: 'giver' });
    }
    return out;
  }

  objectiveMarkers() {
    if (!this.active) return [];
    const s = this.active.stages[this.stage];
    const out = [];
    if (!s) return out;
    if (s.type === 'goto' || s.type === 'drive') {
      out.push({ x: s.x, y: s.y, kind: 'obj' });
    } else if (s.type === 'collect') {
      for (const p of this.collectLeft) out.push({ x: p[0], y: p[1], kind: 'obj' });
    } else if (s.type === 'kill') {
      out.push({ x: s.x, y: s.y, kind: 'obj' });
    } else if (s.type === 'survive') {
      out.push({ x: s.x, y: s.y, kind: 'obj' });
    }
    return out;
  }

  tryStart(S) {
    if (this.active) return;
    const p = S.player;
    for (const m of this.available()) {
      if (dist(p.x, p.y, m.giver.x, m.giver.y) < 42) {
        this.begin(m, S);
        return;
      }
    }
  }

  begin(m, S) {
    this.active = m;
    this.stage = 0;
    this.retryable = true;
    ctx.subtitle(m.title, 2.6);
    ctx.subtitle(m.intro, 5.5);
    if (m.onStart) m.onStart();
    this.enterStage(0, S);
  }

  enterStage(i, S) {
    this.stage = i;
    const s = this.active.stages[i];
    if (!s) { this.complete(S); return; }
    if (s.time !== undefined) this.stageTime = s.time;
    else this.stageTime = -1;
    if (s.type === 'collect') this.collectLeft = s.points.slice();
    if (s.type === 'kill') {
      this.killTargets = ctx.peds.spawnGang(s.x, s.y, s.n);
    }
    if (s.type === 'survive') {
      this.surviveT = s.time;
      ctx.peds.spawnGang(s.x, s.y, 4);
      ctx.police.forceLevel(2);
    }
    if (s.type === 'escape') {
      // make sure there is some heat to escape
      if (ctx.police.level === 0) ctx.police.forceLevel(Math.max(2, this.active.stageHeat || 2));
      if (this.active.id === 'm2') ctx.police.forceLevel(2);
      if (this.active.id === 'm5') ctx.police.forceLevel(3);
    }
    if (s.text) ctx.subtitle(s.text, 3.2);
  }

  update(dt, S) {
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    this.rewardFx = Math.max(0, this.rewardFx - dt);
    this.failMsg = Math.max(0, this.failMsg - dt);

    this.tryStart(S);

    if (!this.active) return;
    const s = this.active.stages[this.stage];
    if (!s) return;

    // stage timer
    if (this.stageTime >= 0) {
      this.stageTime -= dt;
      if (this.stageTime <= 0) { this.fail('Out of time.', S); return; }
    }

    const p = S.player;

    switch (s.type) {
      case 'goto': {
        if (dist(p.x, p.y, s.x, s.y) < s.r) this.nextStage(S);
        break;
      }
      case 'drive': {
        if (p.inCar && dist(p.x, p.y, s.x, s.y) < s.r) {
          if (s.needVehicle) this.nextStage(S);
          else this.nextStage(S);
        }
        break;
      }
      case 'collect': {
        for (let i = this.collectLeft.length - 1; i >= 0; i--) {
          const c = this.collectLeft[i];
          if (dist(p.x, p.y, c[0], c[1]) < 40) {
            this.collectLeft.splice(i, 1);
            if (ctx.sfx) ctx.sfx('pickup', c[0], c[1]);
            if (this.collectLeft.length === 0) this.nextStage(S);
          }
        }
        break;
      }
      case 'kill': {
        let alive = 0;
        for (const g of this.killTargets) if (!g.dead) alive++;
        if (alive === 0) this.nextStage(S);
        break;
      }
      case 'survive': {
        this.surviveT -= dt;
        // top up gangs / heat
        if (Math.random() < dt * 0.35) ctx.peds.spawnGang(s.x, s.y, 1);
        if (this.surviveT <= 0) {
          ctx.police.clearForced();
          this.nextStage(S);
        }
        break;
      }
      case 'escape': {
        if (ctx.police.level === 0) {
          if (this.active.onEnd) this.active.onEnd();
          this.nextStage(S);
        }
        break;
      }
    }
  }

  nextStage(S) {
    if (this.active.onEnd && this.stage === this.active.stages.length - 1) {
      // mission-scoped forced heat gets cleared by specific stages already
    }
    if (this.stage + 1 >= this.active.stages.length) this.complete(S);
    else this.enterStage(this.stage + 1, S);
  }

  complete(S) {
    const m = this.active;
    if (!m) return;
    const payout = m.payout;
    S.money += payout;
    S.stats.earned += payout;
    S.stats.missions++;
    this.done.add(m.id);
    if (!m.side) this.storyIdx++;
    else this.sideIdx++;
    this.banner = { title: 'MISSION PASSED!', sub: m.title + '  —  ' + fmtMoney(payout), t: 5, dur: 5 };
    this.rewardFx = 3;
    if (ctx.sfx) ctx.sfx('mission', S.player.x, S.player.y);
    ctx.subtitle(m.outro, 5);
    if (m.final) {
      this.banner = { title: 'VICE PALMS IS YOURS', sub: 'The story continues…  —  ' + fmtMoney(payout), t: 8, dur: 8 };
    }
    // cleanup mission vehicles
    for (const c of this.missionVehicles) c.tag = null;
    this.missionVehicles.length = 0;
    this.active = null;
    this.stage = 0;
    this.stageTime = -1;
  }

  fail(reason, S) {
    const m = this.active;
    if (!m) return;
    if (m.onEnd) m.onEnd();
    if (m.id === 'm6') ctx.police.clearForced();
    ctx.subtitle('MISSION FAILED — ' + reason, 4);
    ctx.subtitle('Return to the marker to retry.', 3.5);
    this.failMsg = 6;
    this.active = null;
    this.stage = 0;
    this.stageTime = -1;
    // despawn stage spawns lazily (gang members fade via cull)
  }

  // called by game.js when the player dies/busted during a mission
  abort(S) {
    if (!this.active) return;
    if (this.active.onEnd) this.active.onEnd();
    this.active = null;
    this.stage = 0;
    this.stageTime = -1;
    this.collectLeft = [];
  }

  // ------------------------------------------------------------- save/load --
  saveData() {
    return { storyIdx: this.storyIdx, sideIdx: this.sideIdx, done: [...this.done] };
  }

  loadData(d) {
    if (!d) return;
    this.storyIdx = d.storyIdx | 0;
    this.sideIdx = d.sideIdx | 0;
    this.done = new Set(d.done || []);
  }
}
