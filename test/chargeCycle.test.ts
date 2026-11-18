import { describe, expect, it } from 'vitest';
import { ChargeCycle, type ChargeTuning } from '../src/systems/chargeCycle';

const T: ChargeTuning = { cruiseMs: [1000, 1000], telegraphMs: 500, chargeMs: 400, stallMs: 600 };
const run = (c: ChargeCycle, ms: number, opts = { inRange: true } as { inRange: boolean; blocked?: boolean }) => {
  const seen: string[] = [];
  for (let t = 0; t < ms; t += 50) {
    const p = c.update(50, opts);
    if (p) seen.push(p);
  }
  return seen;
};

describe('ChargeCycle', () => {
  it('runs cruise -> telegraph -> charge -> stall -> cruise in order', () => {
    const c = new ChargeCycle(T);
    expect(run(c, 3600)).toEqual(['telegraph', 'charge', 'stall', 'cruise', 'telegraph']);
  });

  it('keeps cruising while the target is out of range, then winds up when it arrives', () => {
    const c = new ChargeCycle(T);
    expect(run(c, 5000, { inRange: false })).toEqual([]);
    expect(c.phase).toBe('cruise');
    expect(c.update(50, { inRange: true })).toBe('telegraph');
  });

  it('gives the player the full telegraph before the charge starts', () => {
    const c = new ChargeCycle(T);
    run(c, 1000);
    expect(c.phase).toBe('telegraph');
    expect(c.telegraphLeftMs).toBeGreaterThan(400);
    run(c, 400);
    expect(c.phase).toBe('telegraph');
    expect(c.telegraphLeftMs).toBeGreaterThan(0);
    run(c, 100);
    expect(c.phase).toBe('charge');
    expect(c.telegraphLeftMs).toBe(0);
  });

  it('ends a charge early when it hits a wall, but not instantly', () => {
    const c = new ChargeCycle(T);
    run(c, 1500); // now charging
    expect(c.phase).toBe('charge');
    expect(c.update(50, { inRange: true, blocked: true })).toBeNull(); // too soon
    expect(c.update(50, { inRange: true, blocked: true })).toBeNull();
    expect(c.update(50, { inRange: true, blocked: true })).toBe('stall');
  });

  it('treats a huge frame delta as a hiccup, not a skipped phase', () => {
    const c = new ChargeCycle(T);
    expect(c.update(60_000, { inRange: true })).toBeNull(); // clamped to 100ms: still cruising
    expect(c.phase).toBe('cruise');
    run(c, 900);
    expect(c.phase).toBe('telegraph');
    expect(c.update(60_000, { inRange: true })).toBeNull(); // still only 100ms of the 500ms telegraph
    expect(c.telegraphLeftMs).toBeGreaterThan(300);
  });

  it('a faster tuning applies from the next phase (boss rage)', () => {
    const c = new ChargeCycle(T);
    run(c, 1100); // telegraphing with the old timing
    c.setTuning({ cruiseMs: [200, 200], telegraphMs: 100, chargeMs: 100, stallMs: 100 });
    run(c, 500); // finishes telegraph (old), charge/stall now use the new tuning
    const seen = run(c, 1000);
    expect(seen.length).toBeGreaterThanOrEqual(4);
  });
});
