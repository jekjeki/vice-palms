// VICE PALMS — global tuning constants. Everything gameplay-visible lives here.

export const CFG = {
  VIEW_W: 1280,
  VIEW_H: 720,
  WORLD_W: 4200,
  WORLD_H: 3260,

  // road grid
  ROAD_XS: [160, 640, 1120, 1600, 2080, 2560, 3040, 3520, 4000],
  ROAD_YS: [160, 640, 1120, 1600, 2080, 2560, 3040],
  ROAD_HALF: 46,          // half width of a road (asphalt)
  SIDEWALK: 26,           // sidewalk band each side of road
  LANE_OFF: 24,           // lane center offset from road centerline

  // regions
  BEACH_Y: 2920,          // sand starts (south of this)
  WATER_TOP: 130,         // ocean north of docks
  WATER_RIGHT: 4150,      // ocean east
  WATER_BOTTOM: 3100,     // ocean south of beach sand
  DOCKS: { x0: 2500, y0: 130, x1: 4150, y1: 700 },
  AIRFIELD: { x0: 3480, y0: 1500, x1: 4150, y1: 2500 },
  PARK: { x0: 2130, y0: 1170, x1: 2510, y1: 1550 },

  // player
  P_WALK: 118,            // px/s walk
  P_RUN: 205,             // sprint
  P_HP: 100,
  P_ARMOR_MAX: 100,
  P_RADIUS: 11,
  PUNCH_DMG: 26,
  PUNCH_RANGE: 26,
  PISTOL_DMG: 34,
  PISTOL_CD: 0.38,
  PISTOL_SPEED: 640,
  PISTOL_RANGE: 480,
  START_MONEY: 250,

  // cars
  CAR_FRICTION: 1.9,      // per-second damping of forward speed
  CAR_GRIP: 7.5,          // per-second lateral velocity bleed
  CAR_DRIFT_GRIP: 1.7,    // grip while handbraking
  CAR_STEER: 2.6,         // rad/s steering authority
  CAR_HP: 100,
  CAR_EXPLODE_R: 110,
  CAR_EXPLODE_DMG: 55,

  // traffic
  TRAFFIC_MAX: 22,
  TRAFFIC_SPEED: 128,
  TRAFFIC_SPAWN_R: 1050,  // spawn beyond this from player
  TRAFFIC_DESPAWN_R: 1500,
  PED_MAX: 26,
  PED_SPAWN_R: 760,
  PED_DESPAWN_R: 1100,
  PED_SPEED: 46,
  PED_FLEE_SPEED: 132,

  // police
  STAR_DECAY_S: 7.0,      // seconds without LOS to shed one star
  COP_SPEED: 232,         // cruiser pursuit speed
  COP_SPAWN_R: 980,
  COP_MAX: 10,
  BUST_HOLD: 1.1,         // seconds a cop must hold the player on foot
  ROADBLOCK_AT: 3,        // stars needed for roadblocks

  // missions
  MARKER_R: 26,
  PICKUP_R: 22,

  // economy
  WASTED_FEE: 100,
  BUSTED_FEE: 200,

  // fx
  BULLET_LIFE: 1.1,
  SHAKE_DECAY: 5.5,

  // lights cycle
  LIGHT_CYCLE: 9.0,       // seconds per phase
};
