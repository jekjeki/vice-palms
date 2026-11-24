// missions.js — 6 chained story missions (Rico returns to Vice Palms) plus
// 3 side missions: markers, steps, timers, fail/retry, payouts, subtitles.

import { CFG } from './config.js';
import { dist, clamp, angDiff } from './util.js';
import { makeCar, explodeCar, carSpeed } from './cars.js';
import { makePed, panicNear } from './peds.js';
import { LANDMARKS } from './world.js';

// ------------------------------------------------------------------ defs

export function buildMissionDefs() {
  const L = LANDMARKS;
  return {
    story: [
      {
        id: 'm1', name: 'Homecoming', giver: { x: L.diner.x, y: L.diner.y }, payout: 500,
        brief: ["RICO: Look who crawled back to Vice Palms!", "RICO: Grab the lockbox from Sunrise Garage before the brackets rust.", "RICO: And don't scratch the paint, hotshot."],
        steps: [
          { type: 'goto', x: L.garage.x, y: L.garage.y, r: 60, text: "Pick up the lockbox at Sunrise Garage." },
          { type: 'goto', x: L.diner.x, y: L.diner.y, r: 60, text: "Bring the lockbox back to Rico's Diner." },
        ],
      },
      {
        id: 'm2', name: 'Repo Runner', giver: { x: L.diner.x, y: L.diner.y }, payout: 1500,
        brief: ["RICO: A pink Banshee GT is squatting at the North Docks.", "RICO: The bank wants it. We want it more. Bring it in clean."],
        steps: [
          { type: 'jackCar', model: 'sports', x: 3350, y: 560, color: '#ff5fa8', text: "Steal the pink Banshee at the North Docks.", alarmStars: 1 },
          { type: 'deliverCar', x: L.garage.x, y: L.garage.y, r: 70, text: "Deliver the Banshee to Sunrise Garage." },
        ],
      },
      {
        id: 'm3', name: 'Bombshell', giver: { x: L.diner.x, y: L.diner.y }, payout: 2500,
        brief: ["RICO: The Ferrettis run product out of the warehouse on the docks.", "RICO: This van has a very generous payload. Park it inside and walk away.", "RICO: You've got 75 seconds. After that the van finds its own boom."],
        steps: [
          { type: 'jackCar', model: 'van', x: 700, y: 2700, color: '#3a3f4c', text: "Pick up the bomb van at the safehouse.", bomb: true },
          { type: 'deliverCar', x: L.warehouse.x, y: L.warehouse.y, r: 80, text: "Park the van inside the rival warehouse.", deliverTimer: 75 },
          { type: 'exitAt', x: L.warehouse.x, y: L.warehouse.y, r: 200, text: "Get clear — 200m blast radius!" },
        ],
      },
      {
        id: 'm4', name: 'Hot Pursuit', giver: { x: L.diner.x, y: L.diner.y }, payout: 3000,
        brief: ["RICO: A Ferretti runner is touring Ocean Drive in a red Banshee.", "RICO: Wreck it before he clears the city limits."],
        steps: [
          { type: 'destroyRunner', x: 4260, y: 1400, text: "Destroy the red runner on Ocean Drive.", escapeT: 100 },
        ],
      },
      {
        id: 'm5', name: 'Airfield Run', giver: { x: L.diner.x, y: L.diner.y }, payout: 4000,
        brief: ["RICO: A crate with our name on it landed at Palm Airfield.", "RICO: The brass is twitchy — expect heat the moment you touch grass."],
        steps: [
          { type: 'goto', x: L.airfieldPkg.x, y: L.airfieldPkg.y, r: 50, text: "Reach the crate at Palm Airfield.", forceStars: 2 },
          { type: 'goto', x: L.diner.x, y: L.diner.y, r: 60, text: "Run the crate back to Rico's Diner." },
        ],
      },
      {
        id: 'm6', name: 'The Last Palm', giver: { x: L.diner.x, y: L.diner.y }, payout: 10000,
        brief: ["RICO: Last job, kid. The Ferretti convoy is staging at the docks.", "RICO: Burn both cars. Then lose the storm that follows and get home."],
        steps: [
          { type: 'destroyTargets', near: { x: 3400, y: 780 }, n: 2, text: "Destroy both convoy cars at the docks." },
          { type: 'escape', text: "Lose the heat and get back to the safehouse.", dest: { x: L.safehouse.x, y: L.safehouse.y }, r: 70, forceStars: 4 },
        ],
      },
    ],
    side: [
      {
        id: 's1', name: 'Cab Duty', giver: { x: L.taxiStand.x, y: L.taxiStand.y }, payout: 450, color: '#46b1ff',
        brief: ["DISPATCH: Three fares, three neighborhoods. The meter is running."],
        steps: [
          { type: 'gotoCar', x: 2360, y: 560, r: 70, text: "Fare 1: pick up at the downtown block." },
          { type: 'gotoCar', x: 3600, y: 1700, r: 70, text: "Fare 2: drop-in near the east towers." },
          { type: 'gotoCar', x: 1160, y: 2300, r: 70, text: "Fare 3: last pickup in Palm Heights." },
        ],
      },
      {
        id: 's2', name: 'Beach Run', giver: { x: 4200, y: 1100 }, payout: 1000, color: '#46b1ff',
        brief: ["STREET RACE SIGN-UP: Three gates down Ocean Drive. Beat 40 seconds."],
        steps: [
          { type: 'gates', gates: [{ x: 4260, y: 1500 }, { x: 4260, y: 2200 }, { x: 4260, y: 2900 }], r: 90, t: 40, text: "Hit gate 1 on Ocean Drive!" },
        ],
      },
      {
        id: 's3', name: 'Vigilante', giver: { x: L.police.x, y: L.police.y }, payout: 2000, color: '#46b1ff',
        brief: ["SERGEANT DANA: Three gang buggies are tearing up Palm Heights.", "SERGEANT DANA: Flatten all three and the city looks the other way."],
        steps: [
          { type: 'destroyGang', n: 3, text: "Destroy the gang buggies (red dots on the map)." },
        ],
      },
    ],
  };
}

