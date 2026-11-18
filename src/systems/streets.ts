/**
 * Street-aware charging for the Cab Wraith and the Phantom Bus. Plain data +
 * math (no Phaser) so it can be unit-tested. Vehicles charge along the four
 * street directions, never at an arbitrary angle; the lane stops at the first
 * wall; and a wind-up only makes sense when the player is actually in that lane.
 */

const QUARTER = Math.PI / 2;

/** The nearest of east (0), south (pi/2), west (pi) and north (-pi/2). */
export function snapToCardinal(angle: number): number {
  const snapped = Math.round(angle / QUARTER) * QUARTER;
  // keep the result in (-pi, pi]: west is +pi, never -pi
  if (snapped > Math.PI + 1e-9) return snapped - 2 * Math.PI;
  if (snapped <= -Math.PI + 1e-9) return snapped + 2 * Math.PI;
  return snapped;
}

export interface RayHit {
  /** Distance travelled before the ray stopped, in px. */
  dist: number;
  /** True if it stopped at a solid tile, false if it reached `maxLen`. */
  hitWall: boolean;
}

/** March along a direction until a solid point is met. `solidAt` takes world px. */
export function rayDistance(solidAt: (x: number, y: number) => boolean, x: number, y: number, angle: number, maxLen: number, step = 4): RayHit {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let d = step; d <= maxLen; d += step) {
    if (solidAt(x + dx * d, y + dy * d)) return { dist: d - step, hitWall: true };
  }
  return { dist: maxLen, hitWall: false };
}

/** Where a target sits relative to a lane: how far along it, and how far off to one side. */
export function laneOffset(fromX: number, fromY: number, laneAngle: number, toX: number, toY: number): { along: number; across: number; side: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const ux = Math.cos(laneAngle);
  const uy = Math.sin(laneAngle);
  const side = -dx * uy + dy * ux; // positive: the target is to the left of the lane's direction
  return { along: dx * ux + dy * uy, across: Math.abs(side), side };
}

export interface LaneCheck {
  /** Angle of the street direction facing the target. */
  angle: number;
  along: number;
  across: number;
  /** Signed offset across the lane: which way to slide to line up with the target. */
  side: number;
  ray: RayHit;
  /** Worth winding up for: the target is ahead, roughly in the lane, and the lane is open. */
  usable: boolean;
}

export const LANE_TOLERANCE = 40;
export const MIN_OPEN_LANE = 70;
/** A vehicle needs a car-length of run-up: right on top of the target, "toward them" is a coin flip. */
export const MIN_ALONG = 40;

/** Pick the street direction toward a target and say whether a charge down it is worth starting. */
export function checkLane(
  solidAt: (x: number, y: number) => boolean,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  maxLen: number,
  tolerance = LANE_TOLERANCE,
  minAlong = MIN_ALONG
): LaneCheck {
  const angle = snapToCardinal(Math.atan2(toY - fromY, toX - fromX));
  const { along, across, side } = laneOffset(fromX, fromY, angle, toX, toY);
  const ray = rayDistance(solidAt, fromX, fromY, angle, maxLen);
  const usable = along >= minAlong && across <= tolerance && ray.dist >= Math.min(along, MIN_OPEN_LANE);
  return { angle, along, across, side, ray, usable };
}
