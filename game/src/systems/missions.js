// Missions and story: six chained jobs for Rico's old contacts, each a small stage machine
// with world markers, a minimap flag, fail/retry and cash rewards. Later missions unlock as
// earlier ones pay out.

import { BLOCKS, PITCH, ROAD_W, SIDEWALK } from '../config.js';
import { blockCenter } from '../world/city.js';
import { dist2 } from '../util.js';

/** A point on the road grid: always reachable on foot or by car. */
function roadPoint(i, j) {
  return { x: i * PITCH, y: j * PITCH };
}

/** A point on the south sidewalk of block (i, j), where contacts stand. */
function sidePoint(i, j) {
  return { x: (i + 0.5) * PITCH, y: (j + 1) * PITCH - ROAD_W / 2 - SIDEWALK / 2 };
}

const GARAGE = sidePoint(12, 26);
const PLAZA = sidePoint(19, 20);
const PAWN = sidePoint(24, 7);
const MARINA = { x: BLOCKS * PITCH - 46, y: 6.5 * PITCH };

export const GIVERS = [
  { name: 'Rosa', x: GARAGE.x, y: GARAGE.y },
  { name: 'Rosa', x: GARAGE.x, y: GARAGE.y },
  { name: 'Rosa', x: GARAGE.x, y: GARAGE.y },
  { name: 'Serge', x: PAWN.x, y: PAWN.y },
  { name: 'Serge', x: PAWN.x, y: PAWN.y },
  { name: 'Marisol', x: PLAZA.x, y: PLAZA.y },
];

