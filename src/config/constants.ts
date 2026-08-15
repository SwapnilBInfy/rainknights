export const WORLD = {
  width: 3200,
  height: 3200,
};

export const TILE = 32;
export const MAP_COLS = Math.ceil(WORLD.width / TILE);
export const MAP_ROWS = Math.ceil(WORLD.height / TILE);

export const PLAYER_BASE = {
  maxHp: 100,
  moveSpeed: 160,
  attackDamage: 12,
  attackRange: 240,
  attackCooldown: 550,
  magnetRadius: 70,
  projectileSpeed: 420,
};

export interface EnemyStats {
  key: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  contactCooldown: number;
  scale: number;
}

export const ENEMY_STATS: Record<string, EnemyStats> = {
  rainImp: { key: 'rainImp', name: 'Rain Imp', hp: 14, speed: 90, damage: 6, xp: 4, contactCooldown: 700, scale: 1 },
  windWraith: { key: 'windWraith', name: 'Wind Wraith', hp: 20, speed: 150, damage: 8, xp: 7, contactCooldown: 650, scale: 1 },
  hailBrute: { key: 'hailBrute', name: 'Hail Brute', hp: 60, speed: 55, damage: 14, xp: 14, contactCooldown: 800, scale: 1.2 },
  lightningWisp: { key: 'lightningWisp', name: 'Lightning Wisp', hp: 24, speed: 130, damage: 12, xp: 10, contactCooldown: 500, scale: 0.9 },
  snowGolem: { key: 'snowGolem', name: 'Snow Golem', hp: 140, speed: 40, damage: 20, xp: 26, contactCooldown: 900, scale: 1.4 },
  tornadoBoss: { key: 'tornadoBoss', name: 'Tornado', hp: 900, speed: 55, damage: 26, xp: 300, contactCooldown: 500, scale: 1 },
};

export interface WeatherFront {
  name: string;
  start: number; // seconds
  enemies: string[];
  spawnIntervalMs: number;
  spawnCount: number;
}

export const WEATHER_FRONTS: WeatherFront[] = [
  { name: 'Light Drizzle', start: 0, enemies: ['rainImp'], spawnIntervalMs: 900, spawnCount: 1 },
  { name: 'Gusty Winds', start: 45, enemies: ['rainImp', 'windWraith'], spawnIntervalMs: 800, spawnCount: 1 },
  { name: 'Hailstorm', start: 100, enemies: ['rainImp', 'windWraith', 'hailBrute'], spawnIntervalMs: 750, spawnCount: 2 },
  { name: 'Thunderstorm', start: 160, enemies: ['windWraith', 'hailBrute', 'lightningWisp'], spawnIntervalMs: 650, spawnCount: 2 },
  { name: 'Blizzard', start: 220, enemies: ['hailBrute', 'lightningWisp', 'snowGolem'], spawnIntervalMs: 600, spawnCount: 2 },
  { name: 'Tornado Warning', start: 280, enemies: ['lightningWisp', 'snowGolem'], spawnIntervalMs: 550, spawnCount: 3 },
];

export const TORNADO_SPAWN_TIME = 300;

export const XP_BASE = 20;
export const XP_GROWTH = 14;
