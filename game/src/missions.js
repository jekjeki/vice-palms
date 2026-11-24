// VICE PALMS — missions: 6 chained story missions (Rico is back in town) plus
// 3 repeatable side gigs. Markers, timers, fail/retry, payouts, subtitles.

import { CFG } from './config.js';
import { G, toast, say, bigMsg, addMoney, addStars, saveGame } from './state.js';
import { dist, dist2, angTo, fmtMoney } from './util.js';
import { runRNG } from './rng.js';
import { makeCar, spawnTrafficCar, damageCar } from './cars.js';
import { spawnGang, makePed, killPed } from './peds.js';
import { play } from './audio.js';
import { terrainAt, isWater, nearestRoadPoint } from './world.js';

const poi = () => G.world.poi;

// ---------------------------------------------------------------------------
// story mission definitions. Each has steps[] — the runtime walks them in order.
// step types: goto | car_goto | steal | kill | collect | checkpoints | survive | reward

export const STORY = [
  {
    id: 'm1', name: 'Welcome Back', giver: () => poi().rico,
    intro: [
      'RICO: Junior! Word was you drowned off the Keys.',
      'RICO: Vice Palms got shiny while you were gone. Docks, palms, neon.',
      'RICO: Grab wheels. I got a crate coming in at the North Docks.',
    ],
    steps: [
      { type: 'car_goto', to: () => poi().docksGate, r: 46, hint: 'Get wheels and drive to the North Docks gate' },
      { type: 'reward', pay: 500, line: 'RICO: Clean run. The crate is yours to watch.' },
    ],
  },
  {
    id: 'm2', name: 'Container Trouble', giver: () => poi().docksGate,
    intro: [
      'RICO: Dockhands say the Rancheros crew is skimming my containers.',
      'RICO: Persuade them. Loudly.',
    ],
    steps: [
      { type: 'goto', to: () => poi().gangHideout, r: 60, hint: 'Head to the Rancheros corner of the docks' },
      { type: 'kill', count: 3, hint: 'Drop the 3 Rancheros lookouts', spawn: 'lookouts' },
      { type: 'reward', pay: 800, line: 'RICO: Nobody skims Rico Ferrara.' },
    ],
  },
  {
    id: 'm3', name: 'Hot Wheels', giver: () => poi().docksGate,
    intro: [
      'RICO: A collector at the Airfield is holding a Cheetah GT for me.',
      'RICO: He forgot to pay his debt. Bring the car to my lockup. 90 seconds.',
    ],
    steps: [
      { type: 'goto', to: () => poi().airfieldPad, r: 70, hint: 'Go to the Palm Airfield' },
      { type: 'steal', car: 'cheetah', hint: 'Steal the Cheetah GT on the apron' },
      { type: 'car_goto', to: () => poi().garage, r: 55, timer: 90, hint: 'Deliver it to Rico\'s lockup before the timer dies' },
      { type: 'reward', pay: 1200, line: 'RICO: Beautiful. Barely scratched. Mostly.' },
    ],
  },
  {
    id: 'm4', name: 'Palm Heist', giver: () => poi().garage,
    intro: [
      'RICO: El Banco keeps a case of bearer bonds in the park gazebo drop.',
      'RICO: Three couriers. Three cases. Make the whole park forget you.',
    ],
    steps: [
      { type: 'collect', count: 3, hint: 'Take the 3 bond cases from the couriers in Palm Park', area: 'park' },
      { type: 'goto', to: () => poi().garage, r: 55, hint: 'Shake the heat and bring the bonds to the lockup' },
      { type: 'reward', pay: 2000, line: 'RICO: You still got the touch, Junior.' },
    ],
  },
  {
    id: 'm5', name: 'Boardwalk Blitz', giver: () => poi().garage,
    intro: [
      'RICO: A messenger bike is slow and my clients are not.',
      'RICO: Run the beach route. Hit every flag. Seventy-five seconds.',
    ],
    steps: [
      { type: 'car_goto', to: () => ({ x: 700, y: 3040 }), r: 60, hint: 'Get on Ocean Drive at the west end' },
      { type: 'checkpoints', count: 5, timer: 75, hint: 'Hit the beach checkpoints before the clock dies' },
      { type: 'reward', pay: 2500, line: 'RICO: Fastest thing on that strip is you.' },
    ],
  },
  {
    id: 'm6', name: 'Last Ride', giver: () => poi().garage,
    intro: [
      'RICO: One last crate, Junior. The Rancheros want it — and us gone.',
      'RICO: Hold the ship deck. Then we vanish like morning fog.',
    ],
    steps: [
      { type: 'goto', to: () => poi().shipDeck, r: 80, hint: 'Get aboard the cargo ship at the middle pier' },
      { type: 'survive', count: 6, timer: 70, hint: 'Hold the deck — drop the 6 Rancheros boarders' },
      { type: 'reward', pay: 5000, line: 'RICO: Vice Palms was always ours, Junior. Ours.' },
      { type: 'ending' },
    ],
  },
];

