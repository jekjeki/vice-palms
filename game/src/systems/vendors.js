// The street economy: hot dog carts, taco stands, liquor stores and one pawn shop
// curb, parked on the sidewalks the crowd already walks. Everything has a price,
// and every price drifts — the day cycle leans on the market and every purchase
// leans back, so the same cart is never the same deal twice. Food heals over time
// (the Full buff), tacos keep the plates coming, liquor puts armor in the jacket
// at the cost of dignity, and the pawn shop buys the car off your curb for parts
// when the market and the damage report both agree on a number. The vendors talk:
// every kind has its bark, and they drop one when a customer gets close.
//
// No network, no inventory screens: the whole economy is E at a cart and a toast
// on the strip. Prices ride the save so a player can't wait out the market for free.

import { dist2 } from '../util.js';

const BUY_RAD = 74;          // how close a customer has to stand
const PRICE_DRIFT = 34;      // seconds between market wobbles
const BARK_RAD = 190;        // where a vendor starts working the pitch
const BARK_COOLDOWN = 26;    // seconds before the same vendor pitches again

// Kinds: what E buys, what it does, and what the vendor says when it lands.
const KINDS = {
  hotdog: {
    label: 'HOT DOG', buff: 'FULL', heal: 3.2, healT: 12, base: 24,
    line: 'Hot off the rollers. You look like the kind of night that skips meals.',
    done: 'The Full: patched up from the inside, one street dog at a time.',
  },
  taco: {
    label: 'TACO PLATE', buff: 'Fired Up', heal: 2.1, healT: 10, base: 32,
    line: 'Al pastor, extra lime. Eating standing up is still dining if the plate is good.',
    done: 'Fired Up: the plates keep coming. So does the healing.',
  },
  liquor: {
    label: 'LIQUOR', buff: 'Liquid Backbone', armor: 2.0, armorT: 10, base: 40,
    line: 'One glass, no music, no judgments. Puts lead in the jacket, if you follow.',
    done: 'Liquid Backbone: the vest drinks first tonight.',
  },
};

// The pawn curb: what it sells, and the parts-market story for what it buys.
const PAWN_STOCK = [
  { id: 'ammo', label: 'PISTOL AMMO ×12', base: 90 },
  { id: 'armor', label: 'ARMOR PLATE', base: 160 },
  { id: 'medkit', label: 'MEDKIT (+40)', base: 130 },
];

/** A sidewalk spot: the first band of every block is pavement, so +58 lands right. */
function spot(kind, name, x, y, phase) {
  return { kind, name, x, y, phase: phase ?? (x + y) % 7, price: null, barkT: 0, near: false };
}

// The vendors: four carts working the blocks around the hospital and the plaza,
// the Strip and the docks promenade, three taco stands downtown, two liquor
// stores, and the pawn curb on the 24h PAWN block.
const LAYOUT = [
  spot('hotdog', 'Sunny’s Cart', 12 * 420 + 58, 23 * 420 + 58),
  spot('hotdog', 'Two Bones', 19 * 420 + 58, 21 * 420 - 58),
  spot('hotdog', 'Strip Dogs', 39 * 420 + 58, 8 * 420 + 210),
  spot('hotdog', 'Pier B Special', 5000, -1520),
  spot('taco', 'La Bendición', 6 * 420 + 58, 10 * 420 - 58),
  spot('taco', 'Tacos Kilo', 26 * 420 - 58, 18 * 420 + 58),
  spot('taco', 'El Faro Cart', 33 * 420 - 58, 29 * 420 + 210),
  spot('liquor', 'Last Call Liquor', 9 * 420 - 58, 14 * 420 + 210),
  spot('liquor', 'Casa del Ron', 30 * 420 + 58, 7 * 420 + 210),
  spot('pawn', '24H Pawn Curb', 24 * 420 + 58, 7 * 420 + 210),
];

