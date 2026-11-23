// config.js — global tuning constants for Vice Palms (deterministic build, no runtime edits)
export const CFG = {
  // world
  W: 5000, H: 4000,
  ROAD_SPACING: 340,
  ROAD_W: 60,
  LANE_OFF: 15,
  COLS: 15, ROWS: 12,
  SIDEWALK: 26,

  // zones
  OCEAN_S: 3700,          // south ocean starts (beach sand above)
  SAND_S: 3540,
  HARBOR_N: 260,          // north harbor water above this line
  DOCKS_S: 700,
  AIR_W: 4300,            // airfield x start
  PARK: { x0: 1740, y0: 1400, x1: 2740, y1: 2080 },

  // camera / view
  VIEW_W: 1280, VIEW_H: 720,
  ZOOM: 1.0,
  CAM_LERP: 6.0,
  SHAKE_MAX: 18,

  // player
  P_WALK: 150, P_SPRINT: 250,
  P_R: 11,
  P_HP: 100, P_ARMOR_MAX: 100,
  PUNCH_DMG: 24, PUNCH_RANGE: 34,
  PISTOL_DMG: 26, PISTOL_CD: 0.34,
  MAG: 12, AMMO_PICKUP: 24,

  // vehicles (speeds in units/s)
  CAR_TYPES: ['sedan', 'sport', 'taxi', 'van', 'pickup', 'coupe', 'truck', 'bus'],

  // bullets
  BULLET_SPEED: 900, BULLET_TTL: 0.6,

  // police
  WANTED_MAX: 5,
  CRUISERS_PER_STAR: 1.4,
  COP_SHOOT_CD: 1.1,
  DECAY_SEEN: 8,          // seconds out of sight per wanted drop
  ROADBLOCK_STARS: 3,
  BUST_FEE: 250, WASTED_FEE: 150,

  // missions
  MISSION_MARKER_R: 34,
  SIDE_MARKERS: true,

  // rendering
  NEON_HUE: [' #ff5da2', '#00e5ff', '#ffd166', '#8cff5d', '#c77dff'],
  SKY_NIGHT: '#07070d',
  FLASH_DECAY: 2.4,

  // audio
  AUDIO_ON: true,

  // physics
  DT_MAX: 1 / 30,
  FIXDT: 1 / 60,

  // save
  SAVE_KEY: 'vicepalms.save.v2',

  // shots
  SHOT_PARAMS: ['start', 'play', 'end', 'chaos'],
};

export const COLORS = {
  road: '#14141c',
  roadLine: '#3c3c50',
  sidewalk: '#23232f',
  block: '#1a1a26',
  water: '#0a1626',
  waterLit: '#0d1f38',
  sand: '#8a7a52',
  sandLit: '#9c8a5e',
  park: '#17301c',
  parkLit: '#1d4025',
  dock: '#20202c',
  asphalt2: '#101018',
  neon: { pink: '#ff5da2', cyan: '#00e5ff', gold: '#ffd166', lime: '#8cff5d', violet: '#c77dff', red: '#ff4a4a' },
  building: ['#1c1b26', '#201f2e', '#241f30', '#1b212c', '#26222f'],
};