export const SIDES = [
  {
    id: 'taxi', name: 'Taxi Fares', giver: () => poi().taxiRank, markerCol: '#5ad0ff',
    blurb: 'Pick up 3 fares in a taxi before the clock dies.',
    setup(m) {
      m.data = { fares: 0, need: 3, faresDone: 0 };
      nextFare(m);
    },
    tick(m, dt) { countdown(m, dt); },
  },
  {
    id: 'vigilante', name: 'Vigilante', giver: () => poi().policeStation, markerCol: '#8fa8ff',
    blurb: 'Wreck 2 Rancheros getaway cars loose on the strip.',
    setup(m) {
      m.data = { need: 2, done: 0, targets: [] };
      for (let i = 0; i < 2; i++) {
        const spot = nearestRoadPoint(G.world, poi().rico.x + runRNG.range(-600, 600), poi().rico.y + runRNG.range(-300, 120));
        const c = makeCar('banshee', spot.x, spot.y, runRNG.next() * 6.28, { driver: 'ai' });
        c.ai = { kind: 'traffic', speed: 170, waitT: 0 };
        c.color = '#3aa14a';
        c.missionTag = 'vig';
        G.cars.push(c);
        m.data.targets.push(c);
      }
      m.check = () => {
        m.data.done = m.data.targets.filter(c => c.dead).length;
        if (m.data.done >= m.data.need) passSide(m);
      };
    },
    tick(m, dt) {},
  },
  {
    id: 'delivery', name: 'Hot Delivery', giver: () => poi().diner, markerCol: '#ffe36e',
    blurb: 'Grab the package and deliver it across town in 65 seconds.',
    setup(m) {
      m.data = { phase: 'pickup', timer: 65, drop: { x: 3760, y: 2450 } };
      m.check = () => {};
    },
    tick(m, dt) { countdown(m, dt); },
  },
];

// ---------------------------------------------------------------------------
// runtime

export function markerStory() {
  if (G.mission) return null;
  const def = STORY[G.missionIdx];
  if (!def) return null;
  return { x: def.giver().x, y: def.giver().y, col: '#ffe36e', kind: 'story', label: def.name };
}

export function markerSide() {
  if (G.sideMission || G.mission || G.missionIdx >= STORY.length) return null;
  for (const s of SIDES) {
    if ((G.sideCooldown[s.id] || 0) > G.time) continue;
    const at = s.giver();
    return { x: at.x, y: at.y, col: s.markerCol, kind: 'side', label: s.name, side: s };
  }
  return null;
}

export function startMission(def) {
  G.mission = {
    def,
    step: 0,
    data: {},
    timer: 0,
    hint: def.steps[0].hint || def.name,
    targets: [],
    pickups: [],
    checkpoints: [],
  };
  bigMsg(def.name, '', '#ffe36e');
  play('mission');
  say(def.intro);
  enterStep(0);
}

export function updateMissions(dt) {
  updateStory(dt);
  updateSide(dt);
}

