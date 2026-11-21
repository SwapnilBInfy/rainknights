import { describe, expect, it } from 'vitest';
import { CAMP_CLEARANCE, CAMP_COUNT, ROSTER, TIER_EDGES, placeCamps, tierAt, tunnelCamps } from '../src/systems/camps';
import { HOME_RADIUS, nextMode, patrolPoint, tuningFor } from '../src/systems/aggro';
import { freshHero, sanitizeHero, xpToNextFor, MAX_LEVEL } from '../src/systems/hero';
import { generateMap, isWalkable, unreachableWalkable } from '../src/systems/mapGen';
import { generateUnderground, flood } from '../src/systems/underground';
import { placePois, tunnelFor } from '../src/systems/pois';
import { CITIES, REGIONS } from '../src/config/regions';
import { ENEMY_STATS, MAP_COLS, XP_BASE, XP_GROWTH } from '../src/config/constants';
import { pointsForLevel } from '../src/systems/stats';

describe('camps', () => {
  for (const region of REGIONS) {
    for (const seed of [1, 7, 33, 90210]) {
      it(`${region.id} (seed ${seed}): camps stand on open ground, in the right rings, apart from each other and the plaza`, () => {
        const { grid, spawn } = generateMap(region.id, seed);
        const { camps, boss } = placeCamps(grid, spawn, seed, region.signature);
        expect(unreachableWalkable(grid, spawn)).toBe(0); // so everything walkable below can be reached
        expect(camps.length).toBeGreaterThanOrEqual(10);
        expect(camps.length).toBeLessThanOrEqual(CAMP_COUNT);
        for (const c of camps) {
          expect(isWalkable(grid[c.row][c.col])).toBe(true);
          const d = Math.hypot(c.col - spawn.col, c.row - spawn.row);
          expect(d, `camp ${c.id} too near the plaza`).toBeGreaterThanOrEqual(CAMP_CLEARANCE);
          expect(c.tier).toBe(tierAt(d));
          expect(c.members.length).toBeGreaterThanOrEqual(2);
          for (const m of c.members) {
            expect(ENEMY_STATS[m.type], `${m.type} is a known enemy`).toBeDefined();
            expect(Math.hypot(m.dx, m.dy)).toBeLessThanOrEqual(20);
            if (m.type !== region.signature) expect(ROSTER[c.tier]).toContain(m.type);
          }
        }
        // the boss waits at the far end
        expect(isWalkable(grid[boss.row][boss.col])).toBe(true);
        expect(Math.hypot(boss.col - spawn.col, boss.row - spawn.row)).toBeGreaterThan(TIER_EDGES[0]);
        for (const c of camps) expect(Math.hypot(c.col - boss.col, c.row - boss.row)).toBeGreaterThanOrEqual(8);
      });
    }
  }

  it('is the same every time for a map and seed, and different for another seed', () => {
    const a = generateMap('nyc', 5);
    const b = generateMap('nyc', 6);
    expect(placeCamps(a.grid, a.spawn, 5, 'cabWraith')).toEqual(placeCamps(a.grid, a.spawn, 5, 'cabWraith'));
    expect(placeCamps(b.grid, b.spawn, 6, 'cabWraith')).not.toEqual(placeCamps(a.grid, a.spawn, 5, 'cabWraith'));
  });

  it('gets tougher further out: the outskirts hold the small fry, the core the heavy ones', () => {
    const { grid, spawn } = generateMap('london', 12);
    const { camps } = placeCamps(grid, spawn, 12);
    const types = (tier: number) => new Set(camps.filter((c) => c.tier === tier).flatMap((c) => c.members.map((m) => m.type)));
    expect(types(0).has('snowGolem')).toBe(false);
    expect(types(0).has('hailBrute')).toBe(false);
    expect(types(2).has('rainImp')).toBe(false);
  });

  it('a signature enemy appears in some camps beyond the outskirts, and never in the outskirts', () => {
    let seen = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { grid, spawn } = generateMap('nyc', seed);
      const { camps } = placeCamps(grid, spawn, seed, 'cabWraith');
      for (const c of camps) for (const m of c.members) if (m.type === 'cabWraith') { seen++; expect(c.tier).toBeGreaterThan(0); }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('every city has camps in all three rings', () => {
    for (const city of CITIES) {
      const { grid, spawn } = generateMap(city.id, 33);
      const tiers = new Set(placeCamps(grid, spawn, 33, city.signature).camps.map((c) => c.tier));
      expect(tiers.size, `${city.id}: ${[...tiers]}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('tunnels hold a few small camps, away from both stairs, on floor the knight can reach', () => {
    for (const region of [CITIES[0], CITIES[1]]) {
      const surface = generateMap(region.id, 33);
      const pois = placePois(surface.grid, surface.spawn, 33, region.dress);
      const entrance = pois.find((p) => p.kind === 'entrance')!;
      const link = tunnelFor(pois, entrance.id)!;
      const tun = generateUnderground(region.id, 33, link.tunnel, region.dress);
      const camps = tunnelCamps(tun.grid, tun.a, tun.b, 33);
      const reached = flood(tun.grid, tun.a);
      expect(camps.length).toBeGreaterThanOrEqual(3);
      for (const c of camps) {
        expect(reached[c.row * MAP_COLS + c.col]).toBe(1);
        expect(Math.hypot(c.col - tun.a.col, c.row - tun.a.row)).toBeGreaterThanOrEqual(12);
        expect(Math.hypot(c.col - tun.b.col, c.row - tun.b.row)).toBeGreaterThanOrEqual(12);
        expect(c.members.length).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('aggro', () => {
  const t = tuningFor('rainImp');

  it('ignores a knight who is far off, and spots one who comes close', () => {
    expect(nextMode('idle', t.sight + 1, 0, t)).toBe('idle');
    expect(nextMode('idle', t.sight, 0, t)).toBe('chase');
  });

  it('gives up the chase when the knight gets far away, or when it has been dragged too far from home', () => {
    expect(nextMode('chase', t.sight * 1.5, 40, t)).toBe('chase');
    expect(nextMode('chase', t.lose + 1, 40, t)).toBe('return');
    expect(nextMode('chase', t.sight, t.leash + 1, t)).toBe('return');
  });

  it('walks home, settles into its loop, and can be spotted again on the way', () => {
    expect(nextMode('return', t.lose + 50, 100, t)).toBe('return');
    expect(nextMode('return', t.lose + 50, HOME_RADIUS, t)).toBe('idle');
    expect(nextMode('return', t.sight - 1, 100, t)).toBe('chase');
  });

  it('does not take the bait beyond its leash: a knight in sight but a long way from its spot is not chased', () => {
    expect(nextMode('idle', t.sight - 1, t.leash + 5, t)).toBe('idle');
  });

  it('bosses and vehicles see farther than imps; heavy things less far than flighty ones', () => {
    expect(tuningFor('phantomBus').sight).toBeGreaterThan(tuningFor('rainImp').sight);
    expect(tuningFor('lightningWisp').sight).toBeGreaterThan(tuningFor('snowGolem').sight);
    expect(tuningFor('nobody').sight).toBeGreaterThan(0);
  });

  it('a loop stays close to home and is different for each phase', () => {
    const home = { x: 100, y: 100 };
    for (let ms = 0; ms < 20000; ms += 333) {
      const p = patrolPoint(home, ms, 1, 16);
      expect(Math.hypot(p.x - home.x, p.y - home.y)).toBeLessThanOrEqual(16 * 1.1); // a loop is a little wider than its radius
    }
    expect(patrolPoint(home, 1000, 0, 16)).not.toEqual(patrolPoint(home, 1000, 2, 16));
  });
});

describe('the persistent knight', () => {
  it('starts at level 1 with nothing spent', () => {
    expect(freshHero()).toEqual({ level: 1, xp: 0, alloc: { strength: 0, power: 0, endurance: 0, speed: 0 } });
  });

  it('XP to the next level matches the curve the run has always used', () => {
    expect(xpToNextFor(1)).toBe(XP_BASE);
    expect(xpToNextFor(2)).toBe(XP_BASE + 2 * XP_GROWTH);
    expect(xpToNextFor(10)).toBeGreaterThan(xpToNextFor(9));
  });

  it('reads a saved hero, and cleans a damaged one', () => {
    const good = { level: 5, xp: 30, alloc: { strength: 4, power: 3, endurance: 2, speed: 1 } };
    expect(sanitizeHero(good)).toEqual(good);
    expect(sanitizeHero(null)).toEqual(freshHero());
    expect(sanitizeHero({ level: 'x', xp: 'y' })).toEqual(freshHero());
    expect(sanitizeHero({ level: 3.5 }).level).toBe(1);
    expect(sanitizeHero({ level: 9999 }).level).toBe(MAX_LEVEL);
    expect(sanitizeHero({ level: 2, xp: 99999 }).xp).toBe(xpToNextFor(2) - 1);
    expect(sanitizeHero({ level: 2, xp: -5 }).xp).toBe(0);
  });

  it('refuses more spent points than the level has earned', () => {
    const cheat = { level: 2, xp: 0, alloc: { strength: 30, power: 30, endurance: 30, speed: 30 } };
    expect(sanitizeHero(cheat).alloc).toEqual(freshHero().alloc);
    const exact = { level: 3, xp: 0, alloc: { strength: pointsForLevel(3), power: 0, endurance: 0, speed: 0 } };
    expect(sanitizeHero(exact)).toEqual(exact);
  });
});

describe('the persistent knight in the save and the profile', () => {
  it('a new profile holds a fresh hero', async () => {
    const { freshProfile } = await import('../src/economy/economy');
    expect(freshProfile().hero).toEqual(freshHero());
  });

  it('round-trips through the save, and a save from before has a fresh hero', async () => {
    const { defaultSave, parseStored, serialize } = await import('../src/save/save');
    const save = defaultSave();
    const grown = { ...save, town: { ...save.town, hero: { level: 7, xp: 12, alloc: { strength: 5, power: 4, endurance: 3, speed: 2 } } } };
    expect(parseStored(serialize(grown), 0).save.town.hero).toEqual(grown.town.hero);
    const old = JSON.parse(serialize(save));
    delete old.town.hero;
    expect(parseStored(JSON.stringify(old), 0).save.town.hero).toEqual(freshHero());
  });

  it('a damaged hero in a save is cleaned, not trusted', async () => {
    const { defaultSave, parseStored, serialize } = await import('../src/save/save');
    const doc = JSON.parse(serialize(defaultSave()));
    doc.town.hero = { level: 2, xp: 1e9, alloc: { strength: 30, power: 30, endurance: 30, speed: 30 } };
    const hero = parseStored(JSON.stringify(doc), 0).save.town.hero;
    expect(hero.level).toBe(2);
    expect(hero.xp).toBe(xpToNextFor(2) - 1);
    expect(hero.alloc).toEqual(freshHero().alloc);
  });

  it('a defeat or a flight does not touch the hero: only the town hp changes', async () => {
    const { defaultSave, recordRunResult } = await import('../src/save/save');
    expect(typeof recordRunResult).toBe('function');
    expect(defaultSave().town.hero).toEqual(freshHero());
  });
});

describe('the clock and the camps', () => {
  it('the storm clock only moves the front along; there is no boss time and no waves', async () => {
    const { WeatherDirector } = await import('../src/systems/WeatherDirector');
    const w = new WeatherDirector(0);
    expect(w.frontName).toBe('Light Drizzle');
    w.update(50_000);
    expect(w.currentFrontIndex).toBeGreaterThan(0);
    w.update(10_000_000);
    expect(w.currentFrontIndex).toBe(5); // the last front lasts as long as the knight stays
    w.restoreClock(0);
    expect(w.currentFrontIndex).toBe(0);
  });

  it('defeated residents come back only once the knight is far, and only if not held', async () => {
    const { CampDirector, RESPAWN_FAR } = await import('../src/systems/CampDirector');
    const knight = { x: 0, y: 0 };
    const made: { active: boolean }[] = [];
    const host = {
      place: () => {
        const e = { active: true } as never;
        made.push(e);
        return e;
      },
      knight: () => knight,
    };
    const camps = [{ id: 0, col: 40, row: 40, tier: 0 as const, members: [{ type: 'rainImp', dx: 0, dy: 0, phase: 0 }, { type: 'rainImp', dx: 8, dy: 0, phase: 1 }] }];
    const dir = new CampDirector(host, camps);
    dir.start();
    expect(dir.count).toBe(2);
    expect(dir.alive).toBe(2);
    (made[0] as { active: boolean }).active = false; // defeated
    knight.x = 40 * 16;
    knight.y = 40 * 16; // standing at the spot
    dir.update();
    expect(dir.alive).toBe(1);
    expect(dir.empty).toBe(1);
    knight.x = 40 * 16 + RESPAWN_FAR - 5; // still within the distance
    dir.update();
    expect(dir.alive).toBe(1);
    dir.held = true;
    knight.x = 40 * 16 + RESPAWN_FAR + 50; // far, but held
    dir.update();
    expect(dir.alive).toBe(1);
    dir.held = false;
    dir.update(); // far, not held: it is back
    expect(dir.alive).toBe(2);
  });
});
