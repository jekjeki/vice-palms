// transit.js — the Palm Line: one city bus loops the strip; board it at a stop to fast-travel.
import { CFG } from './config.js';
import { dist, angleTo, clamp } from './util.js';

// loop waypoints on roads (clockwise around downtown)
export const BUS_LOOP = [
  { x: 680, y: 2395 }, { x: 1360, y: 2395 }, { x: 2040, y: 2395 }, { x: 2720, y: 2395 },
  { x: 2735, y: 2040 }, { x: 2735, y: 1700 }, { x: 2735, y: 1360 }, { x: 2735, y: 1020 },
  { x: 2395, y: 1010 }, { x: 1700, y: 1010 }, { x: 1020, y: 1010 }, { x: 695, y: 1360 },
  { x: 695, y: 1700 }, { x: 695, y: 2040 },
];

export class Transit {
  constructor(game) {
    this.game = game;
    this.bus = null;
    this.wp = 0;
    this.rideT = 0;       // fast-travel fade timer
    this.rideFrom = null;
    this.rideTo = null;
    this.cool = 0;
    this.stopsHit = 0;
  }

  spawnBus() {
    const g = this.game;
    const w = BUS_LOOP[0];
    this.bus = g.addCar('bus', w.x, w.y, 0, '#d8a020');
    this.bus.driver = 'ai';
    this.bus.marker = null;
    this.bus.ai = { drive: (car, game, dt) => this.drive(car) };
    return this.bus;
  }

  drive(car) {
    const target = BUS_LOOP[this.wp];
    const d = dist(car.x, car.y, target.x, target.y);
    if (d < 60) this.wp = (this.wp + 1) % BUS_LOOP.length;
    const aim = angleTo(car.x, car.y, target.x, target.y);
    const err = Math.atan2(Math.sin(aim - car.h), Math.cos(aim - car.h));
    // keep it stately: buses do not street-race
    return { t: 0.5, s: clamp(err * 1.1, -1, 1) };
  }

  nearestStop(x, y) {
    // stops are the world's busstop props near the loop
    const stops = this.game.world.props.filter((p) => p.kind === 'busstop');
    let best = null, bd = 1e9;
    for (const s of stops) {
      const d = dist(s.x, s.y, x, y);
      if (d < bd) { bd = d; best = s; }
    }
    return { stop: best, d: bd };
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.cool = Math.max(0, this.cool - dt);
    if (!this.bus || this.bus.state === 'wreck') {
      this.busRespawn = (this.busRespawn ?? 6) - dt;
      if (this.busRespawn <= 0) { this.busRespawn = 30; this.spawnBus(); }
      return;
    }

    // fast-travel ride in progress
    if (this.rideT > 0) {
      this.rideT -= dt;
      if (this.rideT <= 0) {
        const dest = this.rideTo;
        g.player.inCar = null;
        p.x = dest.x + 40; p.y = dest.y - 40;
        g.cam.x = p.x; g.cam.y = p.y;
        this.bus.driver = 'ai';
        this.bus.x = dest.x + 70; this.bus.y = dest.y;
        g.hud.toast('Next stop: ' + Math.round(dest.x) + ', ' + Math.round(dest.y));
        g.audio?.missionTick?.();
        this.stopsHit++;
        this.rideFrom = null;
      }
      return;
    }

    // board at a stop: on foot, near the bus while it is slow, press F to RIDE (not steal)
    const bus = this.bus;
    const nearBus = dist(p.x, p.y, bus.x, bus.y) < 90 && bus.speed < 30;
    const { stop, d } = this.nearestStop(bus.x, bus.y);
    if (nearBus && d < 220 && !p.inCar && g.input.pressed('F') && this.cool <= 0) {
      this.cool = 1;
      // pick the NEXT stop along the loop from the bus's current waypoint
      const stops = g.world.props.filter((q) => q.kind === 'busstop');
      const idx = stops.indexOf(stop);
      const dest = stops[(idx + 2) % stops.length];
      this.rideFrom = stop;
      this.rideTo = dest;
      this.rideT = 1.1;
      g.hud.banner('PALM LINE', 'Riding the loop… fare $5');
      p.money = Math.max(0, p.money - 5);
      g.audio?.carDoor?.();
      g.player.inCar = bus;
      bus.driver = 'player';
      return;
    }
  }

  // prompt for the render pass
  prompt() {
    const g = this.game, p = g.player;
    if (!this.bus || this.bus.state === 'wreck' || p.inCar || this.rideT > 0) return null;
    const bus = this.bus;
    if (dist(p.x, p.y, bus.x, bus.y) >= 90 || bus.speed >= 30) return null;
    const { d } = this.nearestStop(bus.x, bus.y);
    if (d >= 220) return null;
    return { x: bus.x, y: bus.y - 46, text: 'F: ride the Palm Line ($5)', color: '#ffd166', name: 'PALM LINE' };
  }

  serialize() { return { stopsHit: this.stopsHit }; }
  deserialize(d) { if (d) this.stopsHit = d.stopsHit ?? 0; }
}