function updateStory(dt) {
  if (!G.mission) return;
  const m = G.mission;
  m.timer -= dt;
  if (m.timer > 0 && m.timer <= 0.001) {} // noop guard
  if (m.timer < 0 && m.timerActive) { failMission('Too slow. Rico hates waiting.'); return; }

  const step = m.def.steps[m.step];
  if (!step) return;
  const p = G.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;

  switch (step.type) {
    case 'goto':
      if (dist2(px, py, step.to().x, step.to().y) < step.r * step.r) {
        if (m.arriveT > 0) { m.arriveT -= dt; if (m.arriveT <= 0) nextStep(m); }
        else m.arriveT = 0.35;
      }
      break;
    case 'car_goto':
      if (!p.car) break;
      if (dist2(px, py, step.to().x, step.to().y) < step.r * step.r) {
        if (m.arriveT > 0) { m.arriveT -= dt; if (m.arriveT <= 0) nextStep(m); }
        else m.arriveT = 0.35;
      }
      break;
    case 'steal':
      if (p.car && p.car.missionTag === 'steal') nextStep(m);
      break;
    case 'kill': {
      const alive = m.targets.filter(t => !t.dead).length;
      if (alive === 0) nextStep(m);
      break;
    }
    case 'collect': {
      if (m.data.got >= m.data.need) nextStep(m);
      break;
    }
    case 'checkpoints': {
      if (m.checkpoints.length && dist2(px, py, m.checkpoints[m.data.cp].x, m.checkpoints[m.data.cp].y) < 42 * 42) {
        m.data.cp++;
        play('checkpoint');
        bigMsg('CHECKPOINT ' + m.data.cp + '/' + m.checkpoints.length, '', '#5ad0ff', 1.2);
        if (m.data.cp >= m.checkpoints.length) nextStep(m);
        else m.timerActive = true;
      }
      break;
    }
    case 'survive': {
      const alive = m.targets.filter(t => !t.dead).length;
      if (alive === 0) nextStep(m);
      break;
    }
    case 'reward':
      nextStep(m);
      break;
    case 'ending':
      finishStory();
      break;
  }

  // step hooks
  if (m.tick) m.tick(m, dt);
}

function onArrive(m, step) {
  if (m.arriveT) { m.arriveT = 0; nextStep(m); return; }
  m.arriveT = 0.35; // brief pause so the arrival reads
}

function nextStep(m) {
  m.step++;
  m.arriveT = 0; m.timerActive = false; m.timer = 0;
  m.waitGreet = 0; m.greeted = false;
  m.tick = null; m.check = null;
  enterStep(m.step);
}

function enterStep(i) {
  const m = G.mission;
  if (!m) return;
  const step = m.def.steps[i];
  if (!step) { m.step = i; return; }
  m.hint = step.hint || m.def.name;
  m.pickups = []; m.targets = []; m.checkpoints = [];

  switch (step.type) {
    case 'goto':
    case 'car_goto':
      if (step.timer) { m.timer = step.timer; m.timerActive = true; }
      break;
    case 'steal': {
      const at = { x: poi().airfieldPad.x + 60, y: poi().airfieldPad.y };
      const car = makeCar(step.car, at.x, at.y, 0, { driver: 'none' });
      car.missionTag = 'steal';
      car.color = '#e02d2d';
      car.locked = true;
      G.cars.push(car);
      bigMsg('STEAL THE ' + car.type.name.toUpperCase(), '', '#ff4fa3', 2);
      break;
    }
    case 'kill': {
      for (let k = 0; k < step.count; k++) {
        const base = poi().gangHideout;
        const g = spawnGang(base.x + runRNG.range(-90, 90), base.y + runRNG.range(-60, 60), 'story');
        m.targets.push(g);
      }
      break;
    }
    case 'collect': {
      m.data = { got: 0, need: step.count };
      const P = CFG.PARK;
      for (let k = 0; k < step.count; k++) {
        m.pickups.push({ x: runRNG.range(P.x0 + 40, P.x1 - 40), y: runRNG.range(P.y0 + 40, P.y1 - 40), kind: 'case', tag: 'story' });
      }
      G.pickups.push(...m.pickups);
      break;
    }
    case 'checkpoints': {
      m.data = { cp: 0 };
      m.timerActive = false;
      const pts = [
        { x: 1180, y: 3040 }, { x: 1660, y: 2995 }, { x: 2140, y: 3040 },
        { x: 2620, y: 2995 }, { x: 3060, y: 3040 },
      ];
      m.checkpoints = pts;
      break;
    }
    case 'survive': {
      m.data = { spawned: 0, need: step.count, spawnT: 0.5 };
      m.timer = step.timer; m.timerActive = true;
      m.tick = (mm, dt) => {
        mm.data.spawnT -= dt;
        const alive = mm.targets.filter(t => !t.dead).length;
        if (mm.data.spawned < mm.data.need && alive < 3 && mm.data.spawnT <= 0) {
          mm.data.spawnT = 2.4;
          mm.data.spawned++;
          const p = G.player;
          const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
          const a = runRNG.next() * Math.PI * 2;
          const g = spawnGang(px + Math.cos(a) * 260, py + Math.sin(a) * 260, 'boarder');
          mm.targets.push(g);
        }
      };
      break;
    }
    case 'reward':
      passMission(step);
      return;
    case 'ending':
      return;
  }
}

