import { describe, expect, it } from 'vitest';
import { checkLane, laneOffset, rayDistance, snapToCardinal } from '../src/systems/streets';

const E = 0;
const S = Math.PI / 2;
const W = Math.PI;
const N = -Math.PI / 2;
const deg = (d: number) => (d * Math.PI) / 180;

describe('snapToCardinal', () => {
  it('snaps to the nearest street direction', () => {
    expect(snapToCardinal(deg(10))).toBeCloseTo(E);
    expect(snapToCardinal(deg(-30))).toBeCloseTo(E);
    expect(snapToCardinal(deg(50))).toBeCloseTo(S);
    expect(snapToCardinal(deg(100))).toBeCloseTo(S);
    expect(snapToCardinal(deg(-80))).toBeCloseTo(N);
    expect(snapToCardinal(deg(170))).toBeCloseTo(W);
    expect(snapToCardinal(deg(-170))).toBeCloseTo(W);
  });

  it('always returns exactly one of the four directions', () => {
    for (let d = -360; d <= 360; d += 7) {
      const a = snapToCardinal(deg(d));
      const hits = [E, S, W, N].filter((c) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c))) < 1e-6);
      expect(hits, `${d} deg -> ${a}`).toHaveLength(1);
    }
  });
});

describe('rayDistance', () => {
  const wallAtX = (wx: number) => (x: number) => x >= wx;
  it('stops at the first solid point', () => {
    const r = rayDistance((x) => wallAtX(100)(x), 0, 0, E, 200);
    expect(r.hitWall).toBe(true);
    expect(r.dist).toBeGreaterThanOrEqual(92);
    expect(r.dist).toBeLessThanOrEqual(100);
  });

  it('reports a clear lane at full length', () => {
    expect(rayDistance(() => false, 0, 0, S, 130)).toEqual({ dist: 130, hitWall: false });
  });

  it('works in every direction', () => {
    const solid = (x: number, y: number) => Math.abs(x) >= 50 || Math.abs(y) >= 50;
    for (const a of [E, S, W, N]) expect(rayDistance(solid, 0, 0, a, 200).dist).toBeGreaterThanOrEqual(42);
  });
});

describe('laneOffset', () => {
  it('measures along and across a lane', () => {
    const check = (got: { along: number; across: number }, along: number, across: number) => {
      expect(got.along).toBeCloseTo(along, 6);
      expect(got.across).toBeCloseTo(across, 6);
    };
    check(laneOffset(0, 0, E, 100, 10), 100, 10);
    check(laneOffset(0, 0, S, 10, 100), 100, 10);
    check(laneOffset(0, 0, W, -50, -20), 50, 20);
    expect(laneOffset(0, 0, E, -30, 0).along).toBeLessThan(0); // behind the vehicle
  });
});

describe('checkLane', () => {
  const open = () => false;

  it('uses the street direction facing the target', () => {
    expect(checkLane(open, 0, 0, 100, 10, 130).angle).toBeCloseTo(E);
    expect(checkLane(open, 0, 0, 10, 100, 130).angle).toBeCloseTo(S);
    expect(checkLane(open, 0, 0, -100, -10, 130).angle).toBeCloseTo(W);
  });

  it('is usable when the target is ahead, roughly in the lane, and the lane is open', () => {
    expect(checkLane(open, 0, 0, 100, 20, 130).usable).toBe(true);
  });

  it('says which way to slide to line up with the target', () => {
    const left = checkLane(open, 0, 0, 100, 30, 130); // heading east: +y is to the right (south)
    const right = checkLane(open, 0, 0, 100, -30, 130);
    expect(Math.sign(left.side)).toBe(-Math.sign(right.side));
    expect(Math.abs(left.side)).toBeCloseTo(30, 5);
    // sliding by `side` along the perpendicular lines up exactly
    const perp = left.angle + Math.PI / 2;
    const slid = checkLane(open, Math.cos(perp) * left.side, Math.sin(perp) * left.side, 100, 30, 130);
    expect(slid.across).toBeLessThan(1e-6);
  });

  it('is not usable when the target is right on top of the vehicle (no run-up)', () => {
    expect(checkLane(open, 0, 0, 15, 5, 130).usable).toBe(false);
    expect(checkLane(open, 0, 0, 45, 5, 130).usable).toBe(true);
    expect(checkLane(open, 0, 0, 30, 0, 130, 40, 20).usable).toBe(true); // the run-up is adjustable
  });

  it('is not usable when the target is too far to one side', () => {
    expect(checkLane(open, 0, 0, 80, 80.5, 130).usable).toBe(false); // diagonal: far off the lane axis
    expect(checkLane(open, 0, 0, 100, 60, 130).usable).toBe(false);
  });

  it('is not usable when a wall is right in front of the vehicle', () => {
    const wallSoon = (x: number) => x >= 30;
    expect(checkLane(wallSoon, 0, 0, 120, 0, 130).usable).toBe(false);
  });

  it('is usable when the wall is behind the target (the lane reaches them)', () => {
    const wallFar = (x: number) => x >= 140;
    const c = checkLane(wallFar, 0, 0, 90, 0, 130);
    expect(c.usable).toBe(true);
    expect(c.ray.hitWall).toBe(false); // capped at maxLen before the wall
  });
});
