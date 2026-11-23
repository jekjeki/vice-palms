// ============================================================
// THE GILDED CONCH — the casino on the city's east side.
//
// Three games with real math behind a door marker on the street:
//   * blackjack — a six-deck shoe (reshuffled at 60), dealer
//     stands on all 17s, double down, naturals pay 3:2
//   * roulette — the European single-zero wheel in its true
//     order; straight-up pays 35:1, the outside rail pays even
//     or 2:1 on the dozens/columns
//   * slots — three weighted reels with a posted paytable
// A chip cage converts cash to chips and back, table limits are
// posted, the dealer talks, and the chips you leave with ride
// the save.
//
// Public API (what main.js / game.js / hud.js expect):
//   door {x,y}, inside, update(dt, input), tryInteract(p),
//   render(ctx, W, H), exit(), serialize(), restore(data)
// ============================================================

import { PITCH } from '../config.js';
import { clamp, TAU } from '../util.js';
import { randInt } from '../rng.js';

// European wheel order (single zero).
const WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const TABLE_MIN = 25;
const TABLE_MAX = 2000;

// Weighted slot strips: cherries crowd the reels, crowns are rare.
const REEL = ['🍒', '🍋', '🔔', '🍋', '🍒', '⭐', '🔔', '🍒', '🍋', '💎', '🔔', '⭐', '🍒', '👑', '🍋', '🔔'];
const SLOT_BET = 25;
const SLOT_PAY = { '👑': 40, '💎': 20, '⭐': 10, '🔔': 6, '🍋': 3, '🍒': 2 };

const DEALER_LINES = [
  'The Conch is open all night, friend. House money is patient money.',
  'Table limit is two thousand. The pit boss watches the movers.',
  'Blackjack pays three to two. Dealer stands on every seventeen.',
  'Single zero on the wheel. The European way — kinder odds.',
  'Chips in, chips out. The cage never sleeps.',
  'Luck is a tide. It always comes back to the water.',
  'You win big, you tip big. The dealers remember.',
];

const MONO = 'Consolas, "Courier New", monospace';

