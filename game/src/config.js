// Merapi Sky Run — every tuning number and colour in one place.
// The world is metres; the screen is a 1280x720 logical area the renderer scales.
export const VIEW = { width: 1280, height: 720, panelHeight: 148 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Sea level, in metres. Terrain below this is water. */
export const SEA_LEVEL = 0;

/** Golden-hour sun: azimuth (compass degrees, 270 = west) and elevation above the horizon. */
export const SUN = { azimuthDeg: 268, elevationDeg: 9 };

/** Where the sun sits for the sunset screenshot (lower, warmer). */
export const SUNSET = { azimuthDeg: 262, elevationDeg: 4 };

export const PLANE = {
  /** Top speed at full throttle, level flight, clean. */
  maxSpeed: 96,
  /** Stall speed, clean / with flaps. */
  stallClean: 30,
  stallFlaps: 23,
  /** How fast speed chases its target (per second). */
  speedResponse: 0.55,
  /** Pitch authority, degrees per second of stick. */
  pitchRate: 42,
  /** Roll authority, degrees per second of stick. */
  rollRate: 95,
  /** Pitch limits, degrees. */
  pitchMin: -28,
  pitchMax: 24,
  /** Roll limit, degrees (bank). */
  rollMax: 68,
  /** Climb costs speed; a dive gains it. Speed change per second per degree of pitch. */
  pitchSpeed: 0.55,
  /** Sink rate when stalled, m/s. */
  stallSink: 14,
  /** Fuel: percent at start, drain per second at full throttle. */
  fuelStart: 100,
  fuelDrain: 0.32,
  /** Fuel a ring gives back. */
  ringFuel: 5,
  /** Landing window: vertical speed and speed limits for a good touchdown. */
  landMaxSink: 4.5,
  landMinSpeed: 24,
  landMaxSpeed: 58,
};

export const RINGS = {
  count: 10,
  /** Ring radius, metres. */
  radius: 26,
  /** Points per ring. */
  points: 100,
};

export const SCORE = {
  ring: 100,
  /** Landing bonus, scaled by remaining fuel. */
  landingBase: 500,
  /** Seconds under par for the time bonus (par 240 s). */
  parSeconds: 240,
  timeBonusPerSecond: 5,
};

export const PALETTE = {
  skyTop: '#2b3a6e',
  skyMid: '#7a5a8c',
  skyLow: '#e8803c',
  sunCore: '#fff3c4',
  sunGlow: 'rgba(255, 176, 84, 0.55)',
  seaDeep: '#173f5f',
  seaShallow: '#2a7a8c',
  seaGlitter: 'rgba(255, 214, 130, 0.85)',
  sand: '#d9b380',
  grassLow: '#4d7a3a',
  grassHigh: '#6d8f43',
  jungle: '#2f5d2a',
  rock: '#6e5a4e',
  volcano: '#5a453e',
  crater: '#8a3b22',
  asphalt: '#2e3238',
  runwayMark: '#f2f2e8',
  panel: '#171a20',
  panelEdge: '#3a3f4a',
  gaugeFace: '#101318',
  gaugeRing: '#c8ccd4',
  needle: '#ff5a3c',
  text: '#eef1f5',
  muted: '#9aa1ad',
  amber: '#ffb13c',
  green: '#57d977',
  red: '#ff5340',
  ring: '#ffd23c',
  ringGlow: 'rgba(255, 210, 60, 0.6)',
  planeBody: '#e8542f',
  planeWing: '#f2ede2',
  planeTrim: '#1f6fb2',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"SF Mono", ui-monospace, Menlo, Consolas, monospace';

/** localStorage key for the best score (this browser only). */
export const BEST_KEY = 'merapi-sky-run.best';
