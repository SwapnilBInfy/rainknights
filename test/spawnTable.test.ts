import { describe, expect, it } from 'vitest';
import { pickEnemyType, signatureChance, SIGNATURE_CHANCE } from '../src/systems/spawnTable';

const front = ['rainImp', 'windWraith', 'hailBrute'];

describe('spawn table', () => {
  it('a region without a signature enemy only spawns the front roster', () => {
    for (let i = 0; i < 50; i++) {
      expect(front).toContain(pickEnemyType(front, 3, undefined, Math.random));
    }
  });

  it('never spawns the signature enemy in the opening front', () => {
    expect(signatureChance(0)).toBe(0);
    for (let i = 0; i < 200; i++) expect(pickEnemyType(front, 0, 'cabWraith', Math.random)).not.toBe('cabWraith');
  });

  it('spawns the signature enemy when the roll is under its chance', () => {
    expect(pickEnemyType(front, 3, 'cabWraith', () => 0)).toBe('cabWraith');
    expect(pickEnemyType(front, 3, 'cabWraith', () => 0.99)).not.toBe('cabWraith');
  });

  it('is a modest share of spawns that grows with the storm', () => {
    expect(signatureChance(1)).toBeGreaterThan(0);
    for (let i = 1; i < SIGNATURE_CHANCE.length; i++) expect(SIGNATURE_CHANCE[i]).toBeGreaterThanOrEqual(SIGNATURE_CHANCE[i - 1]);
    expect(Math.max(...SIGNATURE_CHANCE)).toBeLessThanOrEqual(0.25);
  });

  it('clamps front indexes outside the table', () => {
    expect(signatureChance(-4)).toBe(0);
    expect(signatureChance(99)).toBe(SIGNATURE_CHANCE[SIGNATURE_CHANCE.length - 1]);
  });

  it('picks every roster entry with a fair spread', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const t = pickEnemyType(front, 2, 'cabWraith', Math.random);
      counts[t] = (counts[t] ?? 0) + 1;
    }
    for (const t of front) expect(counts[t]).toBeGreaterThan(600);
    expect(counts.cabWraith).toBeGreaterThan(200);
    expect(counts.cabWraith).toBeLessThan(600);
  });
});
