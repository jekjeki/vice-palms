// ---------------------------------------------------------------------------
// config.js — global tuning for Vice Palms. Every module reads from here so
// the feel of the city can be re-balanced without hunting through the code.
// ---------------------------------------------------------------------------

export const CFG = {
  // World -------------------------------------------------------------------
  WORLD: 4096,            // square map edge in px
  ROAD_W: 90,             // full asphalt width
  LANE_OFF: 22,           // lane centre offset from road centre
  SIDEWALK: 26,           // sidewalk band painted beside roads

  // City road grid ----------------------------------------------------------
  // Vertical roads (x centres) and horizontal roads (y centres). Segments may
  // be trimmed (park gaps) — see world.js.
  CITY_VX: [440, 840, 1240, 1640, 2040, 2440, 2840, 3240, 3640],
  CITY_HY: [1480, 1880, 2280, 2680, 3080, 3480, 3880],
  HARBOR_Y: 805,          // coastal highway y centre
  HARBOR_X0: 200,
  HARBOR_X1: 3800,
  CONNECTORS: [440, 1240, 2040, 2840, 3640], // vertical roads reaching the coast road

  // Districts ---------------------------------------------------------------
  PARK: { x0: 2085, y0: 1925, x1: 2795, y1: 2635 },
  POND: { x: 2440, y: 2320, r: 95 },
  DOCKS: { x0: 140, y0: 140, x1: 2320, y1: 700 },
  AIRFIELD: { x0: 2460, y0: 140, x1: 3800, y1: 700 },
  RUNWAY: { x0: 2560, y0: 430, x1: 3720, y1: 550 },
  WATER_N: 140,           // water north of this line
  WATER_E: 3820,          // water east of this line
  SAND_N0: 140, SAND_N1: 235,
  SAND_E0: 3620,

  // Gameplay ---------------------------------------------------------------
  WALK: 152,
  SPRINT: 268,
  PED_WALK: 66,
  PED_FLEE: 196,
  PLAYER_R: 11,
  PED_R: 10,

  HEALTH_MAX: 100,
  ARMOR_MAX: 100,
  PISTOL_MAG: 0,          // ammo is a pool, not a mag
  PISTOL_CD: 0.17,
  PISTOL_DMG_PED: 40,
  PISTOL_DMG_CAR: 9,
  PISTOL_RANGE: 560,
  FIST_CD: 0.34,
  FIST_DMG: 22,
  FIST_RANGE: 34,

  CAR_HIT_DMG: 0.028,     // damage per px/s of impact speed
  EXPLODE_DMG: 140,       // max health removed at blast centre
  EXPLODE_R: 150,

  WANTED_MAX: 5,
  HEAT_PER_STAR: 30,
  HEAT_DECAY: 9,          // per second while unseen
  SIGHT_TIME: 5.5,        // seconds unseen before decay starts
  BUST_DIST: 30,
  BUST_TIME: 0.85,
  RESPAWN_FEE: 100,       // per wanted star

  TRAFFIC_TARGET: 16,     // ambient cars near the player
  PEDS_TARGET: 14,
  TRAFFIC_SPAWN_R: 1500,
  TRAFFIC_CULL_R: 1900,
  PED_SPAWN_R: 900,
  PED_CULL_R: 1200,

  SAVE_KEY: 'vicepalms.save.v1',
  MUTE_KEY: 'vicepalms.muted',

  // Camera ------------------------------------------------------------------
  ZOOM_FOOT: 1.06,
  ZOOM_CAR_MIN: 0.8,
  ZOOM_CAR_MAX: 1.02,

  // Viewport ----------------------------------------------------------------
  VIEW_W: 1280,
  VIEW_H: 720,

  // Palette (night) ----------------------------------------------------------
  COL: {
    asphalt: '#262b34',
    asphaltDark: '#22262e',
    lineY: '#c9b458',
    lineW: '#aab4c2',
    sidewalk: '#3a4252',
    sand: '#93825f',
    sandDark: '#8a7a59',
    water: '#0c2233',
    waterHi: '#1c4a6b',
    grass: '#2c5537',
    grassDark: '#275032',
    path: '#6d6354',
    dirt: '#4a4436',
    concrete: '#434a58',
    concreteDark: '#3c4250',
    building: '#1c212c',
    buildingWall: '#171c26',
    roof: '#283042',
    roof2: '#2e3748',
    ship: '#3d4757',
    neon: ['#ff4d9d', '#3fd9ff', '#ffd23e', '#8bff5e', '#c07bff', '#ff8a3d', '#ff5e5e'],
    police: '#22348c',
    taxi: '#e8b820',
    blood: '#5c1420',
    skid: '#181b20',
    wreck: '#1a1a1c',
  },
};

