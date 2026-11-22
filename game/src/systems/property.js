// ============================================================
// PROPERTY — buyable safehouses and businesses for Vice Palms.
//
// Three safehouses and two businesses: prices, passive income
// that banks itself on a tick, garage storage per property, and
// a purchase/refund flow the phone menu drives.
// ============================================================

export const PROPERTIES = [
  {
    id: 'safehouse-palmetto',
    kind: 'safehouse',
    name: 'Palmetto Rooming House',
    desc: 'A creaky third-floor room above a laundromat. Smells like fabric softener and secrets.',
    price: 24000,
    income: 0,
    incomeEvery: 0,
    garage: 2,
    x: 13 * 420,
    y: 21 * 420,
    color: '#7dd4a0',
  },
  {
    id: 'safehouse-marina',
    kind: 'safehouse',
    name: 'Marina Loft',
    desc: 'Glass, salt air, a balcony over the slips. You can watch the ferries come in.',
    price: 96000,
    income: 0,
    incomeEvery: 0,
    garage: 4,
    x: 38.5 * 420,
    y: 6.5 * 420,
    color: '#63b8f0',
  },
  {
    id: 'safehouse-docks',
    kind: 'safehouse',
    name: 'Pier B Walk-up',
    desc: 'A North Docks room the Tides keep quiet. Nobody asks questions here.',
    price: 52000,
    income: 0,
    incomeEvery: 0,
    garage: 3,
    x: 10 * 420 + 65,
    y: -980,
    color: '#ff7755',
  },
  {
    id: 'biz-laundromat',
    kind: 'business',
    name: 'Suds & City Laundromat',
    desc: 'Washers humming all day. The cash drawer skims itself every night.',
    price: 68000,
    income: 340,
    incomeEvery: 45,
    garage: 1,
    x: 7 * 420,
    y: 33 * 420,
    color: '#c7a23a',
  },
  {
    id: 'biz-tacotruck',
    kind: 'business',
    name: 'La Palma Taco Truck',
    desc: 'Best al pastor on the coast. The line outside pays your bills.',
    price: 41000,
    income: 210,
    incomeEvery: 40,
    garage: 0,
    x: 22 * 420,
    y: 4 * 420,
    color: '#e0803a',
  },
];

const SAVE_KEY = 'vicepalms.property.1';

