// THE LONG WAY DOWN — the second story arc. Six chained jobs that only open once the
// first six are paid out: the debt collectors come collecting, a friend turns coat, the
// airfield gives up its hangar cargo, the harbor hosts one last chase, the city bury's
// one of its own, and the final job runs the long way down to the marina gate.
//
// Each job is the same small stage machine the first arc uses: a world marker, a minimap
// flag, intro and outro beats on the subtitle strip, fail/retry and a cash payout. The
// campaign object is chainable — game.story2.begin(i) starts job i, the walk-in marker
// offers the next one, and after job six the arc closes for good and the city is free.

import { GRID, PITCH, ROAD, WALK, SAND } from '../config.js';
import { dist2 } from '../util.js';

/** A point on the street grid — always reachable on foot or by car. */
function street(i, j) { return { x: i * PITCH, y: j * PITCH }; }

/** A spot on the south sidewalk of block (i, j), where contacts wait. */
function stoop(i, j) {
  return { x: (i + 0.5) * PITCH, y: (j + 1) * PITCH - ROAD / 2 - WALK / 2 };
}

const GARAGE = stoop(12, 26);          // Rosa's bay, where the first arc ended
const PLAZA = stoop(19, 20);           // the landmark plaza, back for the betrayal
const HANGAR = { x: 2040, y: 1500 };   // the middle hangar on the Palms Airfield
const APRON_CASES = [
  { x: 1560, y: 1930 },
  { x: 1840, y: 2100 },
  { x: 2060, y: 1880 },
];
const SHORE_Y = -1435;                 // the docks' coast road centerline
const PIER_C_FOOT = { x: 6720, y: -2300 };
const BOATHOUSE = { x: 2200, y: -1720 };
const BEACH_SPOT = { x: GRID * PITCH + 240, y: 12 * PITCH };
const MARINA_GATE = { x: GRID * PITCH - 46, y: 6.5 * PITCH };
const COLLECTOR_LOT = { x: 38 * PITCH, y: 14 * PITCH };

/** The giver for every arc-two job: Rosa, back at the garage, holding worse news. */
const GIVER = { name: 'Rosa', x: GARAGE.x, y: GARAGE.y };

