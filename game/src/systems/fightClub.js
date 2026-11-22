// THE PIT BELOW — Vice Palms' underground fight club. A door on a south-side block
// leads down to a basement ring where five fighters wait on a ladder. The brawl is a
// self-contained timed minigame: move inside the ropes, punch on the beat, guard or
// give ground, and read each opponent's telegraph. Entry fee, purse per win, and the
// Coral Belt for anyone who clears the whole ladder.
//
// While Rico is downstairs the street keeps breathing above him: the venue renders in
// screen space (like the interiors do) and pins him at the door until he leaves.

import { PITCH } from '../config.js';
import { clamp, TAU, turnDelta, dist2 } from '../util.js';
import { rand, randInt } from '../rng.js';

const DOOR = { x: 24.5 * PITCH, y: 31 * PITCH - 74 };

const LADDER = [
  { name: 'TINY BRUNO', hp: 55, dmg: 7, spd: 88, reach: 40, guard: 0.18, purse: 180, tint: '#c8874a', quip: 'Bruno does not talk. Bruno hits.' },
  { name: 'RAZOR NADIA', hp: 75, dmg: 9, spd: 116, reach: 42, guard: 0.28, purse: 320, tint: '#d4577a', quip: 'She files her knuckles. Both sets.' },
  { name: 'TWO-TOOTH TOM', hp: 100, dmg: 11, spd: 132, reach: 46, guard: 0.34, purse: 520, tint: '#7a9a58', quip: 'Lost a tooth per decade in this pit.' },
  { name: 'THE MARLIN', hp: 135, dmg: 14, spd: 152, reach: 50, guard: 0.4, purse: 840, tint: '#4a7dff', quip: 'Ex-marina enforcer. Swims with receipts.' },
  { name: 'CINDER KALIFA', hp: 180, dmg: 18, spd: 176, reach: 54, guard: 0.46, purse: 1400, tint: '#ff7a3c', quip: 'The pit is named after her temper.' },
];

const FEE = 60;
const RING_R = 168;

