// missions.js — six chained story jobs (Rico is back in town) and three side
// hustles, run by a tiny step engine: say / goto / getcar / deliver /
// destroy / lose. Markers, timers, fail + retry, payouts, subtitles.

import { CFG, roadX, roadY } from './config.js';
import { G, RNG, clamp, dist, fmtTime, fmtMoney, say, missionText, help } from './util.js';
import { Car, dirAng } from './cars.js';
import { sfxMission, sfxPickup } from './audio.js';
import { addStat } from './stats.js';

// map POIs (stable coordinates)
const SAFE = () => G.world.spawns.safe;
const HOSP = () => G.world.spawns.hospital;
const PD = () => G.world.spawns.pd;
const DOCK_GATE = { x: roadX(10), y: roadY(2) + 40 };
const DOCK_GARAGE = { x: roadX(9) + 43 + 90, y: roadY(1) + 43 + 110 };
const PIER = { x: roadX(12) + 120, y: roadY(0) + 43 + 250 };
const AIR_TOWER = { x: roadX(15) + 43 + 97, y: roadY(4) + 43 + 97 };
const BEACH_PARK = { x: roadX(10) + 43 + 97, y: 3470 };
const TAXI_STAND = { x: roadX(8) + 43, y: roadY(8) };
const RAMPAGE_PAD = { x: roadX(9) + 43 + 80, y: roadY(0) + 43 + 80 };
const COURIER_PAD = { x: roadX(14) + 43 + 90, y: roadY(8) + 43 + 90 };
const RIVAL_ROAD = { x: roadX(9) + 43, y: roadY(6) };

export class Missions {
  constructor(seed) {
    this.rng = new RNG(seed ^ 0x21fe.ed0);
    this.storyIdx = 0;
    this.sideDone = [false, false, false, false, false, false];
    this.active = null;      // {def, steps, si, data, isSide}
    this.markers = [];
    this.deadline = null;    // absolute G.t deadline of the timed step
    this.flashT = 0;
  }

