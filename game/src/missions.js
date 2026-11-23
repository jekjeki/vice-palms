// ---------------------------------------------------------------------------
// missions.js — the story of Rico's return to Vice Palms (6 chained missions)
// plus 3 repeatable side hustles. Marker-driven, timer-aware, fail/retry with
// payouts and subtitles. All positions are snapped to roads so everything is
// reachable by car.
// ---------------------------------------------------------------------------

import { CFG } from './config.js';
import { clamp, dist2, fmtMoney, fmtTime } from './util.js';

const STORY = [
  {
    id: 'm1', title: 'Welcome Back', payout: 500,
    giver: { x: 620, y: 705 }, brief: 'Meet Rico at the north docks.',
  },
  {
    id: 'm2', title: 'Container Run', payout: 750,
    giver: { x: 900, y: 640 }, brief: 'Rico has a job at the container yard.',
  },
  {
    id: 'm3', title: 'Hot Wheels', payout: 1000,
    giver: { x: 1640, y: 2280 }, brief: 'The races are back on. Find the start line.',
  },
  {
    id: 'm4', title: 'Palm Grease', payout: 1250,
    giver: { x: 2440, y: 1540 }, brief: 'A collector wants a car from Palm Airfield.',
  },
  {
    id: 'm5', title: 'Heat Wave', payout: 1500,
    giver: { x: 1640, y: 3540 }, brief: 'Rico needs the cops taught a lesson.',
  },
  {
    id: 'm6', title: 'Last Ferry', payout: 2500,
    giver: { x: 620, y: 705 }, brief: 'Manny is skipping town. Big trouble.',
  },
];

const SIDES = [
  { id: 's1', title: 'Taxi Dash', payout: 400, giver: { x: 3240, y: 3540 }, brief: 'Drive a cab. Earn fares.' },
  { id: 's2', title: 'Rampage', payout: 500, giver: { x: 840, y: 2300 }, brief: 'Vent some rage. Five wrecks.' },
  { id: 's3', title: 'Special Delivery', payout: 600, giver: { x: 2040, y: 3140 }, brief: 'Six packages. One clock.' },
];

const CHECKPOINTS_M3 = [
  { x: 1640, y: 3080 }, { x: 840, y: 3080 }, { x: 840, y: 1880 },
  { x: 1240, y: 1880 }, { x: 1240, y: 2680 }, { x: 2040, y: 2680 },
];

const PACKAGE_SPOTS = [
  { x: 440, y: 1880 }, { x: 1240, y: 2280 }, { x: 2040, y: 1880 },
  { x: 2840, y: 2680 }, { x: 3240, y: 3480 }, { x: 840, y: 3480 },
];

export class Missions {
  constructor(worldRef, rng) {
    this.world = worldRef;
    this.rng = rng;
    this.storyIndex = 0;          // next unlocked story mission
    this.state = 'idle';          // idle | active
    this.def = null;
    this.step = 0;
    this.timer = 0;
    this.data = {};
    this.sub = null;              // {text, t}
    this.sidesDone = { s1: 0, s2: 0, s3: 0 };
    // letterbox cutscene: {lines: [{text, t}], t, total, cam:{x,y}}
    this.cut = null;
    this.snapGivers();
  }

  /**
   * Play a short letterboxed cutscene: dark bars + timed dialogue lines.
   * The game keeps simulating softly; the bars drop when done.
   */
  playCutscene(lines, opts = {}) {
    this.cut = {
      lines: lines.map((l) => ({ text: l.text, speaker: l.speaker || 'RICO', t: l.t || 3 })),
      t: 0,
      total: lines.reduce((a, l) => a + (l.t || 3), 0),
      freeze: opts.freeze !== false,
      cam: opts.cam || null,
      done: null,
    };
    this.cutTotal = this.cut.total;
    return this.cut;
  }

