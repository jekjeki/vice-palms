// The story: six chained jobs for Rico's old contacts. Each is a small stage machine with a
// world marker, a minimap flag, fail/retry and a cash payout; the next job only shows its
// marker once the previous one pays out.

import { GRID, PITCH, ROAD, WALK, SAND } from '../config.js';
import { dist2 } from '../util.js';

/** A point on the street grid — always reachable on foot or by car. */
function street(i, j) { return { x: i * PITCH, y: j * PITCH }; }

/** A spot on the south sidewalk of block (i, j), where contacts wait. */
function stoop(i, j) {
  return { x: (i + 0.5) * PITCH, y: (j + 1) * PITCH - ROAD / 2 - WALK / 2 };
}

const GARAGE = stoop(12, 26);
const PLAZA = stoop(19, 20);
const PAWN = stoop(24, 7);
const MARINA = { x: GRID * PITCH - 46, y: 6.5 * PITCH };

export const GIVERS = [
  { name: 'Rosa', x: GARAGE.x, y: GARAGE.y },
  { name: 'Rosa', x: GARAGE.x, y: GARAGE.y },
  { name: 'Rosa', x: GARAGE.x, y: GARAGE.y },
  { name: 'Serge', x: PAWN.x, y: PAWN.y },
  { name: 'Serge', x: PAWN.x, y: PAWN.y },
  { name: 'Marisol', x: PLAZA.x, y: PLAZA.y },
];