// ------------------------------------------------------------------ state

export function initMissions(g) {
  const defs = buildMissionDefs();
  g.missions = {
    defs,
    storyIdx: 0,
    sideDone: [],
    active: null,
    activeSide: false,
    retry: null,
    stats: { passed: 0, failed: 0, kills: 0, jacks: 0, earned: 0 },
  };
  if (!g.subs) g.subs = [];
}

export function say(g, text, dur = 3.4) {
  g.subs.push({ text, t: dur, dur });
  if (g.subs.length > 3) g.subs.shift();
}

export function toast(g, text, col) {
  g.toasts.push({ text, t: 2.6, col: col || '#e8e8f0' });
}

/** markers the world shows right now (for hud + render + minimap) */
export function currentMarkers(g) {
  const out = [];
  const M = g.missions;
  if (M.active) {
    const A = M.active;
    const st = A.def.steps[A.step];
    if (st) {
      if (st.type === 'goto' || st.type === 'gotoCar' || st.type === 'deliverCar') {
        out.push({ x: st.x, y: st.y, r: st.r || CFG.MARKER_R, col: '#ffd24a', kind: 'target' });
      } else if (st.type === 'escape') {
        out.push({ x: st.dest.x, y: st.dest.y, r: st.r, col: '#ffd24a', kind: 'target' });
      } else if (st.type === 'gates') {
        const gate = st.gates[A.data.gateIdx || 0];
        if (gate) out.push({ x: gate.x, y: gate.y, r: st.r, col: '#46b1ff', kind: 'target' });
      } else if (st.type === 'jackCar' || st.type === 'deliverCar2') {
        if (A.data.car && !A.data.car.dead) out.push({ x: A.data.car.x, y: A.data.car.y, r: 30, col: '#ffd24a', kind: 'target' });
      } else if (st.type === 'destroyRunner' && A.data.runner && !A.data.runner.dead) {
        out.push({ x: A.data.runner.x, y: A.data.runner.y, r: 30, col: '#ff5a5a', kind: 'target' });
      } else if (st.type === 'destroyTargets') {
        for (const t of A.data.targets || []) if (t && !t.dead && !t.exploded) out.push({ x: t.x, y: t.y, r: 30, col: '#ff5a5a', kind: 'target' });
      } else if (st.type === 'destroyGang') {
        for (const t of A.data.gang || []) if (t && !t.dead && !t.exploded) out.push({ x: t.x, y: t.y, r: 30, col: '#ff5a5a', kind: 'target' });
      } else if (st.type === 'exitAt' && A.data.car && !A.data.car.dead) {
        out.push({ x: A.data.car.x, y: A.data.car.y, r: 30, col: '#ff7a1a', kind: 'target' });
      }
    }
  } else {
    const s = M.defs.story[M.storyIdx];
    if (s) out.push({ x: s.giver.x, y: s.giver.y, r: CFG.MARKER_R, col: '#ffd24a', kind: 'giver', mission: s, side: false });
    M.defs.side.forEach((sm) => {
      if (!M.sideDone.includes(sm.id)) out.push({ x: sm.giver.x, y: sm.giver.y, r: CFG.MARKER_R, col: sm.color, kind: 'giver', mission: sm, side: true });
    });
  }
  return out;
}

