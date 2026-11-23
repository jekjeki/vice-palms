// ============================================================================
// VICE PALMS — missions.js
// Six chained story missions — Rico returns to Vice Palms — plus three
// repeatable side hustles (cab fares, a rampage, a checkpoint race). A small
// step engine drives markers, timers, spawns, payouts, fail/retry and the
// subtitle stream the HUD renders.
// ============================================================================

import { Car, VEHICLES } from './cars.js';
import { FootCop } from './police.js';
import { Ped } from './peds.js';
import { TAU, clamp, dist, angleTowards, timerStr, money } from './util.js';

const STORY = [
  {
    id: 'm1', name: 'Welcome Back', giver: 'plaza', payout: 500,
    brief: 'Rico is back in Vice Palms. Meet him downtown.',
    steps: [
      { type: 'dialogue', lines: [
        ['RICO', 'Baby! Still driving like a tourist, I see.'],
        ['RICO', 'One package needs wings. Grab a car and get to the North Docks pier.'],
      ] },
      { type: 'goto', loc: 'pier1', r: 6, text: 'Pick up the package at pier one, North Docks.' },
      { type: 'deliver', loc: 'hangar', r: 7, timer: 100, text: 'Deliver the package to the Palm Airfield hangar.' },
    ],
  },
  {
    id: 'm2', name: 'Hot Wheels', giver: 'club', payout: 750,
    brief: 'Rico needs a clean sports car for a collector.',
    steps: [
      { type: 'dialogue', lines: [
        ['RICO', 'A collector wants a Banshee GT. There is one parked outside the club.'],
        ['RICO', 'Bring it to my garage breathing. Scratches come out of your cut.'],
      ] },
      { type: 'steal_car', vtype: 'sport', loc: 'club', text: 'Steal the Banshee GT outside the club.' },
      { type: 'deliver_car', loc: 'garage', r: 6, text: 'Deliver the Banshee to the garage. Keep it pretty.' },
    ],
  },
  {
    id: 'm3', name: 'Air Drop', giver: 'hotel', payout: 900,
    brief: 'Three crates fell off a boat. Collect them fast.',
    steps: [
      { type: 'dialogue', lines: [
        ['RICO', 'Three crates fell off a boat tonight. Pier one, the hotel, and behind the market.'],
        ['RICO', 'The harbor master starts asking questions at dawn. Move.'],
      ] },
      { type: 'collect', spots: ['pier1', 'hotel', 'market'], timer: 150, text: 'Collect the 3 crates before dawn.' },
      { type: 'deliver', loc: 'beachShack', r: 6, text: 'Stash the crates at the beach shack.' },
    ],
  },
  {
    id: 'm4', name: 'Bad Debt', giver: 'garage', payout: 1200,
    brief: 'Snake owes Rico money. Total his car.',
    steps: [
      { type: 'dialogue', lines: [
        ['RICO', 'Snake owes me forty grand and a bigger apology.'],
        ['RICO', 'His Phoenix is idling by the market. Do the math on it with your bumper.'],
      ] },
      { type: 'wreck_car', vtype: 'muscle', loc: 'market', timer: 120, text: 'Wreck Snake’s Phoenix before he escapes.' },
    ],
  },
  {
    id: 'm5', name: 'Dock Heist', giver: 'mansion', payout: 1500,
    brief: 'A crate of VCPD evidence is guarded on pier two.',
    steps: [
      { type: 'dialogue', lines: [
        ['RICO', 'A crate of police evidence sits on pier two. Four uniforms guard it.'],
        ['RICO', 'Make them statistics, take the crate, and lose the heat on the way out.'],
      ] },
      { type: 'kill', loc: 'pier2', n: 4, text: 'Take out the 4 guards on pier two.' },
      { type: 'goto', loc: 'pier2', r: 5, text: 'Grab the evidence crate.' , pickup: true },
      { type: 'deliver', loc: 'beachShack', r: 6, setWanted: 2, text: 'Deliver the crate to the beach shack. The VCPD is looking for you!' },
    ],
  },
  {
    id: 'm6', name: 'Last Flight', giver: 'hangar', payout: 2500,
    brief: 'Every crook in town wants the plane. Reach the runway.',
    steps: [
      { type: 'dialogue', lines: [
        ['RICO', 'Word is out, baby. Every crook in Vice Palms wants the plane at the runway.'],
        ['RICO', 'Punch through them and get to the east end. This is the big one.'],
      ] },
      { type: 'rivals', n: 2, vtype: 'sport', loc: 'hangar', text: 'Survive the ambush and reach the plane!' },
      { type: 'deliver', loc: 'runwayE', r: 8, timer: 150, text: 'Reach the plane at the east end of the runway.' },
    ],
  },
];

