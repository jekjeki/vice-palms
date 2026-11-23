// Stunt jumps: fifteen marked launch points — twelve jumps and three big ramps —
// hidden in plain sight along the roads the city already gives you. Hit one fast
// enough and square, and Rico's car leaves the ground: air-time is the score, a
// combo multiplier climbs while you keep flying within seven seconds of the last
// landing, and cash lands with you. Every jump you clear for the first time is a
// UNIQUE and pays double; the set lives in localStorage, so the board survives
// the save. Come up short and the landing is just sparks and embarrassment.
//
// The world is flat — the air is a lie told by the flight corridor between the
// launch line and the landing line. Cross the launch fast and squared-up, stay
// inside the corridor, and the lie holds. Drift out of it or stall mid-gap and
// the ground remembers it is ground.

import { PITCH, GRID } from '../config.js';
import { dist2, TAU } from '../util.js';

const LAUNCH_SPEED = 185;      // forward speed under which a jump never leaves the ramp
const LAUNCH_RAD = 36;         // capture radius on the launch point
const LAUNCH_ARC = 0.95;       // radians of heading tolerance around the launch bearing
const CORRIDOR_HALF = 70;      // perpendicular half-width of the flight corridor
const COMBO_WINDOW = 7;        // seconds between landings before the multiplier resets
const COMBO_MAX = 5;           // the multiplier's ceiling

/** A jump point on a road line: i*PITCH coordinates, launch bearing, gap, payout. */
function jump(id, name, x, y, ang, gap, pay) {
  return { id, name, x, y, ang, gap, pay, ramp: false };
}

// Twelve jumps. Bearings sit on the road grid — ang 0 runs east (+x), -PI/2 north.
const JUMPS = [
  jump('strip-steps', 'STRIP STEPS', 38 * PITCH, 6 * PITCH + 210, -Math.PI / 2, 120, 260),
  jump('canal-hop', 'CANAL HOP', 6 * PITCH + 210, 10 * PITCH, 0, 130, 260),
  jump('lot-ledge', 'LOT LEDGE', 26 * PITCH, 18 * PITCH + 210, Math.PI / 2, 110, 240),
  jump('plaza-gap', 'PLAZA GAP', 19 * PITCH, 20 * PITCH + 210, 0, 100, 240),
  jump('pier-approach', 'PIER APPROACH', 16 * PITCH, -700, -Math.PI / 2, 140, 320),
  jump('shore-kink', 'SHORE KINK', 3300, -1435, 0, 150, 320),
  jump('yard-flyer', 'YARD FLYER', 22 * PITCH, -900, 0, 130, 300),
  jump('hotel-hopper', 'HOTEL HOPPER', 38 * PITCH, 10 * PITCH + 210, Math.PI / 2, 120, 260),
  jump('dune-dip', 'DUNE DIP', GRID * PITCH, 12 * PITCH, 0, 160, 340),
  jump('downtown-alley', 'DOWNTOWN ALLEY', 14 * PITCH, 24 * PITCH + 210, Math.PI / 2, 105, 240),
  jump('runway-break', 'RUNWAY BREAK', 1800, 1675, 0, 170, 340),
  jump('gate-vault', 'GATE VAULT', 20 * PITCH, -500, -Math.PI / 2, 125, 300),
];

// Three ramps: the same mechanic at landmark scale — bigger gaps, bigger money,
// a bigger story to tell at the garage afterwards.
const RAMPS = [
  jump('palm-launcher', 'THE PALM LAUNCHER', GRID * PITCH, 20 * PITCH, 0, 260, 900),
  jump('dockside-catapult', 'DOCKSIDE CATAPULT', 4 * PITCH, -1435, -Math.PI / 2, 240, 800),
  jump('airfield-embankment', 'AIRFIELD EMBANKMENT', 7 * PITCH, 1620, 0, 280, 1000),
];

function key(id) { return `vicepalms.stunt.${id}`; }