  // ------------------------------------------------------------- catalog
  storyDef(i) {
    const defs = [
      {
        name: 'The Palms Remember', payout: CFG.MISSION_PAYOUTS[0],
        giver: () => SAFE(), color: '#ffd24a',
        brief: 'Rico has a gate at the docks that needs a Vargas.',
        steps: () => [
          { t: 'say', who: 'RICO', text: 'Cousin! The palms got taller, the neon got louder. You still drive like a hurricane?', dur: 4 },
          { t: 'say', who: 'RICO', text: 'First job, easy: my container gate at the north docks. Roll by — bring wheels, it is far.', dur: 4.4 },
          { t: 'goto', x: DOCK_GATE.x, y: DOCK_GATE.y, r: 46, text: 'Meet Rico at the dock gate', needCar: true },
          { t: 'say', who: 'RICO', text: 'You remember tide tables better than birthdays. Good. Envelope now — bigger jobs later.', dur: 4.4 },
        ],
      },
      {
        name: 'Hot Metal', payout: CFG.MISSION_PAYOUTS[1],
        giver: () => DOCK_GATE, color: '#ffd24a',
        brief: 'A collector wants a Banshee. Pearl, no questions.',
        steps: () => [
          { t: 'say', who: 'RICO', text: 'A collector wants a Banshee — pearl, low miles, no questions. One waits on the beach lot.', dur: 4.6 },
          { t: 'getcar', type: 'banshee', x: BEACH_PARK.x, y: BEACH_PARK.y, text: 'Lift the Banshee on the beach lot' },
          { t: 'deliver', x: DOCK_GARAGE.x, y: DOCK_GARAGE.y, r: 50, text: 'Deliver the Banshee to the dock garage', keepCar: true },
          { t: 'say', who: 'RICO', text: 'Clean. The collector purrs. Envelope number two.', dur: 3.4 },
        ],
      },
      {
        name: 'Pier Pressure', payout: CFG.MISSION_PAYOUTS[2],
        giver: () => DOCK_GARAGE, color: '#ffd24a',
        brief: 'Papers for the captain. The tide will not wait.',
        steps: () => [
          { t: 'say', who: 'RICO', text: 'These papers go to the captain of the Coral Maid. Tide turns in 70 seconds — the pier. GO.', dur: 4.6 },
          { t: 'goto', x: PIER.x, y: PIER.y, r: 42, text: 'Reach the pier before the tide turns', time: 70, needCar: true },
          { t: 'say', who: 'RICO', text: 'The captain smiles. That is either very good or very bad.', dur: 3.6 },
        ],
      },
      {
        name: 'Runway Deal', payout: CFG.MISSION_PAYOUTS[3],
        giver: () => DOCK_GATE, color: '#ffd24a',
        brief: 'A briefcase under the airfield tower. The buyer got creative.',
        steps: () => [
          { t: 'say', who: 'RICO', text: 'A briefcase waits under the tower at Palm Airfield. The buyer\u2019s pilot got... creative. Fetch it.', dur: 4.6 },
          { t: 'goto', x: AIR_TOWER.x, y: AIR_TOWER.y, r: 46, text: 'Grab the briefcase under the airfield tower', needCar: true },
          { t: 'say', who: 'RICO', text: 'You just robbed a man with his own runway. VCPD knows it. LOSE THEM.', dur: 4.2 },
          { t: 'lose', stars: 2, text: 'Lose the heat' },
          { t: 'say', who: 'RICO', text: 'Cool as a beach bar. Envelope four, and a nap.', dur: 3.2 },
        ],
      },
      {
        name: 'Neon Chase', payout: CFG.MISSION_PAYOUTS[4],
        giver: () => SAFE(), color: '#ffd24a',
        brief: 'A rival runner is pushing product in your city.',
        steps: () => [
          { t: 'say', who: 'RICO', text: 'A rival runner is pushing OUR product in OUR city. His Stallion is on 9th. Turn it into scrap.', dur: 4.8 },
          { t: 'destroy', x: RIVAL_ROAD.x, y: RIVAL_ROAD.y, type: 'stallion', color: '#00ff9c', text: 'Wreck the rival Stallion' },
          { t: 'say', who: 'RICO', text: 'Rumor says the driver walked away. Rumor is kind.', dur: 3.6 },
        ],
      },
      {
        name: 'The Last Ride', payout: CFG.MISSION_PAYOUTS[5],
        giver: () => DOCK_GATE, color: '#ffd24a',
        brief: 'Three stars of trouble between you and the safehouse. Forever.',
        steps: () => [
          { t: 'say', who: 'RICO', text: 'One last ride, cousin. I called in every favor and every enemy. Three stars of trouble, then the safehouse. Forever.', dur: 5 },
          { t: 'lose', stars: 3, text: 'Survive the heat' },
          { t: 'goto', x: SAFE().x, y: SAFE().y, r: 50, text: 'Reach the safehouse — end of the line' },
          { t: 'say', who: 'RICO', text: 'The Palms remember, cousin. They always remember. Drinks are on you — forever.', dur: 4.4 },
        ],
      },
    ];
    return defs[i];
  }

