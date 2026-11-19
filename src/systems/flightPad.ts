/**
 * The blue flight pad in each city: a plate on the plaza where the knight starts. Standing still on it charges a
 * ring; when the ring is full the knight flies out and the run ends as a retreat. Stepping off lets it drain
 * quickly, so a pass over the pad in a fight does nothing. (In a run, A swings the weapon, so the pad cannot be
 * a press-A thing the way it is in Mistford.) Plain data and maths, no Phaser.
 */

/** How long (ms) the knight must stand on the pad to fly out. */
export const PAD_CHARGE_MS = 1500;
/** Charge drains this many times faster than it builds once the knight steps off. */
export const PAD_DRAIN = 3;
/** The pad is this many pixels from the knight's starting point, to the east, on the cleared plaza. */
export const PAD_OFFSET = 56;
/** The pad is a square this many pixels wide. */
export const PAD_SIZE = 30;
/** How close (px) to the pad's centre counts as standing on it. */
export const PAD_REACH = 14;

export function padCenterFor(spawn: { x: number; y: number }): { x: number; y: number } {
  return { x: spawn.x + PAD_OFFSET, y: spawn.y };
}

export function onPad(pos: { x: number; y: number }, center: { x: number; y: number }): boolean {
  return Math.abs(pos.x - center.x) <= PAD_REACH && Math.abs(pos.y - center.y) <= PAD_REACH;
}

/** The charge, 0..1, after `deltaMs`. */
export function stepPadCharge(charge: number, standing: boolean, deltaMs: number): number {
  const next = standing ? charge + deltaMs / PAD_CHARGE_MS : charge - (deltaMs / PAD_CHARGE_MS) * PAD_DRAIN;
  return Math.min(1, Math.max(0, next));
}
