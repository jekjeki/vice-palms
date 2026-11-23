// missions.js — the Vice Palms story: Rico is back in town and pulling you
// into six chained missions, plus three repeatable side jobs. Each mission is
// a small script of steps (goto / steal / destroy / survive / deliver) with
// timers, fail conditions and payouts, all narrated through subtitles.

import { CFG, PLACES } from './config.js';
import { CAR_SPECS, placeCar, DIR_ANG } from './cars.js';
import { dist, fmtMoney, clamp, circleRectHit } from './util.js';

const P = (tx, ty) => ({ x: tx * CFG.T, y: ty * CFG.T });

// ---------------------------------------------------------------------------
// mission scripts

const STORY = [
  {
    id: 'm1', name: 'Homecoming', payout: 500,
    brief: 'Rico is back in Vice Palms. Meet him at the North Docks.',
    giver: 'start', giverPos: P(14.5, 116),
    steps: [
      { type: 'goto', pos: P(30, 21), r: 44, text: 'Drive north to Dock 4 and meet Rico.', inCar: null },
      { type: 'dialog', lines: [
        'RICO: Kid! The city still remembers you.',
        'RICO: I got a garage, a plan, and a shortage of drivers with your… talents.',
        'RICO: First job — bring me wheels. Something fast.',
      ] },
    ],
    onPass(game) { game.hud.subtitle('RICO: Palm trees forever, kid.', 3); },
  },
  {
    id: 'm2', name: 'Container Run', payout: 800,
    brief: 'Steal the Banshee from the container yard and bring it to Rico\u2019s garage.',
    giver: 'garage', giverPos: P(55, 43),
    steps: [
      { type: 'goto', pos: P(62, 10), r: 120, text: 'Go to the container yard at the North Docks.' },
      { type: 'steal', spec: 'banshee', near: P(62, 10), text: 'Find the Banshee in the yard and jack it.' },
      { type: 'goto', pos: P(55, 45), r: 56, text: 'Deliver it to Rico\u2019s Garage.', needThisCar: true },
      { type: 'dialog', lines: [
        'RICO: A Banshee! You still kiss the throttle like you mean it.',
        'RICO: Next: a package on the beach. Don\u2019t open it. Don\u2019t drop it.',
      ] },
    ],
  },
  {
    id: 'm3', name: 'Palm Beach Pickup', payout: 1000,
    brief: 'Grab the package on the beach and run it to the Coral Tower.',
    giver: 'garage', giverPos: P(55, 43),
    steps: [
      { type: 'goto', pos: P(80, 148), r: 70, text: 'Pick up the package on Palm Beach.' },
      { type: 'heat', stars: 1, text: 'The buyers tipped the cops. Lose the heat or outrun it.' },
      { type: 'goto', pos: P(101, 53), r: 60, text: 'Deliver the package to the Coral Tower penthouse.' },
    ],
  },
  {
    id: 'm4', name: 'Airfield Run', payout: 1500,
    brief: 'A courier dropped a briefcase at Palm Airfield. Collect it.',
    giver: 'penthouse', giverPos: P(101, 53),
    steps: [
      { type: 'goto', pos: P(133, 96), r: 80, text: 'Get through Gate 2 at Palm Airfield.' },
      { type: 'goto', pos: P(148, 86), r: 70, text: 'Grab the briefcase by the control tower.' },
      { type: 'heat', stars: 2, text: 'Airfield security called it in. You know the drill.' },
      { type: 'goto', pos: P(55, 45), r: 56, text: 'Take the briefcase to Rico\u2019s Garage.' },
    ],
  },
  {
    id: 'm5', name: 'Dock Wars', payout: 2000,
    brief: 'The Vega crew is moving product through OUR docks. Burn it.',
    giver: 'garage', giverPos: P(55, 43),
    steps: [
      { type: 'goto', pos: P(62, 10), r: 130, text: 'Get back to the container yard.' },
      { type: 'dialog', lines: [
        'RICO: The Vega crew thinks the docks are theirs now.',
        'RICO: Burn their three cars. Every last one. Loudly.',
      ] },
      { type: 'destroy', count: 3, tag: 'gang', text: 'Destroy the 3 Vega crew cars.', spawn: 'gang' },
    ],
    onPass(game) { game.hud.subtitle('RICO: That\u2019s a message they\u2019ll read twice.', 3.5); },
  },
  {
    id: 'm6', name: 'The Last Palm', payout: 5000,
    brief: 'The traitor is running for the airfield. Stop the car before it takes off.',
    giver: 'penthouse', giverPos: P(101, 53),
    steps: [
      { type: 'destroy_escape', tag: 'escape', text: 'STOP THE TRAITOR\u2019S CAR before it escapes the airfield!', spawn: 'escape', timeLimit: 95 },
      { type: 'dialog', lines: [
        'RICO: …and that is why we don\u2019t hire cousins.',
        'RICO: Vice Palms is ours again. Every neon sign, every palm.',
      ] },
    ],
    onPass(game) { game.hud.subtitle('RICO: Vice Palms is ours again. Palm trees forever, kid.', 4.5); },
  },
];