function passMission(step) {
  const m = G.mission;
  addMoney(step.pay);
  G.stats.missionsDone++;
  bigMsg('MISSION PASSED!', 'RESPECT +  ' + fmtMoney(step.pay), '#7dff9e', 3.4);
  play('pass');
  if (step.line) say([step.line]);
  G.missionIdx++;
  G.mission = null;
  saveGame();
  toast('Progress saved');
}

export function failMission(reason) {
  if (!G.mission) return;
  const m = G.mission;
  // clean up transient entities
  for (const t of m.targets) { if (!t.dead) t.state = 'walk'; t.missionTag = null; }
  for (const pk of m.pickups) {
    const idx = G.pickups.indexOf(pk);
    if (idx >= 0) G.pickups.splice(idx, 1);
  }
  for (const c of G.cars) { if (c.missionTag === 'steal' || c.missionTag === 'vig') { c.missionTag = null; } }
  bigMsg('MISSION FAILED', reason, '#ff4f6e', 3);
  play('fail');
  G.mission = null;
}

export function finishStory() {
  G.done = true;
  G.mission = null;
  G.missionIdx = STORY.length;
  bigMsg('VICE PALMS', 'The city sleeps. You do not.', '#3ae7ff', 5);
  say([
    'RICO: Six jobs, zero loose ends. The palms bow to you now.',
    'EPILOGUE: Junior Ferrara keeps the beach house. The Rancheros keep the sand out of their shoes. The neon keeps humming.',
  ], 6);
  saveGame();
  G.epilogue = true;
}

// ---------------------------------------------------------------------------
// side missions

export function startSide(side) {
  G.sideMission = {
    side,
    timer: 0,
    timerActive: false,
    data: {},
    targets: [],
    pickups: [],
    checkpoints: [],
    hint: side.blurb,
  };
  bigMsg(side.name, side.blurb, side.markerCol, 3);
  play('mission');
  side.setup(G.sideMission);
}

function updateSide(dt) {
  const m = G.sideMission;
  if (!m) return;
  const p = G.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
  const d = m.side.id;

  if (d === 'taxi') {
    m.side.tick(m, dt);
    const fare = m.data.current;
    if (fare) {
      if (m.data.phase === 'pickup' && p.car && dist2(px, py, fare.x, fare.y) < 40 * 40) {
        m.data.phase = 'drop';
        m.data.current = m.data.drop;
        toast('Fare aboard — drive on');
        play('blip');
      } else if (m.data.phase === 'drop' && p.car && dist2(px, py, m.data.current.x, m.data.current.y) < 40 * 40) {
        m.data.faresDone++;
        play('cash');
        addMoney(120);
        toast('Fare paid: $120  (' + m.data.faresDone + '/3)');
        if (m.data.faresDone >= 3) passSide(m);
        else { m.timer += 18; nextFare(m); }
      }
    }
    m.hint = 'Taxi fare ' + Math.min(m.data.faresDone + 1, 3) + '/3 — follow the blue marker';
  } else if (d === 'vigilante') {
    m.side.tick(m, dt);
    if (m.check) m.check();
    m.hint = 'Wreck the green getaway cars (' + (m.data.done || 0) + '/' + m.data.need + ')';
  } else if (d === 'delivery') {
    m.side.tick(m, dt);
    if (m.data.phase === 'pickup' && dist2(px, py, poi().diner.x, poi().diner.y) < 40 * 40) {
      m.data.phase = 'drop';
      toast('Package aboard');
      play('blip');
    } else if (m.data.phase === 'drop' && dist2(px, py, m.data.drop.x, m.data.drop.y) < 40 * 40) {
      addMoney(400);
      play('cash');
      passSide(m);
    }
    m.hint = m.data.phase === 'pickup' ? 'Pick up the package at the diner' : 'Deliver it to the drop marker';
  }

  // pickups shared pool check (story collect handled there; sides use own logic)
}

