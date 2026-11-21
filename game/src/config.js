// Vice Palms tuning: the coastal grid, the night palette, the vehicle roster and every knob
// the simulation reads. Modules treat this file as the single source of world geometry so the
// generator, the renderer and the HUD can never disagree about sizes.

export const GRID = 40;               // blocks per side of the street grid
export const PITCH = 420;             // distance between two road centrelines
export const ROAD = 90;               // full width of every street
export const WALK = 26;               // sidewalk band painted inside each block edge
export const SPAN = GRID * PITCH;     // side of the buildable city square
export const SAND = 520;              // beach depth east of the last street
export const OCEAN = 1600;            // water painted beyond the sand
export const WORLD_W = SPAN + SAND + OCEAN;

// The night is dark blue, but not black — the light pass multiplies these tones over the scene
// while emissives (neon, windows, headlights) are painted at full strength underneath.
export const LIGHT = {
  ambient: [110, 114, 154],
  sky: '#0b0e1e',
  asphalt: '#25272e',
  asphaltJoint: '#2b2d35',
  paint: '#c9c39a',
  sidewalk: '#383b47',
  paving: '#2f323d',
  curb: '#4b4f60',
  grass: '#1c3524',
  sand: '#b2915e',
  sandWet: '#6f5c40',
  water: '#0d1e31',
  foam: 'rgba(140,190,225,0.20)',
  roofTrim: 'rgba(255,255,255,0.07)',
};

// Neon catalogue: sign text + the colour its tube burns. The generator mixes these freely.
export const NEON = [
  ['#ff3fa4', 'CLUB RIVIERA'],
  ['#33e7ff', 'OASIS GRILL'],
  ['#ffc042', 'CASA LUNA'],
  ['#b8ff5e', 'NEON TIDE'],
  ['#a86bff', 'BLUE IGUANA'],
  ['#33e7ff', 'STARLITE ROOMS'],
  ['#ff7a3c', 'GATOR BAR'],
  ['#ff3fa4', 'FLAMINGO LIDO'],
  ['#7bffd4', 'THE GROTTO'],
  ['#ffc042', '24H PAWN'],
  ['#a86bff', 'VELVET ROOM'],
  ['#33e7ff', 'LA SIRENA'],
  ['#b8ff5e', 'ROXY ARCADE'],
  ['#ff3fa4', 'CABANA CLUB'],
  ['#7bffd4', 'TIDE POOL'],
  ['#ff7a3c', 'GOLD COAST GYM'],
  ['#33e7ff', 'MARINA SEVEN'],
  ['#ffc042', 'CORAL DINER'],
  ['#a86bff', 'HAVANA RUM'],
  ['#b8ff5e', 'ZIP LAUNDRY'],
  ['#ff3fa4', 'NIGHT MARKET'],
  ['#7bffd4', 'SEAFOAM SPA'],
  ['#33e7ff', 'PALM & PISTOL'],
  ['#ff7a3c', 'EL FARO MOTEL'],
];

export const CYCLE = 9;         // seconds per traffic-light phase
export const LANE = 22;         // lane centre offset from a road centreline
export const STOP_GAP = 30;     // distance a queued car keeps from the stop line

export const WALK_SPEED = 122;
export const SPRINT_SPEED = 208;
export const PED_SPEED = 56;

export const COP_RANGE = 430;   // cops open fire inside this range at 3+ stars
export const DECAY_SECS = 14;   // seconds unseen before one wanted star decays

// Ten stealable models plus the police cruiser. Arcade stats first, realism never.
export const CARS = [
  { id: 'flamingo',  name: 'Flamingo',   len: 82, wid: 38, top: 330, accel: 220, grip: 0.87, turn: 2.6, hp: 100, tone: '#e0487a', trim: '#ffd9ec' },
  { id: 'vanta',     name: 'Vanta GT',   len: 80, wid: 38, top: 445, accel: 340, grip: 0.83, turn: 2.95, hp: 88,  tone: '#19c6d8', trim: '#c9f6ff' },
  { id: 'guava',     name: 'Guava',      len: 64, wid: 33, top: 272, accel: 185, grip: 0.93, turn: 3.2, hp: 78,  tone: '#9ade6a', trim: '#eaffd6' },
  { id: 'cabana',    name: 'Cabana Cab', len: 88, wid: 42, top: 312, accel: 205, grip: 0.88, turn: 2.45, hp: 112, tone: '#f2cf47', trim: '#20242c' },
  { id: 'ripcurrent', name: 'Ripcurrent', len: 98, wid: 46, top: 292, accel: 190, grip: 0.90, turn: 2.2, hp: 150, tone: '#c8b48c', trim: '#6f6350' },
  { id: 'roadmaster', name: 'Roadmaster', len: 92, wid: 44, top: 388, accel: 268, grip: 0.80, turn: 2.35, hp: 132, tone: '#f07a2e', trim: '#ffd9b0' },
  { id: 'steelhead', name: 'Steelhead',  len: 106, wid: 48, top: 252, accel: 155, grip: 0.92, turn: 1.95, hp: 168, tone: '#77845f', trim: '#3d4433' },
  { id: 'tramline',  name: 'Tramline',   len: 120, wid: 52, top: 236, accel: 138, grip: 0.94, turn: 1.7, hp: 178, tone: '#d8d2c4', trim: '#4a90b8' },
  { id: 'lagoon',    name: 'Lagoon',     len: 86, wid: 40, top: 322, accel: 215, grip: 0.86, turn: 2.55, hp: 104, tone: '#4fa3d9', trim: '#d5ecff' },
  { id: 'howler',    name: 'Howler',     len: 90, wid: 43, top: 396, accel: 272, grip: 0.79, turn: 2.4, hp: 126, tone: '#8a5cd6', trim: '#e2d2ff' },
];

export const WARDEN = { id: 'warden', name: 'Warden', len: 92, wid: 42, top: 412, accel: 295, grip: 0.88, turn: 2.75, hp: 142, tone: '#e9ecf4', trim: '#1c2c54' };

export const SAVE_KEY = 'vicepalms.save.2';
export const STEP = 1 / 60;