// Vehicle catalogue — 8 civilian types + the police cruiser. All numbers in
// px/s / px. `hue` picks a base colour that the painter tints per instance.
export const CAR_SPECS = {
  compact: { name: 'Blista', len: 36, wid: 19, accel: 300, brake: 620, max: 335, rev: 130, turn: 3.1, grip: 6.0, drift: 0.55, mass: 0.85, hp: 100, hue: ['#8a3d3d', '#3d6e8a', '#7a8a3d', '#6b4a8a', '#cfcfcf'] },
  sedan:   { name: 'Primo',  len: 44, wid: 20, accel: 290, brake: 600, max: 385, rev: 140, turn: 2.7, grip: 5.6, drift: 0.5,  mass: 1.0,  hp: 110, hue: ['#4a5a6b', '#6b4a4a', '#3d6e5a', '#8a7a4a', '#565f6e'] },
  taxi:    { name: 'Cabby',  len: 44, wid: 20, accel: 295, brake: 600, max: 380, rev: 140, turn: 2.7, grip: 5.6, drift: 0.5,  mass: 1.0,  hp: 110, hue: ['#e8b820'] },
  sports:  { name: 'Banshee',len: 45, wid: 19, accel: 400, brake: 660, max: 490, rev: 150, turn: 3.0, grip: 6.4, drift: 0.72, mass: 0.9,  hp: 95,  hue: ['#c23b4e', '#2e8ac2', '#e0e0e0'] },
  super:   { name: 'Infernus',len:47, wid: 20, accel: 450, brake: 700, max: 565, rev: 160, turn: 3.05,grip: 6.8, drift: 0.8,  mass: 0.88, hp: 90,  hue: ['#d8d8e0', '#c23b4e', '#1d1f26'] },
  van:     { name: 'Burrito',len: 48, wid: 23, accel: 225, brake: 540, max: 300, rev: 120, turn: 2.2, grip: 5.0, drift: 0.4,  mass: 1.3,  hp: 130, hue: ['#6e6e78', '#5a7a6e', '#7a5a3d'] },
  pickup:  { name: 'Bobcat', len: 46, wid: 21, accel: 250, brake: 560, max: 330, rev: 130, turn: 2.4, grip: 5.2, drift: 0.45, mass: 1.2,  hp: 120, hue: ['#6b4a2e', '#4a5a3d', '#3d4a5a'] },
  bus:     { name: 'Coach',  len: 74, wid: 25, accel: 165, brake: 480, max: 245, rev: 100, turn: 1.7, grip: 4.6, drift: 0.3,  mass: 2.2,  hp: 190, hue: ['#3d7a8a'] },
  police:  { name: 'Cruiser',len: 45, wid: 20, accel: 380, brake: 660, max: 505, rev: 150, turn: 2.9, grip: 6.2, drift: 0.6,  mass: 1.0,  hp: 115, hue: ['#22348c'] },
};

export const CAR_TYPES = Object.keys(CAR_SPECS);

// Ambient traffic mixes — weights for what spawns in the wild.
export const TRAFFIC_MIX = [
  ['compact', 3], ['sedan', 4], ['taxi', 2], ['sports', 1],
  ['van', 2], ['pickup', 2], ['bus', 1],
];

// Pickups -------------------------------------------------------------------
// Deterministic spots; types cycle. Respawn after RESPAWN seconds.
export const PICKUP_CFG = {
  RESPAWN: 45,
  COLLECT_R: 22,
  HEALTH_AMT: 50,
  ARMOR_AMT: 50,
  AMMO_AMT: 17,
  CASH_MIN: 40,
  CASH_MAX: 160,
};

// Weather -------------------------------------------------------------------
export const WEATHER_CFG = {
  // clear → drizzle → storm cycle lengths (seconds). Deterministic.
  CYCLE: [70, 55, 45],
  DROP_COUNT: [0, 140, 320],   // per intensity
  DROP_SPEED: 900,
  DROP_ANGLE: -0.32,           // radians of slant
  SPLASH_CHANCE: 0.3,
  LIGHTNING_MIN_GAP: 7,
  LIGHTNING_STORM_GAP: 2.4,
  WET_GRIP_MULT: 0.86,         // handling multiplier in rain
};

// Police helicopter (4+ stars) ----------------------------------------------
export const HELI_CFG = {
  MIN_STARS: 4,
  HEIGHT: 66,              // fake altitude px for shadow/scale
  ORBIT_R: 190,
  ORBIT_W: 0.55,           // rad/s
  BEAM_R: 120,
  SPOT_SPEED: 130,         // searchlight sweep px/s
  ROTOR_R: 74,
};