// ------------------------------------------------------------
// The six jobs. Briefs are Rosa's voice; the beats are the intro/outro
// scenes the subtitle strip plays as the world keeps stepping.
// ------------------------------------------------------------
const JOBS2 = [
  {
    id: 'collectors',
    title: 'SQUEEZED',
    brief: 'Rosa: “Two of Delgado’s boys are working the Strip lot, saying my name guarantees their loans. Wreck what they drive and send them walking home. He hears the message, not me.”',
    outro: [
      ['Rosa', 'Delgado called. He thinks his insurance went up on its own. Let him.'],
      ['Rosa', 'One more thing. Yuri was asking after you — and Yuri only asks when someone is paying him to.'],
    ],
    reward: 1200,
    hint: 'The collectors’ cars sit on the Strip lot until they are scrap. Anything heavy going fast enough will do.',
    beats: [
      ['Rosa', 'Delgado’s collectors. Two cars, one lot, zero shame.'],
      ['Rico', 'And when Delgado asks who?'],
      ['Rosa', 'Nobody. That is the point. Cars rust, grudges compound.'],
    ],
    stages: [
      { type: 'goto', x: GARAGE.x, y: GARAGE.y, r: 46, text: 'Meet Rosa at the garage' },
      { type: 'wreck', x: COLLECTOR_LOT.x, y: COLLECTOR_LOT.y, r: 90, text: 'Wreck the two collectors’ cars on the Strip lot', specs: [5, 9], count: 2 },
      { type: 'goto', x: GARAGE.x, y: GARAGE.y, r: 46, text: 'Report back to Rosa' },
    ],
  },
  {
    title: 'THE KNIFE YOU KNOW',
    brief: 'Rosa: “Yuri sold your route to a two-star friend of the department. Meet him at the plaza like nothing is wrong — then lose the heat he brings and get to the Tides boathouse clean.”',
    outro: [
      ['Yuri', 'Rico — I owed men who do not accept apologies. You were the only coin I had.'],
      ['Rosa', 'The boathouse means you are breathing. From here on, trust the knife on the table, not the hand that feeds you.'],
    ],
    reward: 1500,
    hint: 'Shake the stars the way the city taught you: side streets, no straight lines, eyes off you for fourteen seconds at a time.',
    beats: [
      ['Rico', 'Yuri. You look like a man with a speech rehearsed.'],
      ['Yuri', 'Rico — I need you to walk with me. Slowly.'],
      ['Yuri', '…I am sorry. I am so sorry.'],
    ],
    stages: [
      { type: 'goto', x: PLAZA.x, y: PLAZA.y, r: 50, text: 'Meet Yuri at the plaza' },
      { type: 'escape', x: BOATHOUSE.x, y: BOATHOUSE.y, r: 70, text: 'Lose the heat and reach the Tides boathouse', stars: 2 },
    ],
  },
  {
    title: 'THE HANGAR JOB',
    brief: 'Rosa: “The airfield keeps three crates in its hangar that never met a customs form. The tower breaks for coffee at one. Ninety seconds of apron, Rico — take the crates, leave the tin.”',
    outro: [
      ['Rosa', 'Crates are open. One holds ledgers with Delgado’s name in the margins. The others hold worse.'],
      ['Rosa', 'The harbor knows we are coming now. So we go anyway.'],
    ],
    reward: 2200,
    hint: 'The apron clock runs the moment you take the first crate. Ninety seconds covers all three if you park close and do not browse.',
    beats: [
      ['Rosa', 'The hangar crates are worth a prison apiece. One is yours if you move.'],
      ['Rico', 'And the tower?'],
      ['Rosa', 'Coffee at one, crossword at half past. The field manages itself, that is the joke of it.'],
    ],
    stages: [
      { type: 'goto', x: HANGAR.x, y: HANGAR.y, r: 60, text: 'Reach the middle hangar' },
      { type: 'collect', text: 'Lift the three crates off the apron', points: APRON_CASES, time: 95 },
      { type: 'goto', x: GARAGE.x, y: GARAGE.y, r: 46, text: 'Bring the crates to Rosa’s garage' },
    ],
  },
  {
    title: 'WAKE CALL',
    brief: 'Rosa: “Delgado’s runner is driving the coast road with the hangar money behind his seat. Take the shore road, keep the clock honest, and take the handoff at Pier C. His door is already dented.”',
    outro: [
      ['Rosa', 'The runner is walking home wet and the money is not complaining. Delgado is out of funds and out of friends.'],
      ['Rosa', 'There is a funeral Friday. You should stand at the front of it.'],
    ],
    reward: 1800,
    hint: 'The shore road is long and straight — perfect for making up time and terrible for hiding. The Pier C handoff is at the water end of the pier.',
    beats: [
      ['Rico', 'One runner, one car, one road.'],
      ['Rosa', 'And ninety-five seconds before his escort notices he is alone. The clock is the whole job.'],
      ['Rico', 'I love it when the job is simple.'],
      ['Rosa', 'Then you will hate the next one.'],
    ],
    stages: [
      { type: 'checkpoints', text: 'Run the runner down along the shore road', time: 95, points: [
        { x: 2200, y: SHORE_Y },
        { x: 5000, y: SHORE_Y },
        { x: 8100, y: SHORE_Y },
        PIER_C_FOOT,
      ] },
    ],
  },
  {
    title: 'PALMS AND RAIN',
    brief: 'Rosa: “Yuri’s funeral is at the plaza. Whoever he owed sent no flowers and two parked cars with the engines running. Stand at the front anyway. Then walk the sand and decide who you are after this.”',
    outro: [
      ['Rosa', 'He played every side and the sides finally settled up. Do not make me stand at yours.'],
      ['Rosa', 'One job left, Rico. The last one. The long way down.'],
    ],
    reward: 900,
    hint: 'Stand inside the circle at the plaza and let the clock carry you. The sand is east — past the last street, where the hotels give up.',
    beats: [
      ['Rico', 'I did not think this city buried its own.'],
      ['Rosa', 'It buries everyone, Rico. It just prefers some in installments.'],
      ['Rosa', 'Engines running at the back of the crowd. Pay your respects like none of it is real.'],
    ],
    stages: [
      { type: 'wait', x: PLAZA.x, y: PLAZA.y, r: 55, text: 'Stand at the front of the funeral', time: 8 },
      { type: 'goto', x: BEACH_SPOT.x, y: BEACH_SPOT.y, r: 60, text: 'Walk out onto the sand' },
    ],
  },
  {
    title: 'THE LONG WAY DOWN',
    brief: 'Rosa: “Delgado’s last buyers want what is in my garage and they are bringing the whole city with them. Take it all — the take, the heat, the truth — to the marina gate. Four stars of company on the way.”',
    outro: [
      ['Rosa', 'The gate is open, the boat is fueled, and the ledger burns better than it reads.'],
      ['Rosa', 'Vice Palms never lets you go, Rico. But tonight — tonight it let you win.'],
    ],
    reward: 5000,
    hint: 'Four stars and a straight shot east. The marina gate is on the water at the end of the beach road — everything between you and it is company.',
    beats: [
      ['Rico', 'The take, the heat, the truth. All of it to the gate.'],
      ['Rosa', 'Every star in the city will want a word with you on the way. Give them none.'],
      ['Rico', 'Six years ago I left this town in a stolen car.'],
      ['Rosa', 'Then leave it in a better one.'],
    ],
    stages: [
      { type: 'escape', x: MARINA_GATE.x, y: MARINA_GATE.y, r: 60, text: 'Run the take to the marina gate', stars: 4 },
    ],
  },
];

