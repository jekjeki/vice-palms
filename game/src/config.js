// VICE PALMS — config.js
// Central tuning constants. Everything deterministic; no libraries, no network.

export const CFG = {
  // view
  VIEW_W: 1280,
  VIEW_H: 720,
  FPS_CAP: 60,
  MAX_DT: 1 / 20,

  // world size
  WORLD_W: 5200,
  WORLD_H: 3800,

  // roads
  ROAD_HALF: 60,        // half width of a road
  LANE_OFF: 15,         // lane center offset from road centerline
  SIDEWALK: 26,         // sidewalk band width
  DASH_LEN: 26,
  DASH_GAP: 30,

  // player
  WALK_SPEED: 168,
  SPRINT_SPEED: 262,
  PLAYER_R: 11,
  PLAYER_HP: 100,
  PLAYER_ARMOR: 0,
  START_MONEY: 250,
  START_AMMO: 48,
  AMMO_MAX: 240,
  PISTOL_DMG: 26,
  PISTOL_CD: 0.26,
  FIST_DMG: 12,
  FIST_CD: 0.4,
  FIST_RANGE: 34,
  PISTOL_RANGE: 560,
  ENTER_RANGE: 95,
  RESPAWN_HOSPITAL_FEE: 100,
  RESPAWN_BUSTED_FEE: 150,

  // cars
  CAR_START_HP: 100,
  SMOKE_HP: 45,
  FIRE_HP: 18,
  CAR_BURN_TIME: 5.5,      // seconds from fire to explosion
  EXPLOSION_R: 150,
  EXPLOSION_DMG: 65,
  CAR_PICK_R: 150,         // radius a car wreck blocks mission fail checks etc.

  // traffic
  TRAFFIC_N: 26,
  TRAFFIC_SPEED: 150,
  TRAFFIC_TURN_CHANCE: 0.28,
  LIGHT_CYCLE: 7.0,
  LIGHT_AMBER: 1.2,

  // peds
  PED_N: 34,
  PED_WALK: 62,
  PED_RUN: 205,
  PED_HP: 40,

  // police
  WANTED_MAX: 5,
  HEAT_DECAY: 0.1,        // stars per second out of sight
  OUT_OF_SIGHT_T: 9,      // seconds without contact before decay starts
  CRUISER_SPEED: 320,
  ROADBLOCK_STARS: 3,
  COP_SHOOT_CD: 1.15,
  COP_BULLET_DMG: 9,
  COP_SHOTGUN_STARS: 4,   // 4+ stars cops carry heavier guns

  // bullets
  BULLET_SPEED: 900,
  BULLET_TTL: 0.65,

  // camera
  CAM_LOOK: 0.42,         // lookahead fraction of velocity
  CAM_ZOOM_FOOT: 1.0,
  CAM_ZOOM_CAR: 0.86,
  SHAKE_DECAY: 3.4,

  // missions
  MARKER_R: 42,
  MARKER_R2: 30,

  // palette
  SKY: '#0a0e22',
  ASPHALT: '#1b1c22',
  ROAD: '#23242b',
  SIDEWALK_COL: '#3a3b42',
  LANE: '#d8c84a',
  WATER: '#0b2f4f',
  WATER_HI: '#14496f',
  SAND: '#6f5d38',
  GRASS: '#153521',
  GRASS_HI: '#1d4530',
  BUILD_BASE: '#232430',
  ROOF: '#2c2e3c',
  NEON: ['#ff2d78', '#00e5ff', '#ffd24a', '#7cff4f', '#b46bff', '#ff7a1a', '#ff4d4d', '#38f8c8'],
  CAR_COLORS: ['#b8bcc8', '#7c8494', '#5a6272', '#8a3b46', '#2f5f8a', '#2f7a4f', '#c8a23c', '#5a3b8a', '#c85a2f', '#8a2f5f'],
  TAXI_COL: '#e8b426',
  POLICE_COL: '#1c2a52',
  POLICE_STRIPE: '#e8e8f0',

  // save
  SAVE_KEY: 'vicepalms.save.v1',

  // urls
  DEFAULT_PORT: 8080,
};
