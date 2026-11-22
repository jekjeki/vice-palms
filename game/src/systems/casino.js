// THE GILDED CONCH — Vice Palms' casino, three tables deep. Blackjack with a six-deck
// shoe and real dealer rules, a single-zero roulette wheel with a full outside board,
// and a three-reel slot row. Chips buy in from Rico's pocket and cash back out; the
// house keeps the limits posted and the dealer keeps the patter going.
//
// The room renders in screen space from main.js (like the interiors); while you are
// at a table the street above stays pinned at the door.

import { PITCH } from '../config.js';
import { clamp, TAU } from '../util.js';
import { rand, randInt, chance } from '../rng.js';

const DOOR = { x: 34.5 * PITCH, y: 9 * PITCH - 74 };

// Blackjack limits and shoe.
const BJ = { min: 10, max: 500, decks: 6 };
// Roulette: European wheel order, clockwise from zero.
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
// Slots: three weighted reels, one payline.
const REEL = ['CHERRY', 'LEMON', 'STAR', 'BELL', 'BAR', 'SEVEN', 'LEMON', 'CHERRY', 'BAR', 'STAR',
  'BELL', 'CHERRY', 'SEVEN', 'LEMON', 'BAR', 'CHERRY', 'STAR', 'BELL', 'LEMON', 'BAR'];
const SLOT_PAYS = { SEVEN: 120, BAR: 40, BELL: 25, STAR: 18, CHERRY: 12, LEMON: 8 };

const DEALER_LINES = {
  win: ['The house tips its hat. This time.', 'Luck is a tourist. It never stays.', 'Count it twice. We did.'],
  lose: ['The Conch keeps what the Conch keeps.', 'The felt forgives. The ledger does not.', 'Another chip for the lagoon floor.'],
  push: ['Nobody wins, nobody sulks.', 'A tie. The dealer calls it diplomacy.'],
  bj: ['Blackjack. The pit boss felt that one.', 'Twenty-one on the nose. Beautiful and rude.'],
  bust: ['Twenty-two is just twenty-one with ambition.', 'Busted. The shoe shrugs.'],
};