const SIDES = {
  taxi: {
    id: 's-taxi', name: 'Vice Cab Co', giver: 'taxiDepot', color: '#ffd23c',
    brief: 'Steal— ahem, borrow a cab and pick up fares.',
  },
  rampage: {
    id: 's-rampage', name: 'Neon Rampage', giver: 'market', color: '#ff6a3c',
    brief: 'Four gang cars are parked near the market. Wreck them all.',
  },
  race: {
    id: 's-race', name: 'Palm Classic', giver: 'plaza', color: '#8dff4a',
    brief: 'An illegal street race. Hit every checkpoint before the clock dies.',
  },
};

const RACE_POINTS = ['plaza', 'club', 'pier1', 'market', 'mansion', 'garage', 'hotel', 'runwayMid'];

export class Missions {
  constructor(game) {
    this.game = game;
    this.storyIdx = 0;          // next story mission to offer
    this.active = null;         // {def, idx, timer, data, isSide}
    this.markers = [];          // {x,y,r,color,label,kind}
    this.subQueue = [];         // {speaker, text, t, dur}
    this.objective = '';
    this.sideCd = { taxi: 0, rampage: 0, race: 0 };
    this.allDone = false;
    this.passedBanner = null;   // {name, payout, t}
  }

  // ---------------------------------------------------------------- subtitles
  sub(text, dur = 3.2, speaker = '') {
    this.subQueue.push({ speaker, text, t: 0, dur });
    if (this.subQueue.length > 4) this.subQueue.shift();
  }

  currentSub() {
    return this.subQueue.length ? this.subQueue[0] : null;
  }

  // ---------------------------------------------------------------- markers
  buildMarkers() {
    this.markers = [];
    if (this.active || this.allDone) return;
    if (this.storyIdx < STORY.length) {
      const def = STORY[this.storyIdx];
      const loc = this.game.world.locations[def.giver];
      this.markers.push({ x: loc.x, y: loc.y, r: 3.2, color: '#25e8ff', kind: 'story', label: def.name });
    }
    for (const key of ['taxi', 'rampage', 'race']) {
      if (this.sideCd[key] > 0) continue;
      const def = SIDES[key];
      const loc = this.game.world.locations[def.giver];
      this.markers.push({ x: loc.x, y: loc.y, r: 3.2, color: def.color, kind: 'side', label: def.name, side: key });
    }
  }

  update(dt) {
    // Subtitle queue
    for (const s of this.subQueue) s.t += dt;
    this.subQueue = this.subQueue.filter(s => s.t < s.dur);

    for (const k in this.sideCd) if (this.sideCd[k] > 0) this.sideCd[k] -= dt;

    if (this.passedBanner) {
      this.passedBanner.t += dt;
      if (this.passedBanner.t > 4.5) this.passedBanner = null;
    }

    if (this.active) {
      this.runStep(dt);
    } else {
      // Check marker entry.
      const p = this.game.player;
      for (const m of this.markers) {
        if (dist(p.x, p.y, m.x, m.y) < m.r) {
          if (m.kind === 'story') this.startStory();
          else this.startSide(m.side);
          break;
        }
      }
    }
    this.buildMarkers();
  }

  // ---------------------------------------------------------------- starting
  startStory() {
    const def = STORY[this.storyIdx];
    this.active = { def, idx: 0, timer: null, data: {}, isSide: false };
    this.game.hud.toast('MISSION — ' + def.name.toUpperCase());
    this.sub(def.brief, 4, '');
  }

