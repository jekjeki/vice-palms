// ============================================================
// HEISTS — "The Coral Crown Job", run out of the North Docks.
//
//   1. SCOUT    — reach the harbormaster office, copy the manifest
//   2. STEAL    — take the contraband off the skiff at Pier C
//   3. CHASE    — harbor security wakes up; lose them along the
//                 coast road checkpoints
//   4. DROP-OFF — hand the cargo over at Pier A
//
// Stage markers, per-stage timers, police response scaling, and
// a payout that rewards a fast, cool head.
// ============================================================

import { dist2, clamp } from '../util.js';

const STAGES = ['scout', 'steal', 'chase', 'dropoff'];

const STAGE_TEXT = {
  scout: 'Case the Harbormaster Office — get close, copy the manifest',
  steal: 'Grab the contraband from the skiff at Pier C',
  chase: 'Security is awake — hit the coast checkpoints',
  dropoff: 'Bring it to the Pier A drop-off, stay clean',
};

const TIME_LIMITS = { scout: 100, steal: 70, chase: 110, dropoff: 80 };
const BASE_PAYOUT = 24000;

// ------------------------------------------------------------
export function createHeists(game, district) {
  const zones = district.heistZones;

  const state = {
    active: false,
    stage: null,
    stageIndex: 0,
    timer: 0,
    timerMax: 0,
    stolen: false,
    chasePoint: 0,
    heat: 0,
    cooldown: 0,
    completedCount: 0,
    bestPayout: 0,
    lastResult: null,
    chasers: [],
    bannerT: 0,
    bannerText: '',
  };

  // ----------------------------------------------------------
  function available() {
    return !state.active && state.cooldown <= 0;
  }

  function start() {
    if (state.active) return false;
    state.active = true;
    state.stage = 'scout';
    state.stageIndex = 0;
    state.stolen = false;
    state.chasePoint = 0;
    state.heat = 0;
    state.timerMax = TIME_LIMITS.scout;
    state.timer = state.timerMax;
    state.chasers = [];
    banner('HEIST: THE CORAL CROWN JOB', 'Stage 1 — ' + STAGE_TEXT.scout, 6, '#ffd977');
    game.phone?.pushMessage?.('fixer-marla', 'Coral Crown job is live. Harbormaster office first. Quiet feet, Rico.', { urgent: true });
    game.audio?.blip?.(525);
    return true;
  }

  function abort(reason) {
    if (!state.active) return;
    state.active = false;
    state.cooldown = 120;
    clearChasers();
    banner('HEIST ABORTED', reason ?? 'Walked away.', 5, '#ff6b5f');
    game.audio?.blip?.(140);
  }

  function complete() {
    const timeBonus = Math.round((state.timer / state.timerMax) * BASE_PAYOUT * 0.4);
    const heatPenalty = Math.round(state.heat * 350);
    const total = Math.max(6000, BASE_PAYOUT + timeBonus - heatPenalty);
    game.player.money += total;
    state.completedCount++;
    state.bestPayout = Math.max(state.bestPayout, total);
    state.lastResult = { payout: total, heat: state.heat, at: Date.now() };
    state.active = false;
    state.cooldown = 200;
    clearChasers();
    banner('HEIST PASSED', `+$${total.toLocaleString()} — Marla says don't spend it in one place.`, 6.5, '#7dffa4');
    game.fx?.cash?.(game.player.x, game.player.y);
    game.audio?.blip?.(880);
    game.phone?.pushMessage?.('fixer-marla', `Clean work. $${total.toLocaleString()} wired. The Coral Crown sails lighter and nobody upstairs knows why.`);
    // A clean heist still cools a little heat: the harbor forgets fast.
    if (game.wanted.stars > 0) game.wanted.stars = Math.max(0, game.wanted.stars - 1);
    game.save();
  }

  function clearChasers() {
    for (const c of state.chasers) {
      if (c && !c.wasted) {
        c.role = 'parked';
        c.siren = false;
      }
    }
    state.chasers = [];
  }

  // ----------------------------------------------------------
  function nextStage(stage) {
    state.stage = stage;
    state.stageIndex = STAGES.indexOf(stage);
    state.timerMax = TIME_LIMITS[stage] ?? 90;
    state.timer = state.timerMax;
    banner(`HEIST ${state.stageIndex + 1}/4`, STAGE_TEXT[stage], 4.5, '#ffd977');
    game.audio?.blip?.(660);
  }

  function failTimer() {
    abort('Out of time.');
  }

  // ----------------------------------------------------------
  function update(dt, player) {
    if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt);
    state.bannerT = Math.max(0, state.bannerT - dt);
    if (!state.active) return;

    state.timer -= dt;
    if (state.timer <= 0) {
      failTimer();
      return;
    }

    switch (state.stage) {
      case 'scout': {
        const z = zones.scout;
        const near = dist2(player.x, player.y, z.x, z.y) < z.r * z.r;
        if (near) {
          game.hud?.setPrompt?.('E — copy the shipping manifest');
          if (game.heistInteract) {
            game.heistInteract = false;
            game.audio?.blip?.(700);
            // The manifest copy is a crime the harbor notices.
            game.wanted.add('gunfire');
            state.heat += 1;
            nextStage('steal');
          }
        }
        break;
      }
      case 'steal': {
        const z = zones.boat;
        const near = dist2(player.x, player.y, z.x, z.y) < z.r * z.r;
        if (near) {
          game.hud?.setPrompt?.('E — cut the line, take the cargo');
          if (game.heistInteract) {
            game.heistInteract = false;
            state.stolen = true;
            game.audio?.blip?.(300);
            banner('CARGO SECURED', 'Harbor security just lit up. Drive.', 4, '#ffd977');
            // Police response scales with the job's noise.
            game.wanted.stars = Math.max(game.wanted.stars, 3);
            game.onWantedBegin();
            state.heat += 2;
            spawnChasers(z.x, z.y, 2);
            nextStage('chase');
          }
        }
        break;
      }
      case 'chase': {
        const pts = zones.chase.pts;
        const wp = pts[Math.min(state.chasePoint, pts.length - 1)];
        game.hud?.setObjective?.(`HEIST 3/4 — ${STAGE_TEXT.chase} (${state.chasePoint + 1}/${pts.length})`);
        if (dist2(player.x, player.y, wp.x, wp.y) < 90 * 90) {
          state.chasePoint++;
          game.audio?.blip?.(760);
          // Each checkpoint keeps the pressure honest: occasional extra heat.
          if (Math.random() < 0.4) {
            game.wanted.stars = Math.min(5, game.wanted.stars + 1);
            game.onWantedBegin();
            spawnChasers(player.x + 400, player.y + 400, 1);
          }
          if (state.chasePoint >= pts.length) {
            banner('YOU LOST THEM', 'Drop-off is quiet. Pier A, on foot.', 4, '#7dffa4');
            // Ditch the cruisers that lost the trail.
            for (const c of state.chasers) { if (!c.wasted) { c.role = 'parked'; c.siren = false; } }
            state.chasers = [];
            if (game.wanted.stars > 2) game.wanted.stars = 2;
            nextStage('dropoff');
          }
        }
        break;
      }
      case 'dropoff': {
        const z = zones.dropoff;
        const near = dist2(player.x, player.y, z.x, z.y) < z.r * z.r;
        if (near) {
          game.hud?.setPrompt?.('E — hand off the cargo');
          if (game.heistInteract) {
            game.heistInteract = false;
            complete();
          }
        }
        break;
      }
    }

    // Chasers that are still alive keep hunting.
    for (const c of state.chasers) {
      if (c && !c.wasted && !c.wreck) c.siren = true;
    }
    // An E-press only counts for the step it landed in.
    game.heistInteract = false;
  }

  function spawnChasers(x, y, n) {
    for (let k = 0; k < n; k++) {
      const cop = game.spawnCar(-1, x + (k % 2 ? 60 : -60), y + 160 + k * 120, Math.PI / 2);
      cop.role = 'cop';
      cop.siren = true;
      game.cops.cruisers.push(cop);
      state.chasers.push(cop);
    }
  }

  /** The game loop funnels E-presses here when a heist prompt is live. */
  function queueInteract() {
    game.heistInteract = true;
  }

  function marker() {
    if (!state.active) return null;
    const z = zones[state.stage];
    if (!z) return null;
    if (state.stage === 'chase') {
      const pts = zones.chase.pts;
      return { ...pts[Math.min(state.chasePoint, pts.length - 1)], color: '#c7a23a' };
    }
    return { x: z.x, y: z.y, color: '#c7a23a' };
  }

  function objectiveText() {
    if (!state.active) return null;
    let text = `HEIST ${state.stageIndex + 1}/4 — ${STAGE_TEXT[state.stage] ?? ''}`;
    if (state.stage === 'chase') {
      text += ` (${state.chasePoint + 1}/${zones.chase.pts.length})`;
    }
    text += ` — ${Math.ceil(state.timer)}s`;
    return text;
  }

  function banner(text, sub, secs, color) {
    game.missions?.banner?.(text, sub, secs, color);
  }

  function hudInfo() {
    return {
      available: available(),
      active: state.active,
      stage: state.stage,
      timer: state.timer,
      timerMax: state.timerMax,
      cooldown: state.cooldown,
      completedCount: state.completedCount,
      bestPayout: state.bestPayout,
    };
  }

  function serialize() {
    return {
      completedCount: state.completedCount,
      bestPayout: state.bestPayout,
      lastResult: state.lastResult,
    };
  }

  function deserialize(data) {
    if (!data) return;
    if (typeof data.completedCount === 'number') state.completedCount = data.completedCount;
    if (typeof data.bestPayout === 'number') state.bestPayout = data.bestPayout;
    if (data.lastResult) state.lastResult = data.lastResult;
  }

  return {
    STAGES,
    STAGE_TEXT,
    BASE_PAYOUT,
    state,
    available,
    start,
    abort,
    update,
    marker,
    objectiveText,
    queueInteract,
    hudInfo,
    serialize,
    deserialize,
  };
}
