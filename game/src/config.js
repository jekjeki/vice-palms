// config.js — Vice Palms: global tuning constants + shared context holder.
// All modules import CFG for numbers and ctx for cross-references that the
// Game object wires up at construction time.

export const VERSION = '3.0.0';

export const CFG = {
  // ---- map geometry -------------------------------------------------------
  map: 6400,               // square world size
  roadEvery: 800,          // grid spacing between road centerlines
  roadHalf: 45,            // half width of a road
  sidewalk: 22,            // sidewalk band width around blocks
  laneOff: 13,             // lane centerline offset from road center
  waterTop: 350,           // y above which is ocean (north / docks)
  waterBottom: 6050,       // y below which is ocean (south / beach)
  beachTop: 5650,          // y above which sand starts

  // ---- named districts ----------------------------------------------------
  park:     { x0: 2400, y0: 3200, x1: 3200, y1: 4000 },
  airfield: { x0: 0,    y0: 1600, x1: 1600, y1: 3200 },
  docks:    { x0: 3200, y0: 0,    x1: 6400, y1: 1600 },
  downtown: { x0: 2400, y0: 800,  x1: 4800, y1: 3200 },

  // ---- player -------------------------------------------------------------
  playerWalk: 150,
  playerSprint: 268,
  playerRadius: 11,
  playerMaxHealth: 100,
  playerMaxArmor: 100,
  startMoney: 250,
  startAmmo: 16,
  pistolRange: 640,
  pistolCooldown: 0.34,
  pistolDamage: 26,
  meleeRange: 36,
  meleeCooldown: 0.45,
  meleeDamage: 16,

  // ---- carjack / vehicles -------------------------------------------------
  jackRange: 78,
  exitSpeed: 140,          // max speed at which you may hop out

  // ---- wanted system ------------------------------------------------------
  crimeBump: 1.0,          // heat added per minor crime unit
  heatLevels: [0, 1, 4, 9, 16, 26],   // heat needed for stars 0..5
  copSpawnInterval: 2.4,
  maxCruisers: 7,
  decayBase: 9,            // seconds out-of-sight before a star drops
  roadblockLevel: 3,
  roadblockCooldown: 22,
  bustGrabRange: 34,
  bustGrabTime: 0.8,
  bustCarStopTime: 2.6,

  // ---- fees ---------------------------------------------------------------
  wastedFee: 200,
  bustedFee: 300,

  // ---- camera -------------------------------------------------------------
  zoomFoot: 1.18,
  zoomCar: 0.98,
  zoomFast: 0.86,
  camLead: 0.55,           // fraction of velocity used as look-ahead

  // ---- simulation ---------------------------------------------------------
  dtMax: 0.05,
  trafficTarget: 22,       // civilian cars near the camera
  pedTarget: 22,
  pedRadius: 26,           // despawn radius multiplier (x1000 units)
  fxMax: 520,

  // ---- render -------------------------------------------------------------
  viewW: 1280,
  viewH: 720,
  minimapSize: 148,
  minimapScale: 0.085,     // world->minimap px

  // ---- palette ------------------------------------------------------------
  colors: {
    water:      '#0b2233',
    waterDeep:  '#061626',
    sand:       '#c8a56b',
    sandWet:    '#b08f56',
    grass:      '#17301f',
    grassDark:  '#122618',
    asphalt:    '#191b21',
    asphaltWet: '#20242e',
    line:       '#c9b23c',
    lineWhite:  '#b9bcc4',
    sidewalk:   '#2b2e38',
    lot:        '#23252d',
    building:   '#15161c',
    building2:  '#1b1d25',
    roof:       '#262a35',
    neonCyan:   '#37e0f0',
    neonPink:   '#f05ec8',
    neonViolet: '#a06bf5',
    neonGold:   '#f5c04a',
    neonGreen:  '#4ae88a',
    neonRed:    '#ff5560',
    palmTrunk:  '#4a3826',
    palmLeaf:   '#2f7a3d',
  },

  // neon sign colors used per-building (picked deterministically)
  neons: ['#37e0f0', '#f05ec8', '#a06bf5', '#f5c04a', '#4ae88a', '#ff5560'],
};

// Shared context — filled once by Game (game.js) before the first update.
// Modules read ctx.<thing> lazily inside their methods, never at import time.
export const ctx = {
  S: null,          // game state object
  world: null,      // built world
  game: null,       // the Game instance
  audio: null,      // AudioSys
  player: null,     // Player
  cars: null,       // all Car instances (traffic + parked + mission)
  peds: null,       // Peds manager
  police: null,     // Police manager
  missions: null,   // Missions manager
  renderer: null,   // Renderer
  // function hooks (assigned by game.js):
  explodeAt: null,   // (x, y, power)
  subtitle: null,    // (text, dur)
  crime: null,       // (units, x, y)
  sfx: null,         // (name, x, y) positional-ish sound
};