// ------------------------------------------------------------
export function createProperty(game) {
  const owned = {};      // id -> { incomeBanked, garagedCars: [] }
  const lastTick = {};
  let totalEarned = 0;

  // Restore from localStorage (the same bucket the save system uses).
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.owned) Object.assign(owned, data.owned);
      if (typeof data.totalEarned === 'number') totalEarned = data.totalEarned;
    }
  } catch {
    /* fresh ledger */
  }

  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ owned, totalEarned }));
    } catch {
      /* storage unavailable */
    }
  }

  function isOwned(id) { return !!owned[id]; }
  function ownedList() { return PROPERTIES.filter((p) => owned[p.id]); }
  function forSaleList() { return PROPERTIES.filter((p) => !owned[p.id]); }

  // ----------------------------------------------------------
  function buy(id) {
    const p = PROPERTIES.find((x) => x.id === id);
    if (!p) return { ok: false, reason: 'Unknown property.' };
    if (owned[p.id]) return { ok: false, reason: 'You already hold the deed.' };
    if (game.player.money < p.price) {
      return { ok: false, reason: `Short by $${(p.price - game.player.money).toLocaleString()}.` };
    }
    game.player.money -= p.price;
    owned[p.id] = { incomeBanked: 0, garagedCars: [] };
    lastTick[p.id] = 0;
    persist();
    game.dialog?.say?.('radio', `Deal closed — ${p.name} is yours.`);
    game.audio?.blip?.(880);
    return { ok: true, property: p };
  }

  function sell(id) {
    const p = PROPERTIES.find((x) => x.id === id);
    if (!p || !owned[id]) return { ok: false, reason: "You don't hold that deed." };
    const refund = Math.floor(p.price * 0.72);
    game.player.money += refund;
    delete owned[id];
    delete lastTick[id];
    persist();
    game.dialog?.say?.('radio', `Sold ${p.name}. $${refund.toLocaleString()} back in your pocket.`);
    return { ok: true, refund };
  }

  // ----------------------------------------------------------
  function update(dt) {
    for (const p of PROPERTIES) {
      if (!p.income || !owned[p.id]) continue;
      lastTick[p.id] = (lastTick[p.id] ?? 0) + dt;
      if (lastTick[p.id] >= p.incomeEvery) {
        lastTick[p.id] -= p.incomeEvery;
        owned[p.id].incomeBanked += p.income;
      }
    }
  }

  function collect() {
    let sum = 0;
    for (const p of PROPERTIES) {
      if (!owned[p.id]) continue;
      sum += owned[p.id].incomeBanked ?? 0;
      owned[p.id].incomeBanked = 0;
    }
    if (sum > 0) {
      game.player.money += sum;
      totalEarned += sum;
      persist();
      game.dialog?.say?.('radio', `Collected $${sum.toLocaleString()} from your properties.`);
      game.fx?.cash?.(game.player.x, game.player.y);
    }
    return sum;
  }

  function pendingIncome() {
    let sum = 0;
    for (const p of PROPERTIES) {
      if (!owned[p.id]) continue;
      sum += owned[p.id].incomeBanked ?? 0;
    }
    return sum;
  }

  // ----------------------------------------------------------
  function storeCar(id, label) {
    const o = owned[id];
    const p = PROPERTIES.find((x) => x.id === id);
    if (!o || !p) return { ok: false, reason: "Not your place." };
    if (o.garagedCars.length >= p.garage) return { ok: false, reason: 'The garage is full.' };
    o.garagedCars.push({ label: label ?? 'Car', t: Date.now() });
    persist();
    return { ok: true };
  }

  function retrieveCar(id, slot) {
    const o = owned[id];
    if (!o) return { ok: false, reason: "Not your place." };
    const i = typeof slot === 'number' ? slot : o.garagedCars.length - 1;
    const car = o.garagedCars.splice(i, 1)[0];
    if (!car) return { ok: false, reason: 'The garage is empty.' };
    persist();
    return { ok: true, car };
  }

  // ----------------------------------------------------------
  // Respawn point: the nearest owned safehouse (death economy).
  // ----------------------------------------------------------
  function respawnPoint(nearX, nearY) {
    const houses = ownedList().filter((p) => p.kind === 'safehouse');
    if (!houses.length) return null;
    let best = houses[0];
    let bestD = Infinity;
    for (const p of houses) {
      const d = (p.x - nearX) ** 2 + (p.y - nearY) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return { x: best.x, y: best.y + 40, name: best.name };
  }

  // ----------------------------------------------------------
  // Menu data for phone.js.
  // ----------------------------------------------------------
  function menuData() {
    return {
      owned: PROPERTIES.filter((p) => owned[p.id]).map((p) => ({
        ...p,
        banked: owned[p.id].incomeBanked ?? 0,
        cars: owned[p.id].garagedCars.length,
      })),
      forSale: PROPERTIES.filter((p) => !owned[p.id]).map((p) => ({
        ...p,
        affordable: game.player.money >= p.price,
      })),
      totalEarned,
      pending: pendingIncome(),
    };
  }

  function stats() {
    return {
      ownedCount: Object.keys(owned).length,
      safehouses: ownedList().filter((p) => p.kind === 'safehouse').length,
      businesses: ownedList().filter((p) => p.kind === 'business').length,
      totalEarned,
      pending: pendingIncome(),
      netWorth: ownedList().reduce((s, p) => s + p.price, 0),
    };
  }

  /** Walk-by prompt when Rico is at a door. */
  function updateProximity(player) {
    for (const p of PROPERTIES) {
      if ((p.x - player.x) ** 2 + (p.y - player.y) ** 2 < 60 * 60) {
        if (owned[p.id]) {
          game.hud?.setPrompt?.(
            p.kind === 'safehouse' ? `${p.name} — your place. Rest to save.` : `${p.name} — your business. Collect at the phone.`
          );
        } else {
          game.hud?.setPrompt?.(`${p.name} — for sale, $${p.price.toLocaleString()}. Buy from your phone.`);
        }
        break;
      }
    }
  }

  return {
    PROPERTIES,
    buy,
    sell,
    collect,
    pendingIncome,
    isOwned,
    ownedList,
    forSaleList,
    storeCar,
    retrieveCar,
    respawnPoint,
    menuData,
    stats,
    update,
    updateProximity,
    persist,
  };
}
