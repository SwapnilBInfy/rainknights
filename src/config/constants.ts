/** Native GBA resolution — the canvas is authored in true GBA pixels. */
export const VIEW = {
  width: 240,
  height: 160,
};

export const WORLD = {
  width: 1600,
  height: 1600,
};

export const TILE = 16;
export const MAP_COLS = Math.ceil(WORLD.width / TILE);
export const MAP_ROWS = Math.ceil(WORLD.height / TILE);

export const PLAYER_BASE = {
  maxHp: 100,
  moveSpeed: 80,
  attackDamage: 12,
  attackRange: 110,
  attackCooldown: 550,
  magnetRadius: 34,
  projectileSpeed: 210,
};

/** The automatic Storm Bolt is a weaker backup to the manual swing and beam. */
export const AUTO_ATTACK = {
  damageMult: 0.6,
  cooldownMult: 1.5,
};

import type { StatusId } from '../systems/status';

export interface EnemyStats {
  key: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  contactCooldown: number;
  scale: number;
  /** Statuses this enemy can never receive (ice creatures ignore frost, wisps ignore shock). */
  immune?: StatusId[];
  /** Scales status durations; the boss uses a small value so it cannot be locked down. */
  statusResist?: number;
}

export const ENEMY_STATS: Record<string, EnemyStats> = {
  rainImp: { key: 'rainImp', name: 'Rain Imp', hp: 14, speed: 45, damage: 6, xp: 4, contactCooldown: 700, scale: 1 },
  windWraith: { key: 'windWraith', name: 'Wind Wraith', hp: 20, speed: 75, damage: 8, xp: 7, contactCooldown: 650, scale: 1 },
  hailBrute: { key: 'hailBrute', name: 'Hail Brute', hp: 60, speed: 28, damage: 14, xp: 14, contactCooldown: 800, scale: 1.2, immune: ['frozen', 'chilled'] },
  lightningWisp: { key: 'lightningWisp', name: 'Lightning Wisp', hp: 24, speed: 65, damage: 12, xp: 10, contactCooldown: 500, scale: 0.9, immune: ['shocked'] },
  snowGolem: { key: 'snowGolem', name: 'Snow Golem', hp: 140, speed: 20, damage: 20, xp: 26, contactCooldown: 900, scale: 1.4, immune: ['frozen', 'chilled'] },
  cabWraith: { key: 'cabWraith', name: 'Cab Wraith', hp: 46, speed: 52, damage: 11, xp: 16, contactCooldown: 700, scale: 1 },
  tornadoBoss: { key: 'tornadoBoss', name: 'Tornado', hp: 900, speed: 28, damage: 26, xp: 300, contactCooldown: 500, scale: 1, statusResist: 0.25 },
  trainingDummy: { key: 'trainingDummy', name: 'Training Dummy', hp: 60, speed: 0, damage: 0, xp: 5, contactCooldown: 1000, scale: 1 },
  phantomBus: { key: 'phantomBus', name: 'Phantom Bus', hp: 1100, speed: 24, damage: 22, xp: 320, contactCooldown: 600, scale: 1, statusResist: 0.25 },
  tempestRegent: { key: 'tempestRegent', name: 'Regent', hp: 1500, speed: 30, damage: 24, xp: 600, contactCooldown: 600, scale: 1.6, immune: ['shocked'], statusResist: 0.3 },
};

/** What each boss calls in on a timer while it is alive (Phaser time, not wall-clock). */
export const BOSS_SUMMONS: Record<string, { everyMs: number; types: string[]; count: number }> = {
  tornadoBoss: { everyMs: 6000, types: ['hailBrute', 'lightningWisp'], count: 2 },
  phantomBus: { everyMs: 8000, types: ['cabWraith', 'rainImp'], count: 2 },
  tempestRegent: { everyMs: 7000, types: ['lightningWisp', 'hailBrute', 'windWraith'], count: 2 },
};

/** How far from the knight a boss arrives. The view is only 240x160, so the bus comes in near the edge to be seen. */
export const BOSS_SPAWN_DISTANCE: Record<string, number> = { tornadoBoss: 170, phantomBus: 112, tempestRegent: 100 };

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

/** Index into WEATHER_FRONTS for a given time into the run. */
export function frontIndexAt(seconds: number): number {
  for (let i = WEATHER_FRONTS.length - 1; i >= 0; i--) if (seconds >= WEATHER_FRONTS[i].start) return i;
  return 0;
}

/**
 * The most enemies alive at once from summons (a boss's backup) and the debug bridge. Without a cap a knight who cannot
 * keep up lets hundreds pile up, which is a lot of work for every frame and makes the game stutter and then lock up on
 * slower devices. (The camps' residents and the boss are not counted.)
 */
export const MAX_LIVING_ENEMIES = 140;

export const XP_BASE = 20;
export const XP_GROWTH = 14;
