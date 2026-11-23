// barks.js — floating one-liners over peds and cops. Little text bubbles that
// pop when the city reacts to you: near-misses, carjacks, gunfire, crashes.
// Pure flavour; capped so the streets never turn into a comic strip.

import { CFG } from './config.js';
import { dist, clamp, TAU } from './util.js';

const PED_CALM = [
  'Nice night, huh?',
  'You seen the new Club Neon?',
  'Bus is late again.',
  'I love this city.',
  'Palms for president.',
  'Tacos. Now.',
];
const PED_SCARED = [
  'HE\u2019S GOT A GUN!',
  'Run! RUN!',
  'Not again!',
  'Call the cops!',
  'My laundry!',
];
const PED_ANGRY = [
  'Watch it, pal!',
  'Hey! The paint!',
  'Learn to drive!',
  'That\u2019s my toe!',
];
const COP_LINES = [
  'VCPD! Freeze!',
  'Hands where I can see them!',
  'You picked the wrong night!',
  'Stop the car!',
  'Units, suspect heading—',
];

export class Barks {
  constructor(game) {
    this.game = game;
    this.active = [];      // {text, x, y, t, dur, color}
    this.cool = new Map(); // entity id -> cooldown t
    this.timer = 1.5;
  }

  /** Bubble over an entity (needs x, y, id). */
  say(ent, text, dur, color) {
    if (!ent || text === undefined) return;
    const last = this.cool.get(ent.id) || 0;
    if (last > 0) return;
    this.cool.set(ent.id, 6);
    this.active.push({ text, x: ent.x, y: ent.y, t: 0, dur: dur || 2.2, color: color || '#ffffff', id: ent.id });
    if (this.active.length > 5) this.active.shift();
  }

  /** Ambient chatter: nearest calm ped may pipe up. */
  ambient() {
    const game = this.game;
    const p = game.player;
    const calm = game.peds.list.filter((pe) => pe.state === 'walk' && dist(pe.x, pe.y, p.x, p.y) < 190);
    if (!calm.length) return;
    const pick = calm[Math.floor(game.time * 7) % calm.length];
    this.say(pick, PED_CALM[Math.floor(game.time) % PED_CALM.length], 2.4, 'rgba(255,255,255,0.85)');
  }

  /** Event hooks called from game code. */
  onJack(ent, cop) {
    if (cop) this.say(ent, COP_LINES[Math.floor(Math.random() * COP_LINES.length)], 2.4, '#8fbaff');
    else this.say(ent, PED_ANGRY[Math.floor(Math.random() * PED_ANGRY.length)], 2.2);
  }

  onPanic(ent) {
    this.say(ent, PED_SCARED[Math.floor(Math.random() * PED_SCARED.length)], 2, '#ffb3b3');
  }

  onNearMiss(ent) {
    this.say(ent, PED_ANGRY[Math.floor(Math.random() * PED_ANGRY.length)], 1.6, '#ffd9a3');
  }

  onCopChase(cop) {
    if (Math.random() < 0.06) {
      this.say(cop, COP_LINES[Math.floor(Math.random() * COP_LINES.length)], 2.2, '#8fbaff');
    }
  }

  update(dt) {
    for (const b of this.active) b.t += dt;
    this.active = this.active.filter((b) => b.t < b.dur);
    for (const [id, t] of this.cool) {
      const nt = t - dt;
      if (nt <= 0) this.cool.delete(id);
      else this.cool.set(id, nt);
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 5 + Math.random() * 6;
      this.ambient();
    }
  }

  draw(ctx) {
    const game = this.game;
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px "Courier New", monospace';
    for (const b of this.active) {
      const a = clamp(Math.min(b.t * 5, (b.dur - b.t) * 3), 0, 1);
      ctx.globalAlpha = a;
      const w = ctx.measureText(b.text).width + 12;
      const bx = clamp(b.x, game.cam.x - game.viewW / 2 / game.cam.zoom + w / 2 + 8, game.cam.x + game.viewW / 2 / game.cam.zoom - w / 2 - 8);
      ctx.fillStyle = 'rgba(8, 10, 16, 0.8)';
      ctx.fillRect(bx - w / 2, b.y - 30, w, 16);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, bx, b.y - 19);
      // little tail
      ctx.fillStyle = 'rgba(8, 10, 16, 0.8)';
      ctx.beginPath();
      ctx.moveTo(bx - 3, b.y - 14.5);
      ctx.lineTo(bx + 3, b.y - 14.5);
      ctx.lineTo(clamp(b.x, bx - 3, bx + 3), b.y - 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    void TAU; void CFG;
  }
}