  startSide(key) {
    const def = SIDES[key];
    const g = this.game;
    if (key === 'taxi' && (!g.player.inCar || g.player.inCar.spec.kind !== 'taxi')) {
      g.hud.toast('NEED A CAB — GET IN A TAXI');
      // Nudge the player back out of the marker.
      g.player.y += 4;
      return;
    }
    const a = { def, idx: 0, timer: null, data: {}, isSide: true, side: key };
    if (key === 'taxi') this.setupTaxiFare(a);
    if (key === 'rampage') this.setupRampage(a);
    if (key === 'race') this.setupRace(a);
    this.active = a;
    g.hud.toast('SIDE JOB — ' + def.name.toUpperCase());
    this.sub(def.brief, 4, '');
  }

  // ---------------------------------------------------------------- steps
  step() {
    const a = this.active;
    if (!a) return null;
    return a.def.steps ? a.def.steps[a.idx] : a.def['step' + a.idx] || null;
  }

  advance() {
    const a = this.active;
    a.idx++;
    a.timer = null;
    const s = this.step();
    if (s && s.text) this.objective = s.text;
  }

  runStep(dt) {
    const a = this.active;
    const g = this.game;
    if (!a) return;

    // Step timers.
    const s = this.currentStep();
    if (!s) return; // will be finished by finishStep

    if (a.timer !== null && a.timer !== undefined) {
      a.timer -= dt;
      if (a.timer <= 0) { this.fail('OUT OF TIME'); return; }
    }

    switch (s.type) {
      case 'dialogue': this.runDialogue(a, s, dt); break;
      case 'goto': this.runGoto(a, s, dt); break;
      case 'deliver': this.runDeliver(a, s, dt); break;
      case 'steal_car': this.runStealCar(a, s, dt); break;
      case 'deliver_car': this.runDeliverCar(a, s, dt); break;
      case 'collect': this.runCollect(a, s, dt); break;
      case 'wreck_car': this.runWreckCar(a, s, dt); break;
      case 'kill': this.runKill(a, s, dt); break;
      case 'rivals': this.runRivals(a, s, dt); break;
      // side missions have custom runners
      case 'taxi_fare': this.runTaxiFare(a, s, dt); break;
      case 'rampage_run': this.runRampage(a, s, dt); break;
      case 'race_run': this.runRace(a, s, dt); break;
      default: this.advance(); break;
    }
  }

  currentStep() {
    const a = this.active;
    if (!a) return null;
    if (a.def.steps) return a.def.steps[a.idx] || null;
    return a.def['step' + a.idx] || null;
  }

  finishStep() {
    this.advance();
    if (!this.currentStep()) this.pass();
  }

  fail(reason) {
    const g = this.game;
    const a = this.active;
    if (!a) return;
    this.sub('MISSION FAILED — ' + reason, 3.5);
    g.hud.toast('MISSION FAILED');
    g.audio.fail();
    this.cleanupData(a);
    this.active = null;
    this.objective = '';
    if (!a.isSide) {
      // Story missions can retry immediately: marker reappears via buildMarkers.
    } else {
      this.sideCd[a.side] = 12;
    }
  }

  pass() {
    const g = this.game;
    const a = this.active;
    if (!a) return;
    let payout = a.def.payout || 0;
    if (a.def.id === 'm2') {
      const car = a.data.targetCar;
      if (car) payout = Math.round((a.def.payout * (0.4 + 0.6 * car.health / 100)) / 10) * 10;
    }
    if (a.def.id === 's-taxi' && a.data.farePayout) payout = a.data.farePayout;
    g.player.addMoney(payout);
    this.passedBanner = { name: a.def.name, payout, t: 0 };
    g.audio.pass();
    g.hud.toast('MISSION PASSED — ' + money(payout));
    this.cleanupData(a);
    this.active = null;
    this.objective = '';
    if (!a.isSide) {
      this.storyIdx++;
      g.stats.missionsPassed++;
      g.achieve('mission-1');
      g.saveGame(true);
      if (this.storyIdx >= STORY.length) {
        this.allDone = true;
        g.finishGame();
      }
    } else {
      this.sideCd[a.side] = 18;
    }
  }

