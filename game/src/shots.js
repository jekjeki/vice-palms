// shots.js — deterministic staged scenes for the 4 dossier screenshots:
// ?shot=start|play|end|chaos&seed=N  (audio stays muted in every shot)

import { CFG } from './config.js';
import { dist } from './util.js';
import { makeCar } from './cars.js';
import { makePed } from './peds.js';
import { addWanted } from './police.js';
import { say } from './missions.js';
import { LANDMARKS } from './world.js';
import { mkPart } from './cars.js';

export function applyShot(g, shot, seed) {
  const L = LANDMARKS;
  const p = g.player;
  switch (shot) {
    case 'start': {
      // pure title screen; nothing to stage
      g.state = 'title';
      break;
    }
    case 'play': {
      g.state = 'play';
      // Rico handing out a job near the diner, player rolling up in a Banshee
      p.x = L.diner.x - 260;
      p.y = L.diner.y - 190;
      const car = makeCar(g, p.x - 40, p.y + 46, Math.PI, 'sports', {
        kind: 'mission', driver: 'player', color: '#ff5fa8',
      });
      p.car = car;
      car.throttle = 1; // rolling shot
      makePed(g, L.diner.x + 40, L.diner.y + 60);
      makePed(g, L.diner.x - 60, L.diner.y + 90);
      say(g, 'RICO: Welcome back to Vice Palms, kid.', 6);
      say(g, 'MISSION — Homecoming: get the lockbox from Sunrise Garage.', 6);
      g.cam.x = p.x + 120;
      g.cam.y = p.y;
      g.cam.zoom = CFG.CAM_ZOOM_CAR;
      break;
    }
    case 'end': {
      g.state = 'play';
      // the finale frame: last mission passed, stats on screen
      g.missions.storyIdx = g.missions.defs.story.length;
      g.passedOverlay = { text: 'MISSION PASSED!', sub: '$10,000', t: 30, col: '#ffd24a' };
      g.cam.x = L.safehouse.x + 300;
      g.cam.y = L.safehouse.y;
      p.x = L.safehouse.x + 300;
      p.y = L.safehouse.y;
      const car = makeCar(g, p.x + 90, p.y + 40, Math.PI / 2, 'sports', {
        kind: 'mission', driver: null, color: '#b46bff',
      });
      car.exitKeep = true;
      g.cam.zoom = CFG.CAM_ZOOM_CAR;
      break;
    }
    case 'chaos': {
      g.state = 'play';
      g.subs.length = 0;
      // three stars of trouble: cruisers closing in, a wreck burning nearby
      addWanted(g, 3, 'a very loud evening');
      p.x = 2300;
      p.y = 1700;
      const car = makeCar(g, p.x, p.y, Math.PI / 2, 'sports', {
        kind: 'mission', driver: 'player', color: '#7c8494',
      });
      car.hp = 40; // smoking
      p.car = car;
      makeCar(g, p.x + 190, p.y - 160, Math.PI / 2, 'police', { kind: 'police', driver: 'npc', siren: true, copMode: 'pursuit' });
      makeCar(g, p.x - 210, p.y + 150, -Math.PI / 2, 'police', { kind: 'police', driver: 'npc', siren: true, copMode: 'pursuit' });
      makeCar(g, p.x + 320, p.y + 260, 0, 'sedan', { kind: 'traffic', driver: 'npc', color: '#8a3b46' });
      // fresh explosion flash to the side
      g.explosions.push({ x: p.x + 240, y: p.y - 220, t: 0.25, power: 1 });
      g.cam.flash = 0.34;
      g.cam.shake = 10;
      makePed(g, p.x - 160, p.y - 90);
      makePed(g, p.x + 80, p.y + 200);
      say(g, 'DISPATCH: All units — gray Banshee, downtown grid, use any force.', 8);
      say(g, 'Three stars of trouble and one very loud evening.', 8);
      g.cam.x = p.x;
      g.cam.y = p.y;
      g.cam.zoom = CFG.CAM_ZOOM_CAR;
      break;
    }
    default:
      break;
  }
}
