// Vice Palms — global configuration and shared constants.
// All world coordinates live in a 6400x6400 px night city; roads form a 400 px grid.

export const VIEW_W = 1280;
export const VIEW_H = 720;

export const WORLD = 6400;

// Road centerline coordinates: 16 per axis, 200 .. 6200.
export const ROADS = [];
for (let i = 0; i < 16; i++) ROADS.push(200 + i * 400);

export const ROAD_W = 88;          // full asphalt width of a road
export const LANE = 22;            // lane offset from the centerline
export const SIDEWALK = 20;        // sidewalk band around each block
export const BORDER_MIN = 70;      // playable clamp
export const BORDER_MAX = WORLD - 70;

// Districts (by block index on the 15x15 block grid).
export const DIST = {
  docksRows: 2,          // blocks j <= docksRows are the NORTH DOCKS
  beachCols: 0,          // blocks i == beachCols are the west beach
  park: [7, 7],          // park block (i, j)
  airfield: [12, 11],    // airfield occupies i >= 12 && j >= 11
  downtownMin: [4, 4],   // downtown tower zone
  downtownMax: [9, 9],
};

// Vehicle / actor physics constants.
export const PHYS = {
  grip: 9.0,             // lateral velocity damping (1/s), handbrake lowers this
  drag: 0.55,            // forward speed damping (1/s)
  carRadiusK: 0.52,      // collision circle radius = w * k
  carPairK: 0.36,        // car-car collision distance = (l1 + l2) * k
  impactMin: 110,        // speed above which impacts cause damage
  impactK: 0.12,         // damage per px/s of impact speed above impactMin
  fireHp: 18,            // hp below which the car catches fire
  smokeHp: 45,           // hp below which the engine smokes
  burnTime: 2.6,         // seconds from catching fire to exploding
  wreckTime: 9,          // seconds a burning wreck stays before it fades
};

// Player constants.
export const PLAYER = {
  walk: 122,
  sprint: 208,
  r: 9,                  // body radius
  hp: 100,
  enterDist: 58,         // how close to a car to enter / carjack
  pistolRate: 0.34,      // seconds between pistol shots
  fistRate: 0.4,
  fistRange: 30,
  fistDmg: 22,
  bulletSpeed: 980,
  bulletLife: 0.55,
  pistolDmg: 34,
};

// Police / wanted constants.
export const POLICE = {
  thresholds: [0, 1, 4, 10, 20, 34],  // heat needed for 1..5 stars
  heatMax: 44,
  decayRate: 0.55,        // heat per second while unseen
  sightRange: 720,        // cop within this range keeps heat pinned
  maxCruisers: (w) => Math.min(w + 1, 6),
  cruiserRate: 4.5,       // seconds between pursuit spawns
  roadblockAt: 3,         // wanted level for roadblocks
  roadblockRate: 22,
  copShootRate: 1.05,
  copRange: 460,
  bustDist: 30,
  bustTime: 1.1,
  wastedFee: 300,
  bustedFee: 200,
};

// Traffic / peds population targets.
export const CROWD = {
  trafficMax: 14,
  pedMax: 11,
  spawnDist: 900,
  despawnDist: 1250,
};

// Effects.
export const FX = {
  boomRadius: 130,
  boomDmg: 130,
  flashDecay: 2.3,
  shakeDecay: 5.5,
};

// Palette — synthwave night.
export const COLORS = {
  sky: '#0a0c14',
  asphalt: '#191d26',
  roadLine: '#8a8f9c',
  sidewalk: '#262b37',
  sand: '#8a744a',
  water: '#0b2740',
  waterLit: '#12405e',
  grass: '#14301f',
  dirt: '#3a3226',
  lot: '#20242e',
  buildingCols: ['#232a3d', '#2a2340', '#1f2d3a', '#2d2438', '#243044', '#2b2b47', '#1e2a3e'],
  roofCols: ['#31394f', '#3a3054', '#2c3c4c', '#41314a', '#304058', '#393957', '#2a3850'],
  neon: ['#ff2d78', '#23e6ff', '#ff9f2d', '#a8ff2d', '#b06bff', '#ffd12d'],
  headlight: 'rgba(255,236,170,',
  taillight: 'rgba(255,64,48,',
  hp: '#ff4d6d',
  armor: '#4db8ff',
  money: '#7dffa8',
  gold: '#ffd12d',
  cop: '#2b4a8f',
  copLight: '#4d7bff',
};

// Weapons: fists + three guns. rate = seconds between shots.
export const WEAPONS = [
  { id: 0, name: 'FISTS', rate: 0.4, dmg: 22, range: 30, pellets: 1, spread: 0, auto: false, melee: true },
  { id: 1, name: 'PISTOL', rate: 0.34, dmg: 34, range: 0.55, pellets: 1, spread: 0.05, auto: false },
  { id: 2, name: 'SMG', rate: 0.09, dmg: 16, range: 0.38, pellets: 1, spread: 0.13, auto: true },
  { id: 3, name: 'SHOTGUN', rate: 0.82, dmg: 13, range: 0.24, pellets: 6, spread: 0.26, auto: false },
];

export const SHOPS = {
  sprayPrice: 100,
  smgPrice: 250,
  shotgunPrice: 420,
  smgAmmoPrice: 150,
  armorPrice: 150,
  healthPrice: 80,
};

// Rain cycle (seconds per phase before rolling to the next).
export const WEATHER = {
  phases: ['clear', 'drizzle', 'storm', 'drizzle'],
  durations: [95, 55, 65, 55],
  gripLoss: 0.18,          // grip multiplier = 1 - intensity * gripLoss
  thunderRate: 0.05,       // chance per second during a storm
};

// Palm Metro: an elevated ring line around the inner city.
export const TRAIN = {
  ring: [1, 14],           // road indices bounding the ring
  offset: 30,              // rail offset from road centerline
  speed: 240,
  stationPause: 5,
  segments: 4,
  segLength: 66,
};

// Police helicopter (4+ stars).
export const HELI = {
  hp: 130,
  speed: 320,
  lightR: 120,
  heatRate: 0.16,          // heat per second while the player is caught in the light
  burstRate: 2.3,          // seconds between door-gun bursts at 5 stars
  respawnDelay: 26,
};

// Keyboard bindings (KeyboardEvent.code).
export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  enter: ['KeyF'],
  shoot: ['Space', 'KeyJ'],
  handbrake: ['Space'],
  weapon: ['KeyQ'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter'],
  mute: ['KeyM'],
  radio: ['KeyN'],
  map: ['Tab'],
};

// Save data.
export const SAVE_KEY = 'vicepalms.v3';