  cleanupData(a) {
    const d = a.data;
    if (d.targetCar && !d.targetCar.wrecked && d.targetCar.driver !== 'player') d.targetCar.remove = true;
    if (d.rivals) for (const r of d.rivals) if (!r.wrecked && r.driver !== 'player') r.remove = true;
    if (d.guards) for (const gu of d.guards) gu.remove = true;
    if (d.packages) {
      // Un-collected packages vanish.
      for (const pk of d.packages) {
        const i = this.game.pickups.indexOf(pk);
        if (i >= 0) this.game.pickups.splice(i, 1);
      }
    }
    if (d.passenger) d.passenger.remove = true;
    if (d.gangCars) for (const gc of d.gangCars) if (!gc.wrecked && gc.driver !== 'player') gc.remove = true;
  }

  // ------------------------------------------------------------ step runners
  runDialogue(a, s, dt) {
    if (a.data.lineT === undefined) {
      a.data.lineT = 0;
      a.data.lineI = -1;
    }
    a.data.lineT -= dt;
    if (a.data.lineT <= 0) {
      a.data.lineI++;
      if (a.data.lineI >= s.lines.length) { a.data = {}; this.finishStep(); return; }
      const [sp, text] = s.lines[a.data.lineI];
      this.sub(text, 3.4, sp);
      a.data.lineT = 3.6;
    }
    this.objective = 'LISTEN…';
  }

  runGoto(a, s, dt) {
    const g = this.game;
    const loc = g.world.locations[s.loc];
    const p = g.player;
    this.objective = s.text;
    if (s.pickup && !a.data.spawned) {
      a.data.spawned = true;
      const pk = { x: loc.x, y: loc.y, kind: 'package', mission: true };
      g.pickups.push(pk);
      (a.data.packages = a.data.packages || []).push(pk);
    }
    if (dist(p.x, p.y, loc.x, loc.y) < s.r) {
      if (s.pickup) {
        // The package pickup handles collection; wait until taken.
        if (a.data.packages && a.data.packages.length && g.pickups.includes(a.data.packages[0])) return;
      }
      this.finishStep();
    }
  }

  runDeliver(a, s, dt) {
    const g = this.game;
    const loc = g.world.locations[s.loc];
    const p = g.player;
    this.objective = s.text + (a.timer != null ? ' [' + timerStr(a.timer) + ']' : '');
    if (a.timer == null && s.timer) a.timer = s.timer;
    if (s.setWanted && !a.data.wantedSet) {
      a.data.wantedSet = true;
      g.police.addHeat(s.setWanted);
    }
    if (dist(p.x, p.y, loc.x, loc.y) < s.r) {
      this.finishStep();
    }
  }

  runStealCar(a, s, dt) {
    const g = this.game;
    const loc = g.world.locations[s.loc];
    this.objective = s.text;
    if (!a.data.targetCar) {
      const car = new Car(g, s.vtype, loc.x + 8, loc.y + 6, Math.PI / 2);
      car.driver = null;
      a.data.targetCar = car;
      g.cars.push(car);
      g.hud.toast('NEW CAR MARKED ON THE MAP');
    }
    if (g.player.inCar === a.data.targetCar) {
      g.hud.toast('NICE RIDE');
      this.finishStep();
    }
  }

  runDeliverCar(a, s, dt) {
    const g = this.game;
    const loc = g.world.locations[s.loc];
    this.objective = s.text;
    const car = a.data.targetCar;
    if (!car) return;
    if (car.wrecked) { this.fail('THE CAR IS TOTALED'); return; }
    if (car.health < 55 && !a.data.warned) {
      a.data.warned = true;
      g.hud.toast('THE COLLECTOR WILL DEDUCT FOR DAMAGE');
    }
    if (g.player.inCar === car && dist(car.x, car.y, loc.x, loc.y) < s.r) {
      this.finishStep();
    }
  }

  runCollect(a, s, dt) {
    const g = this.game;
    this.objective = s.text + (a.timer != null ? ' [' + timerStr(a.timer) + ']' : '');
    if (a.timer == null && s.timer) a.timer = s.timer;
    if (!a.data.spawned) {
      a.data.spawned = true;
      a.data.packages = [];
      for (const sp of s.spots) {
        const loc = g.world.locations[sp];
        const pk = { x: loc.x, y: loc.y, kind: 'package', mission: true };
        g.pickups.push(pk);
        a.data.packages.push(pk);
      }
      a.data.total = s.spots.length;
    }
    const left = g.pickups.filter(pk => pk.kind === 'package' && pk.mission).length;
    if (left === 0) {
      g.hud.toast('ALL CRATES COLLECTED');
      this.finishStep();
    }
  }

