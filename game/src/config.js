// config.js — every tunable constant for Vice Palms lives here.
// Values are px units unless the name says otherwise (tiles, seconds, dollars).

export const CFG = {
  // ---- world scale -------------------------------------------------------
  T: 32,                 // tile size px
  WT: 160,               // world width in tiles
  HT: 160,               // world height in tiles
  get W() { return this.WT * this.T; },
  get H() { return this.HT * this.T; },

  // ---- grid layout -------------------------------------------------------
  // Roads occupy two tiles: a vertical road at column c covers c and c+1.
  ROAD_A: 6,             // first road column/row inside a 16-tile superblock
  ROAD_B: 14,            // second road column/row
  SUPER: 16,             // superblock period in tiles

  // ---- districts (tile coords, inclusive-exclusive) -----------------------
  DOCKS: { x0: 0, y0: 0, x1: 96, y1: 20 },        // north piers + container yard
  AIRFIELD: { x0: 128, y0: 64, x1: 160, y1: 112 },// east military strip
  PARK: { x0: 64, y0: 96, x1: 96, y1: 128 },      // Flamingo Park
  BEACH: { y0: 144, y1: 152 },                    // sand band in the south
  WATER_S: { y0: 152, y1: 160 },                  // ocean south of the beach

  // ---- view / camera -----------------------------------------------------
  VIEW_W: 1280,
  VIEW_H: 720,
  CAM_LERP: 5.0,         // camera follow stiffness (1/s)
  CAM_SHAKE_DECAY: 6.0,
  ZOOM: 1.0,

  // ---- player ------------------------------------------------------------
  PLAYER_R: 10,
  WALK_SPEED: 92,
  SPRINT_MULT: 1.62,
  PLAYER_HP: 100,
  PLAYER_ARMOR_MAX: 100,
  PUNCH_RANGE: 22,
  PUNCH_DMG: 26,
  PUNCH_COOLDOWN: 0.42,
  GUN_RANGE: 560,
  GUN_DMG: 9,            // per bullet vs peds/cops
  GUN_DMG_CAR: 7,
  GUN_COOLDOWN: 0.32,
  GUN_SPEED: 900,
  AMMO_START: 24,
  AMMO_MAX: 240,
  CARJACK_RANGE: 52,
  ENTER_RANGE: 56,
  EXIT_OFFSET: 26,

  // ---- cars --------------------------------------------------------------
  CAR_RADIUS: 15,        // collision circle radius
  CAR_DRAG: 1.9,
  BRAKE_FORCE: 520,
  HANDBRAKE_GRIP: 0.22,  // fraction of normal grip during handbrake
  STEER_RATE: 2.6,       // rad/s at full lock at mid speed
  CAR_HP: 100,
  CAR_FIRE_HP: 22,       // below this the car catches fire
  BURN_RATE: 9,          // hp/s while on fire
  BOOM_DMG: 65,          // to cars inside the blast
  BOOM_DMG_PED: 100,
  BOOM_RADIUS: 92,
  TRAFFIC_COUNT: 14,
  TRAFFIC_SPEED: 118,    // cruise px/s

  // ---- police ------------------------------------------------------------
  HEAT_MAX: 200,
  STAR_TABLE: [10, 30, 60, 100, 160, 200], // heat needed for stars 1..5
  HEAT_JACK: 14,
  HEAT_PED: 16,
  HEAT_COP: 34,
  HEAT_BOOM: 26,
  HEAT_RUN_PED: 22,
  HEAT_DECAY: 9,         // heat/s while fully unseen
  UNSEEN_TIME: 5.0,      // seconds unseen before decay kicks in
  COP_SHOOT_RANGE: 330,
  COP_SHOOT_CD: 0.85,
  BUST_TIME: 0.9,        // seconds of cop contact to get busted
  ROADBLOCK_STARS: 3,
  CRUISER_MAX: [0, 1, 2, 3, 4, 6], // per star level
  SPAWN_COOLDOWN: 4.0,

  // ---- peds --------------------------------------------------------------
  PED_COUNT: 26,
  PED_SPEED: 42,
  PED_FLEE_SPEED: 118,
  PED_HP: 30,

  // ---- economy -----------------------------------------------------------
  FEE_WASTED: 100,
  FEE_BUSTED: 150,
  PICKUP_CASH: 60,       // loose cash pickups

  // ---- traffic lights ----------------------------------------------------
  LIGHT_PERIOD: 8.0,
  LIGHT_YELLOW: 1.2,

  // ---- missions ----------------------------------------------------------
  MARKER_R: 30,
  MISSION_TEXT_TIME: 4.5,

  // ---- look --------------------------------------------------------------
  NIGHT: {
    sky: '#07080f',
    asphalt: '#191c23',
    asphaltEdge: '#20242e',
    sidewalk: '#262b36',
    sidewalkLine: '#2e3440',
    plaza: '#22262f',
    grass: '#12301c',
    grassDark: '#0e2617',
    sand: '#8a744a',
    sandDark: '#7a663f',
    water: '#081f38',
    waterLit: '#0a2a4a',
    runway: '#22252c',
    dockPad: '#242830',
    wall: '#181b22',
    wallLit: '#20242c',
    roof: '#12141a',
    roofLit: '#171a21',
    window: '#ffd98a',
    windowDim: '#3a3f4c',
    neonPink: '#ff4fd8',
    neonCyan: '#37f5ff',
    neonPurple: '#a45bff',
    neonGreen: '#5cff8a',
    neonOrange: '#ffab3d',
    neonRed: '#ff5c5c',
    headlight: 'rgba(255, 238, 170, 0.16)',
    taillight: 'rgba(255, 70, 70, 0.55)',
    sheen: 'rgba(140, 190, 255, 0.05)',
    star: '#ffd23d',
  },
};