  sideDef(i) {
    const defs = [
      {
        name: 'Taxi Rush', payout: 900,
        giver: () => TAXI_STAND, color: '#7cffa0',
        brief: 'Three fares, one timer, zero patience.',
        steps: () => {
          const fares = [
            { px: roadX(11) + 43, py: roadY(7), dx: SAFE().x, dy: SAFE().y },
            { px: HOSP().x, py: HOSP().y, dx: DOCK_GATE.x, dy: DOCK_GATE.y },
            { px: TAXI_STAND.x, py: TAXI_STAND.y, dx: BEACH_PARK.x, dy: BEACH_PARK.y },
          ];
          const out = [{ t: 'say', who: 'DISPATCH', text: 'Three fares, one timer. Green circles pick up, pink circles drop off. Move.', dur: 4 }];
          fares.forEach((f, k) => {
            out.push({ t: 'goto', x: f.px, y: f.py, r: 44, text: `Fare ${k + 1}/3 — pick up`, time: 140, needCar: true });
            out.push({ t: 'goto', x: f.dx, y: f.dy, r: 44, text: `Fare ${k + 1}/3 — drop off`, time: 140, needCar: true });
          });
          out.push({ t: 'say', who: 'DISPATCH', text: 'Not bad. The meter says you owe the city a tyremark.', dur: 3 });
          return out;
        },
      },
      {
        name: 'Dockyard Rampage', payout: 1100,
        giver: () => RAMPAGE_PAD, color: '#7cffa0',
        brief: 'Four clunkers, eighty seconds, one hammer.',
        steps: () => [
          { t: 'say', who: 'FOREMAN', text: 'Four clunkers in my yard, insurance settles tonight. Wreck them all before eighty seconds run out.', dur: 4.4 },
          { t: 'destroy4', cx: RAMPAGE_PAD.x, cy: RAMPAGE_PAD.y, time: 80, text: 'Wreck the four clunkers' },
          { t: 'say', who: 'FOREMAN', text: 'Beautiful. Do not ask what was in the trunks.', dur: 3 },
        ],
      },
      {
        name: 'Night Courier', payout: 1300,
        giver: () => COURIER_PAD, color: '#7cffa0',
        brief: 'Five drops across the city before the seal expires.',
        steps: () => [
          { t: 'say', who: 'SEAL', text: 'Five drops, one package, one hundred thirty seconds before the seal expires. Checkpoints glow green.', dur: 4.4 },
          { t: 'goto', x: PD().x, y: PD().y, r: 46, text: 'Drop 1/5 — precinct alley', time: 130, needCar: true },
          { t: 'goto', x: TAXI_STAND.x, y: TAXI_STAND.y, r: 46, text: 'Drop 2/5 — taxi stand', time: 130, needCar: true },
          { t: 'goto', x: PIER.x, y: PIER.y, r: 46, text: 'Drop 3/5 — the pier', time: 130, needCar: true },
          { t: 'goto', x: DOCK_GARAGE.x, y: DOCK_GARAGE.y, r: 46, text: 'Drop 4/5 — dock garage', time: 130, needCar: true },
          { t: 'goto', x: SAFE().x, y: SAFE().y, r: 46, text: 'Drop 5/5 — safehouse', time: 130, needCar: true },
          { t: 'say', who: 'SEAL', text: 'Seal intact. You are officially boring to insure.', dur: 3 },
        ],
      },
      {
        name: 'Vigilante', payout: 1400,
        giver: () => PD, color: '#7cffa0',
        brief: 'Three runner cars are working the strip tonight. The VCPD outsources.',
        steps: () => [
          { t: 'say', who: 'DESK SGT', text: 'Three runner cars on our strip tonight. We never asked, you never told. Black Voodoos. 150 seconds.', dur: 4.6 },
          { t: 'destroy3', x: roadX(7) + 43, y: roadY(8), time: 150, text: 'Wreck the three runner Voodoos' },
          { t: 'say', who: 'DESK SGT', text: 'The paperwork will say "weather damage". Perfect.', dur: 3 },
        ],
      },
      {
        name: 'Runway Sprint', payout: 1200,
        giver: () => COURIER_PAD, color: '#7cffa0',
        brief: 'Six pylons, one runway, too much engine.',
        steps: () => [
          { t: 'say', who: 'MARSHAL', text: 'Six pylons down the field and back before the tower coffee cools. 95 seconds. Green lights.', dur: 4.2 },
          { t: 'goto', x: roadX(15) + 43 + 60, y: roadY(4) + 43 + 40, r: 44, text: 'Pylon 1/6 — north apron', time: 95, needCar: true },
          { t: 'goto', x: roadX(16) + 43 + 60, y: roadY(6) + 43 + 40, r: 44, text: 'Pylon 2/6 — east hedge', time: 95, needCar: true },
          { t: 'goto', x: roadX(15) + 43 + 60, y: roadY(8) + 43 + 40, r: 44, text: 'Pylon 3/6 — south apron', time: 95, needCar: true },
          { t: 'goto', x: roadX(14) + 43 + 60, y: roadY(6) + 43 + 40, r: 44, text: 'Pylon 4/6 — midfield', time: 95, needCar: true },
          { t: 'goto', x: roadX(15) + 43 + 60, y: roadY(5) + 43 + 40, r: 44, text: 'Pylon 5/6 — tower turn', time: 95, needCar: true },
          { t: 'goto', x: COURIER_PAD.x, y: COURIER_PAD.y, r: 44, text: 'Pylon 6/6 — finish line', time: 95, needCar: true },
          { t: 'say', who: 'MARSHAL', text: 'The tower is not amused. The marshal is. Take the envelope.', dur: 3 },
        ],
      },
      {
        name: 'Night Shift', payout: 1000,
        giver: () => TAXI_STAND, color: '#7cffa0',
        brief: 'Drive the Coach route. Three stops. The tourists get seasick.',
        steps: () => [
          { t: 'say', who: 'MAYOR', text: 'The night bus needs a driver with a lead foot and a heart of gold. The Coach waits at the stand.', dur: 4.4 },
          { t: 'getcar', type: 'bus', x: TAXI_STAND.x + 40, y: TAXI_STAND.y + 20, text: 'Take the Coach from the stand' },
          { t: 'goto', x: HOSP().x, y: HOSP().y + 40, r: 50, text: 'Route stop 1/3 — the hospital', time: 120 },
          { t: 'goto', x: PIER.x, y: PIER.y, r: 50, text: 'Route stop 2/3 — the pier', time: 120 },
          { t: 'goto', x: TAXI_STAND.x, y: TAXI_STAND.y, r: 50, text: 'Route stop 3/3 — back to the stand', time: 120 },
          { t: 'say', who: 'MAYOR', text: 'Every tourist alive. The transit board faints from joy. Envelope six.', dur: 3.2 },
        ],
      },
    ];
    return defs[i];
  }