// ------------------------------------------------------------------ start / stop

export function startMission(g, def, isSide) {
  const M = g.missions;
  if (M.active) return;
  M.active = { def, step: 0, t: 0, data: {}, cars: [], timer: null, markers: [] };
  M.activeSide = isSide;
  say(g, `— ${def.name.toUpperCase()} —`, 2.6);
  for (const line of def.brief) say(g, line, 3.2);
  applyStars(g, def, def.steps[0]);
}

function applyStars(g, def, step) {
  const stars = (step && step.forceStars) || 0;
  if (stars > 0 && g.wanted < stars) g.hooks.addWanted(stars - g.wanted, 'mission heat');
}

export function failMission(g, reason) {
  const M = g.missions;
  if (!M.active) return;
  const def = M.active.def;
  g.passedOverlay = { text: 'MISSION FAILED', sub: reason, t: 3.2, col: '#ff5a5a' };
  g.audio.fail();
  M.stats.failed++;
  M.coolT = 2.5;
  cleanupMission(g);
  M.retry = def;
  say(g, 'Walk back into the marker to retry.', 3);
}

export function passMission(g) {
  const M = g.missions;
  if (!M.active) return;
  const def = M.active.def;
  const pay = def.payout;
  g.hooks.giveMoney(pay);
  g.audio.cash();
  g.passedOverlay = { text: 'MISSION PASSED!', sub: `$${pay.toLocaleString('en-US')}`, t: 3.4, col: '#ffd24a' };
  M.stats.passed++;
  M.stats.earned += pay;
  M.coolT = 2.5;
  cleanupMission(g);
  if (M.activeSide) M.sideDone.push(def.id);
  else M.storyIdx++;
  say(g, def.name + ' complete. ' + (M.storyIdx >= M.defs.story.length ? '' : 'Rico will be in touch.'), 3.2);
}

function cleanupMission(g) {
  const M = g.missions;
  M.active = null;
}

// ------------------------------------------------------------------ update

export function updateMissions(g, dt) {
  const M = g.missions;
  if (!M) return;
  const p = g.player;
  if (!p || p.dead) return;

  // idle: giver markers
  if (!M.active) {
    M.coolT = (M.coolT || 0) - dt;
    if (M.coolT > 0) return;
    for (const m of currentMarkers(g)) {
      if (m.kind !== 'giver') continue;
      if (dist(p.x, p.y, m.x, m.y) < m.r) {
        startMission(g, m.mission, m.side);
      }
    }
    return;
  }

  const A = M.active;
  A.t += dt;
  const def = A.def;
  const step = def.steps[A.step];
  if (!step) return passMission(g);

  // step entry effects
  if (A.stepEntered !== A.step) {
    A.stepEntered = A.step;
    if (step.text) say(g, step.text, 3.4);
    applyStars(g, def, step);
    stepEnter(g, A, step);
  }

  // timers
  if (A.timer !== null) {
    A.timer -= dt;
    if (A.timer <= 0) return failMission(g, 'Out of time.');
  }

  // generic fails
  if (p.dead) return; // game.js handles wasted → fail

  // step-specific progress
  const done = stepUpdate(g, A, step, dt);
  if (done) {
    A.step++;
    if (A.step >= def.steps.length) passMission(g);
  }
}