const SIDES = [
  {
    id: 's1', name: 'Taxi Rush', payout: 600, repeatable: true,
    brief: 'Three fares across town against the clock.',
    giver: 'taxiStand', giverPos: P(22, 67),
    steps: [
      { type: 'fares', count: 3, timeLimit: 100, text: 'Fares are waiting. Hit all 3 markers before the clock runs out.', needCar: 'taxi' },
    ],
  },
  {
    id: 's2', name: 'Vigilante', payout: 700, repeatable: true,
    brief: 'Crooks are parked near the park. Wreck them.',
    giver: 'parkCore', giverPos: P(86, 114),
    steps: [
      { type: 'destroy', count: 2, tag: 'vigilante', text: 'Destroy the 2 marked crook cars.', spawn: 'vigilante' },
    ],
  },
  {
    id: 's3', name: 'Beach Dash', payout: 900, repeatable: true,
    brief: 'A coast sprint down Ocean Drive — beat the clock.',
    giver: 'oceanDrive', giverPos: P(24, 141),
    steps: [
      { type: 'checkpoints', points: [
        P(46, 143), P(70, 143), P(94, 143), P(118, 143), P(134, 143), P(20, 141),
      ], timeLimit: 90, text: 'Coast sprint: hit every checkpoint down Ocean Drive in 90s.', needCar: 'any' },
    ],
  },
  {
    id: 's4', name: 'Bank Run', payout: 1200, repeatable: true,
    brief: 'The Coral Bank, then lose everyone they send.',
    giver: 'policeStation', giverPos: P(87, 65),
    steps: [
      { type: 'goto', pos: P(87, 66), r: 46, text: 'Get to the Coral Bank across from VCPD Central.' },
      { type: 'wait', t: 4, text: 'Cracking the vault… try to look casual.' },
      { type: 'heat', stars: 3, text: 'Silent alarm. Three stars of company.' },
      { type: 'goto', pos: P(55, 45), r: 56, text: 'Lay low at Rico\u2019s Garage with the take.' },
    ],
  },
];

// ---------------------------------------------------------------------------

export class Missions {
  constructor(game) {
    this.game = game;
    this.storyIndex = 0;       // next story mission to offer
    this.current = null;       // active running mission
    this.sideDone = {};        // id -> times passed
    this.markerPulse = 0;
    this.pickupFlash = 0;
  }

  /** Called once the world exists: shove giver markers out of buildings. */
  settleMarkers() {
    const all = [...STORY.map((m) => m.giverPos), ...SIDES.map((m) => m.giverPos)];
    for (const pos of all) {
      for (let tries = 0; tries < 40; tries++) {
        const near = [];
        this.game.world.solidsNear(pos.x, pos.y, 40, near);
        if (!near.some((r) => circleRectHit(pos.x, pos.y, 12, r))) break;
        pos.y += 24;
      }
    }
  }

