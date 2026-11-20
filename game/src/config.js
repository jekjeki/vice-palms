// Central constants for Vice Palms: world geometry, tuning and the palette the city is painted
// with. Everything else reads from here so the night look stays coherent across modules.

export const BLOCKS = 40;            // blocks per side of the coastal grid
export const ROAD_W = 90;            // road width along every grid line
export const PITCH = 420;            // block pitch: PITCH - ROAD_W = 330 of building land
export const BLOCK_LAND = PITCH - ROAD_W;
export const SIDEWALK = 26;          // sidewalk band around each block's edge
export const WORLD = BLOCKS * PITCH; // world square side
export const BEACH_W = 520;          // sand strip along the east edge
export const SEA_W = 1600;           // water beyond the sand
export const WORLD_W = WORLD + BEACH_W + SEA_W; // full canvas width of the world

// Night palette. The light map multiplies the scene, so base colours are drawn slightly bright.
export const NIGHT = {
  ambient: [122, 124, 162],          // the unlit night colour of the light map
  sky: '#0d1022',
  asphalt: '#26282f',
  asphaltSide: '#2c2e36',
  line: '#b9b48a',
  sidewalk: '#3a3d49',
  curb: '#4a4e5e',
  grass: '#1e3a26',
  sand: '#b3925f',
  water: '#0e2033',
  waterGlow: '#173a54',
  roof: '#3a3f4c',
  wall: '#454257',
  neonPink: '#ff3fa4',
  neonCyan: '#33e7ff',
  neonAmber: '#ffb037',
  neonLime: '#a4ff4f',
  neonViolet: '#b26bff',
};

export const LIGHT_CYCLE = 9.0;      // seconds for one traffic-light phase
export const LANE = 22;              // lane centre offset from the road centre line

export const WALK_SPEED = 120;
export const SPRINT_SPEED = 205;
export const PED_WALK = 55;

export const COP_SHOOT_RANGE = 420;
export const STAR_DECAY_TIME = 14;   // seconds out of sight before one star decays

// The eight player-stealable vehicle types plus the police cruiser. Stats are arcade-first.
export const VEHICLES = [
  { id: 'palmetto',  name: 'Palmetto',   len: 84,  wid: 40, top: 320, accel: 210, grip: 0.86, turn: 2.5, color: '#c94f4f', hp: 100 },
  { id: 'vespera',   name: 'Vespera',    len: 78,  wid: 38, top: 360, accel: 250, grip: 0.90, turn: 2.8, color: '#3fb7d9', hp: 90 },
  { id: 'tempest',   name: 'Tempest GT', len: 82,  wid: 38, top: 430, accel: 330, grip: 0.82, turn: 2.9, color: '#ffb037', hp: 85 },
  { id: 'haulmax',   name: 'Haulmax',    len: 108, wid: 48, top: 250, accel: 150, grip: 0.92, turn: 1.9, color: '#7d8a6b', hp: 160 },
  { id: 'coachline', name: 'Coachline',  len: 118, wid: 50, top: 235, accel: 140, grip: 0.93, turn: 1.7, color: '#cfc6b8', hp: 170 },
  { id: 'coralcab',  name: 'Coral Cab',  len: 86,  wid: 42, top: 310, accel: 200, grip: 0.87, turn: 2.4, color: '#f4d24f', hp: 110 },
  { id: 'pico',      name: 'Pico',       len: 64,  wid: 34, top: 270, accel: 180, grip: 0.94, turn: 3.1, color: '#9ae07a', hp: 80 },
  { id: 'bruiser',   name: 'Bruiser',    len: 92,  wid: 44, top: 380, accel: 260, grip: 0.78, turn: 2.3, color: '#7a4fc9', hp: 130 },
];

export const POLICE_CAR = { id: 'interceptor', name: 'Interceptor', len: 90, wid: 42, top: 400, accel: 290, grip: 0.88, turn: 2.7, color: '#e8eaf0', hp: 140 };

export const SAVE_KEY = 'vice-palms-save-v1';

export const STEP = 1 / 60;