  onPackage(pk) {
    // called by player when a package pickup is taken
    if (this.active && this.active.data && this.active.data.packages) {
      const arr = this.active.data.packages;
      const i = arr.indexOf(pk);
      if (i >= 0) {
        arr.splice(i, 1);
        this.sub(arr.length ? arr.length + ' crate' + (arr.length > 1 ? 's' : '') + ' to go.' : 'That is all of them.', 2.4);
      }
    }
  }

  runWreckCar(a, s, dt) {
    const g = this.game;
    const loc = g.world.locations[s.loc];
    this.objective = s.text + (a.timer != null ? ' [' + timerStr(a.timer) + ']' : '');
    if (a.timer == null && s.timer) a.timer = s.timer;
    if (!a.data.targetCar) {
      const car = new Car(g, s.vtype, loc.x + 6, loc.y + 8, 0);
      car.driver = 'ai';
      car.aiKind = 'mission';
      car.ai = { mode: 'flee' };
      a.data.targetCar = car;
      g.cars.push(car);
      g.hud.toast('TARGET MARKED — WRECK IT');
    }
    const car = a.data.targetCar;
    if (car.wrecked) {
      this.sub('That is forty grand of apology.', 3, 'RICO');
      this.finishStep();
    }
  }

  runKill(a, s, dt) {
    const g = this.game;
    const loc = g.world.locations[s.loc];
    this.objective = s.text;
    if (!a.data.guards) {
      a.data.guards = [];
      for (let k = 0; k < s.n; k++) {
        const gu = new FootCop(g, loc.x + (k - (s.n - 1) / 2) * 3.4, loc.y + (k % 2) * 4 - 2);
        gu.guard = true;          // hostile regardless of stars, no arrest
        gu.hp = 50;
        this.footGuardFix(gu);
        a.data.guards.push(gu);
        g.police.foot.push(gu);
      }
      g.hud.toast(s.n + ' GUARDS MARKED — TAKE THEM OUT');
    }
    const alive = a.data.guards.filter(gu => !gu.dead && !gu.remove).length;
    if (alive === 0) this.finishStep();
  }

  footGuardFix(gu) {
    // Guards shoot even at low heat; bust is disabled for them.
    gu.isGuard = true;
  }

  runRivals(a, s, dt) {
    const g = this.game;
    const loc = g.world.locations[s.loc];
    this.objective = s.text;
    if (!a.data.rivals) {
      a.data.rivals = [];
      for (let k = 0; k < s.n; k++) {
        const car = new Car(g, s.vtype, loc.x - 20 - k * 8, loc.y - 14 - k * 10, 0);
        car.driver = 'ai';
        car.aiKind = 'mission';
        car.ai = { mode: 'rival' };
        car.color = k === 0 ? '#7a1e1e' : '#1e3a7a';
        a.data.rivals.push(car);
        g.cars.push(car);
      }
      g.hud.toast('RIVAL CREWS ROLLING IN — WATCH OUT');
    }
    // Rivals are destroyed or delivered; deliver step comes next, so just wait.
    const live = a.data.rivals.filter(c => !c.wrecked);
    if (live.length < a.data.rivals.length) {
      // Some wrecked: fine, the run continues.
    }
    // Advance when the player is heading east on the runway a bit.
    if (g.player.inCar && dist(g.player.x, g.player.y, loc.x, loc.y) > 60) {
      this.finishStep();
    }
  }

  // ------------------------------------------------------------ side missions
  setupTaxiFare(a) {
    const g = this.game;
    const pt = g.world.randomSidewalkPoint(g.rngWorld, g.player.x, g.player.y, 40, 110);
    const spot = pt || g.world.locations.plaza;
    a.data.fare = { x: spot.x, y: spot.y };
    a.data.phase = 'pickup';
    a.steps = [{ type: 'taxi_fare' }];
    a.def = Object.assign({}, a.def, { steps: a.steps });
  }