  /** All markers currently standing in the world. */
  markers() {
    const out = [];
    if (!this.current) {
      if (this.storyIndex < STORY.length) {
        const m = STORY[this.storyIndex];
        out.push({ pos: m.giverPos, kind: 'story', label: m.name, mission: m });
      }
      if (this.storyIndex >= 1) {
        for (const s of SIDES) {
          if (!s.repeatable && this.sideDone[s.id]) continue;
          out.push({ pos: s.giverPos, kind: 'side', label: s.name, mission: s });
        }
      }
    } else {
      const st = this.current;
      const step = st.def.steps[st.step];
      if (step && (step.type === 'goto') && step.pos) {
        out.push({ pos: step.pos, kind: 'objective', label: null });
      }
      if (step && step.type === 'checkpoints') {
        out.push({ pos: step.points[st.cp], kind: 'checkpoint', label: null });
      }
      if (step && step.type === 'fares' && st.fares[st.fareIdx]) {
        out.push({ pos: st.fares[st.fareIdx], kind: 'checkpoint', label: null });
      }
    }
    return out;
  }

  start(def, isSide) {
    const game = this.game;
    this.current = {
      def, isSide, step: 0, t: 0, timer: 0,
      spawnDone: false, targets: [], cp: 0,
      fareIdx: 0, fares: [],
      deliverCar: null,
      startedHeat: game.police.wanted,
      failReason: null,
    };
    const brief = def.brief || (def.steps[0] && def.steps[0].text) || 'Get it done.';
    game.hud.subtitle(`${def.name.toUpperCase()}: ${brief}`, 4.5);
    game.audio.pass();
  }

  fail(reason) {
    const game = this.game;
    const st = this.current;
    if (!st) return;
    this.current = null;
    game.hud.subtitle(`Mission failed — ${reason}. Return to the marker to retry.`, 4);
    game.audio.fail();
    this.cleanupCars(st);
  }

  pass() {
    const game = this.game;
    const st = this.current;
    if (!st) return;
    const payout = st.def.payout;
    game.player.money += payout;
    game.stats.addMoney(payout);
    game.stats.bump(st.isSide ? 'sides' : 'missions');
    game.hud.missionPassed(st.def.name, payout);
    game.audio.pass();
    if (st.isSide) this.sideDone[st.def.id] = (this.sideDone[st.def.id] || 0) + 1;
    else {
      this.storyIndex++;
      if (st.def.onPass) st.def.onPass(game);
    }
    this.current = null;
    this.cleanupCars(st);
    game.autosave();
  }

  cleanupCars(st) {
    const game = this.game;
    for (const c of st.targets) {
      if (c && !c.dead && c.driver !== 'player') {
        c.missionTag = null;
      }
    }
    game.cars = game.cars.filter((c) => !(c.missionTag === 'gang' || c.missionTag === 'vigilante' || c.missionTag === 'escape') || c.dead);
  }

  // ------------------------------------------------------------- update

  update(dt) {
    this.markerPulse += dt;
    this.pickupFlash = Math.max(0, this.pickupFlash - dt);
    const game = this.game;
    const st = this.current;
    const p = game.player;

    if (!st) {
      this.checkGiverMarkers();
      return;
    }
    st.t += dt;
    const step = st.def.steps[st.step];
    if (!step) { this.pass(); return; }

    // step timer (per-step timeLimit)
    if (step.timeLimit) {
      st.timer += dt;
      if (st.timer > step.timeLimit) { this.fail('time ran out'); return; }
    }

    switch (step.type) {
      case 'goto': this.doGoto(step, st); break;
      case 'wait': this.doWait(step, st); break;
      case 'dialog': this.doDialog(step, st); break;
      case 'steal': this.doSteal(step, st); break;
      case 'heat': this.doHeat(step, st); break;
      case 'destroy': this.doDestroy(step, st); break;
      case 'destroy_escape': this.doEscape(step, st); break;
      case 'fares': this.doFares(step, st); break;
      case 'checkpoints': this.doCheckpoints(step, st); break;
      default: this.fail('unknown step'); break;
    }

    // global fail: mission car destroyed while delivering
    if (st.deliverCar && (st.deliverCar.exploded || st.deliverCar.dead)) {
      this.fail('the car was destroyed');
      return;
    }
    // global fail: wasted/busted (game.js calls failActive on those)
  }

