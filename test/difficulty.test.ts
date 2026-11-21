import { describe, expect, it } from 'vitest';
import { CITY_ORDER, NO_SCALE, ZONE_SCALE, bossScaleFor, cityRank, scaleFor } from '../src/systems/difficulty';
import { generateMap } from '../src/systems/mapGen';
import { placeCamps } from '../src/systems/camps';
import { CITIES } from '../src/config/regions';
import { ENEMY_STATS } from '../src/config/constants';
import { xpToNextFor } from '../src/systems/hero';
import { gateLevels, suggestedLevel } from '../src/systems/zones';

const cumXp = (level: number) => {
  let n = 0;
  for (let l = 1; l < level; l++) n += xpToNextFor(l);
  return n;
};

describe('difficulty', () => {
  it('the cities are the five, in the order they are meant to be played', () => {
    expect([...CITY_ORDER]).toEqual(CITIES.map((c) => c.id));
  });

  it('every zone is tougher than the last, in health and damage, and a later city is tougher than an earlier one', () => {
    for (let z = 1; z < 3; z++) {
      expect(ZONE_SCALE[z].hp).toBeGreaterThan(ZONE_SCALE[z - 1].hp);
      expect(ZONE_SCALE[z].damage).toBeGreaterThan(ZONE_SCALE[z - 1].damage);
    }
    for (let i = 1; i < CITY_ORDER.length; i++) {
      for (const zone of [0, 1, 2] as const) {
        const a = scaleFor(CITY_ORDER[i - 1], zone);
        const b = scaleFor(CITY_ORDER[i], zone);
        expect(b.hp).toBeGreaterThan(a.hp);
        expect(b.damage).toBeGreaterThan(a.damage);
        expect(b.xp).toBeGreaterThan(a.xp);
      }
      expect(bossScaleFor(CITY_ORDER[i]).hp).toBeGreaterThan(bossScaleFor(CITY_ORDER[i - 1]).hp);
    }
  });

  it('the first city asks only what the zones ask; the story finale is as hard as the last city', () => {
    expect(scaleFor('nyc', 1)).toEqual(ZONE_SCALE[1]);
    expect(cityRank('stormhold')).toBe(CITY_ORDER.length - 1);
    expect(cityRank('nowhere')).toBe(CITY_ORDER.length - 1);
    expect(NO_SCALE).toEqual({ hp: 1, damage: 1, xp: 1 });
  });

  it('a boss has many times a core foe\'s health, and hits less than proportionally harder', () => {
    const boss = bossScaleFor('nyc');
    expect(boss.hp).toBeGreaterThan(scaleFor('nyc', 2).hp * 0.5);
    expect(boss.damage).toBeLessThan(boss.hp);
  });

  it('the suggested level is above the second gate: a knight just through it is not a match for the boss', () => {
    for (const c of CITIES) expect(suggestedLevel(c.id)).toBeGreaterThan(gateLevels(c.id)[1]);
  });
});

describe('pacing: the gates can be reached by playing, with no grinding', () => {
  /** The XP of every enemy in a zone, after scaling, averaged over a few maps. */
  function zoneXp(city: string, zone: 0 | 1 | 2) {
    const region = CITIES.find((c) => c.id === city)!;
    let total = 0;
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const seed of seeds) {
      const m = generateMap(city, seed, undefined, undefined, true);
      for (const camp of placeCamps(m.grid, m.spawn, seed, region.signature).camps) {
        if (camp.tier !== zone) continue;
        for (const member of camp.members) total += Math.max(1, Math.round(ENEMY_STATS[member.type].xp * scaleFor(city, zone).xp));
      }
    }
    return total / seeds.length;
  }

  it('a new knight can level up enough to open New York\'s first gate by clearing the outskirts once', () => {
    expect(zoneXp('nyc', 0)).toBeGreaterThanOrEqual(cumXp(gateLevels('nyc')[0]) * 1.1);
  });

  it('and enough for the second gate by clearing the outskirts and midtown once', () => {
    const have = zoneXp('nyc', 0) + zoneXp('nyc', 1);
    expect(have).toBeGreaterThanOrEqual(cumXp(gateLevels('nyc')[1]) * 1.05);
  });

  it('a knight who beat the first city\'s boss has the level for the second city\'s first gate', () => {
    const afterNyc = zoneXp('nyc', 0) + zoneXp('nyc', 1) + zoneXp('nyc', 2) + ENEMY_STATS.phantomBus.xp * bossScaleFor('nyc').xp;
    expect(afterNyc).toBeGreaterThanOrEqual(cumXp(gateLevels('miami')[0]));
  });
});