function stepEnter(g, A, step) {
  const p = g.player;
  switch (step.type) {
    case 'jackCar': {
      const c = makeCar(g, step.x, step.y, Math.PI / 2, step.model, {
        kind: 'mission', driver: null, color: step.color || '#b8bcc8',
      });
      c.exitKeep = true;
      A.data.car = c;
      if (step.bomb) {
        A.data.bombArmed = false;
        A.data.bombT = 0;
      }
      if (step.deliverTimer) A.timer = step.deliverTimer;
      break;
    }
    case 'deliverCar':
      if (step.deliverTimer) A.timer = step.deliverTimer;
      break;
    case 'destroyRunner': {
      const c = makeCar(g, step.x, step.y, -Math.PI / 2, 'sports', {
        kind: 'mission', driver: 'npc', color: '#e0342f',
      });
      c.exitKeep = true;
      A.data.runner = c;
      A.data.escapeT = step.escapeT;
      break;
    }
    case 'destroyTargets': {
      A.data.targets = [];
      for (let i = 0; i < step.n; i++) {
        const c = makeCar(g, step.near.x + i * 90 - 45, step.near.y, 0, i === 0 ? 'sports' : 'sedan', {
          kind: 'mission', driver: 'npc', color: i === 0 ? '#e0342f' : '#3a3f4c',
        });
        c.exitKeep = true;
        A.data.targets.push(c);
      }
      break;
    }
    case 'destroyGang': {
      A.data.gang = [];
      for (let i = 0; i < step.n; i++) {
        const ang = (i / step.n) * Math.PI * 2;
        const c = makeCar(g, 2300 + Math.cos(ang) * 500, 1700 + Math.sin(ang) * 500, ang, 'buggy', {
          kind: 'mission', driver: 'npc', color: '#2a2a30',
        });
        c.exitKeep = true;
        A.data.gang.push(c);
      }
      break;
    }
    case 'gates':
      A.data.gateIdx = 0;
      A.timer = step.t;
      break;
    case 'escape':
      if (step.forceStars && g.wanted < step.forceStars) {
        g.hooks.addWanted(step.forceStars - g.wanted, 'the final storm');
      }
      break;
    case 'exitAt':
      A.data.bombArmed = true;
      break;
  }
}

