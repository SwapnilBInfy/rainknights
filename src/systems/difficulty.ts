/**
 * How hard the enemies are. Plain data and maths (no Phaser), so the numbers can be unit-tested and tuned from one place.
 *
 * Every enemy has base stats (see ENEMY_STATS). On top of those, an enemy is scaled by the **zone** it lives in (the
 * core is far tougher than the outskirts) and by the **city** (a later city's enemies are tougher than an earlier one's,
 * so a knight who has outgrown New York still has a fight in Mumbai). The XP an enemy gives is scaled too, so the
 * gates' levels can be reached by playing (see the pacing tests).
 */

export interface Scale {
  /** Multiplies health. */
  hp: number;
  /** Multiplies the damage it deals. */
  damage: number;
  /** Multiplies the XP it gives. */
  xp: number;
}

/** By zone: the outskirts are the base, midtown is a real fight, the core is a hard one. */
export const ZONE_SCALE: readonly [Scale, Scale, Scale] = [
  { hp: 1.7, damage: 1.25, xp: 2 },
  { hp: 4, damage: 1.7, xp: 1.6 },
  { hp: 4.5, damage: 1.8, xp: 1.7 },
];

/** A boss is its own thing: many times a core foe's health, hitting only a little harder (it has its tricks). */
const BOSS_BASE: Scale = { hp: 3.2, damage: 1.5, xp: 1.7 };

/** By city, in the order the cities are meant to be played. */
export const CITY_ORDER = ['nyc', 'miami', 'london', 'tokyo', 'mumbai'] as const;
const CITY_SCALE: readonly Scale[] = [
  { hp: 1, damage: 1, xp: 1 },
  { hp: 1.35, damage: 1.15, xp: 1.3 },
  { hp: 1.8, damage: 1.3, xp: 1.7 },
  { hp: 2.4, damage: 1.5, xp: 2.2 },
  { hp: 3.1, damage: 1.7, xp: 2.8 },
];

/** The finale's place is its own thing: as hard as the last city's core. */
const FINALE_RANK = CITY_ORDER.length - 1;

export const NO_SCALE: Scale = { hp: 1, damage: 1, xp: 1 };

export function cityRank(regionId: string): number {
  const i = (CITY_ORDER as readonly string[]).indexOf(regionId);
  return i >= 0 ? i : FINALE_RANK;
}

/** The scale for a city's boss. */
export function bossScaleFor(regionId: string): Scale {
  const c = CITY_SCALE[cityRank(regionId)];
  return { hp: BOSS_BASE.hp * c.hp, damage: BOSS_BASE.damage * c.damage, xp: BOSS_BASE.xp * c.xp };
}

/** The scale for an enemy of this zone in this city. */
export function scaleFor(regionId: string, zone: 0 | 1 | 2): Scale {
  const z = ZONE_SCALE[zone];
  const c = CITY_SCALE[cityRank(regionId)];
  return { hp: z.hp * c.hp, damage: z.damage * c.damage, xp: z.xp * c.xp };
}
