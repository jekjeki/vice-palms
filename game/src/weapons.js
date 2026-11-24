// weapons.js — fists, pistol, shotgun, SMG. Owned set + per-weapon ammo.
// Player integrates via weapons.update(); ray logic reused from the pistol.

import { CFG, ctx } from './config.js';
import { clamp, dist, TAU } from './util.js';
import { solidsNear } from './world.js';

export const WEAPONS = {
  fists:   { name: 'FISTS',   slot: 1, dmg: 16, range: 36,  cd: 0.45, auto: false, melee: true },
  pistol:  { name: 'PISTOL',  slot: 2, dmg: 26, range: 640, cd: 0.34, spread: 0.02, auto: false, pellets: 1 },
  shotgun: { name: 'SHOTGUN', slot: 3, dmg: 13, range: 310, cd: 0.92, spread: 0.24, auto: false, pellets: 6 },
  smg:     { name: 'SMG',     slot: 4, dmg: 12, range: 520, cd: 0.115, spread: 0.09, auto: true, pellets: 1 },
};

export const WEAPON_ORDER = ['fists', 'pistol', 'shotgun', 'smg'];

export class Weapons {
  constructor() {
    this.owned = new Set(['fists', 'pistol']);
    this.ammo = { pistol: CFG.startAmmo, shotgun: 0, smg: 0 };
    this.current = 'pistol';
    this.cd = 0;
    this.autoLatch = false;
  }

  give(type, rounds = 0) {
    this.owned.add(type);
    if (this.ammo[type] !== undefined) this.ammo[type] += rounds;
    this.current = type;
  }

  select(slot) {
    for (const id of WEAPON_ORDER) {
      if (WEAPONS[id].slot === slot && this.owned.has(id)) { this.current = id; return true; }
    }
    return false;
  }

  cycle(dir = 1) {
    const list = WEAPON_ORDER.filter(w => this.owned.has(w));
    let i = list.indexOf(this.current);
    i = (i + dir + list.length) % list.length;
    this.current = list[i];
  }

  // called each frame while on foot
  update(dt, S, input) {
    this.cd = Math.max(0, this.cd - dt);
    for (let s = 1; s <= 4; s++) {
      if (input.hit('Digit' + s)) this.select(s);
    }
    if (input.hit('KeyQ')) this.cycle(-1);

    const w = WEAPONS[this.current];
    const wantFire = input.mouse.down || input.key('Space');
    const allowed = w.auto ? wantFire : (wantFire && !this.autoLatch);
    if (allowed && this.cd <= 0) {
      if (w.melee) {
        this.melee(S);
        this.cd = w.cd;
        this.autoLatch = true;
      } else if (this.ammo[this.current] > 0) {
        this.fire(S, w);
        this.cd = w.cd;
        this.autoLatch = true;
      } else {
        // dry click → auto-switch to a usable weapon
        if (this.ammo[this.current] <= 0) {
          const alt = WEAPON_ORDER.find(id => this.owned.has(id) && (WEAPONS[id].melee || this.ammo[id] > 0));
          if (alt) this.current = alt;
        }
        this.autoLatch = true;
      }
    }
    if (!wantFire) this.autoLatch = false;
  }

  fire(S, w) {
    const p = S.player;
    this.ammo[this.current]--;
    const ang = p.angle;
    if (ctx.sfx) ctx.sfx(this.current === 'shotgun' ? 'shotgun' : 'shot', p.x, p.y);
    ctx.game.muzzle(p.x + Math.cos(ang) * 16, p.y + Math.sin(ang) * 16, ang);
    ctx.game.addSparks(p.x + Math.cos(ang) * 20, p.y + Math.sin(ang) * 20, this.current === 'smg' ? 1 : 3);

    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const a = ang + (Math.random() - 0.5) * (w.spread || 0);
      this.ray(S, p, a, w);
    }
  }

  ray(S, p, ang, w) {
    const range = w.range;
    const step = 12;
    const wx = ctx.world;
    for (let t = 14; t <= range; t += step) {
      const hx = p.x + Math.cos(ang) * t;
      const hy = p.y + Math.sin(ang) * t;
      for (const pd of ctx.pedsList) {
        if (pd.dead) continue;
        if (dist(hx, hy, pd.x, pd.y) < 12) {
          const killed = pd.hurt(w.dmg);
          ctx.game.addBlood(pd.x, pd.y);
          ctx.peds.panic(pd.x, pd.y, 260);
          if (killed) ctx.game.onPedKilled(pd, 'shot');
          else ctx.police.crime(0.6, hx, hy);
          return;
        }
      }
      for (const c of ctx.policeFootList) {
        if (c.dead) continue;
        if (dist(hx, hy, c.x, c.y) < 12) {
          const killed = c.hurt(w.dmg);
          ctx.game.addBlood(c.x, c.y);
          if (killed) ctx.game.onCopKilled(c);
          return;
        }
      }
      for (const car of ctx.cars) {
        if (car.dead) continue;
        if (dist(hx, hy, car.x, car.y) < car.spec.l * 0.42) {
          car.impact(w.dmg * 0.55);
          ctx.game.addSparks(hx, hy, 3);
          if (car.ai === 'police') ctx.police.crime(0.8, hx, hy);
          if (car.ai === 'traffic' && Math.random() < 0.25) {
            car.ai = 'parked'; car.driver = null; car.aiState = null;
            ctx.peds.panic(car.x, car.y);
          }
          return;
        }
      }
      const solids = solidsNear(wx, hx, hy, 4);
      for (const b of solids) {
        if (b.x0 === undefined) continue;
        if (hx > b.x0 && hx < b.x1 && hy > b.y0 && hy < b.y1) {
          ctx.game.addSparks(hx, hy, 3);
          return;
        }
      }
    }
  }

  melee(S) {
    const p = S.player;
    const w = WEAPONS.fists;
    if (ctx.sfx) ctx.sfx('punch', p.x, p.y);
    const rx = p.x + Math.cos(p.angle) * w.range * 0.7;
    const ry = p.y + Math.sin(p.angle) * w.range * 0.7;
    for (const pd of ctx.pedsList) {
      if (pd.dead) continue;
      if (dist(rx, ry, pd.x, pd.y) < w.range * 0.75) {
        const killed = pd.hurt(w.dmg);
        ctx.game.addBlood(pd.x, pd.y);
        if (killed) ctx.game.onPedKilled(pd, 'fists');
        else { pd.fleeFrom(p.x, p.y); ctx.police.crime(0.5, pd.x, pd.y); }
        return;
      }
    }
    for (const c of ctx.policeFootList) {
      if (c.dead) continue;
      if (dist(rx, ry, c.x, c.y) < w.range * 0.75) {
        const killed = c.hurt(w.dmg);
        if (killed) ctx.game.onCopKilled(c);
        return;
      }
    }
  }

  // --------------------------------------------------------- persistence --
  saveData() {
    return {
      owned: [...this.owned],
      ammo: { ...this.ammo },
      current: this.current,
    };
  }

  loadData(d) {
    if (!d) return;
    this.owned = new Set(d.owned || ['fists', 'pistol']);
    this.ammo = { pistol: 0, shotgun: 0, smg: 0, ...(d.ammo || {}) };
    if (this.owned.has(d.current)) this.current = d.current;
  }
}
