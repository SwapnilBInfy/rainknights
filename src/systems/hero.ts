/**
 * The knight's growth, which now lasts. Level, XP and the stat points spent are kept with the town profile, so a fight
 * (and a defeat, and a retreat by air) never takes them away: the knight who flies out of a city is the knight who
 * lands in the next one. Plain data and maths (no Phaser), so the rules can be unit-tested.
 */
import { XP_BASE, XP_GROWTH } from '../config/constants';
import { freshAllocation, pointsForLevel, pointsSpent, sanitizeAllocation, type Allocation } from './stats';

export interface Hero {
  level: number;
  /** XP into the current level (always less than `xpToNextFor(level)`). */
  xp: number;
  /** Stat points spent. Unspent points are what the level has earned less these. */
  alloc: Allocation;
}

export const MAX_LEVEL = 99;

export const freshHero = (): Hero => ({ level: 1, xp: 0, alloc: freshAllocation() });

/** XP needed to leave this level. (The first level asks for the base, the rest grow with the level.) */
export const xpToNextFor = (level: number): number => (level <= 1 ? XP_BASE : XP_BASE + level * XP_GROWTH);

/** Read a hero out of untrusted saved data: a level in range, XP inside it, and no more points spent than were earned. */
export function sanitizeHero(value: unknown): Hero {
  if (typeof value !== 'object' || value === null) return freshHero();
  const v = value as Record<string, unknown>;
  const level = typeof v.level === 'number' && Number.isInteger(v.level) ? Math.max(1, Math.min(MAX_LEVEL, v.level)) : 1;
  const rawXp = typeof v.xp === 'number' && Number.isFinite(v.xp) ? Math.max(0, v.xp) : 0;
  const xp = Math.min(Math.floor(rawXp), xpToNextFor(level) - 1);
  const alloc = sanitizeAllocation(v.alloc);
  return { level, xp, alloc: pointsSpent(alloc) <= pointsForLevel(level) ? alloc : freshAllocation() };
}

/** Whichever of two heroes has come further (a continued fight from before the knight's growth was kept, say). */
export const laterHero = (a: Hero, b: Hero): Hero => (a.level !== b.level ? (a.level > b.level ? a : b) : a.xp >= b.xp ? a : b);
