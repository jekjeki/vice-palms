// ============================================================================
// VICE PALMS — config.js
// Every tuning knob for the night city in one place. Plain data, no logic.
// Units: 1 world unit ~= 1 meter, 1 sim tick = 1/60 s, speeds in units/s.
// ============================================================================

export const VERSION = '2.0.0-fresh';
export const SAVE_KEY = 'vice-palms-save-v2';

// --- World grid -------------------------------------------------------------
// Roads run on the lines x = i*TILE (i = 0..COLS) and y = j*TILE (j = 0..ROWS).
// A "block" is the buildable square between four roads.
export const TILE = 96;               // grid pitch (block + one road)
export const ROAD = 18;               // road width (two 4.5u lanes + shoulders)
export const LANE = ROAD / 4;         // lane centerline offset from road center
export const COLS = 13;               // block columns  (x direction)
export const ROWS = 10;               // block rows      (y direction)

export const CITY_W = COLS * TILE;              // 1248 — last vertical road x
export const CITY_H = ROWS * TILE;              // 960  — last horizontal road y
export const WATER_NORTH = 88;                  // harbor water band above y=0
export const WATER_SOUTH = 84;                  // sea band below the beach road
export const WORLD_X0 = -ROAD / 2;              // -9
export const WORLD_Y0 = -WATER_NORTH;           // -88 (harbor)
export const WORLD_X1 = CITY_W + ROAD / 2;      // 1257
export const WORLD_Y1 = CITY_H + ROAD / 2 + WATER_SOUTH; // 1051 (sea)

export const SIDEWALK = 5;            // sidewalk band inside each block edge
export const BEACH_ROW = ROWS - 1;    // block row j=9 is the beach sand row
export const DOCK_ROWS = 2;           // block rows 0..1 are the North Docks
export const AIR_COLS = [10, 11, 12]; // block columns of Palm Airfield (north-east)
export const AIR_ROWS = [0, 1, 2, 3];
export const PARK_BLOCKS = [[6, 5], [7, 5], [6, 6], [7, 6]]; // 2x2 city park

// --- Camera / screen --------------------------------------------------------
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const ZOOM_ON_FOOT = 3.4;      // screen px per world unit multiplier base
export const ZOOM_BASE = 7.2;         // px per unit at zoom 1.0
export const ZOOM_MIN = 0.86;         // zoomed out at speed
export const ZOOM_MAX = 1.06;
export const CAM_LOOKAHEAD = 0.42;    // fraction of velocity added as lookahead
export const CAM_LERP = 5.2;          // camera follow stiffness
export const SHAKE_DECAY = 5.5;

// --- Player -----------------------------------------------------------------
export const PLAYER = {
  WALK: 5.0,
  SPRINT: 8.6,
  RADIUS: 0.55,
  HP_MAX: 100,
  ARMOR_MAX: 100,
  ENTER_DIST: 3.6,
  ENTER_CD: 0.45,
  SHOOT_CD: 0.28,
  MELEE_CD: 0.5,
  MELEE_RANGE: 1.9,
  MELEE_DMG: 34,
  BULLET_SPEED: 95,
  BULLET_LIFE: 0.7,
  PISTOL_DMG_PED: 55,
  PISTOL_DMG_CAR: 9,
  REGEN_DELAY: 14,        // s after damage before slow regen
  REGEN_RATE: 2.4,        // hp/s trickle
  HURT_INVULN: 0.35,
};

// --- Wanted / police ----------------------------------------------------------
export const WANTED = {
  CRUISE_TARGET: [0, 1, 2, 3, 4, 6],   // cruisers per star level
  SPAWN_CD: 3.2,                        // s between spawn attempts
  SPAWN_DIST: 78,                       // spawn on road this far from player
  ACTIVE_DIST: 105,                     // farther than this: cops idle/despawn
  DECAY_SEEN: 12,                       // s out of sight before decay starts
  DECAY_RATE: 0.3,                      // heat units per second once decaying
  FOOT_CHASE: 30,                       // cruiser distance to drop foot cops
  BUST_RADIUS: 2.7,
  BUST_TIME: 1.1,                       // s of cop proximity to get busted
  BUST_MAX_SPEED: 2.4,                  // player slower than this is "stopped"
  SHOOT_RANGE: 26,
  SHOOT_CD: [9, 9, 1.4, 1.0, 0.8, 0.65],
  ROADBLOCK_STARS: 3,
  ROADBLOCK_CD: 9,
  RAM_BRAKE: 2,                         // stars at which cruisers ram hard
  COP_HP: 60,
  FEE_BUSTED: 150,
  FEE_WASTED: 220,
};

// --- Traffic ------------------------------------------------------------------
export const TRAFFIC = {
  MAX_CARS: 24,
  DESPAWN_DIST: 150,
  SPAWN_DIST_MIN: 55,
  SPAWN_DIST_MAX: 95,
  LIGHT_CYCLE: 7.0,      // s per phase
  LIGHT_YELLOW: 1.1,
  QUEUE_GAP: 5.2,        // brake when a car is this close ahead
  CIVILIAN_TOP: 0.62,    // fraction of type top speed civilians use
  TURN_CHANCE: 0.34,     // chance to turn at an intersection
  BRAKE_HARD: 14,        // deceleration u/s^2
};

// --- Peds ----------------------------------------------------------------------
export const PEDS = {
  MAX: 46,
  DESPAWN_DIST: 120,
  WALK: 2.3,
  RUN: 6.4,
  FLEE_TIME: 6.5,
  PANIC_RADIUS: 30,      // gunshot/explosion panic radius
  HP: 30,
};