/** Neon sign vocabulary used by the world generator. */
export const NEON_WORDS = [
  'PALMS', 'OCEAN', 'MALIBU', 'MOTEL', 'LIQUOR', 'DINER', 'CLUB', 'PAWN',
  'HOTEL', 'CASINO', 'TATTOO', 'BURGER', 'NOODLE', 'VINYL', 'CAFFE', 'POOL',
];

/** Where the fixed landmark actors stand (px). */
export const PLACES = {
  start: { x: 14.5 * 32, y: 118 * 32, label: 'Ocean Drive, Vice Palms' },
  hospital: { x: 37 * 32, y: 69 * 32, label: 'Mercy General' },
  policeStation: { x: 87 * 32, y: 69 * 32, label: 'VCPD Central' },
  garage: { x: 55 * 32, y: 45 * 32, label: 'Rico\u2019s Garage' },
  docksMeet: { x: 30 * 32, y: 21 * 32, label: 'Dock 4, North Piers' },
  dockYard: { x: 62 * 32, y: 10 * 32, label: 'Container Yard' },
  beachPickup: { x: 80 * 32, y: 148 * 32, label: 'Palm Beach' },
  penthouse: { x: 101 * 32, y: 53 * 32, label: 'The Coral Tower' },
  airfieldGate: { x: 133 * 32, y: 96 * 32, label: 'Palm Airfield, Gate 2' },
  airfieldTower: { x: 148 * 32, y: 86 * 32, label: 'Control Tower' },
  parkCore: { x: 80 * 32, y: 112 * 32, label: 'Flamingo Park' },
  oceanDrive: { x: 24 * 32, y: 143 * 32, label: 'Ocean Drive' },
  taxiStand: { x: 22 * 32, y: 69 * 32, label: 'Vice Taxi Co.' },
  spray1: { x: 61 * 32, y: 47 * 32, label: 'Pay \u2019n\u2019 Spray West' },
  spray2: { x: 94 * 32, y: 109 * 32, label: 'Pay \u2019n\u2019 Spray East' },
};