  /** Player touching a giver marker starts the mission. */
  checkGiverMarkers() {
    const game = this.game;
    const p = game.player;
    if (p.dead) return;
    for (const m of this.markers()) {
      if (m.kind === 'objective' || m.kind === 'checkpoint') continue;
      if (dist(p.x, p.y, m.pos.x, m.pos.y) < CFG.MARKER_R) {
        this.start(m.mission, m.kind === 'side');
        this.pickupFlash = 1;
        return;
      }
    }
  }

  // ------------------------------------------------------------- step impls

  doGoto(step, st) {
    const game = this.game;
    const p = game.player;
    const d = dist(p.x, p.y, step.pos.x, step.pos.y);
    if (step.needThisCar) {
      if (!p.car || p.car !== st.deliverCar) return; // must arrive in the car
    }
    if (step.inCar === true && !p.car) return;
    if (d < (step.r || CFG.MARKER_R)) {
      if (step.needThisCar) this.dropDeliverable(st);
      this.advance(st, step);
    }
  }

  doWait(step, st) {
    st.t2 = (st.t2 || 0) + 1 / 60;
    if (st.t2 >= (step.t || 2)) {
      st.t2 = 0;
      this.advance(st, null);
    }
  }

  /** Cutscene-ish dialogue: subtitle lines in sequence, no player input. */
  doDialog(step, st) {
    st.lineIdx = st.lineIdx || 0;
    st.lineT = (st.lineT || 0) + 1 / 60;
    const hold = 2.8;
    if (st.lineT === 1 / 60 || st.lineT < 0.02) {
      const line = step.lines[st.lineIdx];
      if (line) this.game.hud.subtitle(line, hold);
    }
    if (st.lineT >= hold) {
      st.lineT = 0;
      st.lineIdx++;
      if (st.lineIdx >= step.lines.length) {
        st.lineIdx = 0;
        this.advance(st, null);
      }
    }
  }

  doSteal(step, st) {
    const game = this.game;
    const p = game.player;
    // spawn the target car near the marked point once
    if (!st.spawnDone) {
      st.spawnDone = true;
      const spec = CAR_SPECS.find((s) => s.id === step.spec) || CAR_SPECS[0];
      const car = placeCar(spec, step.near.x + 40, step.near.y + 30, DIR_ANG[1], {
        color: spec.colors[1], driver: null, parked: true, missionTag: 'steal',
      });
      game.cars.push(car);
      st.deliverCar = car;
      game.hud.subtitle(`Find the ${spec.name} — it\u2019s marked on your map.`, 3);
    }
    if (p.car === st.deliverCar) {
      this.advance(st, step);
    }
  }

  doHeat(step, st) {
    const game = this.game;
    if (game.police.wanted < step.stars) {
      game.police.heat = Math.max(game.police.heat, CFG.STAR_TABLE[step.stars - 1] + 2);
      game.police.updateStars();
      game.hud.subtitle(step.text, 3.5);
    }
    // pass when the heat is gone OR the player simply survives 25s of it
    st.t2 = (st.t2 || 0) + 1 / 60;
    if (game.police.wanted === 0) {
      game.hud.subtitle('Heat\u2019s gone. Clean sweep.', 2.5);
      this.advance(st, step);
    } else if (st.t2 > 30) {
      game.hud.subtitle('You outran them long enough.', 2.5);
      game.police.clear();
      this.advance(st, step);
    }
  }

  doDestroy(step, st) {
    const game = this.game;
    if (!st.spawnDone) {
      st.spawnDone = true;
      const near = step.spawn === 'gang' ? P(58, 10) : P(86, 118);
      for (let i = 0; i < step.count; i++) {
        const spec = CAR_SPECS[i % CAR_SPECS.length];
        const car = placeCar(spec, near.x + (i % 2) * 90 - 45, near.y + Math.floor(i / 2) * 70, DIR_ANG[0], {
          color: '#5d1f2a', driver: null, parked: true, missionTag: step.tag,
          headlights: false,
        });
        game.cars.push(car);
        st.targets.push(car);
      }
      game.hud.subtitle(`Destroy the ${step.count} marked cars.`, 3);
    }
    let destroyed = 0;
    for (const c of st.targets) if (c.exploded || c.dead) destroyed++;
    if (destroyed >= step.count) this.advance(st, step);
  }

