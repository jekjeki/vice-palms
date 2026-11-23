// ============================================================
// THE PIT BELOW — the fight club on the city's south side.
//
// A door on the street, a hundred-dollar fee, and a ladder of
// five opponents from Tiny Bruno to Cinder Kalifa. The fight is
// a timed brawl in a basement ring: punch with the beat, step
// out of the telegraphed flare, guard to soak, and mind the
// stamina economy. The crowd of fifty-two roars on big shots,
// the corner-man gives advice after every fight, each win pays
// a purse, and clearing the card takes the Coral Belt home.
//
// Public API (what main.js / game.js / hud.js expect):
//   door {x,y}, inside, update(dt, input), tryInteract(p),
//   render(ctx, W, H), exit(), serialize(), restore(data)
// ============================================================

import { PITCH } from '../config.js';
import { clamp } from '../util.js';
import { rand } from '../rng.js';

const DOOR_FEE = 100;
const FIGHT_TIME = 45;

// The card: five names, five paydays. Telegraph is the seconds
// the fighter winds up before the strike lands.
const LADDER = [
  { name: 'TINY BRUNO', color: '#d98a5f', hp: 70, dmg: 9, speed: 66, telegraph: 0.8, purse: 250, bark: 'You punch like my niece. She is six.' },
  { name: 'SISTER DÍAZ', color: '#c46fd9', hp: 95, dmg: 11, speed: 88, telegraph: 0.62, purse: 400, bark: 'The Lord forgives. The round house does not.' },
  { name: 'MARLOWE THE HAMMER', color: '#5fa8d9', hp: 125, dmg: 15, speed: 76, telegraph: 0.55, purse: 650, bark: 'Hammer time was four fights ago. Still waiting.' },
  { name: 'REX "THE VAULT"', color: '#9aa3b8', hp: 150, dmg: 13, speed: 104, telegraph: 0.45, purse: 900, bark: 'Everything bounces off, Rico. Even regret.' },
  { name: 'CINDER KALIFA', color: '#ff5a4a', hp: 185, dmg: 18, speed: 118, telegraph: 0.36, purse: 1500, bark: 'The Cinders hold the east yards. Now they hold you.' },
];

const BELT_BONUS = 5000;
const MONO = 'Consolas, "Courier New", monospace';

