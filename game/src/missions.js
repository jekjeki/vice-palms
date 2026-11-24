// Vice Palms — missions: 6 chained story missions (Rico returns to Vice Palms)
// plus 3 repeatable side missions, rampage pick-ups and the shop markers.

import { PLAYER } from './config.js';
import { randRoadPoint } from './world.js';
import { spawnMissionCar } from './traffic.js';
import { dist, fmtMoney, fmtTime } from './util.js';
import { makeCar } from './cars.js';
import { makePed } from './peds.js';

export function makeMissions() {
  const m = {
    storyIdx: 0,
    active: null,
    banner: null,
    coolT: 0,
    finale: false,
    rampage: null,       // { n, t, kills, pay }
    shopCool: 0,
    sprayCool: 0,
    onTargetDown(game, car) {
      if (m.active && m.active.def.steps[m.active.stepIdx].type === 'destroy') {
        m.active.down++;
      }
    },
  };
  return m;
}

// ------------------------------------------------------------------ story

const STORY = [
  {
    id: 'welcome', name: 'WELCOME BACK', giver: 'safehouse', pay: 750,
    brief: 'Rico: Vaas is gone but Vice Palms still owes me. Grab my package from the dock office.',
    steps: [
      { type: 'goto', to: 'dockoffice', r: 66, sub: 'Pick up the package at the dock office.' },
      { type: 'goto', to: 'parkstage', r: 66, timer: 85, sub: 'Drop the package at the park stage. Clock is running.' },
      { type: 'goto', to: 'safehouse', r: 66, sub: 'Rico: Bring it home. Word travels fast in this town.' },
    ],
  },
  {
    id: 'groves', name: 'PALM GROVE RUN', giver: 'safehouse', pay: 1000,
    brief: 'Rico: Three growers left drops around town. Collect them before the heat wakes up.',
    steps: [
      { type: 'collect', n: 3, sub: 'Collect the drops — follow the yellow blips.' },
      { type: 'goto', to: 'safehouse', r: 66, sub: 'Bring everything back to the safehouse.' },
    ],
  },
  {
    id: 'dockside', name: 'DOCKSIDE DEAL', giver: 'dockoffice', pay: 1400,
    brief: 'Rico: The Curlies are moving my product off my own pier. Wreck their runners.',
    steps: [
      { type: 'destroy', n: 2, at: 'dockoffice', sub: 'Destroy the rival runners at the docks.' },
      { type: 'lose', sub: 'That called the cops. Lose the heat.' },
      { type: 'goto', to: 'safehouse', r: 66, sub: 'Meet Rico at the safehouse.' },
    ],
  },
  {
    id: 'airfield', name: 'AIRFIELD RUN', giver: 'parkstage', pay: 1600,
    brief: 'Rico: A payplane lands at Palm Airfield with a case for Vaas. Beat it there.',
    steps: [
      { type: 'goto', to: 'airfieldtower', r: 84, timer: 100, sub: 'Reach the airfield tower before the case changes hands.' },
      { type: 'lose', sub: 'The tower called it in. Lose the heat.' },
    ],
  },
  {
    id: 'neon', name: 'NEON TRAILS', giver: 'airfieldtower', pay: 2000,
    brief: 'Rico: Someone talked. The informant is bolting downtown in a pink Cheetah. Total it.',
    steps: [
      { type: 'destroy', n: 1, at: 'airfieldtower', car: 'sports', flee: true, sub: "The informant's Cheetah is running. Wreck it." },
    ],
  },
  {
    id: 'palmsfall', name: 'PALMS FALL', giver: 'safehouse', pay: 3000,
    brief: 'Rico: One last score — Vaas himself is at the pier. This ends tonight.',
    steps: [
      { type: 'goto', to: 'dockoffice', r: 84, sub: 'Meet Rico at the pier.' },
      { type: 'survive', t: 40, sub: 'Hold the pier against the Curlies.' },
      { type: 'destroy', n: 1, at: 'dockoffice', car: 'limo', flee: true, sub: "Vaas is running for the ship in a limo. Wreck it." },
    ],
  },
];

