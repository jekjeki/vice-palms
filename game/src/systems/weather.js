// ============================================================
// WEATHER — the sky over Vice Palms changes its mind.
//
// clear / rain / storm / fog on a weighted cycle. Rain streaks
// and lightning washes ride the screen; fog sits on the horizon
// and on the minimap as fog-of-war; wet roads make the player's
// car slide and the district's puddles shine; traffic brakes
// earlier in poor visibility.
// ============================================================

import { GRID, PITCH, SPAN, SAND, OCEAN } from '../config.js';
import { clamp, lerp } from '../util.js';
import { rand } from '../rng.js';

const TYPES = ['clear', 'rain', 'storm', 'fog'];

const DEF = {
  clear: {
    label: 'Clear',
    tint: null,                 // no extra light-map wash
    rain: 0,
    wind: 0.12,
    grip: 1.0,
    vis: 1.0,
    brake: 1.0,
    fogAlpha: 0,
    nextIn: [110, 240],
  },
  rain: {
    label: 'Rain',
    tint: 'rgba(96,118,150,0.34)',
    rain: 0.55,
    wind: 0.55,
    grip: 0.8,
    vis: 0.72,
    brake: 1.35,
    fogAlpha: 0.16,
    nextIn: [80, 170],
  },
  storm: {
    label: 'Storm',
    tint: 'rgba(62,74,98,0.5)',
    rain: 1.0,
    wind: 1.0,
    grip: 0.66,
    vis: 0.5,
    brake: 1.7,
    fogAlpha: 0.3,
    nextIn: [55, 130],
  },
  fog: {
    label: 'Fog',
    tint: 'rgba(150,158,166,0.4)',
    rain: 0,
    wind: 0.1,
    grip: 0.94,
    vis: 0.34,
    brake: 1.9,
    fogAlpha: 0.55,
    nextIn: [70, 150],
  },
};

const LIGHTNING_INTERVAL = [4.5, 13];