  updateCutscene(dt, game) {
    if (!this.cut) return false;
    const cut = this.cut;
    cut.t += dt;
    // current line drives the subtitle slot
    let acc = 0;
    let shown = null;
    for (const l of cut.lines) {
      acc += l.t;
      if (cut.t < acc) { shown = l; break; }
    }
    if (shown) this.say(shown.speaker + ': ' + shown.text, 0.2);
    if (cut.t >= cut.total) {
      this.cut = null;
      return false;
    }
    return true;
  }

  cutsceneBars(g) {
    if (!this.cut) return 0;
    // bars slide in during the first 0.4s and out over the last 0.4s
    const t = this.cut.t;
    const remain = this.cut.total - t;
    const ease = Math.min(1, t / 0.4, remain / 0.4);
    return 64 * Math.min(1, ease);
  }

  snapGivers() {
    for (const s of STORY) {
      const p = this.world.nearestRoadPoint(s.giver.x, s.giver.y);
      if (p) { s.giver.x = p.x; s.giver.y = p.y; }
    }
    for (const s of SIDES) {
      const p = this.world.nearestRoadPoint(s.giver.x, s.giver.y);
      if (p) { s.giver.x = p.x; s.giver.y = p.y; }
    }
  }

  // ------------------------------------------------------------- lifecycle
  currentStory() {
    return STORY[Math.min(this.storyIndex, STORY.length - 1)];
  }

  storyComplete() {
    return this.storyIndex >= STORY.length;
  }

  start(def, isSide) {
    this.state = 'active';
    this.def = def;
    this.isSide = isSide;
    this.step = 0;
    this.timer = 0;
    this.data = {};
    this.cutPlayed = false;
    this.say(def.brief, 4);
    this.beginStep(0);
  }

