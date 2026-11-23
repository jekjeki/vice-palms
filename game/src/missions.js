// missions.js — 6 chained story missions (Rico returns to Vice Palms) + 3 repeatable
// side gigs. Markers, stage machine, timers, fail/retry, payouts, subtitles.
import { S, hooks, addMoney, say, toast, clamp, dist, Rng } from './core.js';
import { world } from './world.js';
import { makeCar, carSpeed } from './cars.js';
import { addWanted, setWanted } from './police.js';

const SIDES = {
  taxi: {
    name: 'Fare Rush', giver: { x: 4300, y: 2700 }, blip: '#39c8ff', repeat: true,
    intro: 'FARE RUSH — pick up 3 fares around town before the meters run out.',
    stages: [
      { k: 'goto', x: 3900, y: 1150, r: 55, secs: 70, text: 'Pick up the fare at the docks gate.', drop: { x: 3060, y: 3350, r: 55, secs: 80, text: 'Drop the fare downtown.' } },
      { k: 'goto', x: 5300, y: 1000, r: 55, secs: 95, text: 'Fare to Palm Airfield, and step on it.', drop: { x: 2450, y: 2750, r: 55, secs: 100, text: 'Drop the fare at Palm Park.' } },
      { k: 'goto', x: 1100, y: 3550, r: 55, secs: 110, text: 'Last fare: the westside motels.', drop: { x: 2050, y: 4072, r: 55, secs: 110, text: 'Drop them at the Palms Hotel.' } },
    ],
    payout: 420,
  },
  post: {
    name: 'Express Post', giver: { x: 900, y: 1050 }, blip: '#39c8ff', repeat: true,
    intro: 'EXPRESS POST — grab 3 parcels and run them to the airfield hangar.',
    stages: [
      { k: 'collect', items: [{ x: 620, y: 470 }, { x: 1500, y: 950 }, { x: 350, y: 980 }], secs: 210, text: 'Collect the parcels in the docklands.' },
      { k: 'goto', x: 4900, y: 1150, r: 60, secs: 150, needCar: true, text: 'Deliver the parcels to Hangar 1 at Palm Airfield.' },
    ],
    payout: 600,
  },
  rampage: {
    name: 'Beach Rampage', giver: { x: 3500, y: 4240 }, blip: '#ff7a2a', repeat: true,
    intro: 'BEACH RAMPAGE — wreck 6 vehicles in 90 seconds. The heat is ON.',
    stages: [{ k: 'rampage', secs: 90, kills: 6, wanted: 2, text: 'Wreck 6 vehicles!' }],
    payout: 800,
  },
};