// ------------------------------------------------------------
export function createWeather(game, opts = {}) {
  const state = {
    type: opts.start ?? 'clear',
    target: opts.start ?? 'clear',
    blend: 1,
    timer: opts.hold ?? rr(...DEF[opts.start ?? 'clear'].nextIn),
    rainDrops: [],
    windPhase: 0,
    lightning: 0,
    nextStrike: rr(...LIGHTNING_INTERVAL),
    wetness: 0,
    transitions: 0,
    fogOfWar: [],
    lastFlashT: 0,
  };

  // Rain streak pool: recycled in screen space, spawned per frame.
  const RAIN_MAX = 240;
  for (let i = 0; i < RAIN_MAX; i++) {
    state.rainDrops.push({ x: 0, y: 0, len: 12 + Math.random() * 16, live: false });
  }

  // Fog-of-war grid over the whole map (city + docks + bay).
  const FOW_N = 26;
  for (let i = 0; i < FOW_N * FOW_N; i++) state.fogOfWar.push(0);
  const FOW_CELL = (SPAN + SAND + OCEAN) / FOW_N;

  function rr(a, b) { return a + Math.random() * (b - a); }

  // ----------------------------------------------------------
  function setWeather(type, hold) {
    if (!DEF[type]) return false;
    if (state.target === type && state.blend >= 1) return false;
    state.target = type;
    state.blend = state.target === state.type ? 1 : 0;
    state.timer = hold ?? rr(...DEF[type].nextIn);
    state.transitions++;
    announce(type);
    return true;
  }

  function cycleWeather(force) {
    const i = TYPES.indexOf(state.target);
    return setWeather(TYPES[(i + 1) % TYPES.length], force ? 9999 : undefined);
  }

  function announce(type) {
    const lines = {
      clear: 'Skies clearing over the bay.',
      rain: 'Rain rolling in off the water.',
      storm: 'Storm warning — get off the piers.',
      fog: 'A fog bank is swallowing the coast.',
    };
    game.dialog?.say?.('radio', lines[type] ?? `Weather: ${DEF[type].label}`);
  }

  // ----------------------------------------------------------
  function update(dt, t, player) {
    if (state.blend < 1) state.blend = Math.min(1, state.blend + dt * 0.22);
    else if (state.type !== state.target) state.type = state.target;

    state.timer -= dt;
    if (state.timer <= 0) {
      setWeather(pickNext(state.target));
    }

    const def = DEF[state.target];
    const e = ease(state.blend);

    // Wetness tracks rain with a comfortable lag both ways.
    const wetTarget = def.rain > 0.2 ? 1 : 0;
    state.wetness += (wetTarget - state.wetness) * Math.min(1, dt * 0.14);
    if (game.docks?._wetness !== undefined) {
      game.docks._wetness = state.wetness;
    }

    state.windPhase += dt * (0.8 + def.wind * 1.6);

    // Lightning in storms.
    if (state.target === 'storm') {
      state.nextStrike -= dt;
      if (state.nextStrike <= 0) {
        state.nextStrike = rr(...LIGHTNING_INTERVAL);
        state.lightning = 1;
        state.lastFlashT = t;
        game.audio?.boom?.(0.18);
        game.shake = Math.min(10, game.shake + 2.2);
      }
    }
    if (state.lightning > 0) {
      state.lightning = Math.max(0, state.lightning - dt * 2.8);
    }

    // Fog of war: reveal around the player, then the weather slowly re-hides.
    const reveal = def.vis;
    const gx = Math.floor((player?.x ?? 0) / FOW_CELL);
    const gy = Math.floor((player?.y ?? 0) / FOW_CELL);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = gx + dx, y = gy + dy;
        if (x < 0 || y < 0 || x >= FOW_N || y >= FOW_N) continue;
        const i = y * FOW_N + x;
        state.fogOfWar[i] = Math.min(1, state.fogOfWar[i] + dt * 1.6);
      }
    }
    for (let i = 0; i < state.fogOfWar.length; i++) {
      if (state.fogOfWar[i] > 0) {
        state.fogOfWar[i] = Math.max(0, state.fogOfWar[i] - dt * 0.014 * (1.5 - reveal));
      }
    }

    // Weather-aware AI braking: traffic slows down in poor visibility.
    if (game.traffic) game.traffic.brakeFactor = aiBrakeFactor();
  }

  function pickNext(current) {
    const table = {
      clear: ['clear', 'clear', 'rain', 'fog'],
      rain: ['rain', 'storm', 'clear', 'clear'],
      storm: ['rain', 'rain', 'clear'],
      fog: ['fog', 'clear', 'clear', 'rain'],
    };
    const opts = table[current] ?? TYPES;
    return opts[Math.floor(Math.random() * opts.length)];
  }

  function strikeNear() {
    state.lightning = 1;
    state.nextStrike = rr(...LIGHTNING_INTERVAL);
    game.audio?.boom?.(0.22);
  }

  // ----------------------------------------------------------
  // Screen-space pass: rain streaks, fog wash, lightning flash.
  // Called from the Painter after the glow layer.
  // ----------------------------------------------------------
  function drawScreen(ctx, W, H, t, cam) {
    const def = DEF[state.target];
    const e = ease(state.blend);

    // Fog wash: a soft veil, denser toward the top of the frame (horizon).
    const fogA = lerp(DEF[state.type].fogAlpha ?? 0, def.fogAlpha, e);
    if (fogA > 0.01) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(164,174,182,${fogA.toFixed(3)})`);
      g.addColorStop(0.6, `rgba(150,160,170,${(fogA * 0.55).toFixed(3)})`);
      g.addColorStop(1, `rgba(140,150,160,${(fogA * 0.25).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Rain streaks, slanted by the wind, spawned in screen space.
    const rainAmt = lerp(DEF[state.type].rain ?? 0, def.rain, e);
    if (rainAmt > 0.02) {
      const want = Math.floor(RAIN_MAX * rainAmt);
      const speed = 900 + def.wind * 500;
      const slant = 60 + def.wind * 160;
      ctx.strokeStyle = `rgba(174,203,221,${(0.34 * rainAmt).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let drawn = 0;
      for (const dr of state.rainDrops) {
        if (drawn >= want) break;
        if (!dr.live) {
          if (Math.random() > rainAmt * 0.6) continue;
          dr.live = true;
          dr.x = Math.random() * (W + 200) - 100;
          dr.y = -20 - Math.random() * 60;
        }
        dr.y += speed * 0.016;
        dr.x += slant * 0.016;
        if (dr.y > H + 30) { dr.live = false; continue; }
        ctx.moveTo(dr.x, dr.y);
        ctx.lineTo(dr.x - slant * (dr.len / speed), dr.y - dr.len);
        drawn++;
      }
      ctx.stroke();
    }

    // Lightning flash: one additive wash with a quick double-pulse.
    if (state.lightning > 0.01) {
      const l = state.lightning;
      const pulse = l > 0.7 ? 1 : (l > 0.5 ? 0.35 : l * 1.6);
      ctx.fillStyle = `rgba(223,233,255,${(pulse * 0.32).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** Multiply wash on the light map: cool, damp tones under rain and storm. */
  function paintLight(lc, W, H) {
    const def = DEF[state.target];
    const e = ease(state.blend);
    if (!def.tint) return;
    const base = DEF[state.type].tint;
    if (base === def.tint) {
      lc.fillStyle = def.tint;
      lc.fillRect(0, 0, W, H);
      return;
    }
    // Cross-fade between the outgoing and incoming tints.
    lc.fillStyle = base ?? 'rgba(0,0,0,0)';
    lc.globalAlpha = 1 - e;
    lc.fillRect(0, 0, W, H);
    lc.globalAlpha = 1;
    lc.fillStyle = def.tint;
    lc.fillRect(0, 0, W, H);
  }

  // ----------------------------------------------------------
  // Effects API other systems read.
  // ----------------------------------------------------------
  function gripMultiplier() {
    return lerp(DEF[state.type].grip, DEF[state.target].grip, ease(state.blend));
  }
  function aiBrakeFactor() {
    return lerp(DEF[state.type].brake, DEF[state.target].brake, ease(state.blend));
  }
  function visibility() {
    return lerp(DEF[state.type].vis, DEF[state.target].vis, ease(state.blend));
  }
  function rainAmount() {
    return lerp(DEF[state.type].rain ?? 0, DEF[state.target].rain, ease(state.blend));
  }
  function fogOfWarCell(wx, wy) {
    const gx = Math.floor(wx / FOW_CELL);
    const gy = Math.floor(wy / FOW_CELL);
    if (gx < 0 || gy < 0 || gx >= FOW_N || gy >= FOW_N) return 0;
    return state.fogOfWar[gy * FOW_N + gx];
  }
  function hudInfo() {
    return {
      type: state.target,
      label: DEF[state.target].label,
      wetness: state.wetness,
      visibility: visibility(),
      grip: gripMultiplier(),
    };
  }
  function serialize() {
    return { type: state.target, wetness: state.wetness };
  }
  function deserialize(data) {
    if (data && DEF[data.type]) {
      setWeather(data.type);
      if (typeof data.wetness === 'number') state.wetness = data.wetness;
    }
  }

  return {
    TYPES,
    DEF,
    state,
    update,
    drawScreen,
    paintLight,
    setWeather,
    cycleWeather,
    strikeNear,
    gripMultiplier,
    aiBrakeFactor,
    visibility,
    rainAmount,
    fogOfWarCell,
    hudInfo,
    serialize,
    deserialize,
    FOW_N,
    FOW_CELL,
  };
}

function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
