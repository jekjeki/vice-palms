// missions.js — 6 chained story missions (Rico returns to Vice Palms) + 3 repeatable side missions
import { CFG } from './config.js';
import { dist, angleTo, clamp, rand, fmtMoney } from './util.js';

export class Missions {
  constructor(game) {
    this.game = game;
    this.storyIndex = 0;          // next story mission to offer
    this.active = null;           // {def, data, timer, phase}
    this.markers = [];            // mission pickup/target markers
    this.sideCooldown = {};
    this.endings = 0;
  }

  // ---------- marker helpers ----------
  addMarker(x, y, opts = {}) {
    const m = { x, y, r: opts.r ?? CFG.MISSION_MARKER_R, color: opts.color ?? '#ffd166', label: opts.label ?? '', kind: opts.kind ?? 'pickup', id: opts.id ?? ('m' + Math.random().toString(36).slice(2, 7)) };
    this.markers.push(m);
    return m;
  }
  clearMarkers() { this.markers.length = 0; }

  // called every frame
  update(dt) {
    const game = this.game, p = game.player;
    // standing in the story pickup marker starts the next mission
    if (!this.active && this.storyIndex < STORY.length) {
      const m = this.storyMarker();
      if (m && dist(p.x, p.y, m.x, m.y) < m.r && (!p.inCar || m.allowCar)) this.startStory(this.storyIndex);
    }
    // side mission pickups
    for (const def of SIDES) {
      if (this.active || this.storyIndex < def.after || this.sideCooldown[def.id] > game.t) continue;
      if (dist(p.x, p.y, def.x, def.y) < 30) {
        this.startSide(def);
        if (game.dialogue) game.dialogue.play(def.id, true);
      }
    }

    if (this.active) {
      const m = this.active;
      if (m.timer !== null && m.timer !== undefined) {
        m.timer -= dt;
        if (m.timer <= 0) { this.fail('Out of time'); return; }
      }
      const res = m.def.update(game, m, dt);
      if (res === 'complete') this.complete();
      else if (res === 'fail') this.fail(m.def.failHint || 'Mission failed');
    }
  }

  storyMarker() {
    const def = STORY[this.storyIndex];
    if (!def) return null;
    let m = this.markers.find((k) => k.id === 'story');
    if (!m || m.x !== def.x || m.y !== def.y) {
      this.markers = this.markers.filter((k) => k.id !== 'story');
      m = this.addMarker(def.x, def.y, { id: 'story', color: '#ff5da2', label: def.name, allowCar: def.allowCar });
    }
    return m;
  }

  refreshSideMarkers() {
    const game = this.game;
    this.markers = this.markers.filter((m) => m.id === 'story' || m.id.startsWith('obj'));
    for (const def of SIDES) {
      if (this.storyIndex >= def.after && !this.active) {
        this.markers.push({ x: def.x, y: def.y, r: 30, color: '#00e5ff', label: def.name, kind: 'side', id: 'side:' + def.id });
      }
    }
  }

  // ---------- lifecycle ----------
  startStory(idx) {
    const game = this.game;
    const def = STORY[idx];
    this.clearMarkers();
    this.active = { def, data: {}, timer: def.timer ?? null, idx, story: true };
    def.start(game, this.active);
    game.hud.banner(def.name, def.brief);
    game.audio?.missionStart?.();
    game.dialogue?.play(def.id, true);
  }

  startSide(def) {
    const game = this.game;
    this.clearMarkers();
    this.active = { def: { ...def, story: false }, data: {}, timer: def.timer ?? null, idx: -1, story: false };
    def.start(game, this.active);
    game.hud.banner(def.name, def.brief);
    game.audio?.missionStart?.();
  }