const STORY = [
  {
    id: 'm1', name: 'Welcome Back to Vice Palms', giver: { x: 2050, y: 4072 }, payout: 500,
    stages: [
      { k: 'goto', x: 2050, y: 4072, r: 48, text: 'Meet Rico at the Palms Hotel on Ocean Drive.' },
      { k: 'wait', secs: 4.5, text: 'RICO: Little brother! Vice Palms got rich and ugly while you were away.' },
      { k: 'wait', secs: 4.5, text: 'RICO: The docks crew jacked my shipment. Drive us to the pier office — and no wrong turns.' },
      { k: 'goto', x: 1620, y: 800, r: 62, needCar: true, text: 'Drive Rico to the pier office in the North Docks.' },
    ],
    outro: 'RICO: Good to have you back. First cut — spend it loud.',
  },
  {
    id: 'm2', name: 'Pier Pressure', giver: { x: 1620, y: 800 }, payout: 750,
    stages: [
      { k: 'goto', x: 1000, y: 640, r: 60, text: "Rico's Cheetah GT is stashed in the container yard. Find it." },
      { k: 'enterTag', tag: 'cheetah', text: 'Steal the Cheetah GT.', onEnter: 'wanted1' },
      { k: 'goto', x: 2280, y: 1350, r: 60, needCar: true, secs: 150, text: 'Deliver it to the garage downtown. The dock crew tipped off the cops!', carTag: 'cheetah' },
    ],
    outro: 'RICO: Shiny. The crew will be furious — perfect.',
  },
  {
    id: 'm3', name: 'Neon Run', giver: { x: 3060, y: 2700 }, payout: 1000,
    stages: [
      { k: 'goto', x: 3060, y: 2700, r: 70, needCar: true, text: 'Bring any car to the starting line downtown.' },
      { k: 'checkpoints', pts: [
        { x: 1900, y: 700 }, { x: 4700, y: 700 }, { x: 5900, y: 2300 },
        { x: 5100, y: 3900 }, { x: 3500, y: 4150 }, { x: 2700, y: 2700 },
      ], r: 58, secs: 260, text: 'Hit every neon checkpoint. Clock is running!' },
    ],
    outro: 'RICO: Fastest thing on Ocean Drive, little brother!',
  },
  {
    id: 'm4', name: 'Package Deal', giver: { x: 2050, y: 4072 }, payout: 1500,
    stages: [
      { k: 'collect', items: [
        { x: 800, y: 700, tag: 'dock' }, { x: 2690, y: 2700, tag: 'park' },
        { x: 5100, y: 560, tag: 'air' }, { x: 4200, y: 4260, tag: 'beach' },
      ], secs: 300, text: 'Collect all 4 packages. After the second one the cops get curious.' },
      { k: 'goto', x: 5340, y: 4072, r: 62, text: 'Deliver the packages to the beach house.' },
    ],
    outro: 'RICO: Clean. This city is starting to bend for us.',
  },
  {
    id: 'm5', name: 'Airfield Bust', giver: { x: 2280, y: 1350 }, payout: 2000,
    stages: [
      { k: 'goto', x: 5300, y: 1000, r: 90, needCar: true, text: "Rival crew is squatting on Palm Airfield. Drive out and bust it up." },
      { k: 'destroy', spawn: [
        { type: 'muscle', x: 4900, y: 900 }, { type: 'muscle', x: 5600, y: 950 }, { type: 'sports', x: 5200, y: 1250 },
      ], secs: 90, text: 'Destroy all 3 rival cars on the tarmac.' },
      { k: 'survive', secs: 25, wanted: 3, text: 'Their friends called the cops. Survive 25 seconds!' },
    ],
    outro: 'RICO: Airfield is ours. That runway prints money now.',
  },
  {
    id: 'm6', name: 'The Vice Palms Job', giver: { x: 1900, y: 700 }, payout: 5000, finale: true,
    stages: [
      { k: 'goto', x: 1300, y: 900, r: 85, needCar: true, text: 'One last job. The convoy parks at Pier 2 at midnight. Go take it.' },
      { k: 'enterTag', tag: 'convoy', text: 'Steal the Phoenix V8 from the convoy.', onEnter: 'wanted1', spawn: [{ type: 'muscle', x: 1300, y: 900, tag: 'convoy', color: '#c83020' }] },
      { k: 'survive', secs: 45, wanted: 4, text: 'RICO: Drive! I clear the cargo in 45 — just lose the heat!' },
      { k: 'goto', x: 5340, y: 4072, r: 62, needCar: true, text: 'Deliver the take to the beach house.' },
    ],
    outro: 'RICO: Vice Palms is ours, little brother. Ours.',
  },
];

// ---------------------------------------------------------------- engine
export function initMissions() {
  S.mission = { active: null, side: null, index: 0, done: [], banner: null, bannerT: 0, blip: null, sideBlip: null };
}

export function nextStory() { return S.mission.index < STORY.length ? STORY[S.mission.index] : null; }

export function markers() {
  const out = [];
  const st = nextStory();
  if (st && !S.mission.active) out.push({ x: st.giver.x, y: st.giver.y, kind: 'story', name: st.name });
  if (!S.mission.active && !S.mission.side) {
    for (const key of Object.keys(SIDES)) out.push({ x: SIDES[key].giver.x, y: SIDES[key].giver.y, kind: 'side', name: SIDES[key].name, key });
  }
  return out;
}

export function update(dt) {
  // banner lifetime
  if (S.mission.banner) { S.mission.bannerT -= dt; if (S.mission.bannerT <= 0) S.mission.banner = null; }

  // check giver markers (only when idle)
  if (!S.mission.active && !S.mission.side && !S.player.dead) {
    const p = S.player;
    const st = nextStory();
    if (st && dist(p.x, p.y, st.giver.x, st.giver.y) < 46) startStory(st);
    else if (st === null) { /* story complete */ }
    else {
      for (const [key, def] of Object.entries(SIDES)) {
        if (dist(p.x, p.y, def.giver.x, def.giver.y) < 46) { startSide(key, def); break; }
      }
    }
  }

  if (S.mission.active) runMission(S.mission.active, dt, false);
  if (S.mission.side) runMission(S.mission.side, dt, true);
}