const SIDE = [
  {
    id: 'taxi', name: 'VICE CAB', letter: 'T', col: '#ffd12d', giver: 'taxistand', pay: 450,
    brief: 'Vice Cab: Fares are waiting. Three drops, no dents.',
    steps: [], // generated at start
  },
  {
    id: 'wreck', name: 'WRECKING CREW', letter: 'W', col: '#ff9f2d', giver: 'wreckyard', pay: 900,
    brief: 'Yard boss: Three beaters need scrapping. They will not come quietly.',
    steps: [
      { type: 'destroy', n: 3, at: 'wreckyard', car: 'sedan', flee: true, sub: 'Scrap the three marked beaters.' },
    ],
  },
  {
    id: 'airmail', name: 'AIR MAIL', letter: 'A', col: '#23e6ff', giver: 'airmail', pay: 700,
    brief: 'Dispatcher: Hot cargo for Palm Airfield. No detours, no questions.',
    steps: [
      { type: 'goto', to: 'airfieldtower', r: 84, timer: 75, sub: 'Deliver the cargo to the airfield tower.' },
    ],
  },
];

// ------------------------------------------------------------------ runtime

export function updateMissions(game, dt) {
  const M = game.missions;
  M.coolT -= dt;
  M.shopCool -= dt;
  M.sprayCool -= dt;
  if (M.banner) {
    M.banner.t -= dt;
    if (M.banner.t <= 0) M.banner = null;
  }

  // ---- rampage mode
  if (M.rampage) {
    const R = M.rampage;
    R.t -= dt;
    if (R.kills >= R.n) {
      game.player.money += R.pay;
      game.banner('RAMPAGE COMPLETE!', fmtMoney(R.pay), '#ff9f2d');
      game.audio.jingle(true);
      M.rampage = null;
    } else if (R.t <= 0) {
      game.banner('RAMPAGE FAILED', 'The gang scattered', '#ff4d6d');
      M.rampage = null;
    } else {
      // keep the pressure on: a fresh gang member wanders in now and then
      if (game.frame % 90 === 0 && game.peds.filter((q) => q.kind === 'gang').length < 7) {
        const pt = randRoadPoint(game.world, Math.random, game.player.x, game.player.y, 260, 600);
        game.peds.push(makePed(pt.x, pt.y, 'gang'));
      }
      return; // no new missions while rampaging
    }
  }

  // ---- shops: auto-purchase markers
  const sp = game.world.spawns;
  const p = game.player;
  if (M.shopCool <= 0 && !p.inCar && dist(p.x, p.y, sp.ammu.x, sp.ammu.y) < 34) {
    game.playerShop();
    M.shopCool = 1.4;
  }
  if (M.sprayCool <= 0 && p.inCar && dist(p.x, p.y, sp.spray.x, sp.spray.y) < 40) {
    game.playerSpray();
    M.sprayCool = 1.6;
  }

  if (!M.active) {
    // walking into a marker starts a mission (or a rampage)
    const mk = activeMarkers(game);
    for (const k of mk) {
      if (dist(game.player.x, game.player.y, k.x, k.y) < 34) {
        if (k.rampage) {
          startRampage(game);
        } else if (k.def) {
          startMission(game, k.def, k.side);
        }
        break;
      }
    }
    return;
  }

  const A = M.active;
  const step = A.def.steps[A.stepIdx];

  // timers
  if (step.timer !== undefined && step.type === 'goto') {
    A.timer -= dt;
    if (A.timer <= 0) { failMission(game, 'Out of time'); return; }
  }
  if (step.type === 'survive') {
    A.timer -= dt;
    A.waveT -= dt;
    if (A.waveT <= 0) {
      A.waveT = 11;
      const c = makeCar('cruiser', game.player.x + rand(-380, 380), game.player.y + rand(-380, 380), 0, 'police');
      c.ai = { mode: 'chase' };
      game.cars.push(c);
    }
    if (A.timer <= 0) nextStep(game);
    return;
  }
  if (step.type === 'goto') {
    const t = A.target;
    if (t && dist(game.player.x, game.player.y, t.x, t.y) < step.r) nextStep(game);
    return;
  }
  if (step.type === 'collect') {
    const left = game.pickups.filter((p) => p.tag === 'mission').length;
    if (left === 0) nextStep(game);
    return;
  }
  if (step.type === 'destroy') {
    if (A.down >= step.n) nextStep(game);
    return;
  }
  if (step.type === 'lose') {
    if (game.police.wanted === 0) nextStep(game);
    return;
  }
}