  runTaxiFare(a, s, dt) {
    const g = this.game;
    const p = g.player;
    const car = p.inCar;
    this.objective = a.data.phase === 'pickup'
      ? 'Pick up the fare marked on the map.'
      : 'Deliver the fare to the marker. [' + timerStr(a.timer) + ']';
    if (a.data.phase === 'pickup') {
      if (!car || car.spec.kind !== 'taxi') { this.fail('YOU LEFT THE CAB'); return; }
      if (!a.data.passenger) {
        if (dist(p.x, p.y, a.data.fare.x, a.data.fare.y) < 4) {
          const ped = new Ped(g, a.data.fare.x, a.data.fare.y);
          ped.state = 'idle'; ped.idleT = 999;
          a.data.passenger = ped;
          g.peds.list.push(ped);
          g.audio.pickup();
          // choose destination
          const destNames = ['club', 'hotel', 'market', 'mansion', 'beachShack', 'garage'];
          const dn = g.rngWorld.pick(destNames);
          a.data.dest = g.world.locations[dn];
          a.data.pickedAt = { x: p.x, y: p.y };
          a.timer = 20 + dist(p.x, p.y, a.data.dest.x, a.data.dest.y) * 0.9;
          a.data.phase = 'drop';
          g.hud.toast('FARE ABOARD — DRIVE TO THE MARKER');
        }
      }
    } else {
      if (!car || car.spec.kind !== 'taxi') { this.fail('YOU LEFT THE CAB'); return; }
      if (dist(p.x, p.y, a.data.dest.x, a.data.dest.y) < 6) {
        const d = dist(a.data.pickedAt.x, a.data.pickedAt.y, a.data.dest.x, a.data.dest.y);
        a.data.farePayout = 60 + Math.round(d * 1.4);
        a.data.passenger.remove = true;
        a.data.passenger = null;
        this.pass();
        return;
      }
    }
  }

  setupRampage(a) {
    const g = this.game;
    a.steps = [{ type: 'rampage_run' }];
    a.def = Object.assign({}, a.def, { steps: a.steps, payout: 1000 });
    a.timer = 90;
  }

  runRampage(a, s, dt) {
    const g = this.game;
    this.objective = 'Wreck the gang cars! [' + timerStr(a.timer) + ']';
    if (!a.data.gangCars) {
      a.data.gangCars = [];
      const loc = g.world.locations.market;
      for (let k = 0; k < 4; k++) {
        const car = new Car(g, 'sedan', loc.x - 30 + k * 14, loc.y + 20 + (k % 2) * 16, Math.PI);
        car.driver = 'ai';
        car.aiKind = 'mission';
        car.ai = { mode: 'flee' };
        car.color = '#1e2a1e';
        a.data.gangCars.push(car);
        g.cars.push(car);
      }
      g.hud.toast('4 GANG CARS — WRECK THEM ALL');
    }
    const left = a.data.gangCars.filter(c => !c.wrecked).length;
    if (left === 0) { this.pass(); return; }
  }

  setupRace(a) {
    a.steps = [{ type: 'race_run' }];
    a.def = Object.assign({}, a.def, { steps: a.steps, payout: 800 });
    a.timer = 110;
    a.data.cp = 0;
  }

  runRace(a, s, dt) {
    const g = this.game;
    const spots = RACE_POINTS.map(n => g.world.locations[n]);
    const target = spots[a.data.cp];
    this.objective = 'CHECKPOINT ' + (a.data.cp + 1) + '/' + spots.length + '  [' + timerStr(a.timer) + ']';
    if (!g.player.inCar) { this.fail('ON FOOT — GET BACK IN THE CAR'); return; }
    if (dist(g.player.x, g.player.y, target.x, target.y) < 8) {
      a.data.cp++;
      g.audio.pickup();
      if (a.data.cp >= spots.length) { this.pass(); return; }
      g.hud.toast('CHECKPOINT! ' + (spots.length - a.data.cp) + ' TO GO');
    }
  }

