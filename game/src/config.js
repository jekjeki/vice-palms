// config.js — all tuning constants for Vice Palms.
// The whole game reads from this one object so the sim stays consistent.

export const CFG = {
  // ----- world grid -----
  COLS: 17,            // vertical roads (blocks per row)
  ROWS: 13,            // horizontal roads
  B: 280,              // block pitch in px
  RW: 86,              // road width (kerb to kerb)
  SW: 16,              // sidewalk width

  // get world size
  get W() { return this.COLS * this.B + this.RW; },
  get H() { return this.ROWS * this.B + this.RW; },

  // districts
  BEACH_Y: 3300,       // sand starts (south coast)
  WATER_Y: 3560,       // ocean starts
  PARK: { bx: 2, by: 5, bw: 2, bh: 2 },      // block rect of Palm Park
  DOCKS: { bx: 8, by: 0, bw: 9, bh: 3 },     // north docks
  AIRFIELD: { bx: 14, by: 4, bw: 3, bh: 6 }, // Palm Airfield (east)
  DOWNTOWN: { bx: 7, by: 5, bw: 4, bh: 4 },

  // ----- view / feel -----
  NIGHT: 'rgba(8,6,34,0.42)',
  ZOOM_FOOT: 1.05,
  ZOOM_CAR: 0.92,
  ZOOM_FAST: 0.80,

  // ----- player -----
  WALK: 118, SPRINT: 190,
  P_HP: 100, P_ARMOR: 0,
  PUNCH_DMG: 22,
  BULLET_DMG: 12,
  REACH: 26,

  // weapons: pistol from the start, shotgun from Ammu-Nation
  WEAPONS: {
    pistol:  { name: '9mm',    mag: 17, pellets: 1, spread: 0.02, rate: 0.24, dmg: 12, spd: 900, life: 0.5 },
    shotgun: { name: 'Shotgun', mag: 8,  pellets: 5, spread: 0.16, rate: 0.78, dmg: 9,  spd: 780, life: 0.34 },
  },

  // ----- wanted -----
  STAR_DECAY_T: 14,    // seconds out of sight per star
  BUST_R: 30,          // foot-cop bust radius
  CRUISERS: [0, 1, 2, 3, 4, 6],  // per star level
  FEE_STAR: 400,       // busted fee per star
  FEE_WASTE: 300,      // hospital fee (flat + per star half)

  // ----- traffic -----
  TRAFFIC_N: 26,       // target AI cars near player
  PEDS_N: 34,
  DESPAWN_R: 1500,
  SPAWN_R_MIN: 700, SPAWN_R_MAX: 1200,

  // ----- car physics -----
  ENG_DRAG: 0.72,      // per-second loss factor
  BRAKE: 320,
  SLIP_GRIP: 5.2,      // lateral velocity bleed rate
  HANDBRAKE_GRIP: 1.1,
  CAR_R_MULT: 0.42,    // collision radius from size

  // ----- car catalog (8 civilian types + police) -----
  CARS: {
    stallion: { name: 'Stallion',  w: 46, h: 22, max: 340, acc: 190, turn: 2.6, hp: 100, mass: 1.0,
      colors: ['#ff2f7d', '#00d9ff', '#ffb200', '#8b5cf6', '#e8e6e3'] },
    banshee:  { name: 'Banshee',   w: 48, h: 21, max: 400, acc: 235, turn: 2.9, hp: 90,  mass: 0.9,
      colors: ['#f7f7f5', '#ff2f2f', '#18e0b4'] },
    voodoo:   { name: 'Voodoo',    w: 48, h: 23, max: 280, acc: 140, turn: 2.2, hp: 120, mass: 1.2,
      colors: ['#7a3ba8', '#2e6f4e', '#8c1f28', '#3a3f52'] },
    cabbie:   { name: 'Cabbie',    w: 47, h: 23, max: 260, acc: 135, turn: 2.3, hp: 115, mass: 1.15,
      colors: ['#f4c21c'] },
    pickme:   { name: 'Pick-Me-Up',w: 52, h: 24, max: 250, acc: 130, turn: 2.0, hp: 140, mass: 1.4,
      colors: ['#b0562a', '#4d7ea8', '#5d5d5d'] },
    wagon:    { name: 'Moonbeam',  w: 50, h: 24, max: 240, acc: 120, turn: 2.0, hp: 130, mass: 1.3,
      colors: ['#d9d4c8', '#88a550', '#c46a9a'] },
    van:      { name: 'Burrito',   w: 54, h: 26, max: 230, acc: 115, turn: 1.9, hp: 150, mass: 1.5,
      colors: ['#6b6f7a', '#274d8d', '#7d2f2f'] },
    phantom:  { name: 'Phantom',   w: 78, h: 27, max: 220, acc: 105, turn: 1.4, hp: 220, mass: 2.4,
      colors: ['#4a5568', '#7a4a2a', '#2a2f3a'] },
    blade:    { name: 'Blade',     w: 49, h: 23, max: 310, acc: 170, turn: 2.5, hp: 110, mass: 1.05,
      colors: ['#12b886', '#e64980', '#f59f00', '#343a40'] },
    bus:      { name: 'Coach',     w: 74, h: 26, max: 210, acc: 90,  turn: 1.5, hp: 200, mass: 2.2,
      colors: ['#e0a13a'] },
    police:   { name: 'VCPD Cruiser', w: 48, h: 23, max: 360, acc: 205, turn: 2.7, hp: 130, mass: 1.25,
      colors: ['#f2f2f0'] },
  },

  // ----- police helicopter -----
  HELI: { hp: 140, alt: 260, gunStars: 5 },

  // ----- spike strips -----
  SPIKE: { w: 66, h: 10, life: 30, slowT: 11, dmg: 14 },

  // ----- shops -----
  SHOP: { ammoCost: 60, armorCost: 250, foodCost: 25, sprayCost: 150 },

  // ----- missions -----
  MISSION_PAYOUTS: [500, 800, 1200, 1500, 2000, 3000],

  // ----- misc -----
  SKID_MAX: 420,
  PART_MAX: 900,
  BULLET_SPD: 900,
  BULLET_LIFE: 0.5,

  // save key
  SAVE_KEY: 'vicepalms.save.v1',
};

export const DIRS = [
  { dx: 1, dy: 0 },   // 0 east
  { dx: 0, dy: 1 },   // 1 south
  { dx: -1, dy: 0 },  // 2 west
  { dx: 0, dy: -1 },  // 3 north
];

// road centerline coordinates
export const roadX = (i) => CFG.RW / 2 + i * CFG.B;
export const roadY = (j) => CFG.RW / 2 + j * CFG.B;

// lane center offset for a direction (right-hand traffic)
export function laneOffset(dir) {
  // right vector of heading = (-dy, dx); half-lane = RW/4
  const d = DIRS[dir];
  return { ox: -d.dy * CFG.RW / 4, oy: d.dx * CFG.RW / 4 };
}

export const COLORS = {
  asphalt: '#14141c',
  asphaltWet: '#191926',
  line: '#b9b47a',
  cross: '#cfcabc',
  kerb: '#2a2a38',
  sand: '#c9a86a',
  sandDark: '#b6945a',
  water: '#0d2038',
  waterLit: '#123055',
  grass: '#12331c',
  grassDark: '#0e2a16',
  path: '#4a4038',
  dock: '#23242e',
  plank: '#4a3a26',
  runway: '#1b1d24',
  tower: '#101018',
};

export const NEON = ['#ff2f7d', '#00e5ff', '#ffb200', '#8b5cf6', '#18e0b4', '#ff5c2f'];