  complete() {
    const game = this.game;
    const m = this.active;
    if (!m) return;
    let reward = m.def.reward;
    // timed missions pay a speed bonus
    if (m.timer !== null && m.timer !== undefined && m.timer > 0 && m.def.timer) {
      const bonus = Math.round(m.def.reward * 0.4 * clamp(m.timer / m.def.timer, 0, 1));
      if (bonus > 0) {
        reward += bonus;
        game.hud.toast('Time bonus +' + '$' + bonus);
      }
    }
    game.player.money += reward;
    game.hud.banner('MISSION PASSED', 'Respect+  ' + fmtMoney(reward));
    game.audio?.missionDone?.();
    if (m.story && game.dialogue) game.dialogue.play(m.def.id + '_done', true);
    m.def.cleanup?.(game, m);
    this.active = null;
    if (m.story) {
      this.storyIndex = m.idx + 1;
      if (this.storyIndex >= STORY.length) { this.endings++; game.onGameFinished?.(); }
    }
    this.clearMarkers();
    this.refreshSideMarkers();
    game.save?.();
  }

  fail(reason) {
    const game = this.game;
    const m = this.active;
    if (!m) return;
    game.hud.banner('MISSION FAILED', reason);
    game.audio?.missionFail?.();
    m.def.cleanup?.(game, m);
    this.active = null;
    this.clearMarkers();
    this.refreshSideMarkers();
  }

  // hooks from player/game
  onEnterCar(game, car) {
    const m = this.active;
    if (m && m.def.onEnterCar) m.def.onEnterCar(game, m, car);
  }
  onExitCar(game, car) {
    const m = this.active;
    if (m && m.def.onExitCar) m.def.onExitCar(game, m, car);
  }
  onCarExploded(game, car) {
    const m = this.active;
    if (m && m.def.onCarExploded) m.def.onCarExploded(game, m, car);
  }
  onPickupTouched(game, m2) {
    const m = this.active;
    if (m && m.def.onPickupTouched) m.def.onPickupTouched(game, m, m2);
  }

  serialize() { return { storyIndex: this.storyIndex, endings: this.endings }; }
  deserialize(d) { if (d) { this.storyIndex = d.storyIndex ?? 0; this.endings = d.endings ?? 0; } this.refreshSideMarkers(); }
}

// ---------- helpers shared by mission defs ----------
function markerObj(game, x, y, opts) { return game.missions.addMarker(x, y, opts); }
function clearObjMarkers(game) { game.missions.markers = game.missions.markers.filter((m) => m.id === 'story' || m.kind === 'side'); }

function distToPlayer(game, x, y) {
  const p = game.player;
  return dist(p.x, p.y, x, y);
}

// spawn an NPC-driven car driving somewhere
function npcCar(game, type, x, y, dest, speed = 0.9) {
  const car = game.addCar(type, x, y, 0);
  car.driver = 'ai';
  car.ai = { drive(c, g, dt) {
    const aim = angleTo(c.x, c.y, dest.x, dest.y);
    const err = Math.atan2(Math.sin(aim - c.h), Math.cos(aim - c.h));
    return { t: dist(c.x, c.y, dest.x, dest.y) > 40 ? speed : 0, s: clamp(err * 1.4, -1, 1) };
  } };
  return car;
}

