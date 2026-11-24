// Vice Palms — the Palm Metro: an automated ring train you can ride.
// The train is pure path-following (no physics), so it never derails: a
// rectangle ring around roads 1 and 14 with four stations at the midpoints.

import { TRAIN, ROADS } from './config.js';
import { dist } from './util.js';

const R0 = ROADS[TRAIN.ring[0]];
const R1 = ROADS[TRAIN.ring[1]];

/** Corner points of the rail ring, offset onto the grass verge side. */
function ringCorners() {
  const o = TRAIN.offset;
  return [
    { x: R0 - o, y: R0 - o },
    { x: R1 + o, y: R0 - o },
    { x: R1 + o, y: R1 + o },
    { x: R0 - o, y: R1 + o },
  ];
}

const CORNERS = ringCorners();

/** Station positions: the midpoint of each ring side. */
export const STATIONS = [
  { x: (CORNERS[0].x + CORNERS[1].x) / 2, y: CORNERS[0].y, name: 'Northside' },
  { x: CORNERS[1].x, y: (CORNERS[1].y + CORNERS[2].y) / 2, name: 'Palm Airfield' },
  { x: (CORNERS[2].x + CORNERS[3].x) / 2, y: CORNERS[2].y, name: 'Dock Exchange' },
  { x: CORNERS[3].x, y: (CORNERS[3].y + CORNERS[0].y) / 2, name: 'Ocean Ave' },
];

/** Polyline path around the ring with per-segment lengths. */
const PATH = [];
{
  let total = 0;
  for (let i = 0; i < 4; i++) {
    const a = CORNERS[i], b = CORNERS[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    PATH.push({ a, b, len, start: total });
    total += len;
  }
  PATH.total = total;
}

function posAt(s) {
  s = ((s % PATH.total) + PATH.total) % PATH.total;
  for (const seg of PATH) {
    if (s <= seg.start + seg.len) {
      const t = (s - seg.start) / seg.len;
      return {
        x: seg.a.x + (seg.b.x - seg.a.x) * t,
        y: seg.a.y + (seg.b.y - seg.a.y) * t,
        h: Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x),
      };
    }
  }
  return { x: CORNERS[0].x, y: CORNERS[0].y, h: 0 };
}

export function makeTrain() {
  return {
    s: 0,
    speed: TRAIN.speed,
    pause: 0,
    nextStation: 0,
    segs: [],
    stationIdx: 0,
    doorsT: 0,
  };
}

/** Advance the train along the ring, pausing at stations. */
export function updateTrain(game, dt) {
  const t = game.train;
  if (!t) return;
  t.doorsT = Math.max(0, t.doorsT - dt);

  if (t.pause > 0) {
    t.pause -= dt;
    if (t.pause <= 0) {
      t.stationIdx = (t.stationIdx + 1) % 4;
      t.doorsT = 0.4;
    }
  } else {
    t.s += t.speed * dt;
    // approaching the next station?
    const st = STATIONS[t.stationIdx];
    // project the station onto ring distance: nearest path s for it
    const sSt = nearestPathS(st.x, st.y);
    const d = ((sSt - t.s) % PATH.total + PATH.total) % PATH.total;
    if (d < t.speed * dt * 1.5) {
      t.s = sSt;
      t.pause = TRAIN.stationPause;
      if (game.player.riding && dist(game.player.x, game.player.y, trainPos(game).x, trainPos(game).y) < 120) {
        game.subtitle('Palm Metro: now arriving at ' + st.name + '.', 2.6);
      }
    }
  }

  // lay out the linked segments behind the head
  t.segs.length = 0;
  for (let k = 0; k < TRAIN.segments; k++) {
    t.segs.push(posAt(t.s - k * TRAIN.segLength));
  }

  // carry the player
  const p = game.player;
  if (p.riding) {
    const head = t.segs[0];
    const side = head.h + Math.PI / 2;
    p.x = head.x + Math.cos(side) * 14;
    p.y = head.y + Math.sin(side) * 14;
    p.h = head.h;
    p.aim = head.h;
  }
}

function nearestPathS(x, y) {
  let best = 0, bd = Infinity;
  for (const seg of PATH) {
    for (let t = 0; t <= 1; t += 0.02) {
      const px = seg.a.x + (seg.b.x - seg.a.x) * t;
      const py = seg.a.y + (seg.b.y - seg.a.y) * t;
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < bd) { bd = d; best = seg.start + seg.len * t; }
    }
  }
  return best;
}

export function trainPos(game) {
  return game.train.segs[0];
}

/** Board when standing next to a stopped (or slow) segment. */
export function tryBoardTrain(game) {
  const t = game.train;
  if (!t || game.player.riding) return false;
  for (const seg of t.segs) {
    if (dist(game.player.x, game.player.y, seg.x, seg.y) < 52) {
      game.player.riding = true;
      game.subtitle('Palm Metro — press F to hop off.', 2.4);
      return true;
    }
  }
  return false;
}

export function exitTrain(game) {
  const p = game.player;
  if (!p.riding) return;
  p.riding = false;
  const head = game.train.segs[0];
  const side = head.h + Math.PI / 2;
  p.x = head.x + Math.cos(side) * 40;
  p.y = head.y + Math.sin(side) * 40;
}