  // ------------------------------------------------------------ rival car AI
  // Rival mission cars either flee (wreck/rampage targets) or hunt the player.
  driveMissionCar(car, dt) {
    const g = this.game;
    const p = g.player.inCar || g.player;
    const mode = car.ai && car.ai.mode;
    let tx = p.x, ty = p.y;
    if (mode === 'flee') {
      const away = Math.atan2(car.y - p.y, car.x - p.x);
      // Flee along roads-ish: just run away, avoids solids naturally.
      tx = car.x + Math.cos(away) * 40;
      ty = car.y + Math.sin(away) * 40;
      if (car.speed() < 2) { // stuck against a wall: wiggle
        tx = car.x + Math.cos(away + 1.2) * 20;
        ty = car.y + Math.sin(away + 1.2) * 20;
      }
    }
    const desired = Math.atan2(ty - car.y, tx - car.x);
    const diff = Math.atan2(Math.sin(desired - car.angle), Math.cos(desired - car.angle));
    car.steer = clamp(diff * 2.4, -1, 1);
    const vf = car.forwardSpeed();
    const top = mode === 'flee' ? car.spec.top * 0.92 : car.spec.top * 0.8;
    car.throttle = vf < top ? 1 : 0;
    car.brake = 0;
    // Rivals fire occasionally at high heat? Keep them kinetic: they ram.
  }

  updateMissionCars(dt) {
    for (const c of this.game.cars) {
      if (c.aiKind === 'mission' && !c.wrecked && c.driver === 'ai') this.driveMissionCar(c, dt);
    }
  }

  // ------------------------------------------------------------ render hooks
  // Ground coronas: giver markers when idle, live target rings when active.
  drawMarkerCoronas(ctx, t) {
    const g = this.game;
    const pulse = 0.75 + Math.sin(t * 3.2) * 0.25;
    const ring = (x, y, r, color) => {
      ctx.save();
      ctx.globalAlpha = 0.5 * pulse;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.62, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.22 * pulse;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.62, 0, 0, TAU);
      ctx.fill();
      // Beam
      ctx.globalAlpha = 0.16 * pulse;
      const grad = ctx.createLinearGradient(x, y, x, y - 26);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - r * 0.5, y - 26, r, 26);
      ctx.restore();
    };
    if (!this.active) {
      for (const m of this.markers) ring(m.x, m.y, m.r, m.color);
    }
    for (const m of this.activeTargets()) ring(m.x, m.y, m.r, m.color);
  }

  activeTargets() {
    // positions to draw as coronas/markers for the active mission
    const out = [];
    const a = this.active;
    if (!a) return out;
    const g = this.game;
    const s = this.currentStep();
    if (!s) return out;
    const put = (locName, r, color) => {
      const loc = g.world.locations[locName];
      if (loc) out.push({ x: loc.x, y: loc.y, r, color });
    };
    switch (s.type) {
      case 'goto': case 'deliver': put(s.loc, s.r, '#25e8ff'); break;
      case 'steal_car':
        if (a.data.targetCar && !a.data.targetCar.wrecked) out.push({ x: a.data.targetCar.x, y: a.data.targetCar.y, r: 3, color: '#25e8ff' });
        break;
      case 'deliver_car':
        if (a.data.targetCar && !a.data.targetCar.wrecked) out.push({ x: a.data.targetCar.x, y: a.data.targetCar.y, r: 3, color: '#25e8ff' });
        put(s.loc, s.r, '#25e8ff');
        break;
      case 'collect':
        if (a.data.packages) for (const pk of a.data.packages) out.push({ x: pk.x, y: pk.y, r: 2.6, color: '#25e8ff' });
        break;
      case 'wreck_car':
        if (a.data.targetCar && !a.data.targetCar.wrecked) out.push({ x: a.data.targetCar.x, y: a.data.targetCar.y, r: 3, color: '#ff4646' });
        break;
      case 'kill':
        if (a.data.guards) for (const gu of a.data.guards) if (!gu.dead) out.push({ x: gu.x, y: gu.y, r: 2.2, color: '#ff4646' });
        break;
      case 'taxi_fare':
        if (a.data.phase === 'pickup') out.push({ x: a.data.fare.x, y: a.data.fare.y, r: 3.4, color: '#ffd23c' });
        else if (a.data.dest) out.push({ x: a.data.dest.x, y: a.data.dest.y, r: 4, color: '#ffd23c' });
        break;
      case 'race_run': {
        const spots = RACE_POINTS.map(n => g.world.locations[n]);
        const t2 = spots[a.data.cp];
        if (t2) out.push({ x: t2.x, y: t2.y, r: 6, color: '#8dff4a' });
        break;
      }
    }
    return out;
  }
}
