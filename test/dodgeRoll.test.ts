import { describe, expect, it } from 'vitest';
import { DodgeRoll, ROLL } from '../src/systems/dodgeRoll';

describe('DodgeRoll', () => {
  it('starts, runs for its duration, then ends', () => {
    const r = new DodgeRoll();
    expect(r.start(1000, 1, 0)).toBe(true);
    expect(r.isActive(1000)).toBe(true);
    expect(r.isActive(1000 + ROLL.durationMs - 1)).toBe(true);
    expect(r.isActive(1000 + ROLL.durationMs)).toBe(false);
  });

  it('normalises the direction and defaults to down when standing still', () => {
    const r = new DodgeRoll();
    r.start(0, 3, 4);
    expect(r.dir.x).toBeCloseTo(0.6);
    expect(r.dir.y).toBeCloseTo(0.8);
    const s = new DodgeRoll();
    s.start(0, 0, 0);
    expect(s.dir).toEqual({ x: 0, y: 1 });
  });

  it('cannot restart while rolling or on cooldown, then can again', () => {
    const r = new DodgeRoll();
    r.start(0, 1, 0);
    expect(r.start(100, 0, 1)).toBe(false);
    expect(r.canStart(ROLL.cooldownMs - 1)).toBe(false);
    expect(r.start(ROLL.cooldownMs, 0, 1)).toBe(true);
    expect(r.dir).toEqual({ x: 0, y: 1 });
  });

  it('is invulnerable for a little longer than the visible roll', () => {
    const r = new DodgeRoll();
    expect(r.isInvulnerable(0)).toBe(false);
    r.start(500, 1, 0);
    expect(r.isInvulnerable(500)).toBe(true);
    expect(r.isInvulnerable(500 + ROLL.invulnMs - 1)).toBe(true);
    expect(r.isInvulnerable(500 + ROLL.invulnMs)).toBe(false);
    expect(ROLL.invulnMs).toBeGreaterThanOrEqual(ROLL.durationMs);
    // The window is far shorter than the cooldown, so it cannot be chained.
    expect(ROLL.invulnMs).toBeLessThan(ROLL.cooldownMs / 2);
  });

  it('reports progress and recharge', () => {
    const r = new DodgeRoll();
    expect(r.charge(0)).toBe(1);
    r.start(1000, 1, 0);
    expect(r.progress(1000)).toBe(0);
    expect(r.progress(1000 + ROLL.durationMs / 2)).toBeCloseTo(0.5);
    expect(r.progress(5000)).toBe(1);
    expect(r.charge(1000)).toBe(0);
    expect(r.charge(1000 + ROLL.cooldownMs / 2)).toBeCloseTo(0.5);
    expect(r.charge(1000 + ROLL.cooldownMs)).toBe(1);
  });

  it('reset clears the cooldown', () => {
    const r = new DodgeRoll();
    r.start(0, 1, 0);
    r.reset();
    expect(r.canStart(10)).toBe(true);
  });
});
