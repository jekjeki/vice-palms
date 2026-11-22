// ============================================================
// FERRY — the bay ferry crossing from the North Docks slip out
// to the Bay Marina landing on a schedule.
//
// Boarding prompt at the slip, deck riding (Rico stands aboard),
// a horn, a painted schedule board, and a route the minimap and
// painter can both read.
// ============================================================

import { DOCKS_WATER_Y } from '../world/district.js';
import { dist2 } from '../util.js';

const CROSSING_SECONDS = 36;    // slip to landing
const DWELL_SECONDS = 9;        // loading time at each end
const SCHEDULE_SPAN = 80;       // the boat leaves every 80 s of game time

// ------------------------------------------------------------
export function createFerry(game, route) {
  const d = route;
  const state = {
    leg: 0,            // waypoint index the ferry is heading for
    mode: 'docked',    // docked | loading | crossing
    modeT: 0,
    at: 'slip',        // slip | landing | enroute
    x: d.slip.x, y: d.slip.y - 40,
    vx: 0, vy: 0,
    onboard: false,
    departT: 0,
    hornT: 0,
    wakePhase: 0,
  };

  // Departure clock: game.time based, quarter-to-nothing fancy.
  function nextDepartureIn(t) {
    const m = SCHEDULE_SPAN - (t % SCHEDULE_SPAN);
    return m;
  }

  function scheduleString(t) {
    const m = Math.ceil(nextDepartureIn(t));
    if (state.mode === 'crossing') return 'Ferry: crossing the bay';
    if (state.mode === 'loading') return 'Ferry: boarding now';
    return `Next ferry: ${m}s`;
  }

  function horn() {
    game.audio?.horn?.();
    // No dedicated horn sample: a low blip reads fine over the water.
    game.audio?.blip?.(96);
  }

  function notify(msg) {
    game.dialog?.say?.('radio', msg) ?? game.missions?.banner?.('FERRY', msg, 3, '#7bffd4');
  }

  // ----------------------------------------------------------
  function update(dt, t, player) {
    state.modeT += dt;
    state.wakePhase += dt;

    if (state.mode === 'docked') {
      state.departT += dt;
      if (nextDepartureIn(t) < 0.4 && state.departT > 3) castOff();
    } else if (state.mode === 'loading') {
      if (state.modeT > DWELL_SECONDS) {
        state.mode = 'docked';
        state.modeT = 0;
        state.departT = 0;
      }
    } else if (state.mode === 'crossing') {
      const wp = d.waypoints[state.leg];
      const dx = wp.x - state.x, dy = wp.y - state.y;
      const dist = Math.hypot(dx, dy);
      const speed = 90;
      if (dist < speed * dt + 8) {
        state.x = wp.x; state.y = wp.y;
        state.leg++;
        if (state.leg >= d.waypoints.length) arrive();
      } else {
        state.x += (dx / dist) * speed * dt;
        state.y += (dy / dist) * speed * dt;
      }
      state.hornT -= dt;
      if (state.hornT <= 0) {
        state.hornT = 11;
        horn();
      }
    }

    // Rico rides the deck: his world position tracks the boat, and he can
    // shuffle a few steps around the deck while she sails.
    if (state.onboard && player) {
      player.x = state.x + state.deckDX;
      player.y = state.y + state.deckDY;
      player.heading = state.heading ?? player.heading;
    }

    // Boarding prompt: docked at the slip with Rico close by.
    if (state.mode !== 'crossing' && player && !state.onboard) {
      const slip = state.at === 'slip' ? d.slip : d.landing;
      if (dist2(player.x, player.y, slip.x, slip.y) < 120 * 120) {
        game.hud?.setPrompt?.('E — board the ferry (' + scheduleString(t) + ')');
        game.ferryPrompt = true;
      } else if (game.ferryPrompt) {
        game.ferryPrompt = false;
      }
    }
  }

  function castOff() {
    state.mode = 'crossing';
    state.modeT = 0;
    state.leg = state.at === 'slip' ? 0 : 0;
    // The return trip runs the waypoints in reverse by flipping the array read.
    state.dir = state.at === 'slip' ? 1 : -1;
    state.hornT = 0.4;
    horn();
    banner(state.at === 'slip' ? 'Ferry casting off — Bay Marina' : 'Ferry casting off — North Docks');
  }

  function arrive() {
    state.at = state.at === 'slip' ? 'landing' : 'slip';
    state.mode = 'loading';
    state.modeT = 0;
    state.leg = 0;
    // Waypoints for the next crossing: sail back the way she came.
    if (state.at === 'landing') {
      state.path = reversePath(d.waypoints);
    } else {
      state.path = d.waypoints;
    }
    if (state.onboard) {
      state.onboard = false;
      const land = state.at === 'slip' ? d.slip : d.landing;
      const p = game.player;
      p.x = land.x;
      p.y = land.y + 60;
      banner(state.at === 'slip' ? 'Welcome to North Docks' : 'Welcome to Bay Marina');
    }
    horn();
  }

  function reversePath(pts) {
    const out = [];
    for (let i = pts.length - 1; i >= 0; i--) out.push(pts[i]);
    return out;
  }

  function banner(text) {
    game.missions?.banner?.('FERRY', text, 3.4, '#7bffd4');
  }

  // ----------------------------------------------------------
  // Boarding: Rico steps aboard and takes a spot on the deck.
  // ----------------------------------------------------------
  function board() {
    if (state.mode === 'crossing' || state.onboard) return false;
    const p = game.player;
    if (!p || p.car) return false;
    const slip = state.at === 'slip' ? d.slip : d.landing;
    if (dist2(p.x, p.y, slip.x, slip.y) > 140 * 140) return false;
    state.onboard = true;
    state.deckDX = 0;
    state.deckDY = 20;
    p.x = state.x;
    p.y = state.y + 20;
    banner('On board. She leaves on the quarter hour.');
    return true;
  }

  /** E interaction from the game loop: board when the prompt is live. */
  function tryInteract(player) {
    if (state.onboard) return false;
    const slip = state.at === 'slip' ? d.slip : d.landing;
    if (state.mode === 'crossing') return false;
    if (dist2(player.x, player.y, slip.x, slip.y) > 140 * 140) return false;
    return board();
  }

  // ----------------------------------------------------------
  // Draw: hull, cabin, wake, stack smoke handled by painter.
  // ----------------------------------------------------------
  function draw(ctx) {
    const ang = Math.atan2(
      (d.waypoints[Math.min(state.leg, d.waypoints.length - 1)].y - state.y),
      (d.waypoints[Math.min(state.leg, d.waypoints.length - 1)].x - state.x)
    );
    state.heading = state.mode === 'crossing' ? ang : state.heading ?? 0;
    ctx.save();
    ctx.translate(state.x, state.y);
    ctx.rotate(state.heading ?? 0);
    // Wake behind the stern while under way.
    if (state.mode === 'crossing') {
      const t = state.wakePhase;
      ctx.strokeStyle = 'rgba(150,200,235,0.2)';
      ctx.lineWidth = 3;
      for (let k = 1; k <= 3; k++) {
        const rr = 26 + k * 22 + Math.sin(t * 2 + k) * 5;
        ctx.beginPath();
        ctx.ellipse(-130 - k * 26, 0, rr, rr * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Hull.
    ctx.fillStyle = '#d9dde1';
    roundRectPath(ctx, -120, -34, 250, 68, 18);
    ctx.fill();
    ctx.fillStyle = '#2e6bb3';
    ctx.fillRect(-120, -34, 250, 12);
    ctx.fillRect(-120, 22, 250, 12);
    // Deck edge.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    roundRectPath(ctx, -120, -34, 250, 68, 18);
    ctx.stroke();
    // Cabin + wheelhouse.
    ctx.fillStyle = '#31424e';
    ctx.fillRect(-70, -24, 90, 48);
    ctx.fillStyle = '#ffe9b0';
    for (const wx of [-58, -34, -10]) ctx.fillRect(wx, -16, 12, 10);
    ctx.fillRect(-58, 8, 12, 10);
    ctx.fillStyle = '#31424e';
    ctx.fillRect(46, -16, 34, 32);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillRect(74, -10, 5, 20);
    // Stack with a band.
    ctx.fillStyle = '#b3402e';
    ctx.fillRect(-100, -10, 18, 20);
    ctx.fillStyle = '#12141d';
    ctx.fillRect(-100, -10, 18, 6);
    // Benches on the open deck.
    ctx.fillStyle = '#6b4f33';
    for (const bx of [10, 40, 70]) {
      ctx.fillRect(bx, -26, 16, 6);
      ctx.fillRect(bx, 20, 16, 6);
    }
    ctx.restore();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return {
    state,
    update,
    draw,
    board,
    tryInteract,
    scheduleString,
    nextDepartureIn,
    CROSSING_SECONDS,
    SCHEDULE_SPAN,
    slip: d.slip,
    landing: d.landing,
    get mode() { return state.mode; },
    get onboard() { return state.onboard; },
    get x() { return state.x; },
    get y() { return state.y; },
  };
}

// ------------------------------------------------------------
// The painted schedule board at the slip (drawn by the district
// painter pass through this helper).
// ------------------------------------------------------------
export function drawScheduleBoard(ctx, x, y, t, scheduleString) {
  ctx.save();
  ctx.fillStyle = '#20232c';
  ctx.fillRect(x - 3, y - 4, 6, 44);
  ctx.fillStyle = '#14202c';
  ctx.fillRect(x - 56, y - 52, 112, 52);
  ctx.strokeStyle = 'rgba(39,194,160,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 56, y - 52, 112, 52);
  ctx.fillStyle = '#27c2a0';
  ctx.font = 'bold 11px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('BAY FERRY', x, y - 36);
  ctx.font = '10px Consolas, monospace';
  ctx.fillText(scheduleString ?? 'Next ferry: soon', x, y - 18);
  ctx.fillText('DOCKS ⇄ MARINA', x, y - 5);
  ctx.restore();
}
