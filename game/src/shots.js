// Vice Palms — deterministic screenshot states: ?shot=start|play|end|chaos&seed=N
import { S, startRun, say } from './game.js';

const SHOTS = {
  start: { at: 40, setup() { S.mode = 'title'; } },
  play: {
    at: 300,
    setup() {
      S.mode = 'play';
      const w = S.world, p = S.player;
      const car = S.traffic.spawnAt(w.playerStart.x + 64, w.playerStart.y, Math.PI, 'coupe');
      if (car) { car.lane = null; p.enterCar(car); }
      S.money = 640; S.heat = 1.0; S.wanted = 1;
      S.police.sync();
      S.missions.begin();
      say('RICO: Alright rookie, first job — get moving.');
    },
  },
  end: {
    at: 340,
    setup() {
      S.mode = 'play';
      const w = S.world, p = S.player;
      p.x = w.missionSpots.docks.x; p.y = w.missionSpots.docks.y - 140;
      S.cam.x = p.x; S.cam.y = p.y;
      const car = S.traffic.spawnAt(p.x + 130, p.y, 0, 'sport');
      if (car) p.enterCar(car);
      S.money = 5250; S.heat = 2.0; S.wanted = 2;
      S.missions.idx = 3; S.missions.begin();
      S.stats.missions = 3; S.stats.kills = 6; S.stats.jack = 4;
      for (let i = 0; i < 3; i++) S.peds.spawnAt(p.x + 220 + i * 60, p.y + 180 + i * 40);
    },
  },
  chaos: {
    at: 420,
    setup() {
      S.mode = 'play';
      const p = S.player;
      p.x = 2200; p.y = 1900; S.cam.x = p.x; S.cam.y = p.y;
      S.money = 9180; S.heat = 4.2; S.wanted = 4;
      S.missions.idx = 5; S.missions.begin();
      for (let i = 0; i < 4; i++) {
        S.police.spawnCop(p.x + Math.cos(i * 1.57) * 430, p.y + Math.sin(i * 1.57) * 430);
      }
      // burning wreck under the fireball
      const wreck = S.traffic.spawnAt(p.x + 190, p.y + 55, 0.6, 'van');
      wreck.dead = true; wreck.burnT = 6; wreck.lane = null;
      S.peds.spawnAt(p.x + 130, p.y - 90);
      S.peds.panic(p.x, p.y, 600);
      S.particles.push({ x: p.x + 170, y: p.y + 60, vx: 0, vy: -1.2, life: 4, max: 4, r: 28, c: '#ff9a2e', fire: true });
      S.particles.push({ x: p.x + 210, y: p.y + 30, vx: 0, vy: -1.0, life: 4, max: 4, r: 22, c: '#ffd23e', fire: true });
      S.decals.push({ x: p.x + 190, y: p.y + 50, r: 74, c: 'rgba(10,8,8,0.55)' });
      S.flash = 0.5; S.shake = 10;
      say('RICO: You brought the whole PD down on us. DRIVE!');
    },
  },
};

export function setupShot(name) {
  const cfg = SHOTS[name];
  if (!cfg) return;
  S.audioOn = false;
  S.shot = name;
  S.shotAt = cfg.at;
  S.mode = 'play';
  startRun(S.seed);       // builds world/traffic/peds/police/missions with S.seed
  cfg.setup();
  if (S.audio) S.audio.setMuted(true);
  window.__shot = name;
}