function rand(a, b) { return a + Math.random() * (b - a); }

/** A rampage: knock down 10 Curlies in 45 seconds for cash. */
export function startRampage(game) {
  const M = game.missions;
  if (M.rampage || M.active) return;
  M.rampage = { n: 10, t: 45, kills: 0, pay: 500 };
  for (let k = 0; k < 6; k++) {
    const pt = randRoadPoint(game.world, Math.random, game.player.x, game.player.y, 120, 420);
    game.peds.push(makePed(pt.x, pt.y, 'gang'));
  }
  game.banner('RAMPAGE!', 'Waste 10 Curlies in 45 seconds', '#ff4d6d');
  game.audio.jingle(false);
}

function nextStep(game) {
  const A = game.missions.active;
  A.stepIdx++;
  A.down = 0;
  if (A.stepIdx >= A.def.steps.length) {
    passMission(game);
    return;
  }
  beginStep(game, A);
}

function beginStep(game, A) {
  const step = A.def.steps[A.stepIdx];
  A.timer = step.timer !== undefined ? step.timer : 0;
  A.target = null;
  game.subtitle(step.sub, 4.2);

  if (step.type === 'goto') {
    A.target = step.target ? { ...step.target } : { ...game.world.spawns[step.to] };
    game.audio.blip(520, 0.1, 'triangle', 0.12);
  } else if (step.type === 'collect') {
    for (let k = 0; k < step.n; k++) {
      const pt = randRoadPoint(game.world, Math.random, game.player.x, game.player.y, 650, 1600);
      game.pickups.push({ x: pt.x, y: pt.y, kind: 'cash', val: 0, tag: 'mission', t: 0 });
    }
  } else if (step.type === 'destroy') {
    const sp = game.world.spawns[step.at];
    for (let k = 0; k < step.n; k++) {
      const type = step.car || 'sedan';
      const c = spawnMissionCar(game, sp.x + rand(-160, 160), sp.y + rand(-160, 160), type, step.flee ? 'flee' : 'chase');
      c.color = A.side ? '#8f5f3a' : (type === 'limo' ? '#15151b' : '#ff2d78');
      if (type === 'limo') c.color = '#15151b';
    }
  } else if (step.type === 'lose') {
    if (game.police.wanted === 0) game.addCrime(1.6);
  } else if (step.type === 'survive') {
    A.waveT = 0.5;
    game.addCrime(2.5);
  }
}

export function startMission(game, def, isSide) {
  const M = game.missions;
  if (M.active || M.coolT > 0) return;
  // taxi generates its route on the fly
  if (def.id === 'taxi') {
    def = { ...def, steps: [] };
    for (let k = 0; k < 3; k++) {
      const pt = randRoadPoint(game.world, Math.random, game.player.x, game.player.y, 500, 1700);
      def.steps.push({ type: 'goto', to: null, target: pt, r: 56, timer: 48, sub: 'Fare ' + (k + 1) + ' of 3 — get them there!' });
    }
  }
  M.active = { def, side: isSide, stepIdx: -1, down: 0, timer: 0, waveT: 0, target: null };
  game.banner(def.name, def.brief, '#ffd12d');
  game.audio.jingle(true);
  // stepIdx -1 means "briefing shown, begin first step next frame"
  M.active.stepIdx = 0;
  beginStep(game, M.active);
}