// =====================================================================
// STORY — Rico returns to Vice Palms
// =====================================================================
const STORY = [
  {
    id: 'm1', name: "RICO'S CALL", brief: 'Rico is back in town. Meet him at the marina.',
    x: 1020, y: CFG.SAND_S - 26, reward: 150, allowCar: false,
    start(game, m) {
      m.step = 0;
      markerObj(game, game.world.pois.marina.x, game.world.pois.marina.y, { id: 'obj', color: '#ffd166', label: 'Rico' });
      game.hud.subtitle('RICO: "Baby! I kept the keys warm. Marina, north end — and hurry, the tide waits for nobody."', 5);
    },
    update(game, m, dt) {
      if (distToPlayer(game, game.world.pois.marina.x, game.world.pois.marina.y) < 40) {
        game.hud.subtitle('RICO: "Still the fastest thing on sand, kid. Now earn it."', 4);
        return 'complete';
      }
      return 'active';
    },
  },
  {
    id: 'm2', name: 'HOT WHEELS', brief: 'Boost the marked cab at the docks, deliver it to Palm Garage. 90s.',
    x: 680, y: 2210, reward: 300, timer: 90,
    start(game, m) {
      const car = game.addCar('taxi', 900, 560, 0);
      car.marker = 'target';
      m.data.car = car;
      markerObj(game, 900, 560, { id: 'obj', color: '#ffd166', label: 'Cab' });
      game.hud.subtitle('RICO: "One cab, freshly borrowed. Garage on 8th. Scratch it and I dock your cut."', 5);
    },
    onEnterCar(game, m, car) {
      if (car === m.data.car) { m.data.has = true; clearObjMarkers(game); markerObj(game, game.world.pois.garage.x, game.world.pois.garage.y, { id: 'obj', color: '#ffd166', label: 'Garage' }); }
    },
    onCarExploded(game, m, car) { if (car === m.data.car) m.def.failHint = 'You totalled the cab'; },
    update(game, m, dt) {
      if (m.data.has && m.data.car.state !== 'wreck' && distToPlayer(game, game.world.pois.garage.x, game.world.pois.garage.y) < 46 && game.player.inCar === m.data.car) {
        game.hud.subtitle('RICO: "Beautiful. It still has both bumpers."', 4);
        return 'complete';
      }
      if (!m.data.has && m.data.car.state === 'wreck') { m.def.failHint = 'The cab is scrap'; return 'fail'; }
      return 'active';
    },
    cleanup(game, m) { if (m.data.car && m.data.car.state !== 'wreck' && game.player.inCar !== m.data.car) m.data.car.despawn = true; },
  },
  {
    id: 'm3', name: 'COURIER RUN', brief: 'Grab 4 packages on the docks. Heat rises with every pickup.',
    x: 2380, y: 2896, reward: 450,
    start(game, m) {
      m.data.got = 0;
      m.data.spots = [[600, 340], [1520, 320], [2450, 400], [3300, 360]];
      m.data.idx = 0;
      this.nextSpot(game, m);
      game.hud.subtitle('RICO: "Four crates on the piers. Grab and go — dock security hates fun."', 5);
    },
    nextSpot(game, m) {
      clearObjMarkers(game);
      const [x, y] = m.data.spots[m.data.idx];
      markerObj(game, x, y, { id: 'obj', color: '#8cff5d', label: 'Package' });
      game.addPickup(x, y, 'package');
    },
    onPickupTouched(game, m, pk) {
      if (pk.kind !== 'package') return;
      m.data.got++;
      m.data.idx++;
      game.police.addWanted(1, 'trespass');
      game.hud.toast(`Package ${m.data.got}/4`);
      if (m.data.got >= 4) {
        clearObjMarkers(game);
        markerObj(game, game.world.pois.beachhut.x, game.world.pois.beachhut.y, { id: 'obj', color: '#ffd166', label: 'Rico' });
      } else this.nextSpot(game, m);
    },
    update(game, m, dt) {
      if (m.data.got >= 4 && distToPlayer(game, game.world.pois.beachhut.x, game.world.pois.beachhut.y) < 44) {
        game.hud.subtitle('RICO: "You smell like diesel and destiny."', 4);
        return 'complete';
      }
      return 'active';
    },
  },
  {
    id: 'm4', name: 'CONVOY BUSTER', brief: 'Two trucks leave the docks for the airfield. Stop BOTH. 100s.',
    x: 460, y: 430, reward: 600, timer: 100,
    start(game, m) {
      game.police.addWanted(2, 'contract');
      m.data.trucks = [];
      const spots = [[700, 320, 'E'], [2800, 320, 'E']];
      for (const [x, y] of spots) {
        const car = game.addCar('truck', x, y, 0);
        car.driver = 'ai';
        car.marker = 'target';
        car.ai = { drive(c, g, dt) {
          const aim = angleTo(c.x, c.y, CFG.AIR_W + 200, 1980);
          const err = Math.atan2(Math.sin(aim - c.h), Math.cos(aim - c.h));
          return { t: 1, s: clamp(err * 1.1, -1, 1) };
        } };
        m.data.trucks.push(car);
      }
      game.hud.subtitle('RICO: "Two trucks of laundered plates rolling east. Wreck them before they reach the strip."', 5);
    },
    onCarExploded(game, m, car) {
      const i = m.data.trucks.indexOf(car);
      if (i >= 0) { m.data.trucks.splice(i, 1); game.hud.toast('Truck down! 1 to go'); }
    },
    update(game, m, dt) {
      for (const t of m.data.trucks) if (t.x > CFG.AIR_W - 60) { m.def.failHint = 'A truck made it through'; return 'fail'; }
      if (m.data.trucks.length === 0) { game.hud.subtitle('RICO: "Crispy. I love crispy."', 4); return 'complete'; }
      return 'active';
    },
    cleanup(game, m) { for (const t of m.data.trucks) if (t.state !== 'wreck') t.despawn = true; },
  },
  {
    id: 'm5', name: 'THE HEIST', brief: 'Lift the briefcase from Airfield Hangar 2, then vanish to the safehouse.',
    x: 680, y: 2210, reward: 800,
    start(game, m) {
      m.data.step = 0;
      markerObj(game, CFG.AIR_W + 420, 1500, { id: 'obj', color: '#c77dff', label: 'Hangar 2' });
      game.hud.subtitle('RICO: "Hangar 2. Grab the case, do NOT open it, and disappear."', 5);
    },
    update(game, m, dt) {
      if (m.data.step === 0 && distToPlayer(game, CFG.AIR_W + 420, 1500) < 60) {
        m.data.step = 1;
        game.police.addWanted(3, 'heist');
        game.player.carryCase = true;
        clearObjMarkers(game);
        markerObj(game, game.world.pois.safehouse.x, game.world.pois.safehouse.y, { id: 'obj', color: '#ffd166', label: 'Safehouse' });
        game.hud.subtitle('RICO: "That alarm was loud, baby. LOUD. Drive"', 4);
        game.audio?.alarm?.();
      }
      if (m.data.step === 1 && game.player.carryCase && distToPlayer(game, game.world.pois.safehouse.x, game.world.pois.safehouse.y) < 44) {
        game.player.carryCase = false;
        game.hud.subtitle('RICO: "Perfect. You are officially a Vice Palms problem."', 4);
        return 'complete';
      }
      return 'active';
    },
  },
  {
    id: 'm6', name: "LAST DEAL", brief: 'Marco stole our cut. His coupe is at the marina — end it.',
    x: 3060, y: 1196, reward: 1500,
    start(game, m) {
      const car = game.addCar('sport', 560, 480, 0);
      car.color = '#1d2a4a';
      car.marker = 'target';
      car.driver = 'ai';
      m.data.car = car;
      m.data.fleeing = false;
      markerObj(game, 560, 480, { id: 'obj', color: '#ff4a4a', label: 'Marco' });
      game.hud.subtitle('RICO: "Marco skimmed TWO YEARS of our cut. His coupe idles at the marina."', 5);
    },
    update(game, m, dt) {
      const car = m.data.car;
      if (!m.data.fleeing && distToPlayer(game, car.x, car.y) < 260) {
        m.data.fleeing = true;
        clearObjMarkers(game);
        car.ai = { drive(c, g, dt) {
          const p = g.player;
          const aim = angleTo(c.x, c.y, p.x, p.y) + Math.PI;
          const err = Math.atan2(Math.sin(aim - c.h), Math.cos(aim - c.h));
          return { t: 1, s: clamp(err * 1.3, -1, 1) };
        } };
        game.hud.toast('Marco is running!');
        game.police.addWanted(2, 'chase');
      }
      if (m.data.fleeing && (car.state === 'fire' || car.state === 'wreck')) {
        game.hud.subtitle('RICO: "...and THAT is why you never skim, kids."', 5);
        game.onGameFinished?.();
        return 'complete';
      }
      if (car.state === 'wreck' && !m.data.fleeing) return 'complete';
      return 'active';
    },
    cleanup(game, m) { if (m.data.car && m.data.car.state === 'drive') m.data.car.despawn = true; },
  },
];