  doEscape(step, st) {
    const game = this.game;
    if (!st.spawnDone) {
      st.spawnDone = true;
      // the traitor's car spawns near the penthouse and races for the runway
      const spec = CAR_SPECS[1]; // Stinger
      const car = placeCar(spec, P(101, 53).x, P(101, 53).y + 40, DIR_ANG[1], {
        color: '#1d1d24', driver: 'ai', dir: 1, missionTag: 'escape', headlights: true,
      });
      car.escapeMode = true;
      game.cars.push(car);
      st.targets.push(car);
      st.target = car;
      game.hud.subtitle('THE TRAITOR IS RUNNING! Wreck his car!', 4);
    }
    const car = st.target;
    if (car.exploded || car.dead) {
      this.advance(st, step);
      return;
    }
    // drive the escape car along the airfield runway
    this.driveEscape(car, dt);
    // fail if it reaches the far end of the runway
    if (car.x > 157 * CFG.T) {
      this.fail('the traitor escaped');
    }
  }

  driveEscape(car, dt) {
    const game = this.game;
    // path: penthouse -> east highway -> airfield runway -> far east end
    let tx, ty;
    if (car.y < 100 * CFG.T && car.x < 134 * CFG.T) {
      tx = 134 * CFG.T; ty = 96 * CFG.T;
    } else {
      tx = 158 * CFG.T; ty = 90 * CFG.T;
    }
    const want = Math.atan2(ty - car.y, tx - car.x);
    const err = Math.atan2(Math.sin(want - car.ang), Math.cos(want - car.ang));
    car.throttle = 1;
    car.steer = clamp(err * 2.0, -1, 1);
    car.control(car.throttle, car.steer, false, dt, game.weather ? game.weather.gripMult() : 1);
    void game;
  }

  doFares(step, st) {
    const game = this.game;
    const p = game.player;
    if (!st.spawnDone) {
      st.spawnDone = true;
      st.fares = [P(37, 66), P(80, 45), P(60, 92)];
      game.hud.subtitle('Get a cab — any cab — then hit the fare markers.', 3.5);
    }
    if (step.needCar === 'taxi' && (!p.car || p.car.spec.kind !== 'taxi')) {
      // gentle nudge, not a hard fail
      if (!st.warned) {
        st.warned = true;
        game.hud.subtitle('Grab a Cabby first (yellow taxis).', 3);
      }
      return;
    }
    const target = st.fares[st.fareIdx];
    if (!target) { this.advance(st, step); return; }
    if (!p.car) return;
    if (dist(p.x, p.y, target.x, target.y) < 52) {
      st.fareIdx++;
      game.player.money += 150;
      game.audio.cash();
      game.hud.subtitle(st.fareIdx < st.fares.length ? 'Fare collected! Next stop marked.' : 'Last fare done — get back!', 2.5);
      if (st.fareIdx >= st.fares.length) this.advance(st, step);
    }
  }

  doCheckpoints(step, st) {
    const game = this.game;
    const p = game.player;
    if (!p.car) return;
    const target = step.points[st.cp];
    if (!target) { this.advance(st, step); return; }
    if (dist(p.x, p.y, target.x, target.y) < 56) {
      st.cp++;
      game.audio.cash();
      if (st.cp < step.points.length) {
        game.hud.subtitle(`Checkpoint ${st.cp}/${step.points.length}!`, 1.6);
      } else {
        this.advance(st, step);
      }
    }
  }

  advance(st, step) {
    st.step++;
    st.t2 = 0;
    st.spawnDone = false;
    st.timer = 0;
    const next = st.def.steps[st.step];
    if (next && next.text) {
      this.game.hud.subtitle(next.text, 3.5);
    }
    void step;
  }

  dropDeliverable(st) {
    st.deliverCar = null;
  }

  /** The player died or got busted: active mission fails. */
  failActive() {
    if (this.current) this.fail('you went down');
  }

  /** Remaining mission timer for the HUD. */
  timeLeft() {
    const st = this.current;
    if (!st) return null;
    const step = st.def.steps[st.step];
    if (!step || !step.timeLimit) return null;
    return Math.max(0, step.timeLimit - st.timer);
  }
}

export { STORY, SIDES };
