// shops.js — where the money goes: Ammu-Nation (ammo + armor), Pay 'n' Spray
// (respray clears the heat), hot dog carts, and free-running pickups scattered
// across the map that respawn after a cooldown.

import { CFG, roadX, roadY } from './config.js';
import { G, RNG, clamp, dist, say, help } from './util.js';
import { sfxPickup, sfxMission } from './audio.js';
import { addStat } from './stats.js';
import { hit } from './input.js';

const PICKUP_SPOTS = [
  { kind: 'health', x: 0, y: 0 },   // filled from world spawns below
  { kind: 'armor', x: 0, y: 0 },
  { kind: 'ammo', x: 0, y: 0 },
  { kind: 'cash', x: 0, y: 0 },
  { kind: 'cash', x: 0, y: 0 },
  { kind: 'health', x: 0, y: 0 },
];

export class Shops {
  constructor(seed) {
    this.rng = new RNG(seed ^ 0x5b0b);
    const w = G.world;
    this.garage = G.garageData || null;   // stored personal car {type, color}
    this.shops = [
      { kind: 'ammu', name: 'AMMU-NATION', x: roadX(8) + 43 + 90, y: roadY(6) + 43 + 90, r: 30, color: '#ff5040' },
      { kind: 'spray', name: "PAY 'N' SPRAY", x: roadX(11) + 43 + 90, y: roadY(2) + 43 + 90, r: 36, color: '#00e5ff' },
      { kind: 'garage', name: 'GARAGE', x: G.world.spawns.safe.x, y: G.world.spawns.safe.y + 140, r: 34, color: '#ffd24a' },
      { kind: 'food', name: 'HOT DOGS', x: roadX(2) + 43 + 90, y: roadY(5) + 43 + 90, r: 26, color: '#ffd24a' },
      { kind: 'food', name: 'HOT DOGS', x: roadX(14) + 43 + 90, y: roadY(9) + 43 + 90, r: 26, color: '#ffd24a' },
    ];
    // pickups anchored to known landmarks
    const safe = w.spawns.safe, hosp = w.spawns.hospital, pd = w.spawns.pd;
    const pier = { x: roadX(12) + 130, y: roadY(0) + 43 + 260 };
    const park = { x: roadX(2) + 43 + 190, y: roadY(5) + 43 + 190 };
    const beach = { x: roadX(12) + 43 + 90, y: 3470 };
    const spots = [safe, pd, hosp, pier, park, beach];
    this.pickups = PICKUP_SPOTS.map((p, i) => ({
      kind: p.kind,
      x: spots[i].x + (i % 2 ? 40 : -40),
      y: spots[i].y + (i < 3 ? 40 : -40),
      taken: false, respawn: 0, bob: this.rng.range(0, 6),
    }));
    this.open = null;   // open shop menu (only 'ammu' uses a real menu)
  }

  nearby() {
    const P = G.player;
    if (!P || P.car) return null;
    for (const s of this.shops) {
      if (dist(P.x, P.y, s.x, s.y) < s.r) return s;
    }
    return null;
  }

  update(dt) {
    const P = G.player;
    if (!P) return;

    // ---------------- pickups
    for (const p of this.pickups) {
      if (p.taken) {
        p.respawn -= dt;
        if (p.respawn <= 0) p.taken = false;
        continue;
      }
      p.bob += dt * 3;
      if (dist(P.x, P.y, p.x, p.y) < 20) {
        this.collect(p);
      }
    }

    // ---------------- shop interactions
    const near = this.nearby();
    if (this.open) {
      if (hit('KeyE') || hit('Escape')) { this.open = null; }
      else if (this.open.kind === 'ammu') {
        if (hit('Digit1')) this.buyAmmo();
        if (hit('Digit2')) this.buyArmor();
        if (hit('Digit3')) this.buyShotgun();
      }
      return;
    }
    if (near) {
      if (near.kind === 'ammu') help('E — AMMU-NATION  [1] 9mm $60  [2] armor $250  [3] shotgun $400', 1.2);
      else if (near.kind === 'food') help('E — hot dog $25 (+40 health)', 1.2);
      else if (near.kind === 'garage') {
        if (P.car && P.car.speed < 15) help('E — park this car in your garage tonight', 1.2);
        else if (!P.car && this.garage) help('E — take out the ' + this.garage.type + ' from the garage', 1.2);
        else if (!P.car) help('Empty garage. Bring a car you love.', 1.2);
        if (P.car && P.car.speed < 15 && hit('KeyE') && P.car.driver === 'player') this.storeCar(P.car);
        else if (!P.car && this.garage && hit('KeyE')) this.takeCar();
      }
      else if (near.kind === 'spray') {
        help(P.car ? "E — Pay 'n' Spray respray $150 (clears the heat)" : "Drive into the bay for a $150 respray", 1.2);
        if (P.car && P.car.speed < 20 && hit('KeyE')) this.respray(P.car);
      }
      if (near.kind === 'ammu' && hit('KeyE')) this.open = near;
      else if (near.kind === 'food' && hit('KeyE')) this.eat();
    }
  }