function readUnique(id) {
  try { return localStorage.getItem(key(id)) === '1'; } catch { return false; }
}
function writeUnique(id) {
  try { localStorage.setItem(key(id), '1'); } catch { /* private mode */ }
}

/** Shortest signed turn from bearing a to bearing b, in [-PI, PI]. */
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// ------------------------------------------------------------
export function createStunts(game) {
  // Every site gets its unique flag read once, up front — the HUD and the map
  // screen read the cached value so localStorage is touched exactly once per id.
  const sites = [...JUMPS, ...RAMPS].map((def) => ({ ...def, unique: readUnique(def.id) }));
  const byId = new Map(sites.map((s) => [s.id, s]));

  const S = {
    game,
    sites,
    ramps: sites.filter((s) => s.ramp || RAMPS.some((r) => r.id === s.id)),
    jumps: sites.filter((s) => !RAMPS.some((r) => r.id === s.id)),
    air: null,          // { def, alongT, airT } while the car is "off the ground"
    combo: 1,           // current landing multiplier
    comboT: 0,          // seconds left on the combo window
    airFlashT: 0,       // the AIR plate's fade
    scoreFlash: null,   // { text, color, t } the landing callout
    cleared: sites.filter((s) => s.unique).length,
  };

  // ------------------------------------------------------------ helpers

  function toast(text, color) { game.toast(text, color); }

  /** Perpendicular and along-track distance of a point from a launch line. */
  function corridorCoords(def, x, y) {
    const dx = x - def.x, dy = y - def.y;
    const along = dx * Math.cos(def.ang) + dy * Math.sin(def.ang);
    const perp = -dx * Math.sin(def.ang) + dy * Math.cos(def.ang);
    return { along, perp };
  }

  // ------------------------------------------------------------ launch + land

  function tryLaunch(def, p) {
    const car = p.car;
    if (!car) return false;
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < LAUNCH_SPEED) return false;
    // Square to the ramp within the arc: the car's heading, not its velocity,
    // decides whether the jump is a launch or a swerve.
    const heading = Math.atan2(car.vy, car.vx);
    if (Math.abs(angDiff(def.ang, heading)) > LAUNCH_ARC) return false;
    if (dist2(car.x, car.y, def.x, def.y) > LAUNCH_RAD * LAUNCH_RAD) return false;
    S.air = { def, airT: 0, speed };
    game.audio.blip(520);
    return true;
  }

  function land(stuck) {
    const a = S.air;
    S.air = null;
    if (!a) return;
    const car = game.player.car;
    const at = car ?? game.player;
    // Landing always throws sparks; a short landing throws more of them and no cash.
    game.fx.sparks(at.x, at.y, stuck ? 14 : 8);
    if (stuck) {
      S.scoreFlash = { text: 'CAME UP SHORT', color: '#ff6b5f', t: 2.2 };
      game.audio.boom(0.12);
      return;
    }
    // Combo: landing inside the window climbs the multiplier, otherwise it resets.
    S.combo = S.comboT > 0 ? Math.min(COMBO_MAX, S.combo + 0.5) : 1;
    S.comboT = COMBO_WINDOW;

    const def = a.def;
    const first = !def.unique;
    if (first) { def.unique = true; writeUnique(def.id); S.cleared++; }
    const base = first ? def.pay * 2 : Math.round(def.pay * 0.3);
    const cash = Math.round((base * S.combo) / 10) * 10;
    game.player.money += cash;
    game.fx.cash(at.x, at.y);
    const label = first ? `UNIQUE — ${def.name}` : def.name;
    toast(`${label} +$${cash.toLocaleString()}${S.combo > 1 ? ` x${S.combo.toFixed(1)}` : ''}`, first ? '#7dffa4' : '#ffd977');
    S.scoreFlash = { text: `${a.airT.toFixed(2)}s AIR`, color: '#33e7ff', t: 2.2 };
    if (S.cleared === sites.length) toast('ALL FIFTEEN CLEARED — THE CITY HAS NO SECRETS LEFT', '#7bffd4');
    game.audio.blip(700);
  }

  // ------------------------------------------------------------ update

  function update(dt, p) {
    if (S.comboT > 0) {
      S.comboT -= dt;
      if (S.comboT <= 0) S.combo = 1;
    }
    if (S.airFlashT > 0) S.airFlashT -= dt;
    if (S.scoreFlash) {
      S.scoreFlash.t -= dt;
      if (S.scoreFlash.t <= 0) S.scoreFlash = null;
    }

    // The lie of flight: while airborne the corridor decides when the car is
    // back on the ground. Bail out of the car mid-air and the landing counts
    // from wherever Rico lands, which is usually a hedge.
    if (S.air) {
      if (!p.car || p.car.wasted || p.car.wreck) { land(true); return; }
      const c = corridorCoords(S.air.def, p.car.x, p.car.y);
      S.air.airT += dt;
      S.airFlashT = 0.4;
      if (Math.abs(c.perp) > CORRIDOR_HALF) { land(false); return; }
      if (c.along < -60) { land(true); return; }         // rolled back off the ramp
      if (c.along >= S.air.def.gap) land(false);          // cleared the gap
      return;
    }

    // On the ground: poll the launch points. Only the nearest inside its radius
    // gets the speed test, so fifteen point checks a frame stay cheap. Close and
    // slow, the HUD tells the driver what the paint on the road is for.
    let nearDef = null, nearD = 150 * 150;
    for (const def of sites) {
      const d = dist2(p.x, p.y, def.x, def.y);
      if (d < nearD) { nearD = d; nearDef = def; }
      if (d > LAUNCH_RAD * LAUNCH_RAD + 90 * 90) continue;
      if (tryLaunch(def, p)) break;
    }
    if (nearDef && p.car) {
      game.hud?.setPrompt?.(`RAMP — ${nearDef.name}${nearDef.unique ? ' (cleared)' : ''}: hit it fast, hit it straight`);
    }
  }

  // ------------------------------------------------------------ readouts

  /** Blips for the minimap and the map screen: gold uncleared, mint cleared. */
  function blips() {
    return sites.map((s) => [s.x, s.y, s.unique ? '#7dffa4' : '#ffd977', s]);
  }

  /** The total cash the fifteen have paid out if all uniques were taken once. */
  function potTotal() {
    return sites.reduce((sum, s) => sum + s.pay * 2, 0);
  }

  function drawHud(ctx, W, H) {
    // The AIR plate: a quick cyan callout mid-flight, centered high.
    if (S.air && S.airFlashT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, S.airFlashT / 0.4);
      ctx.textAlign = 'center';
      ctx.letterSpacing = '4px';
      ctx.font = 'bold 40px Consolas, "Courier New", monospace';
      ctx.fillStyle = '#33e7ff';
      ctx.fillText(`AIR ${S.air.airT.toFixed(2)}s`, W / 2, H * 0.32);
      ctx.restore();
    }
    // The landing callout and the combo ladder share the same slot.
    if (S.scoreFlash || S.combo > 1) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 22px Consolas, "Courier New", monospace';
      if (S.scoreFlash) {
        ctx.globalAlpha = Math.min(1, S.scoreFlash.t / 0.6);
        ctx.fillStyle = S.scoreFlash.color;
        ctx.fillText(S.scoreFlash.text, W / 2, H * 0.38);
      }
      if (S.combo > 1) {
        ctx.globalAlpha = Math.min(1, S.comboT / COMBO_WINDOW + 0.25);
        ctx.fillStyle = '#ffd977';
        ctx.font = 'bold 17px Consolas, "Courier New", monospace';
        ctx.fillText(`COMBO x${S.combo.toFixed(1)} — ${S.comboT.toFixed(1)}s`, W / 2, H * 0.38 + 26);
      }
      ctx.restore();
    }
  }

  /** How many of the fifteen this profile has cleared, for the map legend. */
  function stats() {
    return { cleared: S.cleared, total: sites.length, pot: potTotal() };
  }

  S.update = update;
  S.drawHud = drawHud;
  S.blips = blips;
  S.stats = stats;
  return S;
}
