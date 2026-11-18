// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size. The
// dungeon itself is bigger than the screen: a camera follows the player through it.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** One dungeon tile, in pixels. */
export const TILE = 32;

/** The dungeon grid, in tiles. Floor 5's arena is carved inside the same grid. */
export const GRID = { width: 56, height: 36 };

export const FLOOR_COUNT = 5;

export const FLOOR_NAMES = [
  'The Ember Gate',
  'The Ashen Halls',
  'The Cinder Warrens',
  'The Deep Forge',
  'The Ember Throne',
];

export const PLAYER = {
  radius: 13,
  speed: 245,
  maxHp: 100,
  swordDamage: 20,
  swordRange: 82,
  /** Half the sword's arc, in radians: a swing covers about 100 degrees. */
  swordArc: 0.9,
  swordCooldown: 0.34,
  swordTime: 0.18,
  dashSpeed: 820,
  dashTime: 0.16,
  dashCooldown: 1.1,
  boltDamage: 16,
  boltSpeed: 560,
  boltCooldown: 0.9,
  boltRange: 520,
  maxEmber: 3,
  emberRecharge: 4,
  /** Seconds of mercy after any hit. */
  invulnerable: 0.9,
  /** Knockback the sword deals, in pixels per second. */
  knockback: 320,
};

export const ENEMIES = {
  bat: { hp: 20, speed: 152, damage: 8, radius: 11, score: 50, gold: 12 },
  hound: { hp: 36, speed: 188, damage: 12, radius: 13, score: 80, gold: 20 },
  golem: { hp: 95, speed: 80, damage: 20, radius: 19, score: 150, gold: 35 },
};

/** Per-floor growth: each floor past the first adds this much enemy health and damage. */
export const FLOOR_SCALING = { hp: 0.22, damage: 0.12, speed: 0.03 };

/** How many monsters a floor holds: a base count plus this many per floor past the first. */
export const SPAWN = { base: 6, perFloor: 3 };

export const BOSS = {
  name: 'The Ember King',
  hp: 430,
  speed: 118,
  damage: 18,
  radius: 30,
  score: 1000,
  burstCount: 10,
  burstSpeed: 250,
  fireballDamage: 12,
  summonMax: 5,
};

export const GOLD = { pileMin: 10, pileMax: 26, scoreEach: 2 };

export const PALETTE = {
  backdrop: '#0a0705',
  floorA: '#241a12',
  floorB: '#2a1f15',
  floorCrack: '#17100a',
  wallTop: '#4a3421',
  wallFace: '#2b1d10',
  wallEdge: '#120c06',
  gold: '#f2b23e',
  ember: '#ff7a2f',
  flame: '#ffb347',
  deepEmber: '#e5532a',
  player: '#ffd166',
  playerTrim: '#fff3d6',
  bat: '#9a8fd0',
  hound: '#c46a3d',
  golem: '#7a6a55',
  boss: '#ff5a2a',
  text: '#f5e8d0',
  muted: '#a8906a',
  dim: '#6e5c40',
  panel: '#1a120a',
  panelEdge: '#8a6a2f',
  hp: '#ff5a4d',
  hpBack: '#3a1a12',
  heal: '#7ddb6a',
  danger: '#ff3b2f',
  darkness: 'rgba(3, 2, 6, 0.88)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best run is kept between visits (this browser only). */
export const BEST_KEY = 'emberdeep.best';