  // the safehouse garage: one car, kept overnight
  storeCar(car) {
    this.garage = { type: car.type, color: car.color };
    G.garageData = this.garage;
    car.driver = null;
    car.ctrl.throttle = 0;
    car.ctrl.steer = 0;
    G.player.car = null;
    G.player.onFoot = true;
    G.player.x = car.x - 30;
    G.player.y = car.y + 20;
    sfxPickup();
    say('The ' + car.spec.name + ' sleeps here now. It will wait for you.', 3);
  }

  takeCar() {
    if (!this.garage) return;
    const car = new Car(this.garage.type, this.shops[2].x + 80, this.shops[2].y + 20, Math.PI, { color: this.garage.color });
    G.cars.push(car);
    this.garage = null;
    G.garageData = null;
    sfxPickup();
    say('Fresh off the cold concrete. She missed you.', 2.6);
  }

  collect(p) {
    const P = G.player;
    if (p.kind === 'cash') {
      const amt = 80 + Math.floor(this.rng.f() * 220);
      G.money += amt;
      addStat('earned', amt);
      say('Found $' + amt + ' someone dropped running from the cops.', 2.4);
    } else if (p.kind === 'health') {
      P.hp = Math.min(CFG.P_HP, P.hp + 50);
      say('Bandages. Good as half-new.', 2.2);
    } else if (p.kind === 'armor') {
      P.armor = Math.min(100, P.armor + 50);
      say('Body armor. The VCPD will hate this.', 2.2);
    } else if (p.kind === 'ammo') {
      P.reserve += 17;
      say('A loose box of 9mm. Holiday season.', 2.2);
    }
    p.taken = true;
    p.respawn = 75;
    sfxPickup();
  }

  buyAmmo() {
    if (G.money < 60) { say('The clerk eyes your wallet. Come back richer.', 2.4); return; }
    G.money -= 60;
    G.player.reserve += 17;
    sfxPickup();
    say('Ammu-Nation: a full box of 9mm. No refunds, no questions.', 2.6);
  }

  buyArmor() {
    if (G.money < 250) { say('Armor costs $250. The clerk is not moved.', 2.4); return; }
    G.money -= 250;
    G.player.armor = 100;
    sfxPickup();
    say('Body armor fitted over the party shirt. Style intact.', 2.6);
  }

  buyShotgun() {
    const P = G.player;
    if (!P.hasShotgun) {
      if (G.money < 400) { say('The shotgun costs $400. Come back with envelope money.', 2.4); return; }
      G.money -= 400;
      P.hasShotgun = true;
      P.weapon = 'shotgun';
      P.weapons.shotgun.mag = 8;
      P.weapons.shotgun.reserve = 8;
      sfxPickup();
      say('A shotgun. Q swaps it for the pistol when you feel subtle.', 3.4);
      return;
    }
    if (G.money < 60) { say('Shells are $60 a box. The clerk shrugs.', 2.4); return; }
    G.money -= 60;
    P.weapons.shotgun.reserve += 8;
    sfxPickup();
    say('Eight shells of persuasion.', 2.4);
  }

  eat() {
    if (G.money < 25) { say('Even the hot dog has standards. $25.', 2.2); return; }
    if (G.player.hp >= CFG.P_HP) { say('You are full of neon and vigor already.', 2.2); return; }
    G.money -= 25;
    G.player.hp = Math.min(CFG.P_HP, G.player.hp + 40);
    sfxPickup();
    say('Mustard, onions, questionable joy. +40 health.', 2.4);
  }

  respray(car) {
    if (G.money < 150) { say("Pay 'n' Spray does not take IOUs. $150.", 2.4); return; }
    G.money -= 150;
    const colors = ['#ff2f7d', '#00d9ff', '#ffb200', '#8b5cf6', '#18e0b4', '#e8e6e3'];
    car.color = colors[Math.floor(this.rng.f() * colors.length)];
    if (G.police && G.police.stars > 0) {
      G.police.clear();
      G.police.removeUnits();
    }
    addStat('sprayed', 1);
    sfxMission(true);
    say('Fresh paint, new plates. The night forgets a face.', 3);
  }

  markers() {
    return this.shops.map((s) => ({ x: s.x, y: s.y, r: s.r, color: s.color, giver: false, shop: s.kind }));
  }
}