function startStory(def) {
  S.mission.active = { def, si: -1, timer: 0, spawned: [], kills: 0, got: 0, tag: null, stageT: 0 };
  say(`${def.name.toUpperCase()} — ${def.stages[0].text}`, 6);
  S.sfx.push({ name: 'mission', x: S.player.x, y: S.player.y });
  nextStage(S.mission.active);
}

function startSide(key, def) {
  S.mission.side = { def, si: -1, timer: 0, spawned: [], kills: 0, got: 0, tag: null, stageT: 0, key };
  say(def.intro, 6);
  S.sfx.push({ name: 'mission', x: S.player.x, y: S.player.y });
  nextStage(S.mission.side);
}

function nextStage(m) {
  m.si++;
  const st = m.def.stages[m.si];
  if (!st) { complete(m); return; }
  m.stageT = st.secs ?? 0;
  m.spawnedThisStage = false;
  if (st.text) say(st.text, 5.5);
  if (st.wanted) setWanted(st.wanted);
  if (st.onEnter === 'wanted1') setWanted(Math.max(1, S.wanted + 1));
  // spawn listed vehicles once
  if (st.spawn) for (const sp of st.spawn) {
    const car = makeCar(sp.type, sp.x, sp.y, sp.ang ?? Math.PI / 2, { color: sp.color, ai: null, missionTag: sp.tag || m.def.id });
    m.spawned.push(car);
  }
  // mission-tagged target car for enterTag stages (m2 cheetah pre-spawned here)
  if (st.k === 'enterTag' && !st.spawn) {
    const car = makeCar('sports', 1000, 640, 0.3, { color: '#20c8e8', ai: null, missionTag: st.tag });
    m.spawned.push(car);
  }
  // blip target
  updateBlip(m);
}

function updateBlip(m) {
  const st = m.def.stages[m.si];
  if (!st) { m.blip = null; return; }
  if (st.k === 'checkpoints') m.blip = { x: st.pts[m.got].x, y: st.pts[m.got].y };
  else if (st.k === 'collect') { const it = st.items[m.got]; m.blip = it ? { x: it.x, y: it.y } : null; }
  else if (st.k === 'destroy') m.blip = st.spawn && m.spawned.length ? { x: m.spawned[0].x, y: m.spawned[0].y } : null;
  else m.blip = st.x !== undefined ? { x: st.x, y: st.y } : null;
}