// ------------------------------------------------------------
export function createCasino(game) {
  const door = { x: 35 * PITCH + 62, y: 9 * PITCH - 62 };

  const C = {
    name: 'THE GILDED CONCH',
    door,
    inside: false,
    chips: 0,
    page: 'floor',          // floor | bj | rl | slots | cage
    cursor: 0,
    lines: [],
    handsWon: 0,
    biggestWin: 0,
    spins: 0,
    dealerLine: DEALER_LINES[0],
    dealerT: 0,
  };

  // ---------------------------------------------------------------- blackjack
  const bj = {
    shoe: [],
    player: [],
    dealer: [],
    bet: 0,
    phase: 'idle',        // idle | player | dealer | done
    message: 'Place your bet — ENTER to deal.',
    result: null,
    doubled: false,
  };

  function reshuffle() {
    bj.shoe = [];
    for (let d = 0; d < 6; d++) {
      for (let s = 0; s < 4; s++) {
        for (let r = 1; r <= 13; r++) bj.shoe.push({ r, s });
      }
    }
    // One pass of Fisher-Yates with the house's own dice.
    for (let i = bj.shoe.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const t = bj.shoe[i]; bj.shoe[i] = bj.shoe[j]; bj.shoe[j] = t;
    }
  }
  reshuffle();

  function cardLabel(c) {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = ['♠', '♥', '♦', '♣'];
    return `${ranks[c.r - 1]}${suits[c.s]}`;
  }
  function cardValue(c) { return c.r > 10 ? 10 : c.r === 1 ? 11 : c.r; }
  function handTotal(cards) {
    let total = 0, aces = 0;
    for (const c of cards) { total += cardValue(c); if (c.r === 1) aces++; }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }
  function draw() {
    if (bj.shoe.length < 60) reshuffle();
    return bj.shoe.pop();
  }

  function bjDeal() {
    const stake = clamp(bj.wager ?? TABLE_MIN, TABLE_MIN, Math.min(TABLE_MAX, C.chips));
    if (stake > C.chips) { bj.message = 'Not enough chips at this table.'; return; }
    C.chips -= stake;
    bj.bet = stake;
    bj.doubled = false;
    bj.player = [draw(), draw()];
    bj.dealer = [draw(), draw()];
    bj.phase = 'player';
    bj.result = null;
    if (handTotal(bj.player) === 21) {
      bj.phase = 'dealer';
      bj.message = 'Natural!';
      settle();
    } else {
      bj.message = 'HIT ↑ · STAND ↓ · DOUBLE →';
    }
  }

  function bjHit() {
    bj.player.push(draw());
    const t = handTotal(bj.player);
    if (t > 21) { bj.message = `Bust at ${t}.`; bj.phase = 'done'; bj.result = 'lose'; }
    else if (t === 21) bjStand();
    else bj.message = 'HIT ↑ · STAND ↓ · DOUBLE →';
  }

  function bjDouble() {
    if (bj.player.length !== 2 || bj.doubled) return false;
    if (C.chips < bj.bet) { bj.message = 'No chips behind the double.'; return true; }
    C.chips -= bj.bet;
    bj.bet *= 2;
    bj.doubled = true;
    bjHit();
    if (bj.phase === 'player') bjStand();
    return true;
  }

  function bjStand() {
    bj.phase = 'dealer';
    while (handTotal(bj.dealer) < 17) bj.dealer.push(draw());
    settle();
  }

  function settle() {
    const p = handTotal(bj.player);
    const d = handTotal(bj.dealer);
    const pBJ = bj.player.length === 2 && p === 21;
    const dBJ = bj.dealer.length === 2 && d === 21;
    let payout = 0;
    if (p > 21) { bj.result = 'lose'; bj.message = `Bust at ${p}. House takes it.`; }
    else if (pBJ && !dBJ) { payout = Math.round(bj.bet * 2.5); bj.result = 'bj'; bj.message = `Blackjack! Pays 3:2 — ${payout} chips.`; }
    else if (dBJ && !pBJ) { bj.result = 'lose'; bj.message = 'Dealer blackjack. Cold night.'; }
    else if (dBJ && pBJ) { payout = bj.bet; bj.result = 'push'; bj.message = 'Two naturals. Push — bet returned.'; }
    else if (d > 21) { payout = bj.bet * 2; bj.result = 'win'; bj.message = `Dealer busts at ${d}. ${payout} chips.`; }
    else if (p > d) { payout = bj.bet * 2; bj.result = 'win'; bj.message = `${p} beats ${d}. ${payout} chips.`; }
    else if (p < d) { bj.result = 'lose'; bj.message = `${d} beats ${p}. House takes it.`; }
    else { payout = bj.bet; bj.result = 'push'; bj.message = `Push at ${p}. Bet returned.`; }
    if (payout > 0) {
      C.chips += payout;
      const won = payout - bj.bet;
      if (won > 0) {
        C.handsWon++;
        C.biggestWin = Math.max(C.biggestWin, won);
        game.fx.cash(game.player.x, game.player.y);
        game.audio.blip(880);
      }
    } else {
      game.audio.blip(160);
    }
    game.save();
    bj.phase = 'done';
    bj.wager = clamp(bj.bet, TABLE_MIN, TABLE_MAX);
  }

  // ---------------------------------------------------------------- roulette
  const rl = {
    bets: {},             // key -> chips
    spinT: 0,
    spinning: false,
    angle: 0,
    ballAngle: 0,
    lastNumber: null,
    history: [],
    straight: 17,
    message: 'LEFT/RIGHT pick a spot · ENTER stacks 25 · SPIN when ready.',
  };

  const RL_SPOTS = [
    { key: 'straight', label: () => `STRAIGHT ${rl.straight}`, pays: '35:1' },
    { key: 'red', label: () => 'RED', pays: '1:1' },
    { key: 'black', label: () => 'BLACK', pays: '1:1' },
    { key: 'odd', label: () => 'ODD', pays: '1:1' },
    { key: 'even', label: () => 'EVEN', pays: '1:1' },
    { key: 'low', label: () => 'LOW 1–18', pays: '1:1' },
    { key: 'high', label: () => 'HIGH 19–36', pays: '1:1' },
    { key: 'dozen1', label: () => '1st 12', pays: '2:1' },
    { key: 'dozen2', label: () => '2nd 12', pays: '2:1' },
    { key: 'dozen3', label: () => '3rd 12', pays: '2:1' },
    { key: 'spin', label: () => 'SPIN THE WHEEL', pays: '' },
  ];

  function rlBetTotal() {
    let sum = 0;
    for (const k in rl.bets) sum += rl.bets[k];
    return sum;
  }

  function rlAdd(cursor) {
    const spot = RL_SPOTS[cursor];
    if (spot.key === 'spin') { rlSpin(); return; }
    if (C.chips < TABLE_MIN) { rl.message = 'No chips to bet.'; return; }
    if (rlBetTotal() + TABLE_MIN > TABLE_MAX) { rl.message = 'Table limit reached.'; return; }
    C.chips -= TABLE_MIN;
    rl.bets[spot.key] = (rl.bets[spot.key] ?? 0) + TABLE_MIN;
    game.audio.blip(520);
  }

  function rlSpin() {
    const total = rlBetTotal();
    if (total <= 0) { rl.message = 'Put chips on the felt first.'; return; }
    rl.spinning = true;
    rl.spinT = 2.2;
    rl.lastNumber = null;
    rl.message = 'No more bets.';
    game.audio.blip(300);
  }

  function rlSettle() {
    const n = WHEEL[randInt(WHEEL.length)];
    rl.lastNumber = n;
    rl.history.unshift(n);
    if (rl.history.length > 12) rl.history.pop();
    let payout = 0;
    const pay = (k, mult) => { payout += (rl.bets[k] ?? 0) * (1 + mult); };
    if (n !== 0) {
      const color = REDS.has(n) ? 'red' : 'black';
      if (n === rl.straight) pay('straight', 35);
      if (rl.bets.red && color === 'red') pay('red', 1);
      if (rl.bets.black && color === 'black') pay('black', 1);
      if (rl.bets.odd && n % 2 === 1) pay('odd', 1);
      if (rl.bets.even && n % 2 === 0) pay('even', 1);
      if (rl.bets.low && n <= 18) pay('low', 1);
      if (rl.bets.high && n >= 19) pay('high', 1);
      if (rl.bets.dozen1 && n <= 12) pay('dozen1', 2);
      if (rl.bets.dozen2 && n > 12 && n <= 24) pay('dozen2', 2);
      if (rl.bets.dozen3 && n > 24) pay('dozen3', 2);
    }
    const staked = rlBetTotal();
    C.chips += payout;
    const net = payout - staked;
    if (net > 0) {
      C.handsWon++;
      C.biggestWin = Math.max(C.biggestWin, net);
      game.fx.cash(game.player.x, game.player.y);
      game.audio.blip(880);
      rl.message = `${n} ${n === 0 ? '— house zero' : REDS.has(n) ? 'RED' : 'BLACK'} — you take ${payout} chips.`;
    } else {
      game.audio.blip(150);
      rl.message = `${n} ${n === 0 ? '— house zero' : REDS.has(n) ? 'RED' : 'BLACK'} — the felt keeps ${staked}.`;
    }
    rl.bets = {};
    game.save();
  }

  // ---------------------------------------------------------------- slots
  const sl = {
    reels: [0, 0, 0],
    spinT: 0,
    spinning: false,
    stopped: [true, true, true],
    lastPay: 0,
    message: 'ENTER pulls the lever. 25 a pull.',
  };

  function slotsSpin() {
    if (C.chips < SLOT_BET) { sl.message = 'The machine wants 25 chips.'; return; }
    C.chips -= SLOT_BET;
    C.spins++;
    sl.spinning = true;
    sl.spinT = 1.4;
    sl.stopped = [false, false, false];
    for (let i = 0; i < 3; i++) sl.reels[i] = randInt(REEL.length);
    sl.message = '...';
    game.audio.blip(240);
  }

  function slotsSettle() {
    const s = sl.reels.map((i) => REEL[i]);
    let mult = 0;
    if (s[0] === s[1] && s[1] === s[2]) mult = SLOT_PAY[s[0]] ?? 2;
    else if (s[0] === s[1] || s[1] === s[2]) mult = 1;
    else if (s.includes('🍒') && s.filter((x) => x === '🍒').length >= 2) mult = 1;
    const payout = SLOT_BET * mult;
    sl.lastPay = payout;
    if (payout > 0) {
      C.chips += payout;
      C.handsWon++;
      C.biggestWin = Math.max(C.biggestWin, payout - SLOT_BET);
      game.fx.cash(game.player.x, game.player.y);
      game.audio.blip(920);
      sl.message = `${s.join(' ')} — pays ${payout}!`;
    } else {
      game.audio.blip(140);
      sl.message = `${s.join(' ')} — the reels keep it.`;
    }
    game.save();
  }

  // ---------------------------------------------------------------- flow

  function enter() {
    C.inside = true;
    C.page = 'floor';
    C.cursor = 0;
    C.dealerT = 0;
    C.graceT = 0.25;      // the E that opened the door must not also press a button
    game.audio.ensure();
    game.audio.blip(660);
    game.toast('THE GILDED CONCH — chips at the cage, tables to the left.', '#a86bff');
  }

  function exit() {
    if (!C.inside) return;
    C.inside = false;
    game.audio.blip(330);
    if (C.chips > 0) game.toast(`You walk out with ${C.chips} chips. Cash them at the cage.`, '#a86bff');
  }

  C.exit = exit;

  C.tryInteract = function (p) {
    if (C.inside) return false;
    if (Math.hypot(p.x - door.x, p.y - door.y) > 66) return false;
    if (p.car) { game.toast('Step out of the car first — the Conch has a dress code.', '#ffd977'); return true; }
    enter();
    return true;
  };

  function pinPlayer() {
    const p = game.player;
    p.x = door.x; p.y = door.y + 26;
    p.vx = 0; p.vy = 0;
  }

  // ---------------------------------------------------------------- update

  C.update = function (dt, input) {
    if (!C.inside) {
      // Door prompt while walking past.
      if (!game.player.car) {
        const d = Math.hypot(game.player.x - door.x, game.player.y - door.y);
        if (d < 90) game.hud?.setPrompt?.('E — THE GILDED CONCH (casino)');
      }
      return;
    }
    pinPlayer();
    C.dealerT += dt;
    C.graceT = Math.max(0, (C.graceT ?? 0) - dt);
    if (C.dealerT > 9) {
      C.dealerT = 0;
      C.dealerLine = DEALER_LINES[randInt(DEALER_LINES.length)];
    }

    // Roulette and slots animation clocks run on real time.
    if (rl.spinning) {
      rl.spinT -= dt;
      rl.angle += dt * 9;
      rl.ballAngle -= dt * 13;
      if (rl.spinT <= 0) { rl.spinning = false; rlSettle(); }
    }
    if (sl.spinning) {
      sl.spinT -= dt;
      for (let i = 0; i < 3; i++) {
        if (sl.spinT < 1.4 - i * 0.4 && !sl.stopped[i]) sl.stopped[i] = true;
      }
      if (sl.spinT <= 0) { sl.spinning = false; slotsSettle(); }
    }

    // ---- input (taps only; the pocket world holds still while inside)
    if (!input) return;
    if (C.graceT > 0) return;
    if (input.tap('KeyQ')) {
      if (C.page === 'floor') exit();
      else { C.page = 'floor'; C.cursor = 0; }
      return;
    }
    if (C.page === 'floor') {
      const items = floorItems();
      if (input.tap('ArrowUp') || input.tap('KeyW')) C.cursor = (C.cursor - 1 + items.length) % items.length;
      if (input.tap('ArrowDown') || input.tap('KeyS')) C.cursor = (C.cursor + 1) % items.length;
      if (input.tap('Enter') || input.tap('Space') || input.tap('KeyE')) {
        const it = items[C.cursor];
        if (it.action) it.action();
      }
      return;
    }
    if (C.page === 'bj') {
      if (bj.phase === 'idle' || bj.phase === 'done') {
        if (input.tap('Enter') || input.tap('Space')) bjDeal();
        if (input.tap('ArrowUp')) bj.wager = clamp((bj.wager ?? TABLE_MIN) + 25, TABLE_MIN, Math.min(TABLE_MAX, C.chips));
        if (input.tap('ArrowDown')) bj.wager = clamp((bj.wager ?? TABLE_MIN) - 25, TABLE_MIN, Math.min(TABLE_MAX, C.chips));
      } else if (bj.phase === 'player') {
        if (input.tap('ArrowUp') || input.tap('KeyW')) bjHit();
        if (input.tap('ArrowDown') || input.tap('KeyS')) bjStand();
        if (input.tap('ArrowRight') || input.tap('KeyD')) bjDouble();
      }
      return;
    }
    if (C.page === 'rl') {
      if (input.tap('ArrowLeft') || input.tap('KeyA')) C.cursor = (C.cursor - 1 + RL_SPOTS.length) % RL_SPOTS.length;
      if (input.tap('ArrowRight') || input.tap('KeyD')) C.cursor = (C.cursor + 1) % RL_SPOTS.length;
      if (!rl.spinning) {
        if (input.tap('ArrowUp')) rl.straight = (rl.straight % 36) + 1;
        if (input.tap('ArrowDown')) rl.straight = ((rl.straight + 34) % 36) + 1;
        if (input.tap('Enter') || input.tap('Space')) rlAdd(C.cursor);
        if (input.tap('KeyC')) {
          C.chips += rlBetTotal();
          rl.bets = {};
          rl.message = 'Bets cleared.';
        }
      }
      return;
    }
    if (C.page === 'slots') {
      if (!sl.spinning && (input.tap('Enter') || input.tap('Space'))) slotsSpin();
      return;
    }
    if (C.page === 'cage') {
      if (input.tap('Enter') || input.tap('Space')) {
        if (C.cursor === 0) {
          const amount = Math.min(1000, game.player.money);
          if (amount < 100) { cageMessage = 'The cage wants at least $100.'; return; }
          const buy = Math.min(1000, Math.floor(amount / 100) * 100);
          game.player.money -= buy;
          C.chips += buy;
          cageMessage = `${buy} chips. Good luck in there.`;
          game.audio.blip(700);
        } else {
          if (C.chips <= 0) { cageMessage = 'Nothing to cash.'; return; }
          game.player.money += C.chips;
          cageMessage = `${C.chips} chips cashed. Come back soon.`;
          C.chips = 0;
          game.audio.blip(700);
          game.save();
        }
      }
      if (input.tap('ArrowUp') || input.tap('ArrowDown')) C.cursor = C.cursor === 0 ? 1 : 0;
      return;
    }
  };

  let cageMessage = 'The cashier nods. Buy in, or cash out.';

  function floorItems() {
    return [
      { label: `BLACKJACK — table limit $${TABLE_MAX}`, sub: `Wager ${bj.wager ?? TABLE_MIN} · shoe ${bj.shoe.length} cards`, action: () => { C.page = 'bj'; C.cursor = 0; } },
      { label: 'ROULETTE — single zero', sub: 'Straight 35:1 · outside rail even', action: () => { C.page = 'rl'; C.cursor = 0; } },
      { label: `SLOTS — ${SLOT_BET} a pull`, sub: 'Crowns pay 40×, follow the lights', action: () => { C.page = 'slots'; } },
      { label: 'CHIP CAGE', sub: `You hold ${C.chips} chips`, action: () => { C.page = 'cage'; C.cursor = 0; } },
      { label: 'LEAVE THE FLOOR', sub: 'Back to the street', action: () => exit() },
    ];
  }

  // ---------------------------------------------------------------- render

  C.render = function (ctx, W, H) {
    // Carpet: deep red with a repeating diamond.
    ctx.fillStyle = '#3a1220';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,214,150,0.06)';
    ctx.lineWidth = 2;
    const step = 56;
    for (let y = -step; y < H + step; y += step) {
      for (let x = -step; x < W + step; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, y + step / 2);
        ctx.lineTo(x + step / 2, y);
        ctx.lineTo(x + step, y + step / 2);
        ctx.lineTo(x + step / 2, y + step);
        ctx.closePath();
        ctx.stroke();
      }
    }
    // Chandelier wash at the top of the room.
    const wash = ctx.createRadialGradient(W / 2, -80, 40, W / 2, -80, H * 0.9);
    wash.addColorStop(0, 'rgba(255,220,150,0.22)');
    wash.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);

    // Header.
    ctx.textAlign = 'center';
    ctx.font = `bold 34px ${MONO}`;
    ctx.fillStyle = '#ffd977';
    ctx.fillText('THE GILDED CONCH', W / 2, 52);
    ctx.font = `13px ${MONO}`;
    ctx.fillStyle = '#c9a54e';
    ctx.fillText('est. 1971 · members and lucky strangers welcome', W / 2, 74);

    // The page itself.
    if (C.page === 'floor') renderFloor(ctx, W, H);
    else if (C.page === 'bj') renderBlackjack(ctx, W, H);
    else if (C.page === 'rl') renderRoulette(ctx, W, H);
    else if (C.page === 'slots') renderSlots(ctx, W, H);
    else if (C.page === 'cage') renderCage(ctx, W, H);

    // Dealer patter line along the bottom.
    ctx.font = `13px ${MONO}`;
    ctx.fillStyle = 'rgba(200,210,230,0.6)';
    ctx.fillText(`DEALER: “${C.dealerLine}”`, W / 2, H - 44);
    // Chips readout + quit hint.
    ctx.textAlign = 'left';
    ctx.font = `bold 17px ${MONO}`;
    ctx.fillStyle = '#7dffa4';
    ctx.fillText(`CHIPS ${C.chips}`, 28, H - 20);
    ctx.textAlign = 'right';
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = 'rgba(200,210,230,0.55)';
    ctx.fillText('Q back · ESC pauses', W - 28, H - 20);
  };

  function renderFloor(ctx, W, H) {
    const items = floorItems();
    // Room stage: three tables and the cage drawn as scenery.
    const cx = W / 2, cy = H * 0.42;
    // Blackjack table.
    ctx.fillStyle = '#1d5c38';
    ctx.beginPath(); ctx.ellipse(cx - 240, cy, 120, 66, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,150,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#c9a54e';
    ctx.font = `bold 15px ${MONO}`;
    ctx.fillText('BLACKJACK', cx - 240, cy + 4);
    // Roulette wheel.
    const wr = 70;
    ctx.fillStyle = '#2b1a3e';
    ctx.beginPath(); ctx.arc(cx + 200, cy, wr + 16, 0, TAU); ctx.fill();
    for (let k = 0; k < WHEEL.length; k++) {
      const a = (k / WHEEL.length) * TAU + rl.angle;
      ctx.fillStyle = WHEEL[k] === 0 ? '#1d5c38' : REDS.has(WHEEL[k]) ? '#a02a2a' : '#181820';
      ctx.beginPath();
      ctx.moveTo(cx + 200 + Math.cos(a) * (wr - 26), cy + Math.sin(a) * (wr - 26));
      ctx.lineTo(cx + 200 + Math.cos(a + TAU / WHEEL.length) * (wr - 26), cy + Math.sin(a + TAU / WHEEL.length) * (wr - 26));
      ctx.lineTo(cx + 200 + Math.cos(a + TAU / WHEEL.length) * wr, cy + Math.sin(a + TAU / WHEEL.length) * wr);
      ctx.lineTo(cx + 200 + Math.cos(a) * wr, cy + Math.sin(a) * wr);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#c9a54e';
    ctx.fillText('ROULETTE', cx + 200, cy + wr + 34);
    // Slots cabinet.
    ctx.fillStyle = '#20242c';
    roundRectPath(ctx, cx + 420, cy - 70, 96, 130, 10); ctx.fill();
    ctx.fillStyle = '#0d0f16';
    roundRectPath(ctx, cx + 432, cy - 56, 72, 56, 6); ctx.fill();
    ctx.fillStyle = '#7dffa4';
    ctx.font = `bold 22px ${MONO}`;
    ctx.fillText('7 7 7', cx + 468, cy - 20);
    ctx.fillStyle = '#c9a54e';
    ctx.font = `bold 13px ${MONO}`;
    ctx.fillText('SLOTS', cx + 468, cy + 80);
    // Menu rows.
    ctx.font = `bold 20px ${MONO}`;
    items.forEach((it, i) => {
      const y = H * 0.68 + i * 40;
      const on = i === C.cursor;
      ctx.textAlign = 'left';
      ctx.fillStyle = on ? '#ffd977' : 'rgba(220,225,240,0.6)';
      ctx.fillText((on ? '▸ ' : '  ') + it.label, W / 2 - 250, y);
      ctx.font = `12px ${MONO}`;
      ctx.fillStyle = 'rgba(180,190,210,0.5)';
      ctx.fillText(it.sub, W / 2 - 250 + 20, y + 17);
      ctx.font = `bold 20px ${MONO}`;
    });
  }

  function renderBlackjack(ctx, W, H) {
    const cx = W / 2;
    // Table.
    ctx.fillStyle = '#1d5c38';
    ctx.beginPath(); ctx.ellipse(cx, H * 0.4, 300, 150, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,214,150,0.55)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, H * 0.4 + 40, 210, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.fillStyle = 'rgba(232,228,204,0.55)';
    ctx.font = `bold 15px ${MONO}`;
    ctx.fillText('BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON 17', cx, H * 0.4 - 70);

    // Dealer hand up top, player hand below.
    ctx.textAlign = 'center';
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = 'rgba(200,210,230,0.6)';
    ctx.fillText('DEALER', cx, H * 0.19);
    drawHand(ctx, bj.dealer, cx, H * 0.25, bj.phase === 'player');
    ctx.fillStyle = 'rgba(200,210,230,0.6)';
    ctx.fillText(`YOU — ${handTotal(bj.player) || ''}`, cx, H * 0.5);
    drawHand(ctx, bj.player, cx, H * 0.56);

    // Bet and message.
    ctx.font = `bold 18px ${MONO}`;
    ctx.fillStyle = '#ffd977';
    ctx.fillText(`BET ${bj.bet || (bj.wager ?? TABLE_MIN)} · SHOE ${bj.shoe.length}`, cx, H * 0.7);
    ctx.font = `15px ${MONO}`;
    ctx.fillStyle = bj.result === 'lose' ? '#ff7a6e' : '#7dffa4';
    ctx.fillText(bj.message, cx, H * 0.75);
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = 'rgba(200,210,230,0.55)';
    ctx.fillText(bj.phase === 'player' ? '↑ HIT · ↓ STAND · → DOUBLE' : 'ENTER deals · ↑↓ wager', cx, H * 0.79);
  }

  function drawHand(ctx, cards, cx, y, hideHole) {
    const cw = 46, ch = 62;
    cards.forEach((c, i) => {
      const x = cx - ((cards.length - 1) * cw) / 2 + i * cw;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((i - (cards.length - 1) / 2) * 0.05);
      ctx.fillStyle = '#f2f2ea';
      roundRectPath(ctx, -cw / 2, -ch / 2, cw, ch, 6);
      ctx.fill();
      if (hideHole && i === 1) {
        ctx.fillStyle = '#7a1d2e';
        roundRectPath(ctx, -cw / 2 + 3, -ch / 2 + 3, cw - 6, ch - 6, 5);
        ctx.fill();
      } else {
        const red = c.s === 1 || c.s === 2;
        ctx.fillStyle = red ? '#b02a2a' : '#20242c';
        ctx.font = `bold 15px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText(cardLabel(c), 0, 5);
      }
      ctx.restore();
    });
  }

  function renderRoulette(ctx, W, H) {
    const cx = W / 2, cy = H * 0.34, wr = Math.min(W, H) * 0.19;
    // Wheel.
    ctx.fillStyle = '#2b1a3e';
    ctx.beginPath(); ctx.arc(cx, cy, wr + 22, 0, TAU); ctx.fill();
    for (let k = 0; k < WHEEL.length; k++) {
      const a = (k / WHEEL.length) * TAU + rl.angle;
      const n = WHEEL[k];
      ctx.fillStyle = n === 0 ? '#1d5c38' : REDS.has(n) ? '#a02a2a' : '#181820';
      const a1 = a, a2 = a + TAU / WHEEL.length;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a1) * (wr - 34), cy + Math.sin(a1) * (wr - 34));
      ctx.lineTo(cx + Math.cos(a2) * (wr - 34), cy + Math.sin(a2) * (wr - 34));
      ctx.lineTo(cx + Math.cos(a2) * wr, cy + Math.sin(a2) * wr);
      ctx.lineTo(cx + Math.cos(a1) * wr, cy + Math.sin(a1) * wr);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8e4d4';
      ctx.font = `bold 11px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(n), cx + Math.cos(a1 + TAU / WHEEL.length / 2) * (wr - 22), cy + Math.sin(a1 + TAU / WHEEL.length / 2) * (wr - 22) + 4);
    }
    // Ball.
    const br = rl.spinning ? wr - 14 : wr - 22;
    const ba = rl.spinning ? rl.ballAngle : (rl.lastNumber != null ? WHEEL.indexOf(rl.lastNumber) * TAU / WHEEL.length + rl.angle : 0);
    ctx.fillStyle = '#f2f2ea';
    ctx.beginPath(); ctx.arc(cx + Math.cos(ba) * br, cy + Math.sin(ba) * br, 5, 0, TAU); ctx.fill();
    // Result readout.
    ctx.font = `bold 22px ${MONO}`;
    ctx.fillStyle = '#ffd977';
    ctx.fillText(rl.spinning ? 'NO MORE BETS' : rl.lastNumber != null ? `LAST: ${rl.lastNumber}` : 'PLACE YOUR BETS', cx, cy + wr + 52);
    // Betting rail.
    ctx.font = `bold 17px ${MONO}`;
    RL_SPOTS.forEach((spot, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = W / 2 - 240 + col * 130;
      const y = H * 0.62 + row * 44;
      const on = i === C.cursor;
      const chips = rl.bets[spot.key] ?? 0;
      ctx.textAlign = 'left';
      ctx.fillStyle = on ? '#ffd977' : 'rgba(220,225,240,0.6)';
      ctx.fillText((on ? '▸ ' : '  ') + spot.label(), x, y);
      ctx.font = `11px ${MONO}`;
      ctx.fillStyle = chips > 0 ? '#7dffa4' : 'rgba(180,190,210,0.45)';
      ctx.fillText(chips > 0 ? `${chips} on the felt` : spot.pays, x + 16, y + 15);
      ctx.font = `bold 17px ${MONO}`;
    });
    ctx.textAlign = 'center';
    ctx.font = `13px ${MONO}`;
    ctx.fillStyle = 'rgba(200,210,230,0.6)';
    ctx.fillText(rl.message, cx, H - 78);
  }

  function renderSlots(ctx, W, H) {
    const cx = W / 2, cy = H * 0.36;
    // Cabinet.
    ctx.fillStyle = '#20242c';
    roundRectPath(ctx, cx - 210, cy - 130, 420, 300, 16); ctx.fill();
    ctx.strokeStyle = '#c9a54e';
    ctx.lineWidth = 3;
    roundRectPath(ctx, cx - 210, cy - 130, 420, 300, 16); ctx.stroke();
    // Three windows.
    for (let i = 0; i < 3; i++) {
      const wx = cx - 140 + i * 120;
      ctx.fillStyle = '#0d0f16';
      roundRectPath(ctx, wx - 46, cy - 70, 92, 110, 8); ctx.fill();
      const spinBlur = sl.spinning && !sl.stopped[i];
      const sym = REEL[sl.reels[i]];
      ctx.font = `${spinBlur ? '46' : '52'}px ${MONO}`;
      ctx.textAlign = 'center';
      if (spinBlur) {
        ctx.fillStyle = 'rgba(200,210,230,0.35)';
        ctx.fillText(REEL[(sl.reels[i] + 1) % REEL.length], wx, cy + 26);
        ctx.fillText(REEL[(sl.reels[i] + REEL.length - 1) % REEL.length], wx, cy - 26);
      }
      ctx.fillStyle = '#f2f2ea';
      ctx.fillText(sym, wx, cy + 18);
    }
    // Lever hint + paytable.
    ctx.font = `bold 18px ${MONO}`;
    ctx.fillStyle = '#ffd977';
    ctx.fillText(sl.message, cx, cy + 210);
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = 'rgba(200,210,230,0.55)';
    ctx.fillText(`PAYTABLE — 👑 40× · 💎 20× · ⭐ 10× · 🔔 6× · 🍋 3× · 🍒 pair 2×, any two 1×`, cx, cy + 236);
    ctx.fillText(`${SLOT_BET} a pull · last pay ${sl.lastPay}`, cx, cy + 256);
  }

  function renderCage(ctx, W, H) {
    const cx = W / 2, cy = H * 0.4;
    // Counter.
    ctx.fillStyle = '#3a3126';
    ctx.fillRect(cx - 260, cy + 40, 520, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(cx - 260, cy + 40, 520, 6);
    // Cashier silhouette.
    ctx.fillStyle = '#2b2e35';
    ctx.beginPath(); ctx.arc(cx, cy - 10, 26, 0, TAU); ctx.fill();
    ctx.fillRect(cx - 30, cy + 6, 60, 40);
    ctx.fillStyle = '#7dffa4';
    ctx.font = `bold 22px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(cageMessage, cx, cy - 70);
    // Options.
    const opts = [
      { label: 'BUY IN — $100 of cash → 100 chips', sub: `you carry $${game.player.money.toLocaleString()}` },
      { label: 'CASH OUT — all chips → cash', sub: `you hold ${C.chips} chips` },
    ];
    ctx.font = `bold 20px ${MONO}`;
    opts.forEach((o, i) => {
      const y = cy + 130 + i * 52;
      const on = i === C.cursor;
      ctx.fillStyle = on ? '#ffd977' : 'rgba(220,225,240,0.6)';
      ctx.fillText((on ? '▸ ' : '  ') + o.label, cx, y);
      ctx.font = `12px ${MONO}`;
      ctx.fillStyle = 'rgba(180,190,210,0.5)';
      ctx.fillText(o.sub, cx, y + 18);
      ctx.font = `bold 20px ${MONO}`;
    });
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = 'rgba(200,210,230,0.55)';
    ctx.fillText('ENTER · ↑↓ pick', cx, cy + 250);
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

  C.serialize = function () {
    return {
      chips: C.chips,
      handsWon: C.handsWon,
      biggestWin: C.biggestWin,
      spins: C.spins,
      wager: bj.wager ?? TABLE_MIN,
    };
  };

  C.restore = function (d) {
    if (!d) return;
    C.chips = Math.max(0, Math.floor(d.chips) || 0);
    C.handsWon = Math.max(0, Math.floor(d.handsWon) || 0);
    C.biggestWin = Math.max(0, Math.floor(d.biggestWin) || 0);
    C.spins = Math.max(0, Math.floor(d.spins) || 0);
    bj.wager = clamp(d.wager ?? TABLE_MIN, TABLE_MIN, TABLE_MAX);
  };

  return C;
}