export function createFightClub(game) {
  const F = {
    game,
    door: DOOR,
    inside: false,
    mode: 'lobby',           // lobby | fight | down | win | ko
    ladder: 0,               // next opponent index
    wins: 0,
    belt: false,
    foe: null,
    hero: null,
    crowd: [],
    roar: 0,
    hitstop: 0,
    stateT: 0,
    hintT: 0,
    cx: 0, cy: 0,            // ring centre in canvas space
    scale: 1,
  };

  // ---------------------------------------------------------------- persistence

  F.serialize = () => ({ wins: F.wins, belt: F.belt });
  F.restore = (d) => {
    if (!d) return;
    F.wins = d.wins ?? 0;
    F.belt = d.belt ?? false;
    F.ladder = Math.min(LADDER.length, F.wins);
  };

  // ---------------------------------------------------------------- door

  F.updateDoor = function (dt, p) {
    if (F.inside) return;
    const d = Math.hypot(p.x - DOOR.x, p.y - DOOR.y);
    if (d < 90 && game.hud) game.hud.setPrompt('E — THE PIT BELOW (fight club)');
  };

  F.tryInteract = function (p) {
    if (F.inside) return false;
    if (dist2(p.x, p.y, DOOR.x, DOOR.y) > 110 * 110) return false;
    enter(p);
    return true;
  };

  function enter(p) {
    F.inside = true;
    F.mode = 'lobby';
    F.anchor = { x: p.x, y: p.y };
    p.vx = 0; p.vy = 0;
    F.hintT = 0;
    game.audio.ensure();
    game.audio.blip(220);
  }

  F.exit = function () {
    if (!F.inside) return;
    F.inside = false;
    const p = game.player;
    if (F.anchor) { p.x = F.anchor.x; p.y = F.anchor.y; }
    p.vx = 0; p.vy = 0;
  };

  // ---------------------------------------------------------------- fight setup

  function startFight() {
    const p = game.player;
    if (p.money < FEE) {
      F.notice = `The door man shakes his head. Fights cost $${FEE} in.`;
      F.noticeT = 3;
      return;
    }
    p.money -= FEE;
    const def = LADDER[Math.min(F.ladder, LADDER.length - 1)];
    F.foe = {
      def,
      x: 0.55, y: -0.5,          // arena coords in ring radii
      vx: 0, vy: 0,
      hp: def.hp, maxHp: def.hp,
      face: Math.PI,
      tele: 0, swing: 0, recover: 0,
      cd: 1.1,
      stagger: 0,
      down: 0,
      blockFlash: 0,
    };
    F.hero = {
      x: -0.55, y: 0.5,
      vx: 0, vy: 0,
      hp: 100, maxHp: 100,
      stam: 100,
      face: 0,
      tele: 0, swing: 0, recover: 0,
      guard: false,
      down: 0,
      blockFlash: 0,
    };
    F.mode = 'fight';
    F.stateT = 0;
    F.roar = 0.35;
    F.notice = null;
    buildCrowd();
    game.audio.blip(440);
  }

  function buildCrowd() {
    F.crowd = [];
    for (let k = 0; k < 52; k++) {
      const a = (k / 52) * TAU + rand() * 0.1;
      const r = 1.3 + rand() * 0.34;
      F.crowd.push({ a, r, ph: rand() * TAU, spd: 2.4 + rand() * 2.2, tint: ['#4b4f60', '#5a4848', '#46516b', '#6a5c3f'][randInt(4)] });
    }
  }

  // ---------------------------------------------------------------- update

  F.update = function (dt, input) {
    const p = game.player;

    if (!F.inside) { F.updateDoor(dt, p); return; }

    // Pin Rico at the door: the street above must not drift without him.
    p.x = F.anchor.x; p.y = F.anchor.y;
    p.vx = 0; p.vy = 0;
    F.roar = Math.max(0, F.roar - dt * 0.5);
    F.noticeT = (F.noticeT ?? 0) - dt;
    F.hintT += dt;

    if (input.tap('Backspace') || input.tap('KeyQ')) { F.exit(); return; }

    if (F.mode === 'lobby') {
      if (input.tap('Space') || input.tap('Enter')) startFight();
      return;
    }

    if (F.mode === 'down' || F.mode === 'ko' || F.mode === 'win') {
      F.stateT -= dt;
      // Idle drift back to corners after the verdict.
      if (F.stateT <= 0) {
        if (F.mode === 'win') {
          F.wins++;
          if (F.wins >= LADDER.length && !F.belt) {
            F.belt = true;
            game.toast('THE CORAL BELT IS YOURS. The pit chants your name.', '#ffc042');
            game.audio.blip(880);
          }
          F.ladder = Math.min(LADDER.length, F.wins);
          game.save();
        }
        F.mode = 'lobby';
        F.foe = null;
        F.hero = null;
      }
      return;
    }

    if (F.mode === 'fight') fightStep(dt, input);
  };

  function fightStep(dt, input) {
    if (F.hitstop > 0) { F.hitstop -= dt; return; }
    const h = F.hero, f = F.foe;
    F.stateT += dt;

    // ---- hero intents
    const ax = input.axis();
    const guard = input.held('ShiftLeft') || input.held('ShiftRight');
    h.guard = guard && h.stam > 6;
    const spd = (h.guard ? 0.42 : 1) * 1.5;

    h.vx = ax.x * spd; h.vy = ax.y * spd;
    h.x += h.vx * dt; h.y += h.vy * dt;
    if (Math.hypot(h.vx, h.vy) > 0.05) h.face = Math.atan2(h.vy, h.vx);
    else {
      // Face assist: standing still, Rico squares up to his opponent — punches
      // are aimed at the man, not at wherever the last step pointed.
      const toFoe = Math.atan2(F.foe.y - h.y, F.foe.x - h.x);
      h.face += clamp(turnDelta(h.face, toFoe), -dt * 7, dt * 7);
    }

    // Rope constraint: the ring pushes back with a little bounce.
    const hr = Math.hypot(h.x, h.y);
    if (hr > 1) {
      const k = 1 / hr;
      h.x *= k; h.y *= k;
      h.vx *= -0.25; h.vy *= -0.25;
    }

    h.stam = clamp(h.stam + (h.guard ? 9 : 16) * dt, 0, 100);
    h.tele = Math.max(0, h.tele - dt);
    h.swing = Math.max(0, h.swing - dt);
    h.recover = Math.max(0, h.recover - dt);
    h.blockFlash = Math.max(0, h.blockFlash - dt * 3);

    if (input.tap('Space') && h.swing <= 0 && h.recover <= 0 && h.stam >= 20) {
      h.swing = 0.26;
      h.tele = 0.11;                 // windup beat before the glove lands
      h.stam -= 20;
      game.audio.blip(300);
    }
    // The glove lands partway through the swing.
    if (h.swing > 0 && h.tele === 0 && !h.landed) {
      h.landed = true;
      const reach = 0.52;
      const d = Math.hypot(f.x - h.x, f.y - h.y);
      const angTo = Math.atan2(f.y - h.y, f.x - h.x);
      const faced = Math.abs(((angTo - h.face + Math.PI * 3) % TAU) - Math.PI) < 1.1;
      if (d < reach && faced && f.down <= 0) {
        const blocked = rand() < f.def.guard;
        const dmg = blocked ? 4 : 9 + rand() * 5;
        f.hp -= dmg;
        f.stagger = blocked ? 0.08 : 0.26;
        if (!blocked) {
          const kx = Math.cos(angTo) * 0.09, ky = Math.sin(angTo) * 0.09;
          f.x += kx; f.y += ky;
          F.roar = Math.min(1, F.roar + 0.22);
          game.audio.punch?.();
          game.fx.sparks(F.cx + f.x * F.scale, F.cy + f.y * F.scale, 2);
        } else {
          f.blockFlash = 1;
          game.audio.blip(180);
        }
        F.hitstop = blocked ? 0.04 : 0.07;
      }
    }
    if (h.swing <= 0) h.landed = false;

    // ---- foe brain
    const def = f.def;
    f.tele = Math.max(0, f.tele - dt);
    f.swing = Math.max(0, f.swing - dt);
    f.recover = Math.max(0, f.recover - dt);
    f.cd -= dt;
    f.stagger = Math.max(0, f.stagger - dt);
    f.blockFlash = Math.max(0, f.blockFlash - dt * 3);

    if (f.down > 0 || h.down > 0) return;

    const toH = Math.atan2(h.y - f.y, h.x - f.x);
    const d = Math.hypot(h.x - f.x, h.y - f.y);
    f.face = toH;

    if (f.stagger > 0) {
      // Reeling: drift backwards a touch.
      f.x -= Math.cos(toH) * 0.16 * dt;
      f.y -= Math.sin(toH) * 0.16 * dt;
    } else if (f.swing > 0) {
      // Committed to the swing; keeps stepping in.
      f.x += Math.cos(toH) * def.spd * 0.0018 * dt * 60;
      f.y += Math.sin(toH) * def.spd * 0.0018 * dt * 60;
    } else if (f.tele > 0) {
      // Telegraphed: holds the windup, no movement — the beat to dodge on.
    } else {
      const want = d > 0.62 ? 1 : d < 0.42 ? -0.32 : 0.1;   // in, out, or circle
      const strafe = Math.sin(F.stateT * 1.7 + 2) * 0.45;
      const mvx = (Math.cos(toH) * want + Math.cos(toH + Math.PI / 2) * strafe);
      const mvy = (Math.sin(toH) * want + Math.sin(toH + Math.PI / 2) * strafe);
      f.x += mvx * (def.spd / 150) * dt * 0.9;
      f.y += mvy * (def.spd / 150) * dt * 0.9;
      // Attack decision: close enough and the timer says so.
      if (d < 0.8 && f.cd <= 0) {
        f.tele = 0.24 + rand() * 0.22;
        f.swing = 0;
        f.cd = 1.5 + rand() * 1.6 - Math.min(0.7, F.ladder * 0.14);
      }
    }
    // Swing resolution.
    if (f.tele === 0 && f.swing === 0 && f.recover === 0 && f.pendingSwing) {
      f.pendingSwing = false;
      f.swing = 0.3;
      f.struck = false;
    }
    if (f.swing > 0 && !f.struck && f.swing < 0.18) {
      f.struck = true;
      const reach = def.reach / 150;
      if (d < reach) {
        const dodge = Math.hypot(h.vx, h.vy) > 0.5 && !h.guard;
        if (dodge) {
          F.notice = 'Dodged!';
          F.noticeT = 0.7;
          F.roar = Math.min(1, F.roar + 0.1);
        } else {
          const dmg = (h.guard ? def.dmg * 0.35 : def.dmg) * (0.85 + rand() * 0.3);
          h.hp -= dmg;
          h.blockFlash = 1;
          const kx = Math.cos(toH) * (h.guard ? 0.03 : 0.08), ky = Math.sin(toH) * (h.guard ? 0.03 : 0.08);
          h.x -= kx; h.y -= ky;
          F.roar = Math.min(1, F.roar + (h.guard ? 0.08 : 0.28));
          game.audio.punch?.();
          game.fx.sparks(F.cx + h.x * F.scale, F.cy + h.y * F.scale, 2);
          F.hitstop = 0.05;
          if (!h.guard) game.shake = Math.min(6, game.shake + 2);
        }
      }
    }
    if (f.tele === 0 && f.swing === 0) f.pendingSwing = f.pendingSwing;
    if (f.tele > 0 && f.tele - dt <= 0) f.pendingSwing = true;

    // Ring keeps both fighters inside.
    for (const fig of [h, f]) {
      const r = Math.hypot(fig.x, fig.y);
      if (r > 1) { const k = 1 / r; fig.x *= k; fig.y *= k; }
    }

    // ---- verdicts
    if (f.hp <= 0) {
      f.hp = 0;
      f.down = 1;
      F.mode = 'win';
      F.stateT = 3;
      F.roar = 1;
      game.audio.boom(0.25);
      game.player.money += def.purse;
      game.toast(`${def.name} is DOWN — $${def.purse} purse.`, '#7bffd4');
    } else if (h.hp <= 0) {
      h.hp = 0;
      h.down = 1;
      F.mode = 'ko';
      F.stateT = 3;
      F.roar = 0.8;
      game.audio.boom(0.3);
      game.toast('You are DOWN. The pit laughs, the medic does not.', '#ff7a3c');
    }
  }

  // ---------------------------------------------------------------- render

  /** Screen-space venue, called from main.js instead of the world painter. */
  F.render = function (ctx, W, H) {
    const scale = Math.min(W / 900, H / 620);
    F.scale = RING_R * scale;
    F.cx = W / 2;
    F.cy = H * 0.47;

    // Basement: near-black with a warm pool of light over the ring.
    ctx.fillStyle = '#08080d';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(F.cx, F.cy, 40, F.cx, F.cy, Math.max(W, H) * 0.6);
    g.addColorStop(0, 'rgba(62,46,34,0.55)');
    g.addColorStop(0.5, 'rgba(30,24,26,0.35)');
    g.addColorStop(1, 'rgba(4,4,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Spot cones from two rig corners.
    for (const sx of [W * 0.2, W * 0.8]) {
      const sg = ctx.createLinearGradient(sx, -20, F.cx, F.cy);
      sg.addColorStop(0, 'rgba(255,230,180,0.20)');
      sg.addColorStop(1, 'rgba(255,230,180,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(sx - 26, -20);
      ctx.lineTo(sx + 26, -20);
      ctx.lineTo(F.cx + F.scale * 1.25, F.cy + F.scale * 0.6);
      ctx.lineTo(F.cx - F.scale * 1.25, F.cy + F.scale * 0.6);
      ctx.closePath();
      ctx.fill();
    }

    drawCrowd(ctx, scale);
    drawRing(ctx, scale);

    if (F.hero && F.foe) {
      drawFighter(ctx, F.foe, F.foe.def.tint, scale, false);
      drawFighter(ctx, F.hero, '#e9ecf4', scale, true);
      drawBars(ctx, W);
    }

    drawChrome(ctx, W, H);
  };

  function drawCrowd(ctx, scale) {
    const rr = F.scale;
    for (const c of F.crowd) {
      const bob = Math.sin(c.ph + F.stateT * c.spd) * 3 + (F.roar * Math.sin(c.ph * 3 + F.stateT * 12) * 4);
      const x = F.cx + Math.cos(c.a) * (rr + 46 * scale);
      const y = F.cy + Math.sin(c.a) * (rr + 40 * scale) + bob;
      ctx.fillStyle = c.tint;
      ctx.beginPath();
      ctx.arc(x, y, 6.5 * scale, 0, TAU);
      ctx.fill();
      // Raised arms on a roar.
      if (F.roar > 0.5) {
        ctx.strokeStyle = c.tint;
        ctx.lineWidth = 2.5 * scale;
        ctx.beginPath();
        ctx.moveTo(x - 5 * scale, y - 4 * scale); ctx.lineTo(x - 9 * scale, y - 13 * scale);
        ctx.moveTo(x + 5 * scale, y - 4 * scale); ctx.lineTo(x + 9 * scale, y - 13 * scale);
        ctx.stroke();
      }
    }
  }

  function drawRing(ctx, scale) {
    const rr = F.scale;
    // Mat.
    const mg = ctx.createRadialGradient(F.cx, F.cy - rr * 0.2, 10, F.cx, F.cy, rr * 1.2);
    mg.addColorStop(0, '#2e4a6e');
    mg.addColorStop(1, '#1d2c44');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(F.cx, F.cy, rr, 0, TAU); ctx.fill();
    // Mat wear: scuff arcs.
    ctx.strokeStyle = 'rgba(10,14,22,0.35)';
    ctx.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      const a0 = (k * 2.3) % TAU;
      ctx.beginPath();
      ctx.arc(F.cx, F.cy, rr * (0.3 + k * 0.14), a0, a0 + 1.2 + (k % 3) * 0.4);
      ctx.stroke();
    }
    // Sponsor ring painted on the canvas edge.
    ctx.fillStyle = 'rgba(232,228,212,0.4)';
    ctx.font = `bold ${Math.max(9, 12 * scale)}px Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('CONCH WATER', F.cx, F.cy - rr * 0.72);
    ctx.fillText('PALM AIR', F.cx, F.cy + rr * 0.78);
    ctx.fillText('GATOR GIN', F.cx - rr * 0.78, F.cy);
    ctx.fillText('ROXY ARCADE', F.cx + rr * 0.8, F.cy);
    // Ropes: three concentric rings in the classic colours.
    const ropes = [['#c94b3c', 1.08], ['#e8e4d4', 1.13], ['#4a7dff', 1.18]];
    for (const [col, f] of ropes) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 3.4 * scale;
      ctx.beginPath(); ctx.arc(F.cx, F.cy, rr * f, 0, TAU); ctx.stroke();
    }
    // Corner posts.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4;
      const px = F.cx + Math.cos(a) * rr * 1.2;
      const py = F.cy + Math.sin(a) * rr * 1.2;
      ctx.fillStyle = k % 2 ? '#c94b3c' : '#4a7dff';
      ctx.beginPath(); ctx.arc(px, py, 7 * scale, 0, TAU); ctx.fill();
    }
  }

  function drawFighter(ctx, fig, tint, scale, isHero) {
    const x = F.cx + fig.x * F.scale;
    const y = F.cy + fig.y * F.scale;
    const r = 15 * scale;
    // Shadow.
    ctx.fillStyle = 'rgba(4,6,12,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.9, r * 1.1, r * 0.4, 0, 0, TAU); ctx.fill();
    // Telegraph flare: the windup you can read and dodge.
    if (fig.tele > 0) {
      ctx.strokeStyle = `rgba(255,180,80,${0.4 + 0.5 * Math.sin(F.stateT * 40)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, TAU); ctx.stroke();
    }
    // Body.
    ctx.fillStyle = fig.down > 0 ? '#3a3f4c' : tint;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, TAU); ctx.fill();
    // Facing nub.
    ctx.fillStyle = '#1d2230';
    ctx.beginPath();
    ctx.arc(x + Math.cos(fig.face) * r * 0.7, y + Math.sin(fig.face) * r * 0.7, r * 0.34, 0, TAU);
    ctx.fill();
    // Gloves: lead glove stretches out mid-swing.
    const swingF = fig.swing > 0 ? 1 - Math.abs(fig.swing - 0.15) / 0.15 : 0;
    const gl = r * (0.9 + swingF * 1.5);
    for (const side of [-1, 1]) {
      const ga = fig.face + side * 0.55;
      ctx.fillStyle = fig.blockFlash > 0.2 && side === 1 ? '#ffe9b0' : '#c94b3c';
      ctx.beginPath();
      ctx.arc(x + Math.cos(ga) * gl, y + Math.sin(ga) * gl, r * 0.36, 0, TAU);
      ctx.fill();
    }
    if (isHero) {
      ctx.strokeStyle = 'rgba(123,255,212,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.stroke();
    }
    if (fig.down > 0) {
      ctx.fillStyle = 'rgba(232,228,212,0.8)';
      ctx.font = `bold ${Math.max(10, 13 * scale)}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('DOWN', x, y - r - 10);
    }
  }

  function drawBars(ctx, W) {
    const h = F.hero, f = F.foe;
    const bw = 250;
    const y = 64;
    // Hero left.
    bar(ctx, 40, y, bw, 16, h.hp / h.maxHp, '#3dff7a');
    bar(ctx, 40, y + 20, bw * 0.66, 8, h.stam / 100, '#ffd977');
    ctx.fillStyle = '#e9ecf4';
    ctx.font = 'bold 13px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('RICO', 40, y - 6);
    // Foe right.
    bar(ctx, W - 40 - bw, y, bw, 16, f.hp / f.maxHp, '#ff5a4a');
    ctx.fillStyle = F.foe.def.tint;
    ctx.textAlign = 'right';
    ctx.fillText(F.foe.def.name, W - 40, y - 6);
  }

  function bar(ctx, x, y, w, h, f, color) {
    ctx.fillStyle = 'rgba(8,10,18,0.8)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#1c2029';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(f, 0, 1), h);
  }

  function drawChrome(ctx, W, H) {
    ctx.textAlign = 'center';
    // Banner.
    ctx.fillStyle = '#ffc042';
    ctx.font = `bold ${Math.max(18, 26)}px Consolas, monospace`;
    ctx.fillText('THE PIT BELOW', W / 2, 36);
    ctx.fillStyle = 'rgba(232,228,212,0.7)';
    ctx.font = '12px Consolas, monospace';
    ctx.fillText('fight club — no cops, no refunds', W / 2, 50);

    if (F.mode === 'lobby') {
      const W2 = Math.min(520, W * 0.86);
      const x0 = W / 2 - W2 / 2, y0 = H * 0.24;
      ctx.fillStyle = 'rgba(8,10,18,0.82)';
      ctx.fillRect(x0, y0, W2, 300);
      ctx.strokeStyle = 'rgba(255,192,66,0.5)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0, y0, W2, 300);
      ctx.fillStyle = '#ffc042';
      ctx.font = 'bold 17px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('TONIGHT’S CARD', x0 + 18, y0 + 28);
      ctx.font = '13px Consolas, monospace';
      LADDER.forEach((def, i) => {
        const done = i < F.wins;
        const next = i === F.ladder;
        ctx.fillStyle = done ? 'rgba(123,255,212,0.75)' : next ? '#ffd977' : 'rgba(232,228,212,0.55)';
        const y = y0 + 58 + i * 30;
        ctx.fillText(`${done ? '✔' : next ? '▶' : '·'} ${def.name}`, x0 + 18, y);
        ctx.textAlign = 'right';
        ctx.fillText(`$${def.purse}`, x0 + W2 - 18, y);
        ctx.textAlign = 'left';
      });
      ctx.fillStyle = 'rgba(232,228,212,0.75)';
      ctx.textAlign = 'center';
      const def = LADDER[Math.min(F.ladder, LADDER.length - 1)];
      ctx.fillText(def.quip, W / 2, y0 + 236);
      ctx.fillStyle = '#7bffd4';
      ctx.font = 'bold 15px Consolas, monospace';
      ctx.fillText(`SPACE — step in  ($${FEE} door fee)      BACKSPACE — leave`, W / 2, y0 + 270);
    }

    if (F.mode === 'fight' && F.stateT < 2.2) {
      ctx.fillStyle = `rgba(255,217,119,${1 - F.stateT / 2.2})`;
      ctx.font = 'bold 30px Consolas, monospace';
      ctx.fillText(`${F.foe.def.name}`, W / 2, H * 0.2);
      ctx.font = '15px Consolas, monospace';
      ctx.fillText('SPACE punch   SHIFT guard   WASD move   dodge the flare', W / 2, H * 0.2 + 26);
    }

    if (F.mode === 'win') {
      ctx.fillStyle = 'rgba(123,255,212,0.95)';
      ctx.font = 'bold 42px Consolas, monospace';
      ctx.fillText('KNOCKOUT', W / 2, H * 0.22);
      ctx.font = 'bold 18px Consolas, monospace';
      ctx.fillStyle = '#ffd977';
      ctx.fillText(`+$${F.foe.def.purse} purse`, W / 2, H * 0.22 + 32);
    }
    if (F.mode === 'ko') {
      ctx.fillStyle = 'rgba(255,90,74,0.95)';
      ctx.font = 'bold 42px Consolas, monospace';
      ctx.fillText('YOU ARE DOWN', W / 2, H * 0.22);
      ctx.font = '15px Consolas, monospace';
      ctx.fillStyle = 'rgba(232,228,212,0.8)';
      ctx.fillText('The pit remembers. Come back heavier.', W / 2, H * 0.22 + 30);
    }

    // Corner coach: after a verdict the crowd gives one piece of advice for the
    // next card, chosen off how the fight actually went.
    if ((F.mode === 'win' || F.mode === 'ko') && F.hero) {
      const tips = F.mode === 'win'
        ? ['Corner man: “Good. Next one hits twice as hard.”',
           'Corner man: “You telegraph the lead hand. Fix it upstairs.”',
           'Crowd: “AGAIN! AGAIN!”']
        : ['Corner man: “Guard earlier. You eat the first shot every time.”',
           'Corner man: “Move your feet, the ropes are not a friend.”',
           'Doc: “Hydrate. Come back with a plan.”'];
      ctx.fillStyle = 'rgba(232,228,212,0.8)';
      ctx.font = '13px Consolas, monospace';
      ctx.fillText(tips[F.wins % tips.length], W / 2, H * 0.72);
    }

    if (F.noticeT > 0 && F.notice) {
      ctx.globalAlpha = clamp(F.noticeT / 0.4, 0, 1);
      ctx.fillStyle = '#ffd977';
      ctx.font = 'bold 15px Consolas, monospace';
      ctx.fillText(F.notice, W / 2, H - 64);
      ctx.globalAlpha = 1;
    }
    // Belt bling for the champion.
    if (F.belt) {
      ctx.fillStyle = '#ffc042';
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('★ CORAL BELT HOLDER', 16, H - 16);
    }
  }

  return F;
}