  beginStep(step) {
    this.step = step;
    const d = this.def;
    const id = d.id;
    if (id === 'm1') {
      if (step === 0) {
        this.say('RICO: cuz! Over here, by the docks.', 4);
        this.data.obj = { x: 620, y: 700, r: 30, label: 'Rico' };
        if (!this.cutPlayed) {
          this.cutPlayed = true;
          this.playCutscene([
            { speaker: 'RICO', text: 'Cuz! You made it off the boat.', t: 3 },
            { speaker: 'RICO', text: 'Vice Palms missed you. The docks run the city now — OUR docks.', t: 3.6 },
            { speaker: 'YOU', text: "Didn't come back for a reunion, Rico.", t: 2.6 },
          ]);
        }
      }
      if (step === 1) { this.say('RICO: Welcome back to Vice Palms. Get us a ride, I know a spot.', 5); this.data.ricoAboard = false; this.data.rico = { x: 620, y: 700, board: true }; }
      if (step === 2) { this.say('Drive to the marina on Ocean Drive.', 4); this.data.obj = { x: 3400, y: 3925, r: 40, label: 'Marina' }; }
    } else if (id === 'm2') {
      if (step === 0) {
        this.say('Pinch a Burrito van from the yard — the tagged one.', 4.5);
        if (!this.cutPlayed) {
          this.cutPlayed = true;
          this.playCutscene([
            { speaker: 'RICO', text: 'Crates in that yard have "borrowed" paperwork, cuz.', t: 3.2 },
            { speaker: 'RICO', text: 'Van. Yard. Lockup uptown. Do not scratch the paint.', t: 3.2 },
          ]);
        }
        this.spawnVan(); this.data.obj = { carTag: 'm2van' };
      }
      if (step === 1) { this.say('Deliver it to the lockup, uptown. Keep it clean.', 4.5); this.timer = 95; this.data.obj = { x: 1240, y: 1580, r: 44, label: 'Lockup' }; }
    } else if (id === 'm3') {
      if (step === 0) {
        this.say('Grab anything quick and roll onto the start grid.', 4);
        if (!this.cutPlayed) {
          this.cutPlayed = true;
          this.playCutscene([
            { speaker: 'RICO', text: 'Street race, five crews, zero rules.', t: 2.8 },
            { speaker: 'RICO', text: 'Win it and the whole block knows our name.', t: 2.8 },
          ]);
        }
        this.data.obj = { x: 1640, y: 2280, r: 46, label: 'Start', needCar: true }; this.data.cp = 0;
      }
      if (step === 1) {
        this.say('GO! Checkpoints — beat the clock!', 3);
        this.timer = 95; this.data.obj = { cp: CHECKPOINTS_M3[0], r: 40, needCar: true };
        // rolling start countdown (visual only — the clock waits for no one)
        this.data.countdown = 3.99;
      }
    } else if (id === 'm4') {
      if (step === 0) {
        this.say('Head up to Palm Airfield, east side.', 4);
        if (!this.cutPlayed) {
          this.cutPlayed = true;
          this.playCutscene([
            { speaker: 'RICO', text: 'A collector with taste wants an Infernus. White, if they have it.', t: 3.2 },
            { speaker: 'RICO', text: 'Hangar two at Palm Air. Bring it shiny, primo.', t: 3 },
          ]);
        }
        this.data.obj = { x: 2840, y: 900, r: 44, label: 'Airfield' };
      }
      if (step === 1) { this.say('The Infernus is in hangar two. Take it.', 4); this.spawnSuper(); this.data.obj = { carTag: 'm4car' }; }
      if (step === 2) { this.say('Deliver it spotless — less than a third roughed up.', 4.5); this.data.obj = { x: 2840, y: 1930, r: 44, label: 'Penthouse' }; }
    } else if (id === 'm5') {
      if (step === 0) {
        this.say('Waste 3 cruisers. Rico will know.', 4);
        if (!this.cutPlayed) {
          this.cutPlayed = true;
          this.playCutscene([
            { speaker: 'RICO', text: 'The badges shook down my containers. All of them.', t: 3.2 },
            { speaker: 'RICO', text: 'Three cruisers in pieces. Then vanish like smoke.', t: 3.2 },
          ]);
        }
        this.data.kills = (this.game && this.game.police.destroyedCruisers) || 0; this.data.obj = { cruisers: 3 };
      }
      if (step === 1) { this.say('Now vanish. Lose the heat.', 4); this.data.obj = { layLow: true }; }
      if (step === 2) { this.say('Back to Rico.', 3); this.data.obj = { x: this.def.giver.x, y: this.def.giver.y, r: 40, label: 'Rico' }; }
    } else if (id === 'm6') {
      if (step === 0) {
        this.say('MANNY: you are too late, primo. Catch me if you can.', 4);
        if (!this.cutPlayed) {
          this.cutPlayed = true;
          this.playCutscene([
            { speaker: 'MANNY', text: 'The ferries, the docks, the palms — all mine now, primo.', t: 3.4 },
            { speaker: 'RICO', text: 'Wreck his ride. Vice Palms keeps the change.', t: 3 },
          ]);
        }
        this.spawnTarget(); this.data.obj = { destroyTag: 'm6target' };
      }
      if (this.step === 1) {
        this.say('The ferry at the north pier — RUN!', 4);
        if (!this.ferryHorn) {
          this.ferryHorn = true;
          this.game.audio.shipHorn();
          this.game.toast('The ferry is casting off!');
        }
        this.timer = 75; this.data.obj = { x: 745, y: 80, r: 50, label: 'Ferry' };
      }
    } else if (id === 's1') {
      if (step === 0) {
        this.say('Find a Cabby and pick up fares.', 4);
        if (!this.cutPlayed) {
          this.cutPlayed = true;
          this.playCutscene([
            { speaker: 'DISPATCH', text: 'Cab 47, you are live. Fares do not tip themselves.', t: 3 },
          ]);
        }
        this.data.obj = { needTaxi: true }; this.data.fares = 0; this.timer = 170;
      }
      if (step === 1) { this.nextFare(); }
    } else if (id === 's2') {
      if (step === 0) {
        this.say('Five wrecks, ninety seconds. Any cars.', 4);
        if (!this.cutPlayed) {
          this.cutPlayed = true;
          this.playCutscene([
            { speaker: 'FOREMAN', text: 'Insurance covers riots, right? Ninety seconds. Go.', t: 3 },
          ], { freeze: false });
        }
        this.data.wrecks = 0; this.timer = 90; this.data.obj = { wrecks: 5 };
      }
    } else if (id === 's3') {
      if (step === 0) {
        this.say('Six packages stashed around town. Clock is ticking.', 4.5);
        if (!this.cutPlayed) {
          this.cutPlayed = true;
          this.playCutscene([
            { speaker: 'DISPATCH', text: 'Six parcels, six corners, one moped — you have a car, better.', t: 3.4 },
          ], { freeze: false });
        }
        this.timer = 150;
        this.data.picked = [false, false, false, false, false, false];
        this.data.obj = { packages: PACKAGE_SPOTS };
      }
    }
  }

