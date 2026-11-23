// ---------------------------------------------------------------------------
// pickups.js — the good stuff on the street: health kits, body armour, ammo
// boxes and rolled cash. Deterministic spots across the city, respawn timers,
// bob + glow animation, collection on foot only (earn it, don't drive it).
// ---------------------------------------------------------------------------

import { CFG, PICKUP_CFG } from './config.js';
import { dist2, fmtMoney } from './util.js';

const TYPES = ['health', 'armor', 'ammo', 'cash'];

// hand-placed spots so every run has the same economy geography
const SPOTS = [
  // downtown hospital-ish cluster
  { x: 2885, y: 3435, type: 'health' },
  { x: 2975, y: 3560, type: 'armor' },
  { x: 1240, y: 1700, type: 'health' },
  { x: 845, y: 2050, type: 'ammo' },
  { x: 2045, y: 2100, type: 'cash' },
  { x: 1640, y: 2500, type: 'armor' },
  { x: 2440, y: 3050, type: 'health' },
  { x: 3240, y: 2100, type: 'ammo' },
  // uptown / coast road
  { x: 445, y: 1000, type: 'cash' },
  { x: 1240, y: 1120, type: 'health' },
  { x: 2040, y: 1000, type: 'armor' },
  { x: 2840, y: 1120, type: 'cash' },
  { x: 3640, y: 1000, type: 'ammo' },
  // docks
  { x: 460, y: 500, type: 'ammo' },
  { x: 1200, y: 300, type: 'cash' },
  { x: 1800, y: 640, type: 'health' },
  // airfield
  { x: 2900, y: 380, type: 'armor' },
  { x: 3500, y: 640, type: 'cash' },
  // park + beach
  { x: 2440, y: 2560, type: 'health' },
  { x: 3760, y: 2400, type: 'cash' },
  { x: 3720, y: 800, type: 'armor' },
  { x: 1600, y: 4020, type: 'health' },
];

const COLORS = {
  health: '#ff5e7a',
  armor: '#4fa3e8',
  ammo: '#ffd23e',
  cash: '#7ce8a0',
};

const GLOWS = {
  health: 'rgba(255,94,122,0.3)',
  armor: 'rgba(79,163,232,0.3)',
  ammo: 'rgba(255,210,62,0.3)',
  cash: 'rgba(124,232,160,0.3)',
};

const GLYPHS = {
  health: '+',
  armor: 'A',
  ammo: '»',
  cash: '$',
};

export class Pickup {
  constructor(spot, i) {
    this.x = spot.x;
    this.y = spot.y;
    this.type = spot.type;
    this.i = i;
    this.alive = true;
    this.respawnT = 0;
    this.phase = i * 1.3;
  }

  update(dt, game) {
    if (this.alive) {
      // collect on foot
      const p = game.player;
      if (!p.inCar && !p.dead && dist2(p.x, p.y, this.x, this.y) < PICKUP_CFG.COLLECT_R ** 2) {
        this.collect(game);
      }
      return;
    }
    this.respawnT -= dt;
    if (this.respawnT <= 0) this.alive = true;
  }

  collect(game) {
    const p = game.player;
    const before = p.money;
    let toast = '';
    if (this.type === 'health') {
      if (p.health >= CFG.HEALTH_MAX) return;           // leave it for later
      p.heal(PICKUP_CFG.HEALTH_AMT);
      toast = '+' + PICKUP_CFG.HEALTH_AMT + ' health';
    } else if (this.type === 'armor') {
      if (p.armor >= CFG.ARMOR_MAX) return;
      p.addArmor(PICKUP_CFG.ARMOR_AMT);
      toast = '+' + PICKUP_CFG.ARMOR_AMT + ' armour';
    } else if (this.type === 'ammo') {
      p.addAmmo(PICKUP_CFG.AMMO_AMT);
      toast = '+' + PICKUP_CFG.AMMO_AMT + ' rounds';
      p.weapon = 'pistol';
    } else {
      const cash = PICKUP_CFG.CASH_MIN + Math.floor(game.rng.next() * (PICKUP_CFG.CASH_MAX - PICKUP_CFG.CASH_MIN));
      p.addMoney(cash);
      toast = '+' + fmtMoney(cash);
    }
    this.alive = false;
    this.respawnT = PICKUP_CFG.RESPAWN;
    game.audio.pickup(this.type !== 'cash');
    game.fx.text(this.x, this.y - 16, toast, COLORS[this.type]);
    game.fx.impactSparks(this.x, this.y, 40);
    game.stats.earned += Math.max(0, p.money - before);
    if (p.money - before > 0) game.recordGain(p.money - before);
  }
}

export class Pickups {
  constructor() {
    this.list = SPOTS.map((s, i) => new Pickup(s, i));
  }

  update(dt, game) {
    for (const pk of this.list) pk.update(dt, game);
  }

  draw(g, game, time) {
    for (const pk of this.list) {
      if (!pk.alive) continue;
      const bob = Math.sin(time * 2.4 + pk.phase) * 3;
      const col = COLORS[pk.type];
      // glow ring
      g.save();
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(pk.x, pk.y + bob, 2, pk.x, pk.y + bob, 26);
      gr.addColorStop(0, GLOWS[pk.type]);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(pk.x - 26, pk.y - 26 + bob, 52, 52);
      g.restore();
      // box
      g.fillStyle = '#11141a';
      g.fillRect(pk.x - 9, pk.y - 9 + bob, 18, 18);
      g.fillStyle = col;
      g.fillRect(pk.x - 7, pk.y - 7 + bob, 14, 14);
      g.fillStyle = '#0d1015';
      g.font = 'bold 11px "Segoe UI", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(GLYPHS[pk.type], pk.x, pk.y + bob + 1);
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
    }
  }
}