function countdown(m, dt) {
  if (!m.timerActive) { m.timerActive = true; if (!m.timer) m.timer = 60; }
  m.timer -= dt;
  if (m.timer <= 0) failSideMission('Too slow.');
}

function nextFare(m) {
  m.data.phase = 'pickup';
  const p = G.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
  m.data.current = {
    x: px + runRNG.range(-700, 700), y: py + runRNG.range(-500, 500),
  };
  m.data.current.x = Math.max(200, Math.min(4000, m.data.current.x));
  m.data.current.y = Math.max(200, Math.min(2980, m.data.current.y));
  m.data.drop = { x: m.data.current.x + runRNG.range(-900, 900), y: m.data.current.y + runRNG.range(-700, 700) };
  m.data.drop.x = Math.max(200, Math.min(4000, m.data.drop.x));
  m.data.drop.y = Math.max(200, Math.min(2980, m.data.drop.y));
  m.data.pickupPos = m.data.current;
}

export function passSide(m) {
  addMoney(300);
  bigMsg('SIDE JOB DONE', '+' + fmtMoney(300), '#7dff9e', 2.6);
  play('pass');
  cleanupSide();
  G.sideCooldown[m.side.id] = G.time + 25;
  G.sideMission = null;
}

export function failSideMission() {
  if (!G.sideMission) return;
  const m = G.sideMission;
  cleanupSide();
  bigMsg('SIDE JOB FAILED', 'Come back later.', '#ff4f6e', 2.4);
  G.sideCooldown[m.side.id] = G.time + 12;
  G.sideMission = null;
}

function cleanupSide() {
  const m = G.sideMission;
  if (!m) return;
  for (const c of m.targets || []) c.missionTag = null;
  for (const pk of m.pickups || []) {
    const idx = G.pickups.indexOf(pk);
    if (idx >= 0) G.pickups.splice(idx, 1);
  }
}

// active marker for HUD/minimap
export function activeMarker() {
  const s = G.mission ? missionMarker() : markerStory();
  const side = G.sideMission ? sideMarker() : markerSide();
  if (side && !s) return side;
  return s || side;
}

function missionMarker() {
  const m = G.mission;
  if (!m) return null;
  const step = m.def.steps[m.step];
  if (!step) return null;
  const p = G.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
  switch (step.type) {
    case 'goto':
    case 'car_goto': {
      const to = step.to();
      return { x: to.x, y: to.y, col: '#ffe36e', kind: 'story' };
    }
    case 'steal': {
      const c = G.cars.find(c => c.missionTag === 'steal' && !c.dead);
      return c ? { x: c.x, y: c.y, col: '#ff4fa3', kind: 'story' } : null;
    }
    case 'kill': {
      const t = m.targets.find(t => !t.dead);
      return t ? { x: t.x, y: t.y, col: '#ff4f6e', kind: 'story' } : null;
    }
    case 'collect': {
      const pk = G.pickups.find(pk => pk.tag === 'story');
      return pk ? { x: pk.x, y: pk.y, col: '#ffe36e', kind: 'story' } : null;
    }
    case 'checkpoints': {
      const c = m.checkpoints[m.data.cp];
      return c ? { x: c.x, y: c.y, col: '#5ad0ff', kind: 'story' } : null;
    }
    case 'survive': {
      const t = m.targets.find(t => !t.dead);
      return t ? { x: t.x, y: t.y, col: '#ff4f6e', kind: 'story' } : null;
    }
  }
  return null;
}

function sideMarker() {
  const m = G.sideMission;
  if (!m) return null;
  const d = m.side.id;
  const p = G.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
  if (d === 'taxi') {
    const t = m.data.current;
    return t ? { x: t.x, y: t.y, col: '#5ad0ff', kind: 'side' } : null;
  }
  if (d === 'vigilante') {
    const t = (m.targets || []).find(c => !c.dead);
    return t ? { x: t.x, y: t.y, col: '#8fa8ff', kind: 'side' } : null;
  }
  if (d === 'delivery') {
    const to = m.data.phase === 'pickup' ? poi().diner : m.data.drop;
    return { x: to.x, y: to.y, col: '#ffe36e', kind: 'side' };
  }
  return null;
}