export const MISSIONS = [
  {
    title: 'Back in Town',
    brief: "Rosa: “Rico? After six years? Don't hug me, the cops still ask about you. Get to my garage — we talk there.”",
    outro: "Rosa: “Still drives like a tourist. Good. I have work.”",
    reward: 300,
    stages: [{ type: 'goto', x: GARAGE.x, y: GARAGE.y, r: 46, text: 'Reach Rosa’s garage' }],
  },
  {
    title: 'Repossession',
    brief: "Rosa: “A client skipped three payments on a Tempest GT. It parks at the Sunset lot. Bring it here — in one shape.”",
    outro: "Rosa: “Told you it would still be there. People here trust nobody, and I trust that.”",
    reward: 500,
    stages: [
      { type: 'steal', x: 27 * PITCH, y: 14 * PITCH, r: 70, text: 'Steal the marked Tempest GT', vehicle: 2 },
      { type: 'goto-vehicle', x: GARAGE.x, y: GARAGE.y, r: 60, text: 'Deliver it to the garage', vehicleTag: 'mission' },
    ],
  },
  {
    title: 'The Night Run',
    brief: "Rosa: “A package sits in my garage. The buyer waits at the plaza. One hundred seconds, Rico. Don’t open it.”",
    outro: "Buyer: “Clean. Rosa sends her best people and her worst apologies.”",
    reward: 700,
    stages: [
      { type: 'goto', x: GARAGE.x, y: GARAGE.y, r: 46, text: 'Pick up the package at the garage' },
      { type: 'goto-timed', x: PLAZA.x, y: PLAZA.y, r: 60, text: 'Deliver to the buyer at the plaza', time: 100 },
    ],
  },
  {
    title: 'Clean Up the Books',
    brief: "Serge: “My ledger is in three briefcases my former partners forgot to steal. Collect them before somebody honest does.”",
    outro: "Serge: “Now the numbers only embarrass me. Much better.”",
    reward: 900,
    stages: [
      { type: 'collect', text: 'Collect the briefcases', points: [roadPoint(8, 9), roadPoint(30, 10), roadPoint(22, 33)] },
    ],
  },
  {
    title: 'Smoke Break',
    brief: "Serge: “Three Coachline vans at the Coral Yard carry what owes me. Turn them into what the fire marshal writes up.”",
    outro: "Serge: “Beautiful. Terrible, but beautiful. Here, and don’t spend it on smoke.”",
    reward: 1400,
    stages: [
      { type: 'destroy', x: 33 * PITCH, y: 29 * PITCH, r: 90, text: 'Destroy the three Coachline vans', vehicle: 4, count: 3 },
    ],
  },
  {
    title: 'The Last Ride',
    brief: "Marisol: “The department has a file with your name in wet ink. Every car they have is coming. Reach the marina gate — the boat won’t wait and neither will I.”",
    outro: "Marisol: “Welcome to the water, Rico. Vice Palms never changes — that’s why we love it.”",
    reward: 2500,
    stages: [
      { type: 'escape', x: MARINA.x, y: MARINA.y, r: 60, text: 'Lose them or outrun them — reach the marina gate', stars: 3 },
    ],
  },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.index = 0;             // next mission to offer
    this.active = null;         // { def, stage, collected, destroyed, timer, tag }
    this.finished = false;
    this.bannerT = 0;
    this.bannerText = '';
    this.bannerColor = '#ffd977';
  }

  /** Where the current marker points: giver when idle, objective when active. */
  marker() {
    if (this.active) {
      const st = this.currentStage();
      if (!st) return null;
      if (st.type === 'collect') {
        const pt = st.points[this.active.collected];
        return pt ? { x: pt.x, y: pt.y, color: '#7dffa4' } : null;
      }
      if (st.type === 'destroy') return { x: st.x, y: st.y, color: '#ff6b5f' };
      return { x: st.x, y: st.y, color: '#ffd977' };
    }
    if (this.finished || this.index >= MISSIONS.length) return null;
    const g = GIVERS[this.index];
    return { x: g.x, y: g.y, color: '#ffd977' };
  }

  objectiveText() {
    if (!this.active) {
      if (this.finished || this.index >= MISSIONS.length) return 'Vice Palms is yours now. Free roam.';
      return `Meet ${GIVERS[this.index].name} for the next job`;
    }
    const st = this.currentStage();
    if (!st) return 'Job done — get paid';
    let text = st.text;
    if (st.type === 'collect') text += ` (${this.active.collected}/${st.points.length})`;
    if (st.type === 'destroy') text += ` (${this.active.destroyed}/${st.count})`;
    if (st.type === 'goto-timed' && this.active.timer != null) text += ` — ${Math.ceil(this.active.timer)}s`;
    if (st.type === 'escape') text += ` — keep the stars up`;
    return text;
  }

  currentStage() {
    const a = this.active;
    if (!a) return null;
    return a.def.stages[a.stage] ?? null;
  }

  /** Player walked into the idle giver marker. */
  tryStart(player) {
    if (this.active || this.finished || this.index >= MISSIONS.length) return;
    const g = GIVERS[this.index];
    if (dist2(player.x, player.y, g.x, g.y) < 55 * 55) this.start(this.index);
  }

  start(index) {
    const game = this.game;
    const def = MISSIONS[index];
    this.active = { def, stage: 0, collected: 0, destroyed: 0, timer: null, index };
    const st = def.stages[0];
    if (st.type === 'steal') this.spawnMissionVehicle(st);
    if (st.type === 'destroy') this.spawnTargetVans(st);
    if (st.type === 'goto-timed' || st.type === 'escape') { /* timers set on stage entry */ }
    this.enterStage(0);
    this.banner(def.title, def.brief, 6.5, '#ffd977');
    game.audio.blip(520);
  }

  enterStage(stageIdx) {
    const game = this.game;
    const a = this.active;
    a.stage = stageIdx;
    const st = a.def.stages[stageIdx];
    if (!st) { this.complete(); return; }
    if (st.type === 'steal') this.spawnMissionVehicle(st);
    if (st.type === 'destroy') this.spawnTargetVans(st);
    if (st.type === 'goto-timed') a.timer = st.time;
    if (st.type === 'escape') { game.wanted.stars = Math.max(game.wanted.stars, st.stars); game.onWantedStart(); }
  }

  spawnMissionVehicle(st) {
    const game = this.game;
    if (this.missionVehicle && !this.missionVehicle.exploded) return;
    const v = game.spawnVehicle(st.vehicle, st.x, st.y, -Math.PI / 2);
    v.tag = 'mission';
    v.role = 'parked';
    this.missionVehicle = v;
  }

  spawnTargetVans(st) {
    const game = this.game;
    for (let k = 0; k < st.count; k++) {
      const v = game.spawnVehicle(st.vehicle, st.x + (k - 1) * 46, st.y + (k - 1) * 90, k % 2 ? Math.PI / 2 : -Math.PI / 2);
      v.tag = 'target';
    }
  }

  update(dt, player) {
    const game = this.game;
    this.bannerT -= dt;
    this.tryStart(player);
    const a = this.active;
    if (!a) return;
    const st = this.currentStage();
    if (!st) return;
    if (a.timer != null) {
      a.timer -= dt;
      if (a.timer <= 0) { this.fail('OUT OF TIME'); return; }
    }

    switch (st.type) {
      case 'goto':
      case 'goto-timed':
        if (dist2(player.x, player.y, st.x, st.y) < st.r * st.r) {
          a.timer = null;
          this.enterStage(a.stage + 1);
        }
        break;
      case 'steal': {
        const v = this.missionVehicle;
        if (!v || v.exploded || v.dead) { this.fail('THE TEMPEST IS SCRAP'); return; }
        if (v.role === 'player') {
          game.wanted.add('carjack');
          this.enterStage(a.stage + 1);
        }
        break;
      }
      case 'goto-vehicle': {
        const v = this.missionVehicle;
        if (!v || v.exploded || v.dead) { this.fail('THE TEMPEST IS SCRAP'); return; }
        if (v.role === 'player' && dist2(v.x, v.y, st.x, st.y) < st.r * st.r) {
          v.role = 'parked';
          if (player.inCar === v) game.exitVehicle();
          this.enterStage(a.stage + 1);
        }
        break;
      }
      case 'collect':
        if (dist2(player.x, player.y, st.points[a.collected].x, st.points[a.collected].y) < 42 * 42) {
          a.collected++;
          game.audio.blip(660);
          game.fx.cash(player.x, player.y);
          if (a.collected >= st.points.length) this.enterStage(a.stage + 1);
        }
        break;
      case 'destroy': {
        // Count tagged vans that are gone; fail is impossible except by leaving them all.
        if (a.destroyed >= st.count) this.enterStage(a.stage + 1);
        break;
      }
      case 'escape':
        if (game.wanted.stars < 2) { game.wanted.stars = 3; game.onWantedStart(); }
        if (dist2(player.x, player.y, st.x, st.y) < st.r * st.r) this.complete();
        break;
    }
  }

  notifyVehicleDestroyed(v) {
    const a = this.active;
    if (!a) return;
    const st = this.currentStage();
    if (!st) return;
    if (st.type === 'destroy' && v.tag === 'target') {
      a.destroyed++;
      this.game.audio.blip(300);
    }
    if (this.missionVehicle === v && (st.type === 'steal' || st.type === 'goto-vehicle')) {
      this.fail('THE TEMPEST IS SCRAP');
    }
  }

  complete() {
    const game = this.game;
    const a = this.active;
    game.player.money += a.def.reward;
    this.finished = this.index === MISSIONS.length - 1;
    this.index = Math.min(this.index + 1, MISSIONS.length);
    this.banner('MISSION COMPLETE', `${a.def.outro}  +$${a.def.reward}`, 6.5, '#7dffa4');
    game.fx.cash(game.player.x, game.player.y);
    game.audio.blip(880);
    this.active = null;
    this.missionVehicle = null;
    game.save();
  }

  fail(reason) {
    const game = this.game;
    this.banner('MISSION FAILED', reason, 5, '#ff6b5f');
    this.active = null;
    this.missionVehicle = null;
    game.audio.blip(140);
  }

  banner(text, sub, seconds, color) {
    this.bannerText = text;
    this.bannerSub = sub;
    this.bannerT = seconds;
    this.bannerColor = color;
  }
}
