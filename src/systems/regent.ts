/**
 * The Tempest Regent's rules: three phases by health, each faster and each calling down more lightning, and where
 * the lightning lands. Plain data and maths (no Phaser), so it can be unit-tested.
 *
 * The Regent does not charge: it drifts after the knight and every few seconds calls strikes. The first strike of
 * every cast lands on the knight (a ring shows where, then it hits), so standing still is punished; the rest fall
 * around them, so running in a straight line is not safe either. The lower its health, the faster it casts and the
 * more strikes it calls, and it calls for backup at each phase change.
 */

export interface RegentPhase {
  /** The phase starts once health is at or below this fraction. */
  below: number;
  /** Speed multiplier. */
  speed: number;
  /** Milliseconds between casts. */
  castMs: number;
  /** Strikes per cast. */
  strikes: number;
}

export const REGENT_PHASES: RegentPhase[] = [
  { below: 1, speed: 1, castMs: 3800, strikes: 2 },
  { below: 0.66, speed: 1.2, castMs: 2900, strikes: 3 },
  { below: 0.33, speed: 1.45, castMs: 2100, strikes: 4 },
];

/** A strike: a ring shows for `telegraphMs`, then hits everything inside `radius`. */
export const STRIKE = { telegraphMs: 950, radius: 22, damage: 18 };
/** The Regent keeps this far from the knight (px) rather than sitting on top of them. */
export const REGENT_STANDOFF = 46;

/** 0, 1 or 2: which phase the Regent is in at this health. */
export function regentPhase(hp: number, maxHp: number): number {
  const f = maxHp > 0 ? hp / maxHp : 0;
  let phase = 0;
  for (let i = 0; i < REGENT_PHASES.length; i++) if (f <= REGENT_PHASES[i].below) phase = i;
  return phase;
}

/**
 * Where a cast's strikes land: the first on the knight, the rest scattered within `spread` px of them, never
 * closer than `gap` px to each other (so they do not stack into one).
 */
export function strikeSpots(
  target: { x: number; y: number },
  count: number,
  rand: () => number,
  spread = 78,
  gap = 30
): { x: number; y: number }[] {
  const spots = [{ x: target.x, y: target.y }];
  for (let tries = 0; spots.length < count && tries < count * 12; tries++) {
    const angle = rand() * Math.PI * 2;
    const dist = 26 + rand() * (spread - 26);
    const spot = { x: target.x + Math.cos(angle) * dist, y: target.y + Math.sin(angle) * dist };
    if (spots.every((s) => Math.hypot(s.x - spot.x, s.y - spot.y) >= gap)) spots.push(spot);
  }
  return spots;
}

/** Whether a strike centred at `at` hits a knight at `who`. */
export const strikeHits = (at: { x: number; y: number }, who: { x: number; y: number }, radius = STRIKE.radius): boolean =>
  Math.hypot(at.x - who.x, at.y - who.y) <= radius;