  nextFare() {
    const spots = [
      { x: 1240, y: 1880 }, { x: 2040, y: 3080 }, { x: 2840, y: 2280 },
      { x: 840, y: 2680 }, { x: 3240, y: 2680 },
    ];
    const d = this.data;
    d.pickup = this.rng.pick(spots);
    let drop = this.rng.pick(spots);
    let guard = 0;
    while (dist2(drop.x, drop.y, d.pickup.x, d.pickup.y) < 900 * 900 && guard++ < 20) drop = this.rng.pick(spots);
    d.drop = drop;
    d.inCab = false;
    this.say('Fare waiting at the marker.', 3);
    this.data.obj = { farePickup: d.pickup };
  }

  spawnVan() {
    const car = this.game.spawnMissionCar('van', 1010, 450, 0, 'm2van');
    car.hp = car.maxHp;
  }

  spawnSuper() {
    const car = this.game.spawnMissionCar('super', 2712, 300, Math.PI / 2, 'm4car');
    car.hp = car.maxHp;
  }

  spawnTarget() {
    const car = this.game.spawnMissionCar('sports', 700, 800, -Math.PI / 2, 'm6target');
    car.cruise = 330;
    car.escape = true;
  }

  say(text, dur = 4) {
    this.sub = { text, t: dur, max: dur };
  }

  pass() {
    const d = this.def;
    this.game.audio.fanfare();
    this.game.player.addMoney(d.payout);
    this.game.stats.earned += d.payout;
    this.game.recordGain(d.payout);
    this.game.stats.missions++;
    // outro bonbons: story missions get a parting line
    if (!this.isSide) {
      const outros = {
        m1: 'RICO: The marina remembers you. Good.',
        m2: 'RICO: Clean steel, clean money. Next.',
        m3: 'RICO: Whole city saw that finish. Legend.',
        m4: 'RICO: Shiny. The collector tipped extra.',
        m5: 'RICO: The badges will think twice. Maybe.',
        m6: 'RICO: Vice Palms is yours, primo. For now.',
      };
      const line = outros[d.id];
      if (line) this.say(line, 5);
    }
    if (this.isSide) {
      this.sidesDone[d.id] = (this.sidesDone[d.id] || 0) + 1;
      this.game.toast(`MISSION PASSED — ${d.title} — ${fmtMoney(d.payout)}`);
    } else {
      this.game.toast(`MISSION PASSED — ${d.title} — ${fmtMoney(d.payout)}`);
      this.storyIndex++;
      this.game.saveGame();
      if (this.storyIndex >= STORY.length) {
        this.game.toast('RICO: Vice Palms is yours, primo. For now.');
      }
    }
    this.cleanup();
    this.state = 'idle';
    this.def = null;
  }

  fail(reason) {
    this.game.audio.fail();
    this.game.toast(`MISSION FAILED — ${reason}`);
    this.cleanup();
    this.state = 'idle';
    this.def = null;
  }

  cleanup() {
    // remove mission cars / markers that lingered
    if (this.data && this.data.rico) this.data.rico = null;
  }