  // ------------------------------------------------------------- lifecycle
  start(def, isSide) {
    this.active = {
      def, isSide: !!isSide,
      steps: def.steps(),
      si: 0,
      data: {},
    };
    this.beginStep(this.active.steps[0]);
    missionText(def.name + ' — ' + def.brief, 5);
    G.hud.cut = { name: def.name, brief: def.brief, t: 3.2, isSide: !!isSide };
    sfxPickup();
  }

  beginStep(s) {
    const m = this.active;
    if (!m) return;
    m.deadline = s.time ? G.t + s.time : null;
    this.deadline = m.deadline;
    switch (s.t) {
      case 'say':
        say(s.who + ': ' + s.text, s.dur || 3.6);
        break;
      case 'goto': {
        G.hud.help = 0;
        if (s.time) missionText(s.text + ' — ' + fmtTime(s.time), 3);
        else missionText(s.text, 3.4);
        break;
      }
      case 'getcar': {
        const car = new Car(s.type, s.x, s.y, 0.4, { color: '#f7f7f5', mission: true });
        car.color = s.type === 'banshee' ? '#f7f7f5' : car.color;
        G.cars.push(car);
        m.data.car = car;
        missionText(s.text, 3.4);
        help('Press F to enter the glowing car.', 4);
        break;
      }
      case 'deliver':
        missionText(s.text, 3.4);
        break;
      case 'destroy': {
        const car = new Car(s.type, s.x, s.y, 0, { color: s.color || '#00ff9c', mission: true });
        car.ai = { kind: 'flee' };
        G.cars.push(car);
        m.data.targets = [car];
        missionText(s.text, 3.4);
        break;
      }
      case 'destroy4': {
        const types = ['voodoo', 'wagon', 'van', 'cabbie'];
        m.data.targets = [];
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          const car = new Car(types[k], s.cx + Math.cos(a) * 120, s.cy + Math.sin(a) * 90, a + Math.PI / 2, { mission: true });
          G.cars.push(car);
          m.data.targets.push(car);
        }
        m.data.total = 4;
        missionText(s.text, 3.4);
        break;
      }
      case 'destroy3': {
        m.data.targets = [];
        for (let k = 0; k < 3; k++) {
          const a = this.rng.range(0, Math.PI * 2);
          const car = new Car('voodoo', s.x + Math.cos(a) * this.rng.range(180, 320), s.y + Math.sin(a) * this.rng.range(140, 280), a, { color: '#0c0c10', mission: true });
          car.ai = { kind: 'flee' };
          G.cars.push(car);
          m.data.targets.push(car);
        }
        m.data.total = 3;
        missionText(s.text, 3.4);
        break;
      }
      case 'lose':
        if (G.police) G.police.setStars(s.stars);
        missionText(s.text, 3.4);
        break;
    }
  }

  tickStep(s, dt) {
    const m = this.active;
    if (!m) return null;
    const P = G.player;
    switch (s.t) {
      case 'say':
        return G.hud.subT <= 0.4 ? 'ok' : null;

      case 'goto': {
        // timed steps fail
        if (m.deadline !== null && G.t > m.deadline) return 'fail';
        if (s.needCar && !P.car) return null;
        const d = dist(P.x, P.y, s.x, s.y);
        return d < s.r ? 'ok' : null;
      }

      case 'getcar': {
        const car = m.data.car;
        if (!car || car.dead) return 'fail';
        if (P.car === car) return 'ok';
        return null;
      }

      case 'deliver': {
        if (m.deadline !== null && G.t > m.deadline) return 'fail';
        const car = m.data.car;
        if (car && car.dead) return 'fail';
        if (!P.car) return null;
        if (s.keepCar && car && P.car !== car) return null;
        return dist(P.x, P.y, s.x, s.y) < s.r ? 'ok' : null;
      }

      case 'destroy': {
        const car = m.data.targets[0];
        if (car && car.dead) return 'ok';
        if (!car) return 'fail';
        // chase logic: it flees the player
        this.driveFlee(car, dt);
        car.update(dt);
        return null;
      }

      case 'destroy3': {
        if (m.deadline !== null && G.t > m.deadline) return 'fail';
        const alive = m.data.targets.filter((c) => !c.dead).length;
        if (alive === 0) return 'ok';
        for (const c of m.data.targets) {
          if (!c.dead) { this.driveFlee(c, dt); c.update(dt); }
        }
        return null;
      }

      case 'destroy4': {
        if (m.deadline !== null && G.t > m.deadline) return 'fail';
        const alive = m.data.targets.filter((c) => !c.dead).length;
        if (alive === 0) return 'ok';
        return null;
      }

      case 'lose':
        if (G.police && G.police.stars === 0) return 'ok';
        return null;
    }
    return null;
  }

  stepMarker(s) {
    const m = this.active;
    if (!m) return null;
    const P = G.player;
    switch (s.t) {
      case 'goto':
        if (s.needCar && !P.car) return { x: s.x, y: s.y, r: s.r, color: '#7cffa0', dim: true };
        return { x: s.x, y: s.y, r: s.r, color: '#7cffa0' };
      case 'getcar': {
        const car = m.data.car;
        if (!car) return null;
        return { x: car.x, y: car.y, r: 34, color: '#ffd24a' };
      }
      case 'deliver': {
        const car = m.data.car;
        if (s.keepCar && car && P.car !== car) {
          return { x: car.x, y: car.y, r: 34, color: '#ffd24a' };
        }
        return { x: s.x, y: s.y, r: s.r, color: '#ff8fc8' };
      }
      case 'destroy': {
        const car = m.data.targets[0];
        return car ? { x: car.x, y: car.y, r: 34, color: '#ff5040' } : null;
      }
      default:
        return null;
    }
  }

  driveFlee(car, dt) {
    const P = G.player;
    const dx = car.x - P.x, dy = car.y - P.y;
    const d = Math.hypot(dx, dy) || 1;
    const want = Math.atan2(dy / d, dx / d);
    const ad = angNorm2(want - car.h);
    car.ctrl.steer = clamp(ad * 2.2, -1, 1);
    car.ctrl.throttle = 1;
    car.ctrl.hand = false;
    // keep it roughly on roads: if it bumps a wall it will slide along
  }

  fail(reason) {
    if (!this.active) return;
    const name = this.active.def.name;
    missionText('MISSION FAILED — ' + reason, 4);
    say('RICO: ' + failLine(this.rng), 3.4);
    sfxMission(false);
    this.cleanup();
    this.active = null;
    this.deadline = null;
  }

  pass() {
    if (!this.active) return;
    const def = this.active.def;
    G.money += def.payout;
    addStat('earned', def.payout);
    if (this.active.isSide) addStat('sideJobs', 1);
    else addStat('missions', 1);
    G.hud.passed = 3.4;
    G.hud.passedName = def.name.toUpperCase() + '  ·  ' + fmtMoney(def.payout);
    sfxMission(true);
    if (this.active.isSide) {
      const i = this.active.sideIdx;
      if (typeof i === 'number') this.sideDone[i] = true;
    } else {
      this.storyIdx++;
      if (this.storyIdx >= 6 && G.gameRef) G.gameRef.finishStory();
    }
    this.cleanup();
    this.active = null;
    this.deadline = null;
  }

  cleanup() {
    const m = this.active;
    if (!m) return;
    // leftover mission cars stay; timed markers clear
    this.deadline = null;
  }

  onCarDestroyed(car) {
    // hook kept for future counting; destroy steps poll target.dead
  }

  // short progress line for the HUD checklist
  progress() {
    const m = this.active;
    if (!m) return null;
    const s = m.steps[m.si];
    switch (s.t) {
      case 'destroy': {
        const car = m.data.targets[0];
        return [s.text, car && !car.dead ? '1 left' : 'wrecked'];
      }
      case 'destroy3': {
        const left = m.data.targets.filter((c) => !c.dead).length;
        return [s.text, left + '/3 left'];
      }
      case 'destroy4': {
        const left = m.data.targets.filter((c) => !c.dead).length;
        return [s.text, left + '/4 left'];
      }
      case 'lose':
        return [s.text, (G.police ? G.police.stars : 0) + ' stars'];
      case 'getcar':
        return [s.text, 'press F'];
      default:
        return null;
    }
  }

  // ------------------------------------------------------------- frame
  update(dt) {
    this.markers.length = 0;
    this.flashT += dt;

    if (this.active) {
      const m = this.active;
      const s = m.steps[m.si];
      const res = this.tickStep(s, dt);
      if (res === 'fail') { this.fail(stepFailReason(s)); return; }
      if (res === 'ok') {
        m.si++;
        if (m.si >= m.steps.length) { this.pass(); return; }
        this.beginStep(m.steps[m.si]);
      }
      // live timer readout
      if (m.deadline !== null) {
        const rem = Math.max(0, m.deadline - G.t);
        missionText(s.text + ' — ' + fmtTime(rem), 0.2);
        if (rem < 11 && Math.floor(rem) !== Math.floor(rem + dt)) sfxTick();
      }
      const mk = this.stepMarker(m.steps[m.si]);
      if (mk) this.markers.push(mk);
      return;
    }

    // no active mission: show giver markers
    if (this.storyIdx < 6) {
      const def = this.storyDef(this.storyIdx);
      const g = def.giver();
      this.markers.push({ x: g.x, y: g.y, r: 30, color: def.color, giver: true, label: 'RICO' });
    }
    for (let i = 0; i < 3; i++) {
      if (this.sideDone[i]) continue;
      const def = this.sideDef(i);
      const g = def.giver();
      this.markers.push({ x: g.x, y: g.y, r: 24, color: def.color, giver: true, side: i });
    }
  }

  // player stepped into a giver marker
  tryGivers() {
    if (this.active) return;
    const P = G.player;
    for (const mk of this.markers) {
      if (!mk.giver) continue;
      if (dist(P.x, P.y, mk.x, mk.y) < mk.r) {
        if (mk.side !== undefined) {
          this.active = null;
          const def = this.sideDef(mk.side);
          this.start(def, true);
          this.active.sideIdx = mk.side;
        } else {
          this.start(this.storyDef(this.storyIdx), false);
        }
        return;
      }
    }
  }
}

// ---------------------------------------------------------------- helpers
function angNorm2(a) {
  a %= Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function stepFailReason(s) {
  if (s.t === 'goto' || s.t === 'deliver' || s.t === 'destroy4' || s.t === 'destroy3') return 'out of time';
  if (s.t === 'getcar') return 'the car was wrecked';
  if (s.t === 'destroy') return 'the runner slipped away';
  return 'too slow';
}

function failLine(rng) {
  const lines = [
    'Do not sweat it. Even the tide comes back.',
    'Again. Slower, meaner, smarter.',
    'The Palms forgive. The paperwork does not.',
    'That was a rehearsal, cousin. Do it for real.',
  ];
  return lines[Math.floor(rng.f() * lines.length)];
}

let _tickT = 0;
function sfxTick() {
  // tiny clock blip — reuse pickup at low volume is fine for a one-person build
  sfxPickup();
}

export function fmtMoneyShim(n) { return '$' + n; }
