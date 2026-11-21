/**
 * How a fixed enemy decides what to do. Plain data and maths (no Phaser), so the rules can be unit-tested.
 *
 * An enemy lives at a spot and walks a small loop round it. It ignores the knight until the knight is spotted (close
 * enough), then chases; it gives up (and walks home) if the knight gets far away, or if the chase drags it too far from
 * its spot. A foe that was walked home is left alone until the knight comes close again.
 */

export type Mode = 'idle' | 'chase' | 'return';

export interface AggroTuning {
  /** Spots the knight within this many px. */
  sight: number;
  /** Gives up when the knight is farther than this. */
  lose: number;
  /** Gives up when it is farther than this from its spot. */
  leash: number;
}

/** Sight by enemy: the quick, flighty ones see farther; the slow, heavy ones less far. Bosses see the whole room. */
const SIGHT: Record<string, number> = {
  rainImp: 70,
  windWraith: 84,
  hailBrute: 66,
  lightningWisp: 92,
  snowGolem: 60,
  cabWraith: 120,
  tornadoBoss: 130,
  phantomBus: 150,
  tempestRegent: 150,
};
const DEFAULT_SIGHT = 72;

export function tuningFor(typeKey: string): AggroTuning {
  const sight = SIGHT[typeKey] ?? DEFAULT_SIGHT;
  return { sight, lose: sight * 2.1, leash: sight * 3 };
}

/** How near to its spot an enemy must be to count as home. */
export const HOME_RADIUS = 6;

/** The next mode, given how far the knight and the spot are. */
export function nextMode(mode: Mode, distToKnight: number, distToHome: number, t: AggroTuning): Mode {
  if (mode === 'chase') return distToKnight > t.lose || distToHome > t.leash ? 'return' : 'chase';
  if (distToKnight <= t.sight && distToHome <= t.leash) return 'chase';
  if (mode === 'return') return distToHome <= HOME_RADIUS ? 'idle' : 'return';
  return 'idle';
}

/** How fast an enemy walks its loop and walks home, as shares of its chase speed. */
export const PATROL_SPEED = 0.34;
export const HOME_SPEED = 0.8;

/** A point on the enemy's loop (a lazy figure of eight) at time `t` ms. `phase` (0 to 2π) keeps a camp's members apart. */
export function patrolPoint(home: { x: number; y: number }, t: number, phase: number, radius: number): { x: number; y: number } {
  const a = t / 2600 + phase;
  return { x: home.x + Math.cos(a) * radius, y: home.y + Math.sin(a * 2) * radius * 0.55 };
}