  // ------------------------------------------------------------------ update
  update(dt, game) {
    this.game = game;
    if (this.sub) {
      this.sub.t -= dt;
      if (this.sub.t <= 0) this.sub = null;
    }
    if (this.state === 'idle') {
      this.checkGivers(game);
      this.updateCutscene(dt, game);
      return;
    }
    // active mission
    this.updateCutscene(dt, game);
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.timer = 0; this.onTimeout(); return; }
    }
    this.updateStep(dt, game);
  }

  onTimeout() {
    this.fail('Out of time');
  }

  checkGivers(game) {
    const p = game.player;
    if (p.inCar) return;
    // story
    if (!this.storyComplete()) {
      const s = this.currentStory();
      if (dist2(p.x, p.y, s.giver.x, s.giver.y) < 34 * 34) {
        this.start(s, false);
        return;
      }
    }
    for (const s of SIDES) {
      if (dist2(p.x, p.y, s.giver.x, s.giver.y) < 34 * 34) {
        this.start(s, true);
        return;
      }
    }
  }

  objMarker() {
    if (this.state !== 'active') return null;
    return this.data.obj || null;
  }

  updateStep(dt, game) {
    const p = game.player;
    const d = this.data;
    const o = d.obj || {};
    const id = this.def.id;

    // m1: Rico boards whatever the player drives
    if (id === 'm1' && this.step === 1 && p.inCar && !p.inCar.wrecked) {
      d.ricoAboard = true;
      d.rico = null;
      this.beginStep(2);
      return;
    }

    // shared: player death fails everything (handled globally too)
    if (o.carTag) {
      const car = game.findCarByTag(o.carTag);
      if (!car || car.wrecked) {
        if (this.step === 0 && id === 'm2') { this.fail('The van is scrap'); return; }
        if (this.step === 1 && id === 'm4') { this.fail('The Infernus is scrap'); return; }
      } else if (car.driver === 'player') {
        if (id === 'm2' && this.step === 0) { this.beginStep(1); return; }
        if (id === 'm4' && this.step === 1) { this.beginStep(2); d.carRef = car; return; }
      }
    }
    if (o.destroyTag) {
      const car = game.findCarByTag(o.destroyTag);
      if (!car || car.wrecked) { this.beginStep(1); return; }
      // target flees toward far nodes
      if (car && !car.wrecked && car.escape) this.driveEscape(car, dt, game);
    }
    if (o.x !== undefined && p.inCar === d.carRef || (o.x !== undefined && (id !== 'm4' || this.step !== 2))) {
      // generic reach-marker (story m1 drop, m4 step2 needs carRef)
      const r = o.r || 36;
      const inCarOk = !o.needCar || p.inCar;
      const carOk = id === 'm2' && this.step === 1 ? (p.inCar && p.inCar.missionTag === 'm2van') : true;
      const carOk4 = id === 'm4' && this.step === 2 ? (p.inCar && p.inCar.missionTag === 'm4car') : true;
      if (inCarOk && carOk && carOk4 && dist2(p.x, p.y, o.x, o.y) < r * r) this.reachGoal(game, o);
    }
    if (o.cp) {
      // rolling countdown for the race start
      if (d.countdown !== undefined && d.countdown > 0) {
        d.countdown -= dt;
        const n = Math.ceil(d.countdown - 1);
        if (n >= 0 && n !== d.lastCount) {
          d.lastCount = n;
          game.audio.pickup(false);
          if (n > 0) game.toast(String(n));
          else game.toast('GO!');
        }
      }
      if (!p.inCar) { /* keep waiting; timer punishes */ }
      if (p.inCar && d.countdown <= 0 && dist2(p.x, p.y, o.cp.x, o.cp.y) < (o.r || 40) * (o.r || 40)) {
        d.cp++;
        game.audio.pickup();
        if (d.cp >= CHECKPOINTS_M3.length) { this.pass(); return; }
        d.obj = { cp: CHECKPOINTS_M3[d.cp], r: 40, needCar: true };
        game.toast(`Checkpoint ${d.cp}/${CHECKPOINTS_M3.length}`);
      }
    }
    if (o.cruisers !== undefined) {
      // count destroyed cruisers since step start
      if (game.police.destroyedCruisers > d.kills) {
        d.kills = game.police.destroyedCruisers;
        game.toast(`Cruisers wrecked: ${d.kills}/${o.cruisers}`);
        if (d.kills >= o.cruisers) this.beginStep(1);
      }
      // keep the heat alive: ensure at least one cruiser exists
      if (game.police.wanted < 1) game.police.crime(p.x, p.y, 12, 'provoked');
    }
    if (o.layLow) {
      if (game.police.wanted === 0) this.beginStep(2);
    }
    if (o.needTaxi) {
      if (p.inCar && p.inCar.type === 'taxi') this.beginStep(1);
    }
    if (o.farePickup) {
      if (!p.inCar || p.inCar.type !== 'taxi') { this.data.obj = { needTaxi: true }; return; }
      const dp = d.farePickup;
      if (!d.inCab && dist2(p.x, p.y, dp.x, dp.y) < 40 * 40) {
        d.inCab = true;
        d.obj = { fareDrop: d.drop };
        game.toast('Fare aboard. Drive to the drop.');
      }
      if (d.inCab) {
        const dd = d.drop;
        if (dist2(p.x, p.y, dd.x, dd.y) < 40 * 40) {
          d.fares++;
          game.audio.pickup();
          game.player.addMoney(120);
          if (d.fares >= 3) { this.pass(); return; }
          this.nextFare();
        }
      }
    }
    if (o.wrecks !== undefined) {
      if (game.explosionCount > (d.seen || 0)) {
        d.seen = game.explosionCount;
        d.wrecks++;
        game.toast(`Wrecks: ${d.wrecks}/${o.wrecks}`);
        if (d.wrecks >= o.wrecks) this.pass();
      }
    }
    if (o.packages) {
      const spots = o.packages;
      for (let i = 0; i < spots.length; i++) {
        if (d.picked[i]) continue;
        if (dist2(p.x, p.y, spots[i].x, spots[i].y) < 34 * 34) {
          d.picked[i] = true;
          game.audio.pickup();
          game.toast(`Package ${d.picked.filter(Boolean).length}/6 collected`);
        }
      }
      if (d.picked.every(Boolean)) { this.pass(); return; }
    }
  }

  reachGoal(game, o) {
    const id = this.def.id;
    if (id === 'm1') {
      if (this.step === 0) this.beginStep(1);
      else if (this.step === 2) this.pass();
    } else if (id === 'm2') {
      this.pass();
    } else if (id === 'm3') {
      if (this.step === 0) this.beginStep(1);
    } else if (id === 'm4') {
      if (this.step === 0) this.beginStep(1);
      else if (this.step === 2) {
        const car = this.data.carRef;
        if (car && car.damage01 < 0.35) this.pass();
        else this.fail('The Infernus was too roughed up');
      }
    } else if (id === 'm5') {
      if (this.step === 2) this.pass();
    } else if (id === 'm6') {
      if (this.step === 1) this.pass();
    } else if (id === 's1' || id === 's3') {
      // handled in updateStep
    }
  }

  /** the m6 target drives away from the player along the road graph */
  driveEscape(car, dt, game) {
    if (!car.from) {
      const near = game.traffic.nearestNode(car.x, car.y);
      if (near) { car.from = near.node; car.lastNode = near.node; car.route = [this.rng.pick(near.node.edges).to]; car.segAxis = 'v'; }
      else return;
    }
    const target = car.route && car.route[0];
    if (!target) {
      const near = game.traffic.nearestNode(car.x, car.y);
      if (near && near.node.edges.length) {
        // run away from the player
        let best = null, bd = -1;
        for (const e of near.node.edges) {
          const d = dist2(e.to.x, e.to.y, game.player.x, game.player.y);
          if (d > bd) { bd = d; best = e; }
        }
        car.from = near.node; car.lastNode = near.node; car.route = [best.to]; car.segAxis = best.seg.axis;
      }
      return;
    }
    const desired = Math.atan2(target.y - car.y, target.x - car.x);
    const diff = desired - car.angle;
    const steer = clamp((Math.abs(diff) > Math.PI ? -diff : diff) * 2, -1, 1);
    car.step(dt, { throttle: 1, steer, handbrake: false }, game.world);
    car.collideWorld(game.world);
    const dNode = Math.hypot(target.x - car.x, target.y - car.y);
    if (dNode < 40) {
      const near = game.traffic.nearestNode(car.x, car.y);
      if (near && near.node.edges.length) {
        let best = null, bd = -1;
        for (const e of near.node.edges) {
          const d = dist2(e.to.x, e.to.y, game.player.x, game.player.y);
          if (d > bd) { bd = d; best = e; }
        }
        car.from = near.node; car.lastNode = near.node; car.route = [best.to]; car.segAxis = best.seg.axis;
      }
    }
  }

  // ------------------------------------------------------------------ markers
  /** list of markers the renderer should draw */
  markers() {
    const out = [];
    if (this.state === 'idle') {
      if (!this.storyComplete()) {
        const s = this.currentStory();
        out.push({ x: s.giver.x, y: s.giver.y, kind: 'story', label: s.title });
      }
      for (const s of SIDES) {
        out.push({ x: s.giver.x, y: s.giver.y, kind: 'side', label: s.title });
      }
    } else {
      const o = this.data.obj || {};
      if (o.x !== undefined) out.push({ x: o.x, y: o.y, kind: 'goal', label: o.label || '' });
      if (o.cp) out.push({ x: o.cp.x, y: o.cp.y, kind: 'checkpoint', label: '' });
      if (o.farePickup) out.push({ x: o.farePickup.x, y: o.farePickup.y, kind: 'goal', label: 'Fare' });
      if (o.fareDrop) out.push({ x: o.fareDrop.x, y: o.fareDrop.y, kind: 'checkpoint', label: 'Drop' });
      if (o.packages) {
        const picked = this.data.picked || [];
        o.packages.forEach((pk, i) => { if (!picked[i]) out.push({ x: pk.x, y: pk.y, kind: 'checkpoint', label: 'Pkg' }); });
      }
      if (o.carTag) {
        const car = this.game ? this.game.findCarByTag(o.carTag) : null;
        if (car && !car.wrecked) out.push({ x: car.x, y: car.y, kind: 'checkpoint', label: 'Car' });
      }
      if (o.destroyTag) {
        const car = this.game ? this.game.findCarByTag(o.destroyTag) : null;
        if (car && !car.wrecked) out.push({ x: car.x, y: car.y, kind: 'goal', label: 'Manny' });
      }
    }
    return out;
  }

  timerText() {
    if (this.state === 'active' && this.timer > 0) return fmtTime(this.timer);
    return null;
  }

  objectiveText() {
    if (this.state !== 'active') return null;
    const id = this.def.id, s = this.step;
    const map = {
      m1: ['Meet Rico at the docks', 'Get a car for Rico', 'Drive to the marina'],
      m2: ['Steal the marked van', 'Deliver the van to the lockup'],
      m3: ['Reach the start grid', 'Hit every checkpoint'],
      m4: ['Get to the airfield', 'Steal the Infernus', 'Deliver it spotless'],
      m5: ['Wreck 3 cruisers', 'Lose the heat', 'Return to Rico'],
      m6: ["Wreck Manny's car", 'Reach the ferry at the north pier'],
      s1: ['Find a taxi', 'Collect fares'],
      s2: ['Wreck 5 vehicles'],
      s3: ['Collect 6 packages'],
    };
    const arr = map[id] || [];
    return arr[Math.min(s, arr.length - 1)] || null;
  }
}