// The banner colors of the arc: gold for the offer, mint for the payout, red for the fail.
const GOLD = '#ffd977';
const MINT = '#7dffa4';
const RED = '#ff6b5f';

// ------------------------------------------------------------
export function createStory2(game) {
  const S = {
    game,
    arc: 'THE LONG WAY DOWN',
    cursor: 0,             // index of the next job on the board
    active: null,          // { def, stage, collected, timer, index, wrecks: [] }
    done: false,
    bannerT: 0,
    bannerText: '',
    bannerSub: '',
    bannerColor: GOLD,
    beats: [],             // queued intro/outro lines: { t, speaker, line }
    failT: 0,
  };

  // ------------------------------------------------------------ unlock gate
  // The arc only exists once the first six jobs are paid out.
  function unlocked() {
    const m = game.missions;
    return !!m && (m.done || m.cursor >= 6);
  }

  function say(speaker, line) {
    game.dialog?.say?.(speaker, line);
  }

  /** Queue a beat list with one line every 3.4 seconds. */
  function queueBeats(beats, t0) {
    let t = t0;
    for (const [speaker, line] of beats) {
      S.beats.push({ t, speaker, line });
      t += 3.4;
    }
  }

  function banner(title, sub, secs, color) {
    S.bannerText = title;
    S.bannerSub = sub;
    S.bannerT = secs;
    S.bannerColor = color ?? GOLD;
  }

  // ------------------------------------------------------------ markers / text

  /** The active stage's world marker, or the giver's when the arc is offering. */
  function marker() {
    const a = S.active;
    if (a) {
      const st = a.def.stages[a.stage];
      if (!st) return null;
      if (st.type === 'collect') {
        const pt = st.points[a.collected];
        return pt ? { x: pt.x, y: pt.y, color: MINT } : null;
      }
      if (st.type === 'checkpoints') {
        const pt = st.points[a.checkpoint];
        return pt ? { x: pt.x, y: pt.y, color: '#33e7ff' } : null;
      }
      if (st.type === 'wreck') return { x: st.x, y: st.y, color: RED };
      if (st.type === 'escape') return { x: st.x, y: st.y, color: '#ff5a6e' };
      return { x: st.x, y: st.y, color: GOLD };
    }
    if (S.done || !unlocked() || S.cursor >= JOBS2.length) return null;
    return { x: GIVER.x, y: GIVER.y, color: GOLD };
  }

  function objectiveText() {
    if (!S.active) {
      if (S.done) return 'The Long Way Down is over. The city is yours.';
      if (!unlocked() || S.cursor >= JOBS2.length) return null;
      return `Meet ${GIVER.name} — the last arc has work for you`;
    }
    const st = S.active.def.stages[S.active.stage];
    if (!st) return 'Job done — get paid';
    let text = st.text;
    if (st.type === 'collect') text += ` (${S.active.collected}/${st.points.length})`;
    if (st.type === 'checkpoints') text += ` (${S.active.checkpoint + 1}/${st.points.length})`;
    if (st.type === 'wreck') text += ` (${S.active.wrecks.filter((c) => c.wasted || c.wreck).length}/${st.count})`;
    if (st.type === 'wait') text += ' — hold still';
    if (S.active.timer != null) text += ` — ${Math.ceil(S.active.timer)}s`;
    if (st.type === 'escape') text += ' — the heat does not cool';
    return text;
  }

  /** The HUD's objective plate reads the arc whenever it is live or offering. */
  function hudOwns() {
    return !!S.active || (unlocked() && !S.done);
  }

  // ------------------------------------------------------------ lifecycle

  /** The player walked into the idle giver marker. */
  function offerCheck(player) {
    if (S.active || S.done || !unlocked() || S.cursor >= JOBS2.length) return;
    if (dist2(player.x, player.y, GIVER.x, GIVER.y) < 55 * 55) begin(S.cursor);
  }

  function begin(index) {
    const def = JOBS2[index];
    S.active = { def, stage: 0, collected: 0, checkpoint: 0, timer: null, index, wrecks: [] };
    enterStage(0);
    banner(def.title, def.brief, 7.5, GOLD);
    game.audio.blip(560);
    queueBeats(def.beats ?? [], 0.2);
    game.dialog?.mission?.('begin');
  }

  function enterStage(idx) {
    const game_ = game;
    const a = S.active;
    if (!a) return;
    a.stage = idx;
    const st = a.def.stages[idx];
    if (!st) { payout(); return; }
    if (st.type === 'collect' || st.type === 'checkpoints') a.timer = st.time ?? null;
    if (st.type === 'wreck') {
      // The collectors' cars sit in the lot until the job runs; tag them so the
      // wreck poll can count only these.
      for (let k = 0; k < st.count; k++) {
        const v = game_.spawnCar(st.specs[k % st.specs.length], st.x + (k - 0.5) * 70, st.y + k * 110, k % 2 ? Math.PI / 2 : -Math.PI / 2);
        v.tag = 'collector';
        v.role = 'parked';
        a.wrecks.push(v);
      }
    }
    if (st.type === 'escape') {
      game_.wanted.stars = Math.max(game_.wanted.stars, st.stars);
      game_.onWantedBegin();
      say('Rosa', 'No cooling off this time. Run.');
    }
    // The funeral hold is the clock: standing in the circle advances `waited`
    // in update(), so this stage gets no shared countdown to fail against.
  }

  function fail(reason) {
    const a = S.active;
    if (!a) return;
    S.active = null;
    S.failT = 1.2;
    // The banner carries the fail line; the retry hint teaches the next attempt.
    banner('JOB FAILED', a.def.hint ?? reason ?? 'Walk back to Rosa to retry.', 6, RED);
    game.audio.blip(140);
    game.dialog?.mission?.('fail');
  }

  function payout() {
    const game_ = game;
    const a = S.active;
    if (!a) return;
    S.active = null;
    S.cursor++;
    game_.player.money += a.def.reward;
    game_.toast(`+$${a.def.reward.toLocaleString()} — ${a.def.title}`, MINT);
    game_.audio.blip(760);
    game_.fx.cash(game_.player.x, game_.player.y);
    if (S.cursor >= JOBS2.length) {
      S.done = true;
      banner('THE LONG WAY DOWN', 'The arc is closed. Free roam — you earned every block of it.', 8, MINT);
    } else {
      banner('JOB PASSED', a.def.reward ? `+$${a.def.reward.toLocaleString()}` : '', 4, MINT);
    }
    // The outro beats start as the banner fades.
    queueBeats(a.def.outro ?? [], 1.2);
    game_.dialog?.mission?.('pass');
    game_.save();
  }

  // ------------------------------------------------------------ update

  function update(dt, player) {
    // Beats play no matter what else is happening — the strip preempts cleanly.
    for (const b of S.beats) b.t -= dt;
    const due = S.beats.filter((b) => b.t <= 0);
    for (const b of due) say(b.speaker, b.line);
    if (due.length) S.beats = S.beats.filter((b) => b.t > 0);

    S.bannerT -= dt;
    if (S.failT > 0) S.failT -= dt;
    if (!unlocked()) return;
    offerCheck(player);

    const a = S.active;
    if (!a) return;
    const st = a.def.stages[a.stage];
    if (!st) return;

    // Shared timers: the collect and checkpoint clocks, and the funeral pause.
    if (a.timer != null) {
      a.timer -= dt;
      if (a.timer <= 0) { fail(st.type === 'collect' ? 'THE TOWER IS BACK — OUT OF TIME' : 'OUT OF TIME'); return; }
    }

    switch (st.type) {
      case 'goto':
      case 'wait':
        if (dist2(player.x, player.y, st.x, st.y) < st.r * st.r) {
          if (st.type === 'wait') {
            // The funeral hold: stand in the circle while the clock runs down.
            a.waited = (a.waited ?? 0) + dt;
            if (a.waited >= st.time) { a.waited = 0; enterStage(a.stage + 1); }
          } else enterStage(a.stage + 1);
        }
        break;
      case 'collect':
        if (dist2(player.x, player.y, st.points[a.collected].x, st.points[a.collected].y) < 46 * 46) {
          a.collected++;
          game.audio.blip(665);
          game.fx.cash(player.x, player.y);
          if (a.collected >= st.points.length) enterStage(a.stage + 1);
        }
        break;
      case 'wreck': {
        // Poll the tagged cars: the job is the count of scrap, not the noise.
        const dead = a.wrecks.filter((c) => c.wasted || c.wreck).length;
        if (dead >= st.count) { a.wrecks.length = 0; enterStage(a.stage + 1); }
        break;
      }
      case 'checkpoints': {
        const pt = st.points[a.checkpoint];
        if (dist2(player.x, player.y, pt.x, pt.y) < 85 * 85) {
          a.checkpoint++;
          game.audio.blip(620);
          game.toast(`CHECKPOINT ${a.checkpoint}/${st.points.length}`, '#33e7ff');
          if (a.checkpoint >= st.points.length) payout();
        }
        break;
      }
      case 'escape':
        // The city refuses to cool off during the run: the heat stays live.
        if (game.wanted.stars < 2) { game.wanted.stars = Math.max(2, st.stars); game.onWantedBegin(); }
        if (dist2(player.x, player.y, st.x, st.y) < st.r * st.r) payout();
        break;
    }
  }

  // A job car pushed into the bay or torched by a stranger still counts as scrap
  // for the wreck stage — but an escape-stage death ends the run like a mission.
  function onHeroDown() {
    if (S.active) fail('YOU BLED OUT BEFORE THE GATE');
  }

  function serialize() {
    return { cursor: S.cursor, done: S.done };
  }

  // ------------------------------------------------------------ campaign board
  // A read-only ledger of the arc for the map screen and the phone: the six
  // jobs, their state, and where the board thinks you should be standing.

  function progress() {
    return {
      arc: S.arc,
      total: JOBS2.length,
      passed: S.done ? JOBS2.length : S.cursor,
      done: S.done,
      unlocked: unlocked(),
      active: S.active ? S.active.def.title : null,
    };
  }

  /** One row per job for the map screen's legend: name, state, marker point. */
  function campaignBoard() {
    return JOBS2.map((def, i) => {
      const state = S.done || i < S.cursor ? 'passed'
        : S.active?.index === i ? 'active'
        : i === S.cursor && unlocked() ? 'offering'
        : 'locked';
      // The first stage's point stands in for the job's location on the board.
      const st0 = def.stages[0];
      return {
        index: i,
        title: def.title,
        state,
        reward: def.reward,
        x: state === 'locked' ? null : st0.x,
        y: state === 'locked' ? null : st0.y,
      };
    });
  }

  /** The payout total the arc has handed over, for the save ledger. */
  function earned() {
    return JOBS2.slice(0, S.done ? JOBS2.length : S.cursor)
      .reduce((sum, def) => sum + def.reward, 0);
  }

  function restore(data) {
    if (!data || typeof data !== 'object') return;
    S.cursor = Number(data.cursor) || 0;
    S.done = !!data.done;
    S.active = null;
  }

  S.marker = marker;
  S.objectiveText = objectiveText;
  S.hudOwns = hudOwns;
  S.begin = begin;
  S.update = update;
  S.serialize = serialize;
  S.restore = restore;
  S.onHeroDown = onHeroDown;
  S.progress = progress;
  S.campaignBoard = campaignBoard;
  S.earned = earned;
  S.JOBS = JOBS2;
  S.GIVER = GIVER;
  S.unlocked = unlocked;
  return S;
}
