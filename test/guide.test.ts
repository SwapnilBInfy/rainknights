import { describe, expect, it } from 'vitest';
import { CHEAPEST_CHARM, STRIP_MAX, TIPS, TIP_IDS, runGoal, sanitizeTips, townTip, type TownCtx } from '../src/systems/guide';
import { CITIES } from '../src/config/regions';
import { gateLevels, suggestedLevel } from '../src/systems/zones';
import { CHARMS } from '../src/economy/charms';

const ctx: TownCtx = { runs: 3, wins: 1, level: 5, unspent: 0, coins: 0, charmsOwned: 1 };

describe('the tip in Mistford', () => {
  it('a player who has never flown is told to', () => {
    expect(townTip({ ...ctx, runs: 0, wins: 0 })).toMatch(/BLUE PAD/);
  });

  it('then: stat points to spend, a first charm to buy, the first boss to find', () => {
    expect(townTip({ ...ctx, wins: 0, unspent: 3 })).toMatch(/POINTS/);
    expect(townTip({ ...ctx, wins: 0, charmsOwned: 0, coins: CHEAPEST_CHARM })).toMatch(/CHARM/);
    expect(townTip({ ...ctx, wins: 0, charmsOwned: 0, coins: CHEAPEST_CHARM - 1 })).toMatch(/FIRST BOSS/);
    expect(townTip({ ...ctx, wins: 0 })).toBe(`FIRST BOSS: NEW YORK, LV${suggestedLevel('nyc')}+`);
  });

  it('points to spend come before a charm to buy (they are free)', () => {
    expect(townTip({ ...ctx, wins: 0, unspent: 1, charmsOwned: 0, coins: 500 })).toMatch(/POINTS/);
  });

  it('a knight who has won a boss and has nothing pressing is left alone', () => {
    expect(townTip(ctx)).toBe('');
  });

  it('the cheapest charm is a real price', () => {
    expect(CHEAPEST_CHARM).toBe(Math.min(...CHARMS.map((c) => c.price)));
    expect(CHEAPEST_CHARM).toBeGreaterThan(0);
  });
});

describe('the goal in a city', () => {
  for (const city of CITIES) {
    const [a, b] = gateLevels(city.id);
    it(`${city.id}: the level for the first gate, then the second, then the boss`, () => {
      expect(runGoal({ regionId: city.id, level: 1, bossAlive: true })).toBe(`REACH LV${a}: OPENS THE GATE`);
      expect(runGoal({ regionId: city.id, level: a, bossAlive: true })).toBe(`REACH LV${b}: OPENS THE CORE`);
      expect(runGoal({ regionId: city.id, level: b, bossAlive: true })).toBe(`BOSS AT THE FAR END: LV${suggestedLevel(city.id)}+`);
      expect(runGoal({ regionId: city.id, level: suggestedLevel(city.id), bossAlive: true })).toBe('DEFEAT THE BOSS: FAR END');
    });
  }

  it('says nothing once the boss is down', () => {
    expect(runGoal({ regionId: 'nyc', level: 20, bossAlive: false })).toBe('');
  });

  it('every line fits the strip along the bottom of the screen', () => {
    const lines = new Set<string>();
    for (const city of CITIES) for (const level of [1, 2, 3, 5, 6, 8, 10, 13, 16, 18, 30]) for (const bossAlive of [true, false]) lines.add(runGoal({ regionId: city.id, level, bossAlive }));
    for (const runs of [0, 3]) for (const wins of [0, 1]) for (const unspent of [0, 3]) for (const coins of [0, 500]) for (const charmsOwned of [0, 2]) lines.add(townTip({ runs, wins, level: 5, unspent, coins, charmsOwned }));
    for (const line of lines) expect(line.length, `"${line}"`).toBeLessThanOrEqual(STRIP_MAX);
  });
});

describe('one-time tips', () => {
  it('each is two short lines', () => {
    for (const id of TIP_IDS) {
      expect(TIPS[id]).toHaveLength(2);
      for (const line of TIPS[id]) expect(line.length).toBeLessThanOrEqual(27);
    }
  });

  it('a saved list is cleaned: known tips only, no repeats', () => {
    expect(sanitizeTips(undefined)).toEqual([]);
    expect(sanitizeTips(['spotted', 'nonsense', 'spotted', 4, 'gate'])).toEqual(['spotted', 'gate']);
  });

  it('round-trips through the save, and an older save has none', async () => {
    const { defaultSave, parseStored, serialize } = await import('../src/save/save');
    const save = defaultSave();
    expect(save.tips).toBeUndefined();
    expect(parseStored(serialize({ ...save, tips: ['gate'] }), 0).save.tips).toEqual(['gate']);
    expect(parseStored(serialize(save), 0).save.tips).toBeUndefined();
  });
});
