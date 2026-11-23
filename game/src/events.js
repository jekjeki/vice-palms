// events.js — dynamic city events: every so often Vice Palms stages itself.
import { CFG } from './config.js';
import { rand, dist, clamp } from './util.js';

const EVENTS = [
  {
    id: 'parade', name: 'NEON PARADE',
    text: 'A neon parade floods the strip. Everyone honks in E major.',
    spawn(game) {
      const y = game.world.roadH[7] + CFG.LANE_OFF;
      for (let i = 0; i < 5; i++) {
        const car = game.spawnTraffic(i % 2 ? 'coupe' : 'sport', 800 + i * 420, y);
        if (car) car.color = ['#ff5da2', '#00e5ff', '#ffd166', '#8cff5d', '#c77dff'][i];
      }
      return 'Neon convertibles everywhere. Do not merge. Merging is for Mondays.';
    },
  },
  {
    id: 'raid', name: 'DOCKS RAID',
    text: 'VPD raids the docks. Someone tips off the crates.',
    spawn(game) {
      for (let i = 0; i < 3; i++) {
        const cop = game.spawnPed(900 + i * 500, 560, { kind: 'cop' });
        cop.homeDir = Math.PI / 2;
      }
      const van = game.spawnTraffic('van', 1400, 560);
      if (van) van.color = '#3d3d48';
      return 'Unmarked van, nervous officers, one suspicious seagull.';
    },
  },
  {
    id: 'market', name: 'NIGHT MARKET',
    text: 'The night market opens by the park. Grilled everything.',
    spawn(game) {
      for (let i = 0; i < 6; i++) {
        game.spawnPed(1900 + (i % 3) * 120, 2160 + Math.floor(i / 3) * 60, { job: i % 2 ? 'tourist' : 'dogwalker' });
      }
      return 'Smells like teriyaki and motor oil. Mostly teriyaki.';
    },
  },
  {
    id: 'streetrace', name: 'STREET RACE SIGHTING',
    text: 'Two sport cars, zero patience, one intersection.',
    spawn(game) {
      for (const [x, type] of [[1200, 'sport'], [1500, 'coupe']]) {
        const car = game.spawnTraffic(type, x, game.world.roadH[5] + CFG.LANE_OFF);
        if (car) { car.ai.cruise = 1.0; car.ai.panic = 3; }
      }
      return 'They will regret this at the first palm tree.';
    },
  },
  {
    id: 'storm', name: 'SQUALL OFF THE REEF',
    text: 'A squall rolls in off the reef. The whole city smells like rain.',
    spawn(game) {
      game.weather.intensity = 1;
      game.weather.target = 1;
      game.weather.thunderT = 4;
      return 'Umbrellas up. Suspension down.';
    },
  },
  {
    id: 'dragnet', name: 'VPD DRAGNET',
    text: 'A dragnet crawls across downtown. Walk casually.',
    spawn(game) {
      for (let i = 0; i < 4; i++) {
        game.spawnPed(1000 + i * 700, game.world.roadH[6] - CFG.ROAD_W / 2 - 12, { kind: 'cop' });
      }
      return 'Every cruiser in the grid, one very calm jaywalker.';
    },
  },
  {
    id: 'towline', name: 'TOW TRUCK STAMPEDE',
    text: 'The impound lot overflows. Every tow truck in VP is rolling.',
    spawn(game) {
      for (let i = 0; i < 3; i++) {
        const car = game.spawnTraffic('truck', 1500 + i * 900, game.world.roadH[8] + CFG.LANE_OFF);
        if (car) car.ai.cruise = 0.85;
      }
      return 'Nobody knows whose car is whose. That is the business model.';
    },
  },
  {
    id: 'filmcrew', name: 'FILM CREW SIGHTING',
    text: 'A car-chase movie shoots on 8th. The city is the stunt team.',
    spawn(game) {
      const y = game.world.roadH[7];
      for (let i = 0; i < 8; i++) {
        game.spawnPed(600 + i * 240, y - CFG.ROAD_W / 2 - 12, { job: 'tourist' });
      }
      const hero = game.spawnTraffic('sport', 1000, y + CFG.LANE_OFF);
      if (hero) hero.color = '#e0c040';
      return 'Someone yelled "action" and the traffic obeyed.';
    },
  },
  {
    id: 'blackout', name: 'ROLLING BLACKOUT',
    text: 'The grid flips out for a minute. Neon city goes candlelight.',
    spawn(game) {
      game.blackout = 14;
      return 'Vice Palms by candlelight: still illegal, just quieter.';
    },
  },
];

export class Events {
  constructor(game) {
    this.game = game;
    this.nextT = 40 + rand(0, 30);
    this.active = null;
    this.activeT = 0;
    this.count = 0;
    this.recent = [];
  }

  update(dt) {
    const g = this.game;
    if (g.state !== 'play' || g.shotMode) return;
    if (this.active) {
      this.activeT -= dt;
      if (this.activeT <= 0) this.active = null;
      return;
    }
    this.nextT -= dt;
    if (this.nextT > 0) return;
    this.nextT = 55 + rand(0, 45);
    // pick an event that did not just run
    const pool = EVENTS.filter((e) => !this.recent.slice(-2).includes(e.id));
    const ev = pool[(Math.random() * pool.length) | 0];
    this.recent.push(ev.id);
    this.active = ev;
    this.activeT = 45;
    this.count++;
    const flavor = ev.spawn(g);
    g.hud.banner('CITY EVENT · ' + ev.name, flavor);
    g.audio?.missionStart?.();
  }

  serialize() { return { count: this.count }; }
  deserialize(d) { if (d) this.count = d.count ?? 0; }
}