export function passMission(game) {
  const M = game.missions;
  const A = M.active;
  const pay = A.def.pay;
  game.player.money += pay;
  game.stats.moneyEarned += pay;
  game.stats.missionsDone++;
  M.coolT = 2;
  if (!A.side) {
    M.storyIdx = Math.min(M.storyIdx + 1, STORY.length);
    if (M.storyIdx >= STORY.length) {
      M.finale = true;
      game.banner('VICE PALMS SAVED', 'Rico: The city is ours again, kid. ' + fmtMoney(pay), '#7dffa8', 6);
      game.subtitle('The story is complete — side missions stay open.', 6);
    } else {
      game.banner('MISSION PASSED!', A.def.name + ' — ' + fmtMoney(pay), '#7dffa8');
    }
  } else {
    game.banner('JOB DONE!', A.def.name + ' — ' + fmtMoney(pay), '#7dffa8');
  }
  game.audio.jingle(true);
  M.active = null;
  cleanup(game);
  game.save();
}

export function failMission(game, why) {
  const M = game.missions;
  if (!M.active) return;
  game.banner('MISSION FAILED', why || 'Try again at the marker', '#ff4d6d');
  game.audio.jingle(false);
  M.coolT = 2;
  M.active = null;
  cleanup(game);
}

function cleanup(game) {
  for (let i = game.cars.length - 1; i >= 0; i--) {
    const c = game.cars[i];
    if (c.tag === 'mission' && !c.dead) game.cars.splice(i, 1);
    else if (c.tag === 'mission') game.cars.splice(i, 1);
  }
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    if (game.pickups[i].tag === 'mission') game.pickups.splice(i, 1);
  }
  game.police.blocks.length = 0;
}

// ------------------------------------------------------------------ markers

/**
 * Every active mission marker: the story giver (gold, R) while the story is
 * unfinished, plus side-job givers, the shops and rampage pick-ups.
 */
export function activeMarkers(game) {
  const M = game.missions;
  const out = [];
  if (M.rampage) return out;
  if (M.active) {
    const step = M.active.def.steps[M.active.stepIdx];
    if (step.type === 'goto' && M.active.target) {
      out.push({ x: M.active.target.x, y: M.active.target.y, letter: '!', col: '#23e6ff' });
    }
    return out;
  }
  if (M.coolT > 0) return out;
  if (M.storyIdx < STORY.length) {
    const sp = game.world.spawns[STORY[M.storyIdx].giver];
    out.push({ x: sp.x, y: sp.y, letter: 'R', col: '#ffd12d', def: STORY[M.storyIdx], side: false });
  }
  for (const s of SIDE) {
    const sp = game.world.spawns[s.giver];
    out.push({ x: sp.x, y: sp.y, letter: s.letter, col: s.col, def: s, side: true });
  }
  // shops
  out.push({ x: game.world.spawns.ammu.x, y: game.world.spawns.ammu.y, letter: 'G', col: '#a8ff2d' });
  out.push({ x: game.world.spawns.spray.x, y: game.world.spawns.spray.y, letter: 'S', col: '#b06bff' });
  // rampage pick-ups
  if (!M.rampage) {
    for (const key of ['rampage1', 'rampage2']) {
      const sp = game.world.spawns[key];
      out.push({ x: sp.x, y: sp.y, letter: '☠', col: '#ff4d6d', rampage: key });
    }
  }
  return out;
}

/** HUD line describing the current objective. */
export function objectiveText(game) {
  const M = game.missions;
  if (M.rampage) {
    const R = M.rampage;
    return 'RAMPAGE: ' + R.kills + '/' + R.n + ' — ' + Math.ceil(R.t) + 's';
  }
  if (!M.active) {
    if (M.storyIdx >= STORY.length) return 'Story complete — side work stays open';
    return 'Story: ' + STORY[M.storyIdx].name;
  }
  const step = M.active.def.steps[M.active.stepIdx];
  let txt = step.sub;
  if (step.timer !== undefined && step.type === 'goto') txt += '  [' + fmtTime(M.active.timer) + ']';
  if (step.type === 'survive') txt += '  [' + Math.ceil(M.active.timer) + 's]';
  if (step.type === 'destroy') txt += '  (' + M.active.down + '/' + step.n + ')';
  if (step.type === 'collect') {
    const left = game.pickups.filter((p) => p.tag === 'mission').length;
    txt += '  (' + (step.n - left) + '/' + step.n + ')';
  }
  return txt;
}
