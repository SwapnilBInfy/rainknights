/**
 * The four stats a knight spends points on, as in the classic action-RPGs this is modelled on. Every level gives
 * POINTS_PER_LEVEL points; they can be put into (and taken back out of) Strength, Power, Endurance and Speed from the
 * Bag. Plain data and maths (no Phaser), so the rules can be unit-tested.
 *
 * - **Strength** hits harder with the held weapon (the swing).
 * - **Power** hits harder from a distance (the energy beam and the storm bolt).
 * - **Endurance** adds health and takes a little off every hit.
 * - **Speed** moves the knight faster and shortens the dodge roll's wait.
 */

export const STAT_IDS = ['strength', 'power', 'endurance', 'speed'] as const;
export type StatId = (typeof STAT_IDS)[number];

export const POINTS_PER_LEVEL = 3;

export interface Allocation {
  strength: number;
  power: number;
  endurance: number;
  speed: number;
}

export const STAT_NAMES: Record<StatId, string> = { strength: 'STRENGTH', power: 'POWER', endurance: 'ENDURANCE', speed: 'SPEED' };
export const STAT_BLURBS: Record<StatId, string> = {
  strength: 'Swing damage +7% each.',
  power: 'Beam damage +7% each.',
  endurance: '+8 HP, -2% damage taken.',
  speed: 'Move +4%, roll wait -3%.',
};

export const freshAllocation = (): Allocation => ({ strength: 0, power: 0, endurance: 0, speed: 0 });

export const pointsSpent = (a: Allocation): number => STAT_IDS.reduce((n, id) => n + a[id], 0);

/** Points earned by reaching `level` (a new knight is level 1 and has earned none). */
export const pointsForLevel = (level: number): number => Math.max(0, Math.floor(level) - 1) * POINTS_PER_LEVEL;

/** The most any one stat can hold, so no build is the only build. */
export const STAT_CAP = 30;

export interface Spend {
  /** Points still unspent. */
  points: number;
  alloc: Allocation;
}

/** Put one point into a stat. Null if there are none to spend or the stat is full. */
export function addPoint(state: Spend, id: StatId): Spend | null {
  if (state.points < 1 || state.alloc[id] >= STAT_CAP) return null;
  return { points: state.points - 1, alloc: { ...state.alloc, [id]: state.alloc[id] + 1 } };
}

/** Take one point back out of a stat (the knight can re-think a build freely). Null if there is none in it. */
export function removePoint(state: Spend, id: StatId): Spend | null {
  if (state.alloc[id] < 1) return null;
  return { points: state.points + 1, alloc: { ...state.alloc, [id]: state.alloc[id] - 1 } };
}

export interface StatEffects {
  /** Multiplies the held weapon's swing damage. */
  melee: number;
  /** Multiplies beam and bolt damage. */
  ranged: number;
  /** Flat extra max HP. */
  maxHp: number;
  /** Multiplies the damage taken (below 1 is a help). */
  taken: number;
  /** Multiplies move speed. */
  move: number;
  /** Multiplies the dodge roll's cooldown (below 1 is a help). */
  roll: number;
}

export const NO_EFFECTS: StatEffects = { melee: 1, ranged: 1, maxHp: 0, taken: 1, move: 1, roll: 1 };

/** What an allocation does. */
export function statEffects(a: Allocation): StatEffects {
  return {
    melee: 1 + 0.07 * a.strength,
    ranged: 1 + 0.07 * a.power,
    maxHp: 8 * a.endurance,
    taken: Math.max(0.6, 1 - 0.02 * a.endurance),
    move: 1 + 0.04 * a.speed,
    roll: Math.max(0.6, 1 - 0.03 * a.speed),
  };
}

/** Read an allocation out of untrusted saved data: whole numbers within the cap, nothing else. */
export function sanitizeAllocation(value: unknown): Allocation {
  const out = freshAllocation();
  if (typeof value !== 'object' || value === null) return out;
  for (const id of STAT_IDS) {
    const n = (value as Record<string, unknown>)[id];
    if (typeof n === 'number' && Number.isInteger(n)) out[id] = Math.max(0, Math.min(STAT_CAP, n));
  }
  return out;
}