function stepUpdate(g, A, step, dt) {
  const p = g.player;
  switch (step.type) {
    case 'goto':
      return dist(p.x, p.y, step.x, step.y) < step.r;
    case 'gotoCar':
      return p.car && dist(p.x, p.y, step.x, step.y) < step.r;
    case 'jackCar': {
      const c = A.data.car;
      if (!c || c.dead) { failMission(g, 'The car was destroyed.'); return false; }
      if (c.driver === 'player') {
        if (!A.data.starsApplied && step.alarmStars) {
          A.data.starsApplied = true;
          g.hooks.addWanted(step.alarmStars, 'car alarm');
        }
        return true;
      }
      return false;
    }
    case 'deliverCar': {
      const c = A.data.car;
      if (!c || c.dead) { failMission(g, 'The car was destroyed.'); return false; }
      if (c.driver !== 'player') {
        if (dist(c.x, c.y, step.x, step.y) < step.r) return true;
        return false;
      }
      if (dist(p.x, p.y, step.x, step.y) < step.r) {
        if (step.type === 'deliverCar' && A.def.id === 'm3') {
          // park & get out handled by next step
        }
        return true;
      }
      return false;
    }
    case 'exitAt': {
      // bomb countdown after the player leaves the blast zone
      const c = A.data.car;
      if (c && !c.dead && dist(p.x, p.y, step.x, step.y) > step.r) {
        if (!A.data.boomStarted) {
          A.data.boomStarted = true;
          say(g, 'BOMB ARMED — RUN!', 2.5);
        }
        A.data.boomT = (A.data.boomT || 3.5) - dt;
        if (A.data.boomT <= 0) {
          if (c && !c.exploded) explodeCar(g, c);
          return true;
        }
      }
      if (c && c.dead) return true;
      return false;
    }
    case 'destroyRunner': {
      const r = A.data.runner;
      if (!r) return false;
      if (r.dead || r.exploded) {
        toast(g, 'Runner down!', '#8fdc8f');
        return true;
      }
      // flee AI + escape timer
      runnerAI(g, r, p, dt);
      A.data.escapeT -= dt;
      if (A.data.escapeT <= 0) { failMission(g, 'The runner escaped the city.'); return false; }
      return false;
    }
    case 'destroyTargets': {
      const ts = A.data.targets || [];
      let alive = 0;
      for (const t of ts) if (t && !t.dead && !t.exploded) alive++;
      for (const t of ts) if (t && !t.exploded && t.driver === 'npc') runnerAI(g, t, p, dt, 0.75);
      return alive === 0;
    }
    case 'destroyGang': {
      const ts = A.data.gang || [];
      let alive = 0;
      for (const t of ts) if (t && !t.dead && !t.exploded) alive++;
      for (const t of ts) if (t && !t.exploded && t.driver === 'npc') gangAI(g, t, p, dt);
      return alive === 0;
    }
    case 'gates': {
      const gi = A.data.gateIdx;
      const gate = step.gates[gi];
      if (p.car && dist(p.x, p.y, gate.x, gate.y) < step.r) {
        A.data.gateIdx++;
        g.audio.pickup();
        if (A.data.gateIdx >= step.gates.length) return true;
        A.timer = 14;
        say(g, `Gate ${A.data.gateIdx + 1} of ${step.gates.length}!`, 2.2);
      }
      return false;
    }
    case 'escape': {
      if (g.wanted === 0) {
        return dist(p.x, p.y, step.dest.x, step.dest.y) < step.r;
      }
      return false;
    }
  }
  return false;
}

// ------------------------------------------------------------------ chase AIs

function runnerAI(g, c, p, dt, speedMul = 1) {
  // flee: drive away from the player, bounce off walls, never stop
  const away = Math.atan2(c.y - p.y, c.x - p.x);
  const want = away;
  const diff = angDiff(c.ang, want);
  c.steer = clamp(diff * 2.4, -1, 1);
  c.throttle = 1;
  c.brake = 0;
  c.handbrake = Math.abs(diff) > 1.5;
  const sp = carSpeed(c);
  if (sp < 20) c.stuckT += dt; else c.stuckT = 0;
  if (c.stuckT > 1.4) { c.stuckT = 0; c.reverseT = 0.8; }
  if (c.reverseT > 0) { c.reverseT -= dt; c.throttle = 0; c.brake = 1; c.steer = -c.steer; }
  c.panicT = 1;
}

function gangAI(g, c, p, dt) {
  // gang cars circle and occasionally ram the player
  const d = dist(c.x, c.y, p.x, p.y);
  if (d < 420) {
    runnerAI(g, c, p, dt, 0.9);
    // charge instead of flee when close
    const want = Math.atan2(p.y - c.y, p.x - c.x);
    c.steer = clamp(angDiff(c.ang, want) * 2, -1, 1);
    c.throttle = 1;
  } else {
    runnerAI(g, c, p, dt, 0.9);
  }
}

// ------------------------------------------------------------------ wasted/busted hooks into missions

export function onPlayerDied(g) {
  if (g.missions && g.missions.active) failMission(g, 'You got wasted.');
}

export function onBusted(g) {
  if (g.missions && g.missions.active) failMission(g, 'You got busted.');
}
