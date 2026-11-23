// shops.js — Pay'n'Spray, gas station, Ammu-Nation, food stands: walk/drive-in services
import { CFG } from './config.js';
import { dist } from './util.js';

const SERVICES = [
  {
    id: 'spray', poi: 'spray', name: "Pay 'n' Spray", color: '#ff5da2',
    hint: 'Drive in to respray and repair — $100',
    line: 'shop_spray',
    canUse(g) { return !!g.player.inCar; },
    price: 100,
    act(g) {
      const car = g.player.inCar;
      if (g.player.money < this.price) return 'Not enough cash';
      g.player.money -= this.price;
      car.hp = car.maxHp;
      car.state = 'drive';
      car.fireT = 0;
      car.smokeT = 0;
      car.color = repaint(car);
      g.police.clear();
      g.hud.toast('Fresh paint, clean record — $100');
      g.audio?.missionTick?.();
      g.fxSparks(car.x, car.y, 10);
      g.dialogue?.play(this.line, true);
      return null;
    },
  },
  {
    id: 'gas', poi: 'gas', name: 'Octane Fuel & Repair', color: '#ffd166',
    hint: 'Stop here to patch the bodywork — $50',
    line: 'shop_spray',
    canUse(g) { return !!g.player.inCar; },
    price: 50,
    act(g) {
      const car = g.player.inCar;
      if (g.player.money < this.price) return 'Not enough cash';
      g.player.money -= this.price;
      car.hp = Math.min(car.maxHp, car.hp + car.maxHp * 0.7);
      car.state = 'drive';
      car.fireT = 0;
      g.hud.toast('Bodywork patched — $50');
      g.audio?.missionTick?.();
      g.dialogue?.play(this.line, true);
      return null;
    },
  },
  {
    id: 'ammo', poi: 'ammunation', name: 'Ammu-Nation', color: '#8cff5d',
    hint: 'E: buy 24 rounds ($60) · E again: armor ($150)',
    price: 60,
    line: 'shop_guns',
    canUse(g) { return !g.player.inCar; },
    act(g) {
      if (!this.armorNext) {
        if (g.player.money < 60) return 'Not enough cash';
        g.player.money -= 60;
        g.player.ammo += 24;
        g.hud.toast('+24 rounds — $60');
      } else {
        if (g.player.money < 150) return 'Not enough cash';
        g.player.money -= 150;
        g.player.armor = Math.min(CFG.P_ARMOR_MAX, g.player.armor + 100);
        g.hud.toast('Body armor — $150');
      }
      this.armorNext = !this.armorNext;
      g.audio?.missionTick?.();
      g.dialogue?.play(this.line, true);
      return null;
    },
  },
  {
    id: 'food', poi: 'food', name: 'Palm Dogs', color: '#00e5ff',
    hint: 'E: hot dog, full heal — $25',
    price: 25,
    line: 'shop_spray',
    canUse(g) { return !g.player.inCar; },
    act(g) {
      if (g.player.hp >= CFG.P_HP) return 'Already full';
      if (g.player.money < 25) return 'Not enough cash';
      g.player.money -= 25;
      g.player.hp = CFG.P_HP;
      g.hud.toast('Full health — $25');
      g.audio?.missionTick?.();
      g.dialogue?.play(this.line, true);
      return null;
    },
  },
];

function repaint(car) {
  const pool = car.def.colors;
  let c = pool[(Math.random() * pool.length) | 0];
  if (c === car.color && pool.length > 1) c = pool[(pool.indexOf(c) + 1) % pool.length];
  return c;
}

export class Shops {
  constructor(game) {
    this.game = game;
    this.cool = 0;
    this.armorNext = false;
    this.lastService = null;
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.cool = Math.max(0, this.cool - dt);
    for (const s of SERVICES) {
      const poi = g.world.pois[s.poi];
      if (!poi) continue;
      const near = dist(p.x, p.y, poi.x, poi.y) < 46;
      if (near && s.canUse(g) && this.cool <= 0) {
        // drive-through services auto-trigger; counter services need E
        const auto = s.id === 'spray' || s.id === 'gas';
        if (auto || g.input.pressed('E')) {
          this.cool = 1.0;
          const err = s.act.call(s, g);
          if (err) g.hud.toast(err);
        }
      }
    }
  }

  // prompt text for the render pass
  prompt() {
    const g = this.game, p = g.player;
    for (const s of SERVICES) {
      const poi = g.world.pois[s.poi];
      if (!poi) continue;
      if (dist(p.x, p.y, poi.x, poi.y) < 46 && s.canUse(g)) {
        return { x: poi.x, y: poi.y - 40, text: s.hint, color: s.color, name: s.name };
      }
    }
    return null;
  }
}