export function createCasino(game) {
  const C = {
    game,
    door: DOOR,
    inside: false,
    screen: 'lobby',         // lobby | cashier | blackjack | roulette | slots
    chips: 100,
    sel: 0,
    notice: null,
    noticeT: 0,
    line: 'Welcome to the Conch. The air conditioning is real, so is the rake.',
    // blackjack state
    shoe: [], bet: 0, lastBet: 25, hand: [], dealer: [], phase: 'bet',
    // roulette state
    bets: {}, chipSize: 10, cell: -1, wheelAng: 0, spinT: 0, pocket: 0, spinResult: null,
    // slots state
    slotBet: 10, reels: [0, 7, 13], reelV: [0, 0, 0], spinning: 0, slotWin: 0, holdGlow: 0,
  };

  // ---------------------------------------------------------------- persistence

  C.serialize = () => ({ chips: Math.round(C.chips) });
  C.restore = (d) => { if (d && Number.isFinite(d.chips)) C.chips = clamp(Math.round(d.chips), 0, 999999); };

  // ---------------------------------------------------------------- room

  C.updateDoor = function (dt, p) {
    if (C.inside) return;
    if (Math.hypot(p.x - DOOR.x, p.y - DOOR.y) < 90 && game.hud) {
      game.hud.setPrompt('E — THE GILDED CONCH (casino)');
    }
  };

  C.tryInteract = function (p) {
    if (C.inside) return false;
    if (Math.hypot(p.x - DOOR.x, p.y - DOOR.y) > 110 * 110) return false;
    C.inside = true;
    C.anchor = { x: p.x, y: p.y };
    p.vx = 0; p.vy = 0;
    C.screen = 'lobby';
    C.sel = 0;
    game.audio.ensure();
    game.audio.blip(500);
    return true;
  };

  C.exit = function () {
    if (!C.inside) return;
    C.inside = false;
    const p = game.player;
    if (C.anchor) { p.x = C.anchor.x; p.y = C.anchor.y; }
    p.vx = 0; p.vy = 0;
    game.save();
  };

  C.update = function (dt, input) {
    const p = game.player;
    if (!C.inside) { C.updateDoor(dt, p); return; }
    p.x = C.anchor.x; p.y = C.anchor.y;
    p.vx = 0; p.vy = 0;
    C.noticeT -= dt;
    C.wheelAng += dt * 0.5;
    if (C.spinT > 0) {
      C.spinT -= dt;
      if (C.spinT <= 0) resolveSpin();
    }
    if (C.spinning > 0) { C.spinning -= dt; slotsTick(dt); }
    if (input.tap('Backspace') || input.tap('KeyQ')) back();
    else if (C.screen === 'lobby') lobbyKeys(input);
    else if (C.screen === 'cashier') cashierKeys(input);
    else if (C.screen === 'blackjack') blackjackKeys(input);
    else if (C.screen === 'roulette') rouletteKeys(input);
    else if (C.screen === 'slots') slotsKeys(input);
  };

  function back() {
    if (C.screen === 'lobby') { C.exit(); return; }
    if (C.screen === 'blackjack' && C.phase !== 'bet' && C.phase !== 'done') {
      C.notice = 'Hand in progress. Finish it first.';
      C.noticeT = 2;
      return;
    }
    C.screen = 'lobby';
    C.sel = 0;
  }

  function say(list) { C.line = list[randInt(list.length)]; }

  function notice(text) { C.notice = text; C.noticeT = 2.4; }

  // ---------------------------------------------------------------- lobby + cashier

  const LOBBY = ['BLACKJACK', 'ROULETTE', 'SLOTS', 'CASHIER'];

  function lobbyKeys(input) {
    const n = LOBBY.length;
    if (input.tap('ArrowUp') || input.tap('KeyW')) C.sel = (C.sel - 1 + n) % n;
    if (input.tap('ArrowDown') || input.tap('KeyS')) C.sel = (C.sel + 1) % n;
    if (input.tap('Enter') || input.tap('Space')) {
      game.audio.blip(430);
      const pick = LOBBY[C.sel];
      if (pick === 'BLACKJACK') { C.screen = 'blackjack'; C.phase = 'bet'; C.sel = 0; }
      else if (pick === 'ROULETTE') { C.screen = 'roulette'; C.cell = -1; }
      else if (pick === 'SLOTS') { C.screen = 'slots'; }
      else { C.screen = 'cashier'; C.sel = 0; }
    }
  }

  const CASHIER = ['BUY CHIPS', 'CASH OUT', 'BACK TO FLOOR'];

  function cashierKeys(input) {
    const n = CASHIER.length;
    if (input.tap('ArrowUp') || input.tap('KeyW')) C.sel = (C.sel - 1 + n) % n;
    if (input.tap('ArrowDown') || input.tap('KeyS')) C.sel = (C.sel + 1) % n;
    if (input.tap('Enter') || input.tap('Space')) {
      const pick = CASHIER[C.sel];
      if (pick === 'BUY CHIPS') {
        // Buy in chips with whatever is in pocket, in $100 trays.
        const afford = Math.min(1000, Math.floor(game.player.money / 100) * 100);
        if (afford < 100) { notice('The cage wants $100 minimum to play.'); game.audio.blip(160); return; }
        game.player.money -= afford;
        C.chips += afford;
        game.audio.blip(720);
        notice(`$${afford} in chips. The cage stamps your hand.`);
      } else if (pick === 'CASH OUT') {
        const out = Math.floor(C.chips);
        if (out <= 0) { notice('No chips to cash. The cage is polite about it.'); return; }
        C.chips -= out;
        game.player.money += out;
        game.audio.blip(760);
        notice(`$${out} back in your pocket.`);
        game.save();
      } else {
        C.screen = 'lobby'; C.sel = 0;
      }
    }
  }

  // ---------------------------------------------------------------- blackjack

  function buildShoe() {
    C.shoe = [];
    for (let d = 0; d < BJ.decks; d++) {
      for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) C.shoe.push({ r, s });
    }
    for (let i = C.shoe.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [C.shoe[i], C.shoe[j]] = [C.shoe[j], C.shoe[i]];
    }
  }

  const draw = () => C.shoe.pop();

  function handValue(cards) {
    let total = 0, aces = 0;
    for (const c of cards) {
      if (c.r === 1) { total += 11; aces++; }
      else total += Math.min(10, c.r);
    }
    let soft = false;
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    soft = aces > 0;
    return { total, soft };
  }

  function betKeys(input) {
    if (input.tap('ArrowLeft') || input.tap('KeyA')) { C.bet = Math.max(0, C.bet - 25); }
    if (input.tap('ArrowRight') || input.tap('KeyD')) { C.bet = Math.min(BJ.max, C.bet + 25); }
    if (input.tap('ArrowUp') || input.tap('KeyW')) { C.bet = Math.min(BJ.max, C.bet + 100); }
    if (input.tap('ArrowDown') || input.tap('KeyS')) { C.bet = Math.max(0, C.bet - 100); }
    if (input.tap('Enter') || input.tap('Space')) deal();
  }

  function deal() {
    if (C.bet < BJ.min) { notice(`Table minimum is $${BJ.min}.`); return; }
    if (C.bet > C.chips) { notice('Not enough chips for that bet.'); C.bet = Math.floor(C.chips); return; }
    if (C.shoe.length < 60) buildShoe();
    C.chips -= C.bet;
    C.hand = [draw(), draw()];
    C.dealer = [draw(), draw()];
    C.phase = 'play';
    const hv = handValue(C.hand);
    const dv = handValue(C.dealer);
    if (hv.total === 21) { settle(true); return; }
    if (dv.total === 21) { settle(false); return; }
    game.audio.blip(340);
  }

  function blackjackKeys(input) {
    if (C.phase === 'bet') { betKeys(input); return; }
    if (C.phase !== 'play') {
      if (input.tap('Enter') || input.tap('Space')) { C.phase = 'bet'; C.bet = 0; C.hand = []; C.dealer = []; }
      return;
    }
    if (input.tap('KeyA') || input.tap('ArrowLeft')) hit();
    else if (input.tap('KeyD') || input.tap('ArrowRight')) stand();
    else if (input.tap('KeyW') || input.tap('ArrowUp')) double();
  }

  function hit() {
    C.hand.push(draw());
    const hv = handValue(C.hand);
    game.audio.blip(300);
    if (hv.total > 21) { C.dealer[1].up = true; settle('bust'); }
    else if (hv.total === 21) stand();
  }

  function stand() {
    // Dealer draws to 17, stands on all 17s.
    while (handValue(C.dealer).total < 17) C.dealer.push(draw());
    settle('showdown');
  }

  function double() {
    if (C.hand.length !== 2) { notice('Double is first two cards only.'); return; }
    if (C.bet > C.chips) { notice('Not enough chips to double.'); return; }
    C.chips -= C.bet;
    C.bet *= 2;
    C.hand.push(draw());
    game.audio.blip(520);
    if (handValue(C.hand).total > 21) { C.dealer[1].up = true; settle('bust'); }
    else stand();
  }

  function settle(outcome) {
    C.phase = 'done';
    const hv = handValue(C.hand);
    const dv = handValue(C.dealer);
    let delta = 0;
    if (outcome === 'bust') {
      say(DEALER_LINES.bust);
      delta = 0;
    } else if (outcome === true) {
      // Natural blackjack pays 3:2.
      delta = C.bet + Math.floor(C.bet * 1.5);
      say(DEALER_LINES.bj);
      game.audio.blip(900);
    } else {
      const pBust = hv.total > 21;
      const dBust = dv.total > 21;
      if (pBust) delta = 0;
      else if (dBust || hv.total > dv.total) { delta = C.bet * 2; say(DEALER_LINES.win); }
      else if (hv.total < dv.total) { delta = 0; say(DEALER_LINES.lose); }
      else { delta = C.bet; say(DEALER_LINES.push); }
    }
    C.chips += delta;
    C.lastBet = C.bet;
    C.delta = delta - C.bet;
    game.save();
  }

  // ---------------------------------------------------------------- roulette

  function rouletteKeys(input) {
    // Cell -1 = outside rail; 0..36 straight numbers.
    if (C.spinT > 0) return;
    if (input.tap('ArrowRight') || input.tap('KeyD')) C.cell = C.cell >= 36 ? -1 : C.cell + 1;
    if (input.tap('ArrowLeft') || input.tap('KeyA')) C.cell = C.cell <= -1 ? 36 : C.cell - 1;
    if (input.tap('ArrowUp') || input.tap('KeyW')) C.cell = C.cell >= 3 ? C.cell - 3 : 36;
    if (input.tap('ArrowDown') || input.tap('KeyS')) C.cell = C.cell >= 0 && C.cell <= 33 ? C.cell + 3 : (C.cell === 36 ? -1 : 0);
    C.cell = clamp(C.cell, -1, 36);
    if (input.tap('ArrowUp') === false && input.tap('KeyE')) C.chipSize = C.chipSize === 10 ? 50 : C.chipSize === 50 ? 100 : 10;
    if (input.tap('Enter') || input.tap('Space')) placeChip();
    if (input.tap('KeyX') || input.tap('KeyC')) spin();
  }

  function placeChip() {
    const at = C.cell;
    if (at < 0) {
      // Cycle the outside bets with Space when the rail is selected.
      C.outsideSel = ((C.outsideSel ?? -1) + 1) % 6;
      notice(`Rail bet: ${OUTSIDE[C.outsideSel][0]}`);
      return;
    }
    if (C.chipSize > C.chips) { notice('Not enough chips.'); return; }
    C.chips -= C.chipSize;
    const key = `n${at}`;
    C.bets[key] = (C.bets[key] ?? 0) + C.chipSize;
    game.audio.blip(380);
  }

  const OUTSIDE = [
    ['RED', (n) => n !== 0 && RED.has(n), 2],
    ['BLACK', (n) => n !== 0 && !RED.has(n), 2],
    ['EVEN', (n) => n !== 0 && n % 2 === 0, 2],
    ['ODD', (n) => n % 2 === 1, 2],
    ['LOW', (n) => n >= 1 && n <= 18, 2],
    ['HIGH', (n) => n >= 19 && n <= 36, 2],
  ];

  function spin() {
    if (C.spinT > 0) return;
    const totalBet = Object.values(C.bets).reduce((a, b) => a + b, 0);
    if (totalBet <= 0 && C.outsideAmount > 0) totalBet = 0;
    if (totalBet <= 0 && !(C.outsideAmount > 0)) { notice('Put a chip down first (arrows, Space).'); return; }
    C.spinResult = randInt(37);
    C.spinT = 2.6;
    C.wheelAng = 0;
    game.audio.blip(260);
  }

  function resolveSpin() {
    const n = C.spinResult;
    let back = 0;
    for (const [key, amt] of Object.entries(C.bets)) {
      if (Number(key.slice(1)) === n) back += amt * 36;   // 35:1 plus stake
    }
    if (C.outsideAmount > 0 && C.outsideBetIdx != null) {
      const [name, test, mult] = OUTSIDE[C.outsideBetIdx];
      if (n !== 0 && test(n)) back += C.outsideAmount * mult;
    }
    C.chips += back;
    C.bets = {};
    C.outsideAmount = 0;
    C.lastNumber = n;
    if (back > 0) { say(DEALER_LINES.win); game.audio.blip(820); }
    else { say(DEALER_LINES.lose); game.audio.blip(200); }
    game.save();
  }

  // ---------------------------------------------------------------- slots

  function slotsKeys(input) {
    if (C.spinning > 0) return;
    if (input.tap('ArrowUp') || input.tap('KeyW')) C.slotBet = Math.min(100, C.slotBet * 2);
    if (input.tap('ArrowDown') || input.tap('KeyS')) C.slotBet = Math.max(5, Math.floor(C.slotBet / 2));
    if (input.tap('Enter') || input.tap('Space')) pullSlot();
  }

  function pullSlot() {
    if (C.slotBet > C.chips) { notice('Not enough chips.'); return; }
    C.chips -= C.slotBet;
    C.slotWin = 0;
    C.spinning = 1.6;
    C.reelV = [9 + rand() * 4, 11 + rand() * 4, 13 + rand() * 4];
    C.reelStop = [0.9, 1.25, 1.6];
    game.audio.blip(300);
  }

  function slotsTick(dt) {
    for (let k = 0; k < 3; k++) {
      if (C.spinning <= C.reelStop[k]) {
        C.reelV[k] = Math.max(0, C.reelV[k] - dt * 22);
      }
      C.reels[k] = (C.reels[k] + C.reelV[k] * dt * 12) % REEL.length;
    }
    if (C.spinning <= 0) {
      C.reels = C.reels.map((v) => Math.round(v) % REEL.length);
      const [a, b, c] = C.reels.map((i) => REEL[i]);
      if (a === b && b === c) {
        C.slotWin = C.slotBet * SLOT_PAYS[a];
      } else {
        // Cherries pay small from the left edge, classic one-arm math.
        let cherries = 0;
        for (const s of [a, b, c]) { if (s === 'CHERRY') cherries++; else break; }
        C.slotWin = cherries === 2 ? C.slotBet * 3 : cherries === 1 ? C.slotBet : 0;
      }
      C.chips += C.slotWin;
      if (C.slotWin >= C.slotBet * 40) { say(DEALER_LINES.bj); game.audio.blip(940); }
      else if (C.slotWin > 0) { game.audio.blip(700); }
      else say(DEALER_LINES.lose);
      game.save();
    }
  }

  // ---------------------------------------------------------------- render

  C.render = function (ctx, W, H) {
    // Room: deep green felt walls, gold trim, one big conch on the far wall.
    ctx.fillStyle = '#0b1410';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.42, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(46,92,66,0.5)');
    g.addColorStop(0.55, 'rgba(20,44,32,0.4)');
    g.addColorStop(1, 'rgba(4,10,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffc042';
    ctx.font = `bold ${Math.max(20, 30)}px Consolas, monospace`;
    ctx.fillText('✶ THE GILDED CONCH ✶', W / 2, 38);
    ctx.fillStyle = 'rgba(232,228,212,0.7)';
    ctx.font = '12px Consolas, monospace';
    ctx.fillText('blackjack · roulette · slots — the house always keeps the lights on', W / 2, 56);

    // Chips + purse readout, always visible.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7bffd4';
    ctx.font = 'bold 17px Consolas, monospace';
    ctx.fillText(`CHIPS $${Math.floor(C.chips)}`, W - 24, 34);
    ctx.fillStyle = 'rgba(232,228,212,0.7)';
    ctx.font = '13px Consolas, monospace';
    ctx.fillText(`POCKET $${game.player.money}`, W - 24, 54);

    if (C.screen === 'lobby') drawLobby(ctx, W, H);
    else if (C.screen === 'cashier') drawCashier(ctx, W, H);
    else if (C.screen === 'blackjack') drawBlackjack(ctx, W, H);
    else if (C.screen === 'roulette') drawRoulette(ctx, W, H);
    else if (C.screen === 'slots') drawSlots(ctx, W, H);

    // Dealer line + notice.
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,217,119,0.9)';
    ctx.font = '14px Consolas, monospace';
    if (C.screen !== 'lobby') ctx.fillText(`“${C.line}”`, W / 2, H - 58);
    if (C.noticeT > 0 && C.notice) {
      ctx.globalAlpha = clamp(C.noticeT / 0.4, 0, 1);
      ctx.fillStyle = '#7bffd4';
      ctx.font = 'bold 15px Consolas, monospace';
      ctx.fillText(C.notice, W / 2, H - 30);
      ctx.globalAlpha = 1;
    }
  };

  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(7,12,10,0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,192,66,0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }

  function drawLobby(ctx, W, H) {
    const w = Math.min(430, W * 0.8), x = W / 2 - w / 2, y = H * 0.28;
    panel(ctx, x, y, w, 62 + LOBBY.length * 34);
    LOBBY.forEach((item, i) => {
      const on = i === C.sel;
      ctx.textAlign = 'left';
      ctx.fillStyle = on ? '#ffd977' : 'rgba(232,228,212,0.8)';
      ctx.font = `bold ${on ? 19 : 16}px Consolas, monospace`;
      ctx.fillText(`${on ? '▶ ' : '  '}${item}`, x + 26, y + 40 + i * 34);
      if (on) {
        ctx.fillStyle = 'rgba(123,255,212,0.85)';
        ctx.font = '12px Consolas, monospace';
        ctx.fillText(['table $10–$500', 'single zero, 35:1 straight', 'three reels, one line', 'chips in, chips out'][i], x + w - 26 - 190, y + 40 + i * 34);
      }
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(232,228,212,0.6)';
    ctx.font = '12px Consolas, monospace';
    ctx.fillText('↑↓ choose · ENTER play · BACKSPACE leave', W / 2, y + 62 + LOBBY.length * 34 + 22);
  }

  function drawCashier(ctx, W, H) {
    const w = Math.min(380, W * 0.8), x = W / 2 - w / 2, y = H * 0.3;
    panel(ctx, x, y, w, 60 + CASHIER.length * 34);
    CASHIER.forEach((item, i) => {
      const on = i === C.sel;
      ctx.textAlign = 'left';
      ctx.fillStyle = on ? '#ffd977' : 'rgba(232,228,212,0.8)';
      ctx.font = `bold ${on ? 19 : 16}px Consolas, monospace`;
      ctx.fillText(`${on ? '▶ ' : '  '}${item}`, x + 26, y + 40 + i * 34);
    });
  }

  function cardLabel(c) {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    return ranks[c.r - 1];
  }
  const SUITS = [['♠', '#1a1e26'], ['♥', '#c23a3a'], ['♦', '#c23a3a'], ['♣', '#1a1e26']];

  function drawCard(ctx, c, x, y, faceUp) {
    const w = 46, h = 66;
    ctx.fillStyle = faceUp === false ? '#27364e' : '#f4f1e6';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,20,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (faceUp === false) {
      ctx.fillStyle = 'rgba(232,228,212,0.25)';
      ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      return;
    }
    const [glyph, col] = SUITS[c.s];
    ctx.fillStyle = col;
    ctx.font = 'bold 17px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(cardLabel(c), x + 6, y + 20);
    ctx.font = '15px Consolas, monospace';
    ctx.fillText(glyph, x + 6, y + 38);
    ctx.save();
    ctx.translate(x + w - 8, y + h - 10);
    ctx.rotate(Math.PI);
    ctx.font = 'bold 13px Consolas, monospace';
    ctx.fillText(cardLabel(c), 0, 4);
    ctx.restore();
  }

  function drawBlackjack(ctx, W, H) {
    const x = W / 2, y = H * 0.24;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffc042';
    ctx.font = 'bold 18px Consolas, monospace';
    ctx.fillText('BLACKJACK — $10 min · $500 max · dealer stands on 17', x, y - 18);

    if (C.phase === 'bet') {
      panel(ctx, x - 180, y + 30, 360, 150);
      ctx.fillStyle = '#e8e4d4';
      ctx.font = 'bold 24px Consolas, monospace';
      ctx.fillText(`BET $${C.bet}`, x, y + 70);
      ctx.fillStyle = 'rgba(232,228,212,0.7)';
      ctx.font = '13px Consolas, monospace';
      ctx.fillText('←→ ±$25   ↑↓ ±$100   ENTER deal', x, y + 100);
      ctx.fillStyle = '#7bffd4';
      ctx.fillText(`last bet $${C.lastBet} · chips $${Math.floor(C.chips)}`, x, y + 124);
      return;
    }

    // Dealer hand.
    ctx.fillStyle = 'rgba(232,228,212,0.8)';
    ctx.font = 'bold 14px Consolas, monospace';
    const dv = handValue(C.dealer);
    const reveal = C.phase === 'done';
    ctx.fillText(`DEALER ${reveal ? dv.total : '?'}`, x - 80, y + 16);
    C.dealer.forEach((c, i) => drawCard(ctx, c, x - 160 + i * 54, y + 24, reveal || i === 0));
    // Player hand.
    const hv = handValue(C.hand);
    ctx.fillText(`RICO ${hv.total}${hv.soft ? ' (soft)' : ''}`, x - 80, y + 140);
    C.hand.forEach((c, i) => drawCard(ctx, c, x - 160 + i * 54, y + 148, true));

    if (C.phase === 'play') {
      ctx.fillStyle = '#7bffd4';
      ctx.font = 'bold 14px Consolas, monospace';
      ctx.fillText('A/← HIT   D/→ STAND   W/↑ DOUBLE', x, y + 260);
    } else if (C.phase === 'done') {
      const net = C.delta ?? 0;
      ctx.fillStyle = net > 0 ? '#7bffd4' : net === 0 ? '#e8e4d4' : '#ff7a3c';
      ctx.font = 'bold 22px Consolas, monospace';
      ctx.fillText(net > 0 ? `+$${net}` : net === 0 ? 'PUSH' : `-$${C.lastBet}`, x, y + 262);
      ctx.fillStyle = 'rgba(232,228,212,0.6)';
      ctx.font = '13px Consolas, monospace';
      ctx.fillText('ENTER next hand', x, y + 286);
    }
  }

  function drawRoulette(ctx, W, H) {
    const x = W * 0.32, y = H * 0.52;
    // Wheel.
    const R = Math.min(W, H) * 0.21;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(C.spinT > 0 ? C.wheelAng * 9 : C.wheelAng * 0.4);
    ctx.fillStyle = '#3a2f22';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.fillStyle = '#181c22';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, TAU); ctx.fill();
    WHEEL.forEach((n, i) => {
      const a0 = (i / 37) * TAU, a1 = ((i + 1) / 37) * TAU;
      ctx.fillStyle = n === 0 ? '#1f7a3c' : RED.has(n) ? '#7a1f28' : '#101318';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R * 0.84, a0, a1);
      ctx.closePath();
      ctx.fill();
      if (R > 60) {
        ctx.save();
        ctx.rotate((a0 + a1) / 2);
        ctx.fillStyle = 'rgba(232,228,212,0.75)';
        ctx.font = `${Math.max(6, R * 0.075)}px Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(String(n), R * 0.76, 4);
        ctx.restore();
      }
    });
    // Ball: rides opposite the wheel, settles into the result pocket.
    const settle = C.spinT <= 0;
    const idx = settle && C.lastNumber != null ? WHEEL.indexOf(C.lastNumber) : (C.wheelAng * -14) % 37;
    const bi = ((idx % 37) + 37) % 37;
    const ba = (bi / 37) * TAU + (settle ? 0 : C.wheelAng * 9);
    ctx.fillStyle = '#f4f1e6';
    ctx.beginPath();
    ctx.arc(Math.cos(ba) * R * 0.6, Math.sin(ba) * R * 0.6, Math.max(3, R * 0.05), 0, TAU);
    ctx.fill();
    ctx.restore();

    // Board: zero + 3x12 grid + outside rail.
    const bw = 34, bh = 26;
    const bx = W * 0.56, by = H * 0.28;
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px Consolas, monospace';
    for (let n = 0; n <= 36; n++) {
      const col = n === 0 ? 0 : Math.floor((n - 1) / 3);
      const row = n === 0 ? -1 : (n - 1) % 3;
      const cx = bx + (n === 0 ? -bw : col * bw);
      const cy = by + (row + 1) * bh;
      const on = C.cell === n;
      ctx.fillStyle = on ? '#ffd977' : n === 0 ? '#1f7a3c' : RED.has(n) ? '#7a1f28' : '#101318';
      ctx.fillRect(cx, cy, bw - 2, bh - 2);
      ctx.fillStyle = on ? '#101318' : 'rgba(232,228,212,0.9)';
      ctx.fillText(String(n), cx + bw / 2 - 1, cy + bh / 2 + 4);
      const amt = C.bets[`n${n}`];
      if (amt) chipDot(ctx, cx + bw / 2 - 1, cy + bh / 2 + 4, amt);
    }
    // Outside rail on the left of the grid.
    const names = ['RED', 'BLK', 'EVE', 'ODD', 'LOW', 'HIGH'];
    OUTSIDE.forEach(([name, test, mult], i) => {
      const cy = by + i * bh;
      const on = C.outsideSel === i && C.cell === -1;
      ctx.fillStyle = on ? '#ffd977' : 'rgba(30,36,30,0.9)';
      ctx.fillRect(bx - bw * 1.4, cy, bw * 1.3, bh - 2);
      ctx.fillStyle = on ? '#101318' : 'rgba(232,228,212,0.85)';
      ctx.fillText(name, bx - bw * 1.4 + bw * 0.62, cy + bh / 2 + 4);
    });
    if (C.cell === -1) {
      ctx.fillStyle = '#7bffd4';
      ctx.font = '12px Consolas, monospace';
      ctx.fillText('SPACE cycles the rail · ENTER bets rail', bx, by + 6 * bh + 18);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffc042';
    ctx.font = 'bold 15px Consolas, monospace';
    ctx.fillText(`CHIP $${C.chipSize} — E cycles chip · arrows move · ENTER place · X spin`, W / 2, H - 86);
    if (C.spinT > 0) {
      ctx.fillStyle = '#e8e4d4';
      ctx.font = 'bold 22px Consolas, monospace';
      ctx.fillText('NO MORE BETS…', W / 2, H * 0.2);
    } else if (C.lastNumber != null) {
      ctx.fillStyle = 'rgba(232,228,212,0.9)';
      ctx.font = 'bold 18px Consolas, monospace';
      ctx.fillText(`LAST: ${C.lastNumber} ${C.lastNumber === 0 ? 'ZERO' : RED.has(C.lastNumber) ? 'RED' : 'BLACK'}`, W / 2, H * 0.2);
    }
  }

  function chipDot(ctx, x, y, amt) {
    ctx.fillStyle = '#ffc042';
    ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(16,19,24,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#101318';
    ctx.font = 'bold 7px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(amt), x, y + 2.5);
  }

  const SLOT_GLYPHS = {
    CHERRY: '#ff4a55', LEMON: '#ffe14a', STAR: '#7bffd4', BELL: '#ffc042', BAR: '#e8e4d4', SEVEN: '#ff7a3c',
  };

  function drawSlots(ctx, W, H) {
    const x = W / 2, y = H * 0.34;
    const w = Math.min(420, W * 0.7);
    panel(ctx, x - w / 2, y, w, 210);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffc042';
    ctx.font = 'bold 16px Consolas, monospace';
    ctx.fillText('CONCH SLOTS — one line', x, y + 26);
    // Three reel windows.
    const rw = 86, gap = 22;
    const startX = x - (rw * 3 + gap * 2) / 2;
    for (let k = 0; k < 3; k++) {
      const rx = startX + k * (rw + gap);
      ctx.fillStyle = '#05070b';
      ctx.fillRect(rx, y + 44, rw, 74);
      ctx.strokeStyle = C.spinning > 0 && C.spinning <= (C.reelStop?.[k] ?? 0) ? 'rgba(123,255,212,0.6)' : 'rgba(255,192,66,0.4)';
      ctx.strokeRect(rx, y + 44, rw, 74);
      const sym = REEL[Math.floor(C.reels[k]) % REEL.length];
      ctx.fillStyle = SLOT_GLYPHS[sym] ?? '#e8e4d4';
      ctx.font = 'bold 17px Consolas, monospace';
      ctx.fillText(sym, rx + rw / 2, y + 86);
    }
    ctx.fillStyle = '#e8e4d4';
    ctx.font = 'bold 18px Consolas, monospace';
    if (C.slotWin > 0) ctx.fillText(`WIN $${C.slotWin}`, x, y + 150);
    else if (C.spinning <= 0 && C.slotWin === 0 && C.slotBet > 0) ctx.fillStyle = 'rgba(232,228,212,0.4)';
    ctx.fillStyle = '#7bffd4';
    ctx.font = '13px Consolas, monospace';
    ctx.fillText(`bet $${C.slotBet} · ↑↓ change · ENTER spin`, x, y + 178);
    // Paytable strip.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(232,228,212,0.55)';
    ctx.font = '11px Consolas, monospace';
    const pays = Object.entries(SLOT_PAYS);
    pays.forEach(([sym, mult], i) => {
      ctx.fillStyle = SLOT_GLYPHS[sym];
      ctx.fillText(`${sym} ×3 = ${mult}×`, x - w / 2 + 16 + (i % 3) * 130, y + 226 + Math.floor(i / 3) * 18);
    });
  }

  return C;
}