// =====================================================================
// SIDE MISSIONS — repeatable
// =====================================================================
const SIDES = [
  {
    id: 'delivery', name: 'PALM DELIVERY', brief: 'Drop 5 packages at neon markers. 120s. $60 each.',
    x: 1020, y: CFG.SAND_S - 26, after: 1, reward: 300, timer: 120,
    start(game, m) {
      m.data.left = 5;
      m.data.drops = [];
      for (let i = 0; i < 5; i++) m.data.drops.push([500 + rand(0, 3600) | 0, 900 + rand(0, 2400) | 0]);
      this.next(game, m);
      game.hud.subtitle('DISPATCH: "Five drops, five minutes, five fifties. Go."', 4);
    },
    next(game, m) {
      clearObjMarkers(game);
      const [x, y] = m.data.drops[5 - m.data.left];
      markerObj(game, x, y, { id: 'obj', color: '#00e5ff', label: 'Drop ' + (6 - m.data.left) });
    },
    update(game, m, dt) {
      const p = game.player;
      const mk = game.missions.markers.find((k) => k.id === 'obj');
      if (mk && dist(p.x, p.y, mk.x, mk.y) < mk.r + 8) {
        m.data.left--;
        game.player.money += 60;
        game.audio?.missionTick?.();
        game.hud.toast('Delivered! $60');
        if (m.data.left <= 0) return 'complete';
        this.next(game, m);
      }
      return 'active';
    },
  },
  {
    id: 'taxi', name: 'TAXI FARE', brief: 'Fares need rides. Pick up 3 cabbies in your cab. $100 each.',
    x: 1700, y: 2725, after: 2, reward: 300,
    start(game, m) {
      m.data.left = 3;
      m.data.needCab = true;
      this.next(game, m);
      game.hud.subtitle('DISPATCH: "Three fares. Meter running, heart racing."', 4);
    },
    next(game, m) {
      clearObjMarkers(game);
      const x = 400 + rand(0, 3600) | 0, y = 700 + rand(0, 2600) | 0;
      m.data.dest = [x, y];
      markerObj(game, x, y, { id: 'obj', color: '#ffd166', label: 'Fare' });
    },
    onEnterCar(game, m, car) { m.data.cab = car.type === 'taxi' ? car : m.data.cab; },
    update(game, m, dt) {
      const p = game.player;
      if (!p.inCar || p.inCar.type !== 'taxi') return 'active';
      const mk = game.missions.markers.find((k) => k.id === 'obj');
      if (!mk) return 'active';
      if (m.data.pickingUp && dist(p.x, p.y, mk.x, mk.y) < mk.r + 6 && p.inCar.speed < 40) {
        m.data.pickingUp = false;
        clearObjMarkers(game);
        markerObj(game, m.data.dest[0], m.data.dest[1], { id: 'obj', color: '#ffd166', label: 'Destination' });
        m.data.hauling = true;
      } else if (m.data.hauling && dist(p.x, p.y, mk.x, mk.y) < mk.r + 10 && p.inCar.speed < 40) {
        m.data.hauling = false;
        m.data.left--;
        game.player.money += 100;
        game.audio?.missionTick?.();
        game.hud.toast('Fare paid! $100');
        if (m.data.left <= 0) return 'complete';
        this.next(game, m);
      }
      return 'active';
    },
    onExitCar() {},
  },
  {
    id: 'sweep', name: 'STREET SWEEP', brief: '3 gang coupes prowl Vice Palms. Wreck them all. 90s.',
    x: 3060, y: 1196, after: 3, reward: 450, timer: 90,
    start(game, m) {
      m.data.cars = [];
      const spots = [[1200, 1500], [2600, 2300], [3600, 1200]];
      for (const [x, y] of spots) {
        const car = game.addCar('coupe', x, y, rand(0, 6.28));
        car.color = '#3d1f2e';
        car.marker = 'gang';
        car.driver = 'ai';
        car.ai = { drive(c, g, dt) {
          const p = g.player;
          const aim = angleTo(c.x, c.y, p.x, p.y) + Math.PI * 0.7;
          const err = Math.atan2(Math.sin(aim - c.h), Math.cos(aim - c.h));
          return { t: 0.85, s: clamp(err * 1.2, -1, 1) };
        } };
        m.data.cars.push(car);
      }
      game.hud.subtitle('DISPATCH: "Gang coupes are shaking down the strip. Unshake them."', 4);
    },
    onCarExploded(game, m, car) {
      const i = m.data.cars.indexOf(car);
      if (i >= 0) { m.data.cars.splice(i, 1); game.hud.toast('Gang car wrecked! ' + m.data.cars.length + ' left'); }
    },
    update(game, m, dt) {
      if (m.data.cars.length === 0) return 'complete';
      return 'active';
    },
    cleanup(game, m) { for (const c of m.data.cars) if (c.state === 'drive') c.despawn = true; },
  },
  {
    id: 'heatrun', name: 'HEAT RUN', brief: 'Survive 45 seconds at 3 stars without WASTED or BUSTED. $600.',
    x: 1386, y: 1700, after: 4, reward: 600, timer: 45,
    start(game, m) {
      game.police.addWanted(3, 'heat-run');
      m.data.started = true;
      game.hud.subtitle('DISPATCH: "You wanted a chase? Keep it alive for 45 seconds."', 4);
    },
    update(game, m, dt) {
      if (game.police.wanted <= 0) { m.def.failHint = 'You lost the heat too early'; return 'fail'; }
      return 'active';
    },
    cleanup(game, m) { if (m.def.failHint) game.police.clear(); },
  },
  {
    id: 'pilotrun', name: 'PILOT RUN', brief: 'Delivery for a pilot: reach Hangar 3 in 60 seconds. $400.',
    x: 3060, y: 1720, after: 5, reward: 400, timer: 60,
    start(game, m) {
      markerObj(game, CFG.AIR_W + 420, 1500, { id: 'obj', color: '#00e5ff', label: 'Hangar 3' });
      game.hud.subtitle('DISPATCH: "Charts in the glovebox. Hangar 3, west gate. 60 seconds."', 4);
    },
    update(game, m, dt) {
      if (distToPlayer(game, CFG.AIR_W + 420, 1500) < 70) {
        game.hud.subtitle('PILOT: "Damn, you fly low but you fly fast."', 4);
        return 'complete';
      }
      return 'active';
    },
  },
  {
    id: 'vicegp', name: 'VICE GP', brief: 'Unofficial street race: 8 checkpoints around downtown. $100 per lap.',
    x: 2404, y: 1046, after: 6, reward: 800,
    start(game, m) {
      m.data.checkpoints = [
        [2735, 1360], [2395, 1020], [1360, 1020], [695, 1360],
        [695, 2040], [1360, 2395], [2040, 2395], [2400, 1060],
      ];
      m.data.idx = 0;
      this.next(game, m);
      game.hud.subtitle('RACE ORGANIZER: "Eight corners, no rules, no insurance. GO!"', 4);
      game.police.addWanted(1, 'street-race');
    },
    next(game, m) {
      clearObjMarkers(game);
      const [x, y] = m.data.checkpoints[m.data.idx];
      markerObj(game, x, y, { id: 'obj', color: '#8cff5d', label: 'CP ' + (m.data.idx + 1) + '/8' });
    },
    update(game, m, dt) {
      const mk = game.missions.markers.find((k) => k.id === 'obj');
      if (!mk) return 'active';
      if (distToPlayer(game, mk.x, mk.y) < mk.r + 10) {
        m.data.idx++;
        game.audio?.missionTick?.();
        game.player.money += 100;
        if (m.data.idx >= m.data.checkpoints.length) return 'complete';
        this.next(game, m);
      }
      return 'active';
    },
  },
];

export const STORY_COUNT = STORY.length;
export const SIDE_LIST = SIDES;