// ------------------------------------------------------------
export function createFightClub(game) {
  const door = { x: 19 * PITCH + 62, y: 34 * PITCH + 62 };

  const F = {
    name: 'THE PIT BELOW',
    door,
    inside: false,
    mode: 'idle',        // idle | intro | fight | result
    card: 0,             // opponents defeated
    belt: false,
    wins: 0,
    losses: 0,
    earned: 0,
    best: null,          // fastest win, seconds
  };

  // Fight-local state.
  const s = {
    t: 0,
    timeLeft: FIGHT_TIME,
    beat: 0,
    opponent: null,
    px: -90, pvx: 0,
    ox: 90, ovx: 0,
    php: 100, omax: 100, ohp: 100,
    stamina: 100,
    punchT: 0,
    guard: false,
    dodgeT: 0,
    oTelegraph: -1,     // seconds remaining on the wind-up flare
    oStrikeT: 0,
    oRecover: 0,
    freeze: 0,
    roar: 0,
    sparks: [],
    advice: null,
    resultText: null,
    purse: 0,
  };

  function startFight() {
    const def = LADDER[F.card];
    s.t = 0;
    s.timeLeft = FIGHT_TIME;
    s.beat = 0;
    s.opponent = def;
    s.px = -100; s.pvx = 0;
    s.ox = 110; s.ovx = 0;
    s.php = 100;
    s.omax = def.hp; s.ohp = def.hp;
    s.stamina = 100;
    s.punchT = 0;
    s.guard = false;
    s.dodgeT = 0;
    s.oTelegraph = -1;
    s.oStrikeT = 0;
    s.oRecover = 0;
    s.freeze = 0;
    s.roar = 0.3;
    s.sparks.length = 0;
    s.advice = null;
    s.resultText = null;
    s.purse = 0;
    F.mode = 'intro';
    F.introT = 2.4;
    game.audio.blip(220);
  }

  function enter() {
    F.inside = true;
    game.audio.ensure();
    if (F.card >= LADDER.length) {
      game.toast('You hold the Coral Belt. The Pit bows and keeps the lights low.', '#ffd977');
      F.mode = 'idle';
      return;
    }
    if (game.player.money < DOOR_FEE) {
      game.toast(`The door man wants $${DOOR_FEE}. Come back heavier.`, '#ff7a3c');
      F.inside = false;
      return;
    }
    game.player.money -= DOOR_FEE;
    game.toast(`The Pit takes $${DOOR_FEE} at the door. First bell soon.`, '#ff5a6e');
    startFight();
  }

  function exit() {
    if (!F.inside) return;
    F.inside = false;
    F.mode = 'idle';
    game.audio.blip(300);
  }

  F.exit = exit;

  F.tryInteract = function (p) {
    if (F.inside) return false;
    if (Math.hypot(p.x - door.x, p.y - door.y) > 66) return false;
    if (p.car) { game.toast('The ladder down does not fit a car.', '#ffd977'); return true; }
    enter();
    return true;
  };

  function pinPlayer() {
    const p = game.player;
    p.x = door.x; p.y = door.y + 26;
    p.vx = 0; p.vy = 0;
  }

  // ---------------------------------------------------------------- fight

  function crowdRoar(amount) {
    s.roar = clamp(s.roar + amount, 0, 1.6);
  }

  function spark(x, n, color) {
    for (let k = 0; k < n; k++) {
      s.sparks.push({ x, y: -26 + rand() * 40, vx: (rand() - 0.5) * 260, vy: -rand() * 160, life: 0.4 + rand() * 0.2 });
    }
  }

  function playerPunch() {
    if (s.punchT > 0 || s.stamina < 12) return;
    s.punchT = 0.42;
    s.stamina = Math.max(0, s.stamina - 12);
    // Punching on the beat hits harder: within a twelfth of the pulse.
    const onBeat = Math.abs(((s.beat % 1.2) + 1.2) % 1.2 - 0.0) < 0.12
      || Math.abs(((s.beat % 1.2) + 1.2) % 1.2 - 1.2) < 0.12;
    const dmg = onBeat ? 22 : 12;
    const reach = 52;
    if (Math.abs(s.ox - s.px) < reach) {
      s.ohp -= dmg;
      s.ox += Math.sign(s.ox - s.px) * (onBeat ? 26 : 12);
      s.freeze = onBeat ? 0.12 : 0.05;
      spark((s.px + s.ox) / 2, onBeat ? 6 : 3, '#ffd977');
      crowdRoar(onBeat ? 0.22 : 0.08);
      game.audio.punch();
      if (onBeat) game.audio.tone(520, 0.09, 0.1);
    } else {
      game.audio.punch();
    }
  }

  function opponentAI(dt) {
    const def = s.opponent;
    const dir = Math.sign(s.px - s.ox) || 1;
    const gap = Math.abs(s.px - s.ox);
    // Wind-up → strike → recover, otherwise close the distance.
    if (s.oTelegraph >= 0) {
      s.oTelegraph -= dt;
      s.ovx *= 0.8;
      if (s.oTelegraph <= 0) {
        // The strike lands if the player stood in range and did not step out.
        const dodged = s.dodgeT > 0 || gap > 64;
        if (!dodged) {
          const soak = s.guard ? 0.28 : 1;
          s.php -= def.dmg * soak;
          s.pvx += dir * (s.guard ? 120 : 300);
          s.freeze = 0.09;
          spark(s.px, s.guard ? 2 : 5, s.guard ? '#8ab4ff' : '#ff5a4a');
          crowdRoar(s.guard ? 0.1 : 0.25);
          game.audio.punch();
        } else {
          s.ovx = -dir * 60;
          crowdRoar(0.14);
          game.audio.tone(740, 0.07, 0.07);
        }
        s.oStrikeT = 0.14;
        s.oTelegraph = -1;
        s.oRecover = 0.5 + rand() * 0.4;
      }
      return;
    }
    if (s.oRecover > 0) {
      s.oRecover -= dt;
      s.ovx *= 0.86;
      return;
    }
    // Close in; higher cards feint more.
    const want = 58 - def.speed * 0.08;
    if (gap > want) s.ovx += dir * def.speed * dt * 6;
    else s.ovx *= 0.8;
    if (s.oStrikeT <= 0 && gap < 86 && rand() < dt * (1.6 + F.card * 0.35)) {
      s.oTelegraph = def.telegraph;
      game.audio.tone(180, 0.12, 0.06);
    }
  }

  function endFight(win, reason) {
    F.mode = 'result';
    s.resultGrace = 0.35;   // the punch that ended it must not also confirm the board
    s.resultText = reason;
    if (win) {
      s.purse = s.opponent.purse;
      const fast = FIGHT_TIME - s.timeLeft;
      if (s.best == null || fast < s.best) s.best = fast;
      game.player.money += s.purse;
      F.earned += s.purse;
      F.wins++;
      F.card++;
      game.fx.cash(game.player.x, game.player.y);
      game.audio.blip(880);
      if (F.card >= LADDER.length && !F.belt) {
        F.belt = true;
        game.player.money += BELT_BONUS;
        F.earned += BELT_BONUS;
        s.advice = 'Corners: "That is the whole card. The Coral Belt is yours — wear it loud."';
      } else {
        const next = LADDER[F.card];
        s.advice = next
          ? `Corners: "${next.name} is next — ${next.bark}"`
          : 'Corners: "Whole card, clean work."';
      }
      game.save();
    } else {
      F.losses++;
      game.audio.blip(140);
      s.advice = 'Corners: "Breathe. Guard earlier. Step out of the red flare — the rest is paperwork."';
      game.save();
    }
  }

  // ---------------------------------------------------------------- update

  F.update = function (dt, input) {
    if (!F.inside) {
      if (!game.player.car) {
        const d = Math.hypot(game.player.x - door.x, game.player.y - door.y);
        if (d < 90) {
          game.hud?.setPrompt?.(F.card >= LADDER.length
            ? 'E — THE PIT (champion entrance)'
            : `E — THE PIT (fight card, $${DOOR_FEE} door)`);
        }
      }
      return;
    }
    pinPlayer();

    if (F.mode === 'intro') {
      F.introT -= dt;
      if (F.introT <= 0) F.mode = 'fight';
      return;
    }
    if (F.mode === 'result') {
      s.t += dt;
      if (s.resultGrace > 0) s.resultGrace -= dt;
      if (s.resultGrace <= 0 && (input?.tap('Enter') || input?.tap('Space'))) {
        F.mode = 'idle';
        if (F.card < LADDER.length) startFight();
        else exit();
      }
      return;
    }
    if (F.mode !== 'fight') return;

    // Clocks.
    s.t += dt;
    s.timeLeft -= dt;
    s.beat += dt;
    s.punchT -= dt;
    s.dodgeT -= dt;
    s.oStrikeT -= dt;
    s.roar = Math.max(0.2, s.roar - dt * 0.12);
    s.stamina = clamp(s.stamina + (s.guard ? -14 : 9) * dt, 0, 100);
    if (s.freeze > 0) {
      s.freeze -= dt;
      return;   // hit-stop: the whole ring holds its breath
    }

    // ---- player input
    const ax = (input.held('KeyD') || input.held('ArrowRight') ? 1 : 0) - (input.held('KeyA') || input.held('ArrowLeft') ? 1 : 0);
    s.guard = input.held('KeyS') || input.held('ArrowDown');
    const mv = s.guard ? 40 : 130;
    if (ax !== 0) {
      s.pvx += ax * mv * dt * 8;
      if (s.punchT <= -0.05) s.dodgeT = 0.24;   // a fresh step reads as a dodge
    }
    if (input.tap('Space') || input.tap('KeyE')) playerPunch();

    // ---- physics of two bodies in a ring
    s.pvx *= Math.pow(0.02, dt);
    s.ovx *= Math.pow(0.02, dt);
    s.px += s.pvx * dt;
    s.ox += s.ovx * dt;
    s.px = clamp(s.px, -170, 170);
    s.ox = clamp(s.ox, -170, 170);
    // Bodies do not overlap: push apart.
    const gap = s.ox - s.px;
    if (Math.abs(gap) < 44) {
      const push = (44 - Math.abs(gap)) * 0.5 * Math.sign(gap || 1);
      s.px -= push; s.ox += push;
    }

    opponentAI(dt);

    // Sparks fall and die.
    for (let i = s.sparks.length - 1; i >= 0; i--) {
      const p = s.sparks[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 460 * dt;
      if (p.life <= 0) s.sparks.splice(i, 1);
    }

    // ---- ends
    if (s.ohp <= 0) {
      s.ohp = 0;
      endFight(true, `WIN — ${s.opponent.name} is down.`);
    } else if (s.php <= 0) {
      s.php = 0;
      endFight(false, `DOWN — ${s.opponent.name} stands over you.`);
    } else if (s.timeLeft <= 0) {
      endFight(false, 'THE BELL — the crowd wanted more than a stalemate.');
    }
  };

  // ---------------------------------------------------------------- render

  F.render = function (ctx, W, H) {
    // Basement: black walls, a single cage light over the ring.
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.46;

    // Cage light cone.
    const cone = ctx.createRadialGradient(cx, cy - 210, 20, cx, cy - 210, 420);
    cone.addColorStop(0, 'rgba(255,236,200,0.16)');
    cone.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = cone;
    ctx.fillRect(0, 0, W, H);

    // The ring: mat, ropes, posts.
    ctx.fillStyle = '#26313a';
    ctx.fillRect(cx - 260, cy - 90, 520, 190);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(cx - 260, cy - 90, 520, 12);
    ctx.strokeStyle = '#c9c39a';
    ctx.lineWidth = 3;
    for (const ry of [-70, -18, 40, 88]) {
      ctx.beginPath();
      ctx.moveTo(cx - 268, cy + ry);
      ctx.lineTo(cx + 268, cy + ry);
      ctx.stroke();
    }
    ctx.fillStyle = '#54443a';
    for (const px of [cx - 274, cx + 262]) {
      ctx.fillRect(px, cy - 96, 12, 190);
    }

    // Beat pulse: a ring that breathes on the count.
    const beatPhase = (s.beat % 1.2) / 1.2;
    if (F.mode === 'fight') {
      ctx.strokeStyle = `rgba(255,217,119,${(0.5 * (1 - beatPhase)).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 30 + beatPhase * 46, 0, Math.PI * 2); ctx.stroke();
    }

    // The crowd: 52 heads around the ring, bobbing with the roar.
    const crowdN = 52;
    for (let k = 0; k < crowdN; k++) {
      const a = (k / crowdN) * Math.PI * 2 + 0.35;
      const r = 330 + ((k * 37) % 3) * 26;
      const x = cx + Math.cos(a) * r * 1.25;
      const y = cy + Math.sin(a) * r * 0.44 - 20;
      if (y > H - 60) continue;
      const bob = Math.sin(s.t * (2.4 + s.roar * 5) + k) * (2 + s.roar * 5);
      ctx.fillStyle = k % 5 === 0 ? '#3a4254' : k % 3 === 0 ? '#4a3b50' : '#2e3440';
      ctx.beginPath(); ctx.arc(x, y + bob, 6.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,210,0.12)';
      ctx.fillRect(x - 5, y + bob + 6, 10, 8);
    }

    if (F.mode === 'intro') {
      ctx.textAlign = 'center';
      ctx.font = `bold 42px ${MONO}`;
      ctx.fillStyle = '#ff5a6e';
      ctx.fillText('THE PIT', cx, cy - 140);
      ctx.font = `bold 24px ${MONO}`;
      ctx.fillStyle = '#e8ecf4';
      ctx.fillText(s.opponent ? `FIGHT ${F.card + 1}/5 — ${s.opponent.name}` : '', cx, cy - 100);
      return;
    }

    if (F.mode === 'result') {
      ctx.textAlign = 'center';
      ctx.font = `bold 40px ${MONO}`;
      ctx.fillStyle = s.purse > 0 ? '#7dffa4' : '#ff7a6e';
      ctx.fillText(s.resultText ?? '', cx, cy - 150);
      if (s.purse > 0) {
        ctx.font = `bold 24px ${MONO}`;
        ctx.fillStyle = '#ffd977';
        ctx.fillText(`PURSE $${s.purse}`, cx, cy - 110);
      }
      ctx.font = `15px ${MONO}`;
      ctx.fillStyle = 'rgba(220,225,240,0.85)';
      ctx.fillText(s.advice ?? '', cx, cy + 140);
      ctx.font = `13px ${MONO}`;
      ctx.fillStyle = 'rgba(200,210,230,0.6)';
      ctx.fillText(F.card < LADDER.length ? 'ENTER — next fight' : 'ENTER — climb out', cx, cy + 176);
      drawFighters(ctx, cx, cy, true);
      return;
    }

    if (F.mode === 'fight') drawFight(ctx, cx, cy, W, H);
    if (F.mode === 'idle') {
      ctx.textAlign = 'center';
      ctx.font = `bold 30px ${MONO}`;
      ctx.fillStyle = '#e8ecf4';
      ctx.fillText('THE PIT', cx, cy - 140);
      ctx.font = `15px ${MONO}`;
      ctx.fillStyle = 'rgba(220,225,240,0.8)';
      ctx.fillText(F.belt ? 'You hold the Coral Belt.' : `The card waits. Enter to climb back down.`, cx, cy - 100);
    }

    // Fight HUD: health, stamina, timer, fight card.
    ctx.textAlign = 'left';
    ctx.font = `bold 14px ${MONO}`;
    ctx.fillStyle = '#e8ecf4';
    ctx.fillText('RICO', 40, 44);
    bar(ctx, 40, 52, 240, 14, s.php / 100, '#3dff7a');
    bar(ctx, 40, 70, 240, 8, s.stamina / 100, '#ffd24a');
    if (s.opponent) {
      ctx.textAlign = 'right';
      ctx.fillStyle = s.opponent.color;
      ctx.fillText(s.opponent.name, W - 40, 44);
      bar(ctx, W - 280, 52, 240, 14, s.ohp / s.omax, '#ff5a4a');
    }
    ctx.textAlign = 'center';
    ctx.font = `bold 26px ${MONO}`;
    ctx.fillStyle = s.timeLeft < 10 ? '#ff5a4a' : '#e8ecf4';
    ctx.fillText(`${Math.max(0, Math.ceil(s.timeLeft))}`, cx, 52);
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = 'rgba(200,210,230,0.6)';
    ctx.fillText(`CARD ${Math.min(F.card + 1, LADDER.length)}/5 · punch on the BEAT · step out of the RED · guard with ↓`, cx, H - 24);
  };

  function drawFight(ctx, cx, cy, W, H) {
    // Telegraph flare: the whole ring flashes red on the wind-up.
    if (s.oTelegraph >= 0) {
      const urgency = 1 - s.oTelegraph / Math.max(0.01, s.opponent.telegraph);
      ctx.fillStyle = `rgba(255,60,50,${(0.10 + urgency * 0.16).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = `rgba(255,60,50,${(0.5 + urgency * 0.4).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx + s.ox, cy, 34 - urgency * 10, 0, Math.PI * 2); ctx.stroke();
    }
    drawFighters(ctx, cx, cy, false);
    // Sparks.
    ctx.fillStyle = '#ffd977';
    for (const p of s.sparks) {
      ctx.globalAlpha = clamp(p.life * 2.4, 0, 1);
      ctx.fillRect(p.x, p.y, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  function drawFighters(ctx, cx, cy, frozen) {
    // Rico, fists up.
    drawBoxer(ctx, cx + s.px, cy, '#e8ecf4', s.guard, s.punchT > 0.14, 1);
    // The opponent, wound up while the flare burns.
    const def = s.opponent;
    if (def) {
      const winding = s.oTelegraph >= 0;
      drawBoxer(ctx, cx + s.ox, cy, def.color, false, winding, -1, def.name);
    }
    void frozen;
  }

  function drawBoxer(ctx, x, y, color, guard, punching, face, name) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(0, 52, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    // Legs in a boxer's stance.
    ctx.fillStyle = '#23262e';
    ctx.fillRect(-9, 26, 6, 28);
    ctx.fillRect(4, 30, 6, 24);
    // Torso.
    ctx.fillStyle = color;
    roundRectPath(ctx, -11, -10, 22, 40, 8); ctx.fill();
    // Guarded gloves up high, or the punch extended.
    ctx.fillStyle = '#c0392b';
    const reach = punching ? 34 : guard ? 12 : 16;
    const lift = guard || punching ? -6 : 2;
    ctx.beginPath(); ctx.arc(face * (12 + reach), lift + 4, 6.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(face * 10, -2, 6, 0, Math.PI * 2); ctx.fill();
    // Head.
    ctx.fillStyle = '#d9b091';
    ctx.beginPath(); ctx.arc(0, -18, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#241a10';
    ctx.beginPath(); ctx.arc(0, -20, 7, Math.PI, 0); ctx.fill();
    if (name) {
      ctx.fillStyle = 'rgba(220,225,240,0.65)';
      ctx.font = `bold 11px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(name, 0, -34);
    }
    ctx.restore();
  }

  function bar(ctx, x, y, w, h, f, color) {
    ctx.fillStyle = 'rgba(8,10,16,0.8)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * clamp(f, 0, 1)), h - 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // ---------------------------------------------------------------- save

  F.serialize = function () {
    return { card: F.card, belt: F.belt, wins: F.wins, losses: F.losses, earned: Math.round(F.earned), best: s.best };
  };

  F.restore = function (d) {
    if (!d) return;
    F.card = clamp(Math.floor(d.card) || 0, 0, LADDER.length);
    F.belt = !!d.belt;
    F.wins = Math.max(0, Math.floor(d.wins) || 0);
    F.losses = Math.max(0, Math.floor(d.losses) || 0);
    F.earned = Math.max(0, Math.floor(d.earned) || 0);
    s.best = typeof d.best === 'number' ? d.best : null;
  };

  return F;
}
