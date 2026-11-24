// Vice Palms — 6 chained story missions for Rico: markers, timers, payouts
import { S, say, toast, crime } from './game.js';

const MS = [
  {
    title: 'Welcome to Vice Palms',
    brief: 'Meet me at the payphone, kid. Don\'t keep me waiting.',
    pay: 250,
    steps: [{ type: 'goto', at: 'rico', r: 64, text: 'Meet Rico at the payphone' }],
  },
  {
    title: 'Hot Wheels',
    brief: 'An Infernus is parked outside Club Vice. Bring it to my garage — no scratches.',
    pay: 500,
    steps: [
      { type: 'car', at: 'club', carType: 'sport', text: 'Steal the Infernus outside Club Vice' },
      { type: 'deliver', at: 'garage', text: 'Deliver the Infernus to the garage' },
    ],
  },
  {
    title: 'Pier Pressure',
    brief: 'Three packages fell off a boat at the docks. Collect them before the coast guard does. 75 seconds.',
    pay: 750,
    steps: [{ type: 'collect', at: 'docks', n: 3, time: 75, text: 'Collect the dock packages' }],
  },
  {
    title: 'Beach Bash',
    brief: 'Gang bangers are muscling in on our beach. Waste 3 of them. 90 seconds.',
    pay: 1000,
    steps: [{ type: 'kill', at: 'beach', n: 3, time: 90, text: 'Waste 3 gang members at the beach' }],
  },
  {
    title: 'Cash Grab',
    brief: 'Hit the corner store. Then lose the heat. Simple.',
    pay: 1500,
    steps: [
      { type: 'rob', at: 'store', text: 'Rob the corner store' },
      { type: 'loseheat', text: 'Lose the cops' },
    ],
  },
  {
    title: 'The Getaway',
    brief: 'Last job: the heat is on all of us. Get to the escape point on the west beach. 110 seconds. Run, baby, run.',
    pay: 2500,
    steps: [{ type: 'goto', at: 'escape', r: 80, time: 110, text: 'Reach the escape point' }],
  },
];

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export class Missions {
  constructor() {
    this.idx = 0; this.step = 0; this.timer = 0; this.cool = 0;
    this.items = []; this.targets = []; this.mcar = null;
    this.done = false; this.retry = false; this.objText = '';
  }

  begin() {
    this.step = 0; this.timer = 0; this.cool = 0;
    this.items = []; this.targets = []; this.mcar = null;
    if (this.idx >= MS.length) {
      this.done = true;
      S.objective = 'VICE PALMS: complete. The city is yours.';
      return;
    }
    const m = MS[this.idx];
    say(`RICO: ${m.brief}`, 5.5);
    this.prep(m, 0);
  }

  prep(m, st) {
    this.step = st;
    const s = m.steps[st];
    if (!s) return;
    this.timer = s.time || 0;
    this.items = []; this.targets = [];
    this.objText = s.text || '';
    S.objective = `${m.title.toUpperCase()} — ${s.text || ''}`;
    const base = S.world.missionSpots[s.at];
    if (s.type === 'collect' && base) {
      for (let i = 0; i < s.n; i++) {
        const a = (i / s.n) * Math.PI * 2;
        this.items.push({ x: base.x + Math.cos(a) * 230, y: base.y + Math.sin(a) * 230, got: false });
      }
    }
    if (s.type === 'kill' && base) {
      for (let i = 0; i < s.n; i++) {
        const q = S.peds.spawnAt(base.x + (S.rng() - 0.5) * 340, base.y + (S.rng() - 0.5) * 340);
        q.gang = true;
        this.targets.push(q);
      }
    }
    if (s.type === 'car' && base) {
      this.mcar = S.traffic.spawnAt(base.x + 110, base.y + 60, 0, s.carType);
    }
  }

  marker() {
    if (this.done || this.idx >= MS.length) return null;
    const m = MS[this.idx], s = m.steps[this.step], p = S.player;
    if (s.type === 'goto' || s.type === 'car' || s.type === 'deliver' || s.type === 'rob') {
      const sp = S.world.missionSpots[s.at];
      return { x: sp.x, y: sp.y, r: s.r || 70 };
    }
    if (s.type === 'collect') {
      let best = null, bd = 1e9;
      for (const it of this.items) {
        if (it.got) continue;
        const d = dist(it.x, it.y, p.cx(), p.cy());
        if (d < bd) { bd = d; best = it; }
      }
      return best ? { x: best.x, y: best.y, r: 46 } : null;
    }
    if (s.type === 'kill') {
      let best = null, bd = 1e9;
      for (const q of this.targets) {
        if (q.dead) continue;
        const d = dist(q.x, q.y, p.cx(), p.cy());
        if (d < bd) { bd = d; best = q; }
      }
      return best ? { x: best.x, y: best.y, r: 40 } : null;
    }
    return null;
  }

  update(dt) {
    if (this.done || this.idx >= MS.length) return;
    if (this.cool > 0) {
      this.cool -= dt;
      if (this.cool <= 0) this.begin();
      return;
    }
    const m = MS[this.idx], s = m.steps[this.step], p = S.player;
    const px = p.cx(), py = p.cy();

    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.fail('Out of time'); return; }
    }
    if ((s.type === 'car' || s.type === 'deliver') && this.mcar && this.mcar.dead) {
      this.fail('The car was destroyed'); return;
    }

    switch (s.type) {
      case 'goto': {
        const sp = S.world.missionSpots[s.at];
        if (dist(px, py, sp.x, sp.y) < (s.r || 70)) this.complete();
        break;
      }
      case 'car': {
        if (p.inCar === this.mcar) { this.next(m); }
        break;
      }
      case 'deliver': {
        const sp = S.world.missionSpots[s.at];
        if (p.inCar === this.mcar && dist(px, py, sp.x, sp.y) < 90) this.complete();
        break;
      }
      case 'collect': {
        let left = 0;
        for (const it of this.items) {
          if (it.got) continue;
          if (dist(px, py, it.x, it.y) < 48) {
            it.got = true;
            S.audio.blip(1100, 0.1, 'sine', 0.08);
            toast(`Package ${this.items.filter((i2) => i2.got).length}/${this.items.length}`);
          } else left++;
        }
        if (left === 0) this.complete();
        break;
      }
      case 'kill': {
        let dead = 0;
        for (const q of this.targets) if (q.dead) dead++;
        if (dead >= s.n) this.complete();
        break;
      }
      case 'rob': {
        const sp = S.world.missionSpots[s.at];
        if (dist(px, py, sp.x, sp.y) < 60) {
          crime(3.3);
          S.money += 800;
          say('RICO: Alarm is screaming — MOVE! Lose them!', 4);
          toast('Store robbed: +$800');
          this.next(m);
        }
        break;
      }
      case 'loseheat': {
        if (S.wanted === 0 && S.heat <= 0.05) this.complete();
        break;
      }
    }
  }

  next(m) {
    if (this.step + 1 < m.steps.length) {
      say('RICO: Good. Now for the rest.', 3);
      this.prep(m, this.step + 1);
    } else this.complete();
  }

  complete() {
    const m = MS[this.idx];
    S.money += m.pay;
    S.stats.missions++;
    toast(`${m.title} complete! +$${m.pay}`);
    say('RICO: Clean work. I\'ll be in touch.', 3.5);
    S.audio.blip(760, 0.12, 'sine', 0.09);
    this.idx++;
    this.objText = '';
    S.objective = '';
    this.cool = 2.8;
    this.retry = false;
    if (this.idx >= MS.length) {
      this.done = true;
      S.objective = 'VICE PALMS: all jobs done. The city is yours.';
      say('RICO: That\'s the whole ledger square. You\'re free, kid. Enjoy Vice Palms.', 6);
    }
  }

  fail(why) {
    say(`MISSION FAILED — ${why}. Rico will reconnect.`, 3.5);
    toast('Mission failed');
    S.audio.blip(180, 0.3, 'sawtooth', 0.08);
    this.retry = true;
    this.cool = 2.8;
  }

  onRespawn() { this.begin(); }
}