// --- Cars physics ---------------------------------------------------------------
export const CAR_PHYS = {
  DRAG: 0.36,            // quadratic-ish drag factor /s
  ROLL: 1.1,             // rolling resistance u/s^2
  BRAKE: 22,
  GRIP: 5.4,             // lateral velocity damping per second (normal)
  GRIP_HB: 0.7,          // handbrake lateral damping (drift)
  STEER_MAX: 2.6,        // rad/s at low speed
  STEER_FADE: 15,        // steering authority fade with speed
  IMPACT_DMG: 0.9,       // damage per u/s of impact above threshold
  IMPACT_MIN: 7,
  SMOKE_HP: 42,          // health below which engine smokes
  FIRE_HP: 18,           // burning
  BURN_TIME: 4.2,        // s of burning before explosion
  EXPLODE_RADIUS: 10,
  EXPLODE_DMG: 120,
  SKID_MIN: 5.5,         // lateral speed for skid marks
};

// --- Missions / economy ----------------------------------------------------------
export const ECON = {
  START_MONEY: 350,
  HOSPITAL_FEE: 220,   // extra fee the game layers on top of WANTED fees
  PICKUP_CASH: 60,
  PICKUP_HEALTH: 35,
  PICKUP_ARMOR: 50,
  PICKUP_AMMO: 24,
};

// --- Rendering / night lighting ----------------------------------------------------
export const RENDER = {
  AMBIENT: [26, 30, 58],          // night ambient multiply color
  LIGHT_SCALE: 0.34,              // lightmap resolution scale (bloom source)
  BLOOM_ALPHA: 0.42,
  HEADLIGHT_LEN: 30,
  HEADLIGHT_SPAN: 0.42,           // cone half-angle
  STREETLIGHT_R: 15,
  NEON_R: 13,
  WET_STREAK: 0.075,              // sheen alpha on wet roads
  EXPLODE_FLASH: 0.85,
  VIGNETTE: 0.42,
};

// --- Audio -------------------------------------------------------------------------
export const AUDIO = {
  MASTER: 0.55,
  MUSIC_BPM: 104,
  ENGINE_FLOOR: 42,
  ENGINE_CEIL: 210,
  SIREN_R: 60,           // audible distance
};

// --- Sim ---------------------------------------------------------------------------
export const DT = 1 / 60;             // fixed tick
export const MAX_FRAME = 0.1;         // clamp real frame time
export const DEFAULT_SEED = 1337;

// --- Color language ------------------------------------------------------------------
export const NEON = {
  pink: '#ff3ca0',
  cyan: '#25e8ff',
  lime: '#8dff4a',
  amber: '#ffb02e',
  violet: '#a06bff',
  red: '#ff4646',
  teal: '#2effc8',
};

export const SKINS = ['#e8b48a', '#c98d62', '#8a5a3b', '#f0c8a0', '#6b4226', '#d9a06b'];
export const SHIRTS = ['#e94b4b', '#3f7fe0', '#48c264', '#e0c33f', '#c95fd0', '#eee7dc', '#2c2c38', '#ff8b3f', '#57cfc4'];
export const CAR_COLORS = ['#d8365f', '#2bb7d5', '#e0dcd2', '#22232b', '#f2a33c', '#7dc95e', '#c04be0', '#8b1e1e', '#3d5fc2', '#d5c74e'];

// --- Weapons -------------------------------------------------------------------------
export const WEAPONS = [
  { id: 'fists',  name: 'FISTS',  melee: true,  auto: false },
  { id: 'pistol', name: 'PISTOL', melee: false, auto: false },
];

// --- Police helicopter (4+ stars) ------------------------------------------------------
export const HELI = {
  STARS: 4,
  HEIGHT: 26,          // visual altitude offset (parallax units)
  SPEED: 30,           // chase speed u/s
  LIGHT_R: 17,         // searchlight radius on the ground
  ROTOR: 0.6,          // rotor sfx volume
  OFFSET_WOBBLE: 6,    // searchlight wander amplitude
};

// --- Weather (rolled per seed) ------------------------------------------------------------
export const WEATHER = {
  // night fog veil alpha over the scene; wet sheen multiplier
  TYPES: [
    { id: 'clear', fog: 0.0, wet: 1.0 },
    { id: 'humid', fog: 0.16, wet: 1.15 },
    { id: 'sea-fog', fog: 0.3, wet: 0.8 },
    { id: 'storm', fog: 0.12, wet: 1.7 },
  ],
};

// --- Garage (repair & respray) --------------------------------------------------------------
export const GARAGE = {
  FEE: 300,             // repair + clear wanted
  RADIUS: 7,
  COOLDOWN: 6,
};

// --- Radio stations (bassline seeds per station) ----------------------------------------------
export const RADIO = [
  { id: 'neon-fm', name: 'NEON FM', pattern: 0 },
  { id: 'palm-waves', name: 'PALM WAVES 103.5', pattern: 1 },
  { id: 'night-drive', name: 'NIGHT DRIVE RADIO', pattern: 2 },
];

// --- Achievements (one-shot toasts) -------------------------------------------------------------
export const ACHIEVEMENTS = [
  { id: 'first-car', text: 'FIRST RIDE — YOU JACKED YOUR FIRST CAR' },
  { id: 'first-star', text: 'HEAT — THE VCPD KNOWS YOUR FACE' },
  { id: 'first-boom', text: 'PYROMANIST — FIRST CAR EXPLOSION' },
  { id: 'speed-120', text: '120 CLUB — THE STREETS BELONG TO YOU' },
  { id: 'mission-1', text: 'MADE MAN — FIRST MISSION PASSED' },
];