export const JOBS = [
  {
    title: 'Back in Town',
    brief: 'Rosa: “Six years, Rico. Six years and not one postcard. Get yourself to my garage before this town remembers why it ate you the first time.”',
    outro: 'Rosa: “Still walking like you own the sidewalk. Good — because I have work, and the work has teeth.”',
    reward: 300,
    stages: [{ type: 'goto', x: GARAGE.x, y: GARAGE.y, r: 46, text: 'Reach Rosa’s garage' }],
  },
  {
    title: 'Repo Run',
    brief: 'Rosa: “A client quit paying on a Vanta GT. The car still sits at the Sunset lot, laughing at the paperwork. Bring it home — ideally the same shape it left in.”',
    outro: 'Rosa: “Knew it would still be there. Nobody in this city trusts anybody. I build my whole ledger on that.”',
    reward: 500,
    stages: [
      { type: 'steal', x: 27 * PITCH, y: 14 * PITCH, r: 70, text: 'Steal the marked Vanta GT', vehicle: 1 },
      { type: 'deliver', x: GARAGE.x, y: GARAGE.y, r: 60, text: 'Drive it to the garage' },
    ],
  },
  {
    title: 'The Night Run',
    brief: 'Rosa: “A case waits in my garage. A buyer waits at the plaza. Ninety seconds, Rico — and whatever you hear ticking in there, do not open it.”',
    outro: 'Buyer: “Clean work. Rosa sends her best people and her worst apologies.”',
    reward: 700,
    stages: [
      { type: 'goto', x: GARAGE.x, y: GARAGE.y, r: 46, text: 'Pick up the case at the garage' },
      { type: 'timed', x: PLAZA.x, y: PLAZA.y, r: 60, text: 'Deliver to the buyer at the plaza', time: 90 },
    ],
  },
  {
    title: 'Paper Trail',
    brief: 'Serge: “My ledger is split across three cases, held by ex-partners too lazy to steal it properly. Collect them before somebody honest does — honesty would ruin everything.”',
    outro: 'Serge: “Now the numbers only embarrass me instead of bankrupting me. Progress, Rico. Progress.”',
    reward: 900,
    stages: [
      { type: 'collect', text: 'Collect the three ledger cases', points: [street(8, 9), street(30, 10), street(22, 33)] },
    ],
  },
  {
    title: 'Torch Song',
    brief: 'Serge: “Three Tramline vans in the Coral Yard carry everything that owes me. Turn them into what the fire marshal writes up. My insurance man and I thank you in advance.”',
    outro: 'Serge: “Beautiful. Terrible, but beautiful. Here — and don’t spend it all on smoke.”',
    reward: 1400,
    stages: [
      { type: 'destroy', x: 33 * PITCH, y: 29 * PITCH, r: 90, text: 'Destroy the three Tramline vans', vehicle: 7, count: 3 },
    ],
  },
  {
    title: 'The Last Ride',
    brief: 'Marisol: “There’s a warrant with your name in fresh ink, and every cruiser in the city is out learning it by heart. A boat waits at the marina gate. Dawn doesn’t wait at all.”',
    outro: 'Marisol: “Welcome to the water, Rico. Vice Palms never lets you go — that’s the trouble with loving it.”',
    reward: 2500,
    stages: [
      { type: 'escape', x: MARINA.x, y: MARINA.y, r: 60, text: 'Reach the marina gate', stars: 3 },
    ],
  },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.cursor = 0;        // index of the next job on the board
    this.active = null;     // { def, stage, collected, torched, timer, index }
    this.done = false;
    this.bannerT = 0;
    this.bannerText = '';
    this.bannerColor = '#ffd977';
    this.jobCar = null;
  }

  /** Where the current marker points: the giver when idle, the objective when running. */
  marker() {
    const a = this.active;
    if (a) {
      const st = a.def.stages[a.stage];
      if (!st) return null;
      if (st.type === 'collect') {
        const pt = st.points[a.collected];
        return pt ? { x: pt.x, y: pt.y, color: '#7dffa4' } : null;
      }
      if (st.type === 'destroy') return { x: st.x, y: st.y, color: '#ff6b5f' };
      return { x: st.x, y: st.y, color: '#ffd977' };
    }
    if (this.done || this.cursor >= JOBS.length) return null;
    const g = GIVERS[this.cursor];
    return { x: g.x, y: g.y, color: '#ffd977' };
  }

  objectiveText() {
    if (!this.active) {
      if (this.done || this.cursor >= JOBS.length) return 'Vice Palms is yours. Free roam.';
      return `Meet ${GIVERS[this.cursor].name} for the next job`;
    }
    const st = this.currentStage();
    if (!st) return 'Job done — get paid';
    let text = st.text;
    if (st.type === 'collect') text += ` (${this.active.collected}/${st.points.length})`;
    if (st.type === 'destroy') text += ` (${this.active.torched}/${st.count})`;
    if (st.type === 'timed' && this.active.timer != null) text += ` — ${Math.ceil(this.active.timer)}s`;
    if (st.type === 'escape') text += ' — lose nobody, stop for nobody';
    return text;
  }

  currentStage() {
    const a = this.active;
    return a ? a.def.stages[a.stage] ?? null : null;
  }

  /** The player walked into the idle giver marker. */
  offerCheck(player) {
    if (this.active || this.done || this.cursor >= JOBS.length) return;
    const g = GIVERS[this.cursor];
    if (dist2(player.x, player.y, g.x, g.y) < 55 * 55) this.begin(this.cursor);
  }

  begin(index) {
    const game = this.game;
    const def = JOBS[index];
    this.active = { def, stage: 0, collected: 0, torched: 0, timer: null, index };
    this.enterStage(0);
    this.banner(def.title, def.brief, 6.5, '#ffd977');
    game.audio.blip(525);
    game.cutscenes?.playIntro(index);   // the job's opening scene, skippable with Space
    game.dialog?.mission('begin');      // control confirms the job is live
  }

  enterStage(idx) {
    const game = this.game;
    const a = this.active;
    a.stage = idx;
    const st = a.def.stages[idx];
    if (!st) { this.payout(); return; }
    if (st.type === 'steal') this.spawnJobCar(st);
    if (st.type === 'destroy') this.spawnVans(st);
    if (st.type === 'timed') a.timer = st.time;
    if (st.type === 'escape') {
      game.wanted.stars = Math.max(game.wanted.stars, st.stars);
      game.onWantedBegin();
    }
  }

  spawnJobCar(st) {
    const game = this.game;
    if (this.jobCar && !this.jobCar.wasted) return;
    const v = game.spawnCar(st.vehicle, st.x, st.y, -Math.PI / 2);
    v.tag = 'job';
    v.role = 'parked';
    this.jobCar = v;
  }

  spawnVans(st) {
    const game = this.game;
    for (let k = 0; k < st.count; k++) {
      const v = game.spawnCar(st.vehicle, st.x + (k - 1) * 46, st.y + (k - 1) * 90, k % 2 ? Math.PI / 2 : -Math.PI / 2);
      v.tag = 'van';
    }
  }

  update(dt, player) {
    const game = this.game;
    this.bannerT -= dt;
    this.offerCheck(player);
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
      case 'timed':
        if (dist2(player.x, player.y, st.x, st.y) < st.r * st.r) {
          a.timer = null;
          this.enterStage(a.stage + 1);
        }
        break;
      case 'steal': {
        const v = this.jobCar;
        if (!v || v.wasted || v.wreck) { this.fail('THE VANTA IS SCRAP'); return; }
        if (v.role === 'player') {
          game.wanted.add('carjack');
          this.enterStage(a.stage + 1);
        }
        break;
      }
      case 'deliver': {
        const v = this.jobCar;
        if (!v || v.wasted || v.wreck) { this.fail('THE VANTA IS SCRAP'); return; }
        if (v.role === 'player' && dist2(v.x, v.y, st.x, st.y) < st.r * st.r) {
          v.role = 'parked';
          if (player.car === v) game.leaveCar();
          this.enterStage(a.stage + 1);
        }
        break;
      }
      case 'collect':
        if (dist2(player.x, player.y, st.points[a.collected].x, st.points[a.collected].y) < 42 * 42) {
          a.collected++;
          game.audio.blip(665);
          game.fx.cash(player.x, player.y);
          if (a.collected >= st.points.length) this.enterStage(a.stage + 1);
        }
        break;
      case 'destroy':
        if (a.torched >= st.count) this.enterStage(a.stage + 1);
        break;
      case 'escape':
        // The city refuses to cool off during the finale: the warrant keeps the heat live.
        if (game.wanted.stars < 2) { game.wanted.stars = 3; game.onWantedBegin(); }
        if (dist2(player.x, player.y, st.x, st.y) < st.r * st.r) this.payout();
        break;
    }
  }

  /** Hook from game.onBlast: count tagged vans, fail if the job car burns. */
  vehicleGone(v) {
    const a = this.active;
    if (!a) return;
    const st = this.currentStage();
    if (!st) return;
    if (st.type === 'destroy' && v.tag === 'van') {
      a.torched++;
      this.game.audio.blip(300);
    }
    if (this.jobCar === v) this.fail('THE VANTA IS SCRAP');
  }

  payout() {
    const game = this.game;
    const a = this.active;
    game.player.money += a.def.reward;
    this.done = this.cursor === JOBS.length - 1;
    this.cursor = Math.min(this.cursor + 1, JOBS.length);
    this.banner('MISSION PASSED', `${a.def.outro}  +$${a.def.reward}`, 6.5, '#7dffa4');
    game.fx.cash(game.player.x, game.player.y);
    game.audio.blip(880);
    game.cutscenes?.playOutro(a.index);  // the job's closing scene
    game.dialog?.mission('pass');
    this.active = null;
    this.jobCar = null;
    game.save();
  }

  fail(reason) {
    const game = this.game;
    this.banner('MISSION FAILED', reason, 5, '#ff6b5f');
    this.active = null;
    this.jobCar = null;
    game.audio.blip(140);
    game.dialog?.mission('fail');
  }

  banner(text, sub, secs, color) {
    this.bannerText = text;
    this.bannerSub = sub;
    this.bannerT = secs;
    this.bannerColor = color;
  }
}
