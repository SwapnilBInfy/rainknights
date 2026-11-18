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

  it('a charge that hits something is a crash with a longer stall; one that runs its course is not', () => {
    const tuning: ChargeTuning = { ...T, crashStallMs: 500 };
    const crashed = new ChargeCycle(tuning);
    run(crashed, 1500); // charging
    expect(crashed.phase).toBe('charge');
    run(crashed, 200, { inRange: true, blocked: true });
    expect(crashed.phase).toBe('stall');
    expect(crashed.crashed).toBe(true);
    run(crashed, 400); // still stalled: the stall is 600 + 500
    expect(crashed.phase).toBe('stall');
    run(crashed, 800);
    expect(crashed.phase).toBe('cruise');

    const clean = new ChargeCycle(tuning);
    run(clean, 2000); // charge ran out by itself
    expect(clean.phase).toBe('stall');
    expect(clean.crashed).toBe(false);
    run(clean, 650);
    expect(clean.phase).toBe('cruise'); // the plain 600ms stall
  });

  it('crashed resets for the next charge', () => {
    const c = new ChargeCycle(T);
    run(c, 1500);
    run(c, 200, { inRange: true, blocked: true });
    expect(c.crashed).toBe(true);
    run(c, 3000); // through stall, cruise, telegraph into the next charge
    expect(c.crashed).toBe(false);
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