function runMission(m, dt, isSide) {
  const st = m.def.stages[m.si];
  if (!st) return;
  const p = S.player;
  m.stageT -= dt;
  if (st.secs && m.stageT <= 0) { fail(m, 'Out of time.'); return; }
  if (p.dead) { fail(m, 'You got wasted.'); return; }

  // car-destroyed fail (tagged delivery car)
  if (st.carTag) {
    const car = m.spawned.find((c) => c.missionTag === st.carTag);
    if (car && car.dead) { fail(m, 'The car is wrecked!'); return; }
  }

  switch (st.k) {
    case 'goto': {
      const ok = dist(p.x, p.y, st.x, st.y) < (st.r ?? 55);
      if (ok && st.needCar && !p.inCar) break; // wait until in a car
      if (ok && st.drop && !m.dropPhase) {
        m.dropPhase = true;
        m.stageT = st.drop.secs;
        say(st.drop.text, 5.5);
        m.blip = { x: st.drop.x, y: st.drop.y };
        break;
      }
      if (m.dropPhase) {
        if (dist(p.x, p.y, st.drop.x, st.drop.y) < (st.drop.r ?? 55)) { if (st.drop.needCar && !p.inCar) break; m.dropPhase = false; nextStage(m); }
      } else if (ok) nextStage(m);
      break;
    }
    case 'enterTag': {
      const car = m.spawned.find((c) => c.missionTag === st.tag && !c.dead);
      if (!car) { fail(m, 'The car is gone!'); break; }
      m.blip = { x: car.x, y: car.y };
      if (p.inCar === car) {
        addWanted(1, p.x, p.y);
        nextStage(m);
      }
      break;
    }
    case 'wait': {
      m.blip = null;
      if (m.stageT <= 0.05) nextStage(m);
      break;
    }
    case 'destroy': {
      const alive = m.spawned.filter((c) => !c.dead);
      m.blip = alive.length ? { x: alive[0].x, y: alive[0].y } : null;
      if (alive.length === 0) { say(st.done || 'Targets destroyed.', 4); nextStage(m); }
      break;
    }
    case 'checkpoints': {
      if (!p.inCar) break;
      const cp = st.pts[m.got];
      m.blip = cp ? { x: cp.x, y: cp.y } : null;
      if (cp && dist(p.x, p.y, cp.x, cp.y) < (st.r ?? 55)) {
        m.got++;
        S.sfx.push({ name: 'pickup', x: p.x, y: p.y });
        say(`Checkpoint ${m.got}/${st.pts.length}`, 2);
        if (m.got >= st.pts.length) nextStage(m);
      }
      break;
    }
    case 'collect': {
      const it = st.items[m.got];
      m.blip = it ? { x: it.x, y: it.y } : null;
      if (it && dist(p.x, p.y, it.x, it.y) < 42) {
        m.got++;
        S.sfx.push({ name: 'pickup', x: p.x, y: p.y });
        say(`Package ${m.got}/${st.items.length} secured.`, 3);
        if (m.got === 2 && st.id !== 'post') setWanted(Math.max(S.wanted, 2));
        if (m.got >= st.items.length) nextStage(m);
      }
      break;
    }
    case 'survive': {
      m.blip = null;
      if (m.stageT <= 0.05) { say('Heat is off. Move!', 3); nextStage(m); }
      break;
    }
    case 'rampage': {
      m.blip = null;
      // count any car destroyed since stage start (police cars count double)
      const n = m.kills;
      if (n >= st.kills) { nextStage(m); }
      break;
    }
  }
}

function complete(m) {
  const def = m.def;
  addMoney(def.payout);
  S.mission.banner = { text: isSide(m) ? 'SIDE JOB PASSED!' : 'MISSION PASSED!', pay: def.payout, name: def.name };
  S.mission.bannerT = 3.4;
  if (def.outro) say(def.outro, 6);
  S.sfx.push({ name: 'win', x: S.player.x, y: S.player.y });
  cleanup(m);
  if (isSide(m)) { S.mission.side = null; }
  else {
    S.mission.done.push(def.id);
    if (def.finale) S.finale = true;
    S.mission.index++;
    S.mission.active = null;
  }
}

export function fail(m, reason) {
  S.mission.banner = { text: 'MISSION FAILED', pay: 0, name: `${m.def.name} — ${reason}` };
  S.mission.bannerT = 3;
  say(reason, 4);
  S.sfx.push({ name: 'fail', x: S.player.x, y: S.player.y });
  cleanup(m);
  if (isSide(m)) S.mission.side = null;
  else S.mission.active = null;
}

function isSide(m) { return m === S.mission.side; }

function cleanup(m) {
  for (const car of m.spawned) {
    if (S.player.inCar === car) continue; // keep whatever the player is driving
    car.despawn = true;
  }
  m.spawned = [];
  m.blip = null;
}

// Called by game.js whenever a car fully explodes (for rampage counting).
export function onCarDestroyed(car) {
  const m = S.mission.side;
  if (m && m.def.stages[m.si]?.k === 'rampage') {
    m.kills += car.ai === 'police' ? 2 : 1;
    say(`Wrecked: ${m.kills}/${m.def.stages[m.si].kills}`, 1.6);
  }
  const a = S.mission.active;
  if (a && a.def.id === 'm5') { /* destroy stage reads spawned list directly */ }
}

// Mission HUD line (objective + timer).
export function hudLine() {
  const m = S.mission.active || S.mission.side;
  if (!m) return null;
  const st = m.def.stages[m.si];
  if (!st) return null;
  let obj = st.drop && m.dropPhase ? st.drop.text : st.text || '';
  let t = null;
  if (st.secs) t = m.stageT;
  return { name: m.def.name, obj, t };
}