// ------------------------------------------------------------
export function createVendors(game) {
  const vendors = LAYOUT.map((v) => ({ ...v, price: KINDS[v.kind]?.base ?? 0, sold: 0 }));
  const pawn = vendors.find((v) => v.kind === 'pawn');
  const pawnPrices = Object.fromEntries(PAWN_STOCK.map((s) => [s.id, s.base]));

  const S = {
    game,
    vendors,
    pawn,
    stock: PAWN_STOCK,
    buff: null,          // { label, heal, armor, t }
    barkT: 0,
    marketT: PRICE_DRIFT,
    trades: 0,           // lifetime purchases, saved
  };

  // ------------------------------------------------------------ pricing

  /** The market wobble: every drift window, each price breathes around its base. */
  function driftPrices() {
    const day = game.time / 90;                    // the night cycles the market too
    for (const v of vendors) {
      const base = KINDS[v.kind]?.base;
      if (!base) continue;
      const wobble = Math.sin(day + v.phase) * 0.18 + Math.sin(day * 2.7 + v.phase * 1.3) * 0.08;
      v.price = Math.max(8, Math.round((base * (1 + wobble) + v.sold * base * 0.03) / 2) * 2 - v.sold);
      if (v.price < base * 0.7) v.price = Math.round(base * 0.7);
    }
    for (const s of PAWN_STOCK) {
      const wobble = Math.cos(day * 1.4 + s.base) * 0.15;
      pawnPrices[s.id] = Math.max(20, Math.round(s.base * (1 + wobble) + S.trades * 1.5));
    }
  }

  /** What the pawn curb will pay for the car on your curb, right now. */
  function scrapQuote(car) {
    if (!car) return 0;
    const hp = car.spec?.hp ?? 100;
    const hurt = car.wreck ? 0.25 : 1 - Math.min(0.85, Math.max(0, (hp - (car.hp ?? hp)) / hp));
    // Top-end models fetch more; a wreck is a wreck. The market leans in a little.
    const day = game.time / 90;
    const lean = 1 + Math.sin(day + car.specIndex) * 0.12;
    return Math.max(60, Math.round(((car.spec?.top ?? 300) * 1.6 + hp * 2) * hurt * lean / 10) * 10);
  }

  // ------------------------------------------------------------ barks

  function bark(v, line) {
    game.dialog?.say?.('vendor', line ?? KINDS[v.kind]?.line ?? 'Buy something or keep walking.');
    v.barkT = BARK_COOLDOWN;
  }

  // ------------------------------------------------------------ buying

  function applyBuff(kind) {
    const def = KINDS[kind];
    S.buff = {
      label: def.buff,
      heal: def.heal ?? 0,
      armor: def.armor ?? 0,
      t: Math.max(def.healT ?? 0, def.armorT ?? 0),
    };
  }

  function buy(v) {
    const p = game.player;
    if (p.money < v.price) {
      toast2(`The ${v.name} wants $${v.price}. You are short.`, '#ff6b5f');
      bark(v, 'Short is short, friend. The cart does not run on charm.');
      return true;
    }
    p.money -= v.price;
    v.sold++;
    S.trades++;
    applyBuff(v.kind);
    game.toast(`${KINDS[v.kind].label} — $${v.price}`, '#7bffd4');
    game.audio.blip(480);
    bark(v, KINDS[v.kind].done);
    return true;
  }

  function buyPawnItem(item) {
    const p = game.player;
    const price = pawnPrices[item.id];
    if (p.money < price) {
      toast2(`${item.label} runs $${price}. Come back heavier.`, '#ff6b5f');
      return true;
    }
    p.money -= price;
    S.trades++;
    if (item.id === 'ammo') { p.ammo += 12; game.toast('PISTOL AMMO ×12 — $' + price, '#ffe9a3'); }
    if (item.id === 'armor') { p.armor = Math.min(100, p.armor + 50); game.toast('ARMOR PLATE — $' + price, '#5db3ff'); }
    if (item.id === 'medkit') { p.health = Math.min(100, p.health + 40); game.toast('MEDKIT — $' + price, '#3dff7a'); }
    game.audio.blip(480);
    bark(pawn, 'Pleasure, as always. The interest is in the smile, not the ledger.');
    return true;
  }

  /** Sell the parked car you stepped out of: the parts market takes it whole. */
  function sellCar(p) {
    const car = p.car;
    if (!car || car.role !== 'player' || car.tag === 'job') return false;
    if (game.wanted.stars > 0) {
      toast2('The pawn curb does not buy felonies with the lights on. Lose the heat.', '#ff6b5f');
      return true;
    }
    const quote = scrapQuote(car);
    game.player.money += quote;
    game.fx.cash(car.x, car.y);
    game.audio.blip(640);
    // The car leaves the world the honest way: sold, not wasted.
    car.wasted = true;
    p.car = null;
    S.trades++;
    game.toast(`SOLD FOR PARTS — $${quote.toLocaleString()}`, '#ffd977');
    bark(pawn, 'She will live again as someone’s door panel. Cash is cash.');
    return true;
  }

  /** The E hook game.resolveInteract calls: one action per press, nearest first. */
  function tryInteract(p) {
    let best = null, bd = BUY_RAD * BUY_RAD;
    for (const v of vendors) {
      const d = dist2(p.x, p.y, v.x, v.y);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return false;
    if (best.kind === 'pawn') {
      // The pawn curb serves in order: the car on your curb first, then the shelf.
      if (p.car && sellCar(p)) return true;
      const affordable = PAWN_STOCK.find((s) => s.id === 'ammo') ?? PAWN_STOCK[0];
      return buyPawnItem(affordable);
    }
    return buy(best);
  }

  // ------------------------------------------------------------ update

  function update(dt, p) {
    // The market breathes on its own clock, not the player's.
    S.marketT -= dt;
    if (S.marketT <= 0) { S.marketT = PRICE_DRIFT; driftPrices(); }

    // The active buff drips health or armor back onto Rico.
    if (S.buff) {
      S.buff.t -= dt;
      if (S.buff.heal) game.player.health = Math.min(100, game.player.health + S.buff.heal * dt);
      if (S.buff.armor) game.player.armor = Math.min(100, game.player.armor + S.buff.armor * dt);
      if (S.buff.t <= 0) S.buff = null;
    }

    // Barks and prompts: one vendor at a time gets the customer's ear.
    S.barkT -= dt;
    let nearV = null, nd = BARK_RAD * BARK_RAD;
    for (const v of vendors) {
      v.barkT -= dt;
      const d = dist2(p.x, p.y, v.x, v.y);
      if (d < nd) { nd = d; nearV = v; }
    }
    if (nearV && !nearV.near) {
      nearV.near = true;
      if (nearV.barkT <= 0) bark(nearV);
    } else if (!nearV) {
      for (const v of vendors) v.near = false;
    }
    if (nearV) {
      game.hud?.setPrompt?.(promptFor(nearV, p));
    }
  }

  function promptFor(v, p) {
    if (v.kind === 'pawn') {
      return p.car && p.car.role === 'player' && p.car.tag !== 'job'
        ? `E — SELL CAR FOR PARTS ($${scrapQuote(p.car).toLocaleString()})`
        : `E — BUY ${PAWN_STOCK[0].label} ($${pawnPrices.ammo})`;
    }
    return `E — ${KINDS[v.kind].label} ($${v.price})`;
  }

  function toast2(text, color) { game.toast(text, color ?? '#7bffd4'); }

  // ------------------------------------------------------------ readouts

  /** The vendor blips for the minimap and the map screen. */
  function blips() {
    return vendors.map((v) => [
      v.x, v.y,
      v.kind === 'pawn' ? '#a86bff' : v.kind === 'liquor' ? '#ff7a3c' : '#7dffa4',
      v,
    ]);
  }

  /** A one-line market report for the map screen's legend. */
  function marketLine() {
    const p = pawnPrices;
    return `PAWN: ammo $${p.ammo} · plate $${p.armor} · medkit $${p.medkit}`;
  }

  function drawHud(ctx, W, H) {
    if (!S.buff) return;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px Consolas, "Courier New", monospace';
    ctx.fillStyle = 'rgba(123,255,212,0.9)';
    ctx.fillText(`${S.buff.label.toUpperCase()} — ${Math.ceil(S.buff.t)}s`, 27, 60 + 20);
    ctx.restore();
  }

  function serialize() {
    return {
      trades: S.trades,
      prices: vendors.map((v) => v.price),
      pawn: { ...pawnPrices },
    };
  }

  function restore(data) {
    if (!data || typeof data !== 'object') return;
    S.trades = Number(data.trades) || 0;
    if (Array.isArray(data.prices)) {
      data.prices.forEach((pr, i) => { if (vendors[i] && pr > 0) vendors[i].price = pr; });
    }
    if (data.pawn) Object.assign(pawnPrices, data.pawn);
  }

  S.tryInteract = tryInteract;
  S.update = update;
  S.drawHud = drawHud;
  S.blips = blips;
  S.marketLine = marketLine;
  S.scrapQuote = scrapQuote;
  S.serialize = serialize;
  S.restore = restore;
  return S;
}
