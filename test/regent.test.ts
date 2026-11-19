import { describe, expect, it } from 'vitest';
import { CITIES, REGIONS, getRegion } from '../src/config/regions';
import { BOSS_SPAWN_DISTANCE, BOSS_SUMMONS, ENEMY_STATS } from '../src/config/constants';
import { mulberry32 } from '../src/systems/mapGen';
import { REGENT_PHASES, REGENT_STANDOFF, STRIKE, regentPhase, strikeHits, strikeSpots } from '../src/systems/regent';

describe('the Tempest Regent', () => {
  it('has three phases, by health: full, below two thirds, below a third', () => {
    expect(regentPhase(1500, 1500)).toBe(0);
    expect(regentPhase(1000, 1500)).toBe(0); // 66.7%: still the first
    expect(regentPhase(990, 1500)).toBe(1); // exactly 66%
    expect(regentPhase(700, 1500)).toBe(1);
    expect(regentPhase(495, 1500)).toBe(2); // exactly 33%
    expect(regentPhase(1, 1500)).toBe(2);
    expect(regentPhase(0, 1500)).toBe(2);
    expect(regentPhase(10, 0)).toBe(2);
  });

  it('gets faster, casts sooner and calls more lightning with every phase', () => {
    for (let i = 1; i < REGENT_PHASES.length; i++) {
      expect(REGENT_PHASES[i].speed).toBeGreaterThan(REGENT_PHASES[i - 1].speed);
      expect(REGENT_PHASES[i].castMs).toBeLessThan(REGENT_PHASES[i - 1].castMs);
      expect(REGENT_PHASES[i].strikes).toBeGreaterThan(REGENT_PHASES[i - 1].strikes);
      expect(REGENT_PHASES[i].below).toBeLessThan(REGENT_PHASES[i - 1].below);
    }
    // the last phase is hard but fair: a cast every two seconds, and a ring takes nearly a second to land
    expect(REGENT_PHASES[2].castMs).toBeGreaterThan(STRIKE.telegraphMs);
  });

  it('puts the first strike of every cast on the knight, and spreads the rest around them', () => {
    const rand = mulberry32(5);
    for (let n = 1; n <= 4; n++) {
      const spots = strikeSpots({ x: 500, y: 400 }, n, rand);
      expect(spots).toHaveLength(n);
      expect(spots[0]).toEqual({ x: 500, y: 400 });
      for (const s of spots.slice(1)) {
        const d = Math.hypot(s.x - 500, s.y - 400);
        expect(d).toBeGreaterThanOrEqual(26 - 1e-9);
        expect(d).toBeLessThanOrEqual(78 + 1e-9);
      }
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y)).toBeGreaterThanOrEqual(30 - 1e-9);
      }
    }
  });

  it('is deterministic for a given random stream, and different for another', () => {
    const a = strikeSpots({ x: 0, y: 0 }, 4, mulberry32(9));
    expect(strikeSpots({ x: 0, y: 0 }, 4, mulberry32(9))).toEqual(a);
    expect(strikeSpots({ x: 0, y: 0 }, 4, mulberry32(10))).not.toEqual(a);
  });

  it('a strike hits only what is inside its ring', () => {
    expect(strikeHits({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
    expect(strikeHits({ x: 0, y: 0 }, { x: STRIKE.radius, y: 0 })).toBe(true);
    expect(strikeHits({ x: 0, y: 0 }, { x: STRIKE.radius + 1, y: 0 })).toBe(false);
    // the knight can outrun the ring: the telegraph is long enough to walk out of
    expect(STRIKE.telegraphMs / 1000).toBeGreaterThan(0.7);
    expect(80 * (STRIKE.telegraphMs / 1000)).toBeGreaterThan(STRIKE.radius * 2);
    expect(REGENT_STANDOFF).toBeGreaterThan(0);
  });
});

describe('Stormhold, the finale', () => {
  it('is a story-only place: not in the city list, with its own boss, song, emblem and an early boss', () => {
    const region = getRegion('stormhold');
    expect(region.id).toBe('stormhold');
    expect(region.story).toBe(true);
    expect(CITIES.map((r) => r.id)).toEqual(['nyc', 'miami', 'london', 'tokyo', 'mumbai']);
    expect(REGIONS.map((r) => r.id)).toContain('stormhold');
    expect(region.boss).toBe('tempestRegent');
    expect(region.bossAt).toBeGreaterThan(0);
    expect(region.bossAt!).toBeLessThan(300);
    expect(region.bossIntro!.split('\n').every((line) => line.length <= 27)).toBe(true);
  });

  it('the boss has stats, summons and an arrival distance, like every other boss', () => {
    expect(ENEMY_STATS.tempestRegent.hp).toBeGreaterThan(ENEMY_STATS.phantomBus.hp);
    expect(BOSS_SUMMONS.tempestRegent.count).toBeGreaterThan(0);
    expect(BOSS_SPAWN_DISTANCE.tempestRegent).toBeGreaterThan(0);
    expect(ENEMY_STATS.tempestRegent.name.length).toBeLessThanOrEqual(8); // the boss bar shares its row with the name
  });
});
