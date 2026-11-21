import { describe, expect, it } from 'vitest';
import { GATE_LEVELS, ZONE_RADII, gateLevels, levelForZone, suggestedLevel, zoneAt, type Gate } from '../src/systems/zones';
import { generateMap, isWalkable, unreachableWalkable, TileType, type Grid } from '../src/systems/mapGen';
import { CITIES, REGIONS } from '../src/config/regions';
import { earnedKnights, newlyEarned, sanitizeUnlocked, unlockHint, FIRST_KNIGHT, type UnlockContext } from '../src/systems/unlocks';
import { CHARACTERS } from '../src/config/characters';
import { placeCamps } from '../src/systems/camps';

const zoned = (id: string, seed: number) => generateMap(id, seed, undefined, undefined, true);
const plainWalkable = (g: Grid) => g.flat().filter(isWalkable).length;

describe('zones', () => {
  for (const city of CITIES) {
    for (const seed of [1, 7, 33, 90210, 6, 12]) {
      it(`${city.id} (seed ${seed}): two rings with gates, everything reachable, little of the map lost`, () => {
        const plain = generateMap(city.id, seed);
        const m = zoned(city.id, seed);
        const [l1, l2] = gateLevels(city.id);
        // every walkable tile can be reached from the plaza (through the gates)
        expect(unreachableWalkable(m.grid, m.spawn)).toBe(0);
        // both rings have at least one gate, at their own level
        for (const ring of [1, 2] as const) {
          const g = m.gates.filter((x) => x.ring === ring);
          expect(g.length, `ring ${ring}`).toBeGreaterThanOrEqual(1);
          expect(g.length).toBeLessThanOrEqual(4);
          for (const gate of g) {
            expect(gate.level).toBe(ring === 1 ? l1 : l2);
            expect(gate.tiles.length).toBeGreaterThan(1);
            for (const t of gate.tiles) {
              expect(isWalkable(m.grid[t.row][t.col]), `gate tile ${t.col},${t.row} is open ground`).toBe(true);
              const d = Math.hypot(t.col - m.spawn.col, t.row - m.spawn.row);
              expect(Math.abs(d - ZONE_RADII[ring - 1])).toBeLessThanOrEqual(1.1); // in its ring
            }
          }
        }
        // the rings are solid everywhere except the gates (nothing walkable crosses them)
        const gateTiles = new Set(m.gates.flatMap((g) => g.tiles.map((t) => `${t.col},${t.row}`)));
        for (const radius of ZONE_RADII) {
          for (let row = 0; row < m.grid.length; row++) {
            for (let col = 0; col < m.grid[0].length; col++) {
              const d = Math.hypot(col - m.spawn.col, row - m.spawn.row);
              if (d >= radius - 1 && d < radius + 1 && !gateTiles.has(`${col},${row}`)) expect(isWalkable(m.grid[row][col]), `${col},${row} is shut`).toBe(false);
            }
          }
        }
        // the zoning costs the knight little of the map
        expect((plainWalkable(plain.grid) - plainWalkable(m.grid)) / plainWalkable(plain.grid)).toBeLessThan(0.15);
      });
    }
  }

  it('the zones are real: nothing in a farther zone can be walked to without a gate', () => {
    // close every gate and flood from the plaza: only the outskirts are reachable
    for (const city of CITIES) {
      const m = zoned(city.id, 33);
      const grid = m.grid.map((r) => r.slice());
      for (const g of m.gates) for (const t of g.tiles) grid[t.row][t.col] = TileType.ROCK;
      const reached = new Set<number>();
      const cols = grid[0].length;
      const queue = [m.spawn.row * cols + m.spawn.col];
      reached.add(queue[0]);
      for (let q = 0; q < queue.length; q++) {
        const x = queue[q] % cols;
        const y = (queue[q] - x) / cols;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= grid.length || reached.has(ny * cols + nx) || !isWalkable(grid[ny][nx])) continue;
          reached.add(ny * cols + nx);
          queue.push(ny * cols + nx);
        }
      }
      for (const i of reached) expect(zoneAt(i % cols, Math.floor(i / cols), m.spawn), `${city.id}`).toBe(0);
    }
  });

  it('opening only the first ring leads to midtown and no further', () => {
    const m = zoned('nyc', 33);
    const grid = m.grid.map((r) => r.slice());
    for (const g of m.gates) if (g.ring === 2) for (const t of g.tiles) grid[t.row][t.col] = TileType.ROCK;
    const cols = grid[0].length;
    const seen = new Set<number>([m.spawn.row * cols + m.spawn.col]);
    const queue = [...seen];
    for (let q = 0; q < queue.length; q++) {
      const x = queue[q] % cols;
      const y = (queue[q] - x) / cols;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= grid.length || seen.has(ny * cols + nx) || !isWalkable(grid[ny][nx])) continue;
        seen.add(ny * cols + nx);
        queue.push(ny * cols + nx);
      }
    }
    const zones = new Set([...seen].map((i) => zoneAt(i % cols, Math.floor(i / cols), m.spawn)));
    expect(zones.has(1)).toBe(true);
    expect(zones.has(2)).toBe(false);
  });

  it('is the same for a map and seed, different for another, and an unzoned map has no rings or gates', () => {
    expect(zoned('nyc', 5).gates).toEqual(zoned('nyc', 5).gates);
    expect(JSON.stringify(zoned('nyc', 5).gates)).not.toBe(JSON.stringify(zoned('nyc', 6).gates));
    const plain = generateMap('nyc', 5);
    expect(plain.gates).toEqual([]);
    expect(plain.grid).toEqual(generateMap('nyc', 5).grid);
  });

  it('every camp and the boss are in the zone they are meant for, and so is every ring on the same radii', () => {
    for (const city of CITIES) {
      const m = zoned(city.id, 33);
      const { camps, boss } = placeCamps(m.grid, m.spawn, 33, city.signature);
      for (const c of camps) expect(c.tier).toBe(zoneAt(c.col, c.row, m.spawn));
      expect(zoneAt(boss.col, boss.row, m.spawn)).toBe(2); // the boss waits in the core
      for (const c of camps) expect(isWalkable(m.grid[c.row][c.col])).toBe(true);
      expect(camps.filter((c) => c.tier === 2).length, `${city.id}: camps in the core`).toBeGreaterThan(0);
    }
  });

  it('gate levels: two per city, rising within a city, and later cities ask more', () => {
    for (const city of CITIES) {
      const [a, b] = gateLevels(city.id);
      expect(a).toBeGreaterThanOrEqual(2);
      expect(b).toBeGreaterThan(a);
    }
    const order = CITIES.map((c) => suggestedLevel(c.id));
    expect(order).toEqual([...order].sort((x, y) => x - y)); // nyc, miami, london, tokyo, mumbai
    expect(new Set(order).size).toBe(order.length);
    expect(levelForZone('nyc', 0)).toBe(1);
    expect(levelForZone('nyc', 1)).toBe(GATE_LEVELS.nyc[0]);
    expect(levelForZone('nyc', 2)).toBe(GATE_LEVELS.nyc[1]);
    expect(gateLevels('nowhere')).toEqual(gateLevels('nyc'));
    expect(REGIONS.length).toBeGreaterThan(CITIES.length);
  });

  it('the gate list is plain data: tiles, a level, and a middle', () => {
    const g: Gate = zoned('tokyo', 4).gates[0];
    expect(typeof g.level).toBe('number');
    expect(typeof g.col).toBe('number');
    expect(Array.isArray(g.tiles)).toBe(true);
  });
});

describe('knights earned', () => {
  const base: UnlockContext = { wins: 0, level: 1, storyStarted: false, storyStage: 0, storyComplete: false };

  it('only the Rain Knight at the start', () => {
    expect(earnedKnights(base)).toEqual([FIRST_KNIGHT]);
    expect(FIRST_KNIGHT).toBe(CHARACTERS[0].id);
  });

  it('the Hail Warden comes with a boss won, or the story as far as stage 3', () => {
    expect(earnedKnights({ ...base, wins: 1 })).toContain('hailWarden');
    expect(earnedKnights({ ...base, storyStarted: true, storyStage: 3 })).toContain('hailWarden');
    expect(earnedKnights({ ...base, storyStarted: true, storyStage: 2 })).not.toContain('hailWarden');
    expect(earnedKnights({ ...base, storyStage: 5 })).not.toContain('hailWarden'); // (a story that never started counts for nothing)
  });

  it('the Storm Chaser comes at level 10, or the story as far as stage 5, or a finished story', () => {
    expect(earnedKnights({ ...base, level: 9 })).not.toContain('stormChaser');
    expect(earnedKnights({ ...base, level: 10 })).toContain('stormChaser');
    expect(earnedKnights({ ...base, storyStarted: true, storyStage: 5 })).toContain('stormChaser');
    expect(earnedKnights({ ...base, storyComplete: true })).toEqual(['rainKnight', 'hailWarden', 'stormChaser']);
  });

  it('knows what is new, and what each locked knight asks for', () => {
    expect(newlyEarned(['rainKnight'], { ...base, wins: 2, level: 12 })).toEqual(['hailWarden', 'stormChaser']);
    expect(newlyEarned(['rainKnight', 'hailWarden'], { ...base, wins: 2 })).toEqual([]);
    expect(unlockHint('hailWarden').length).toBeGreaterThan(0);
    expect(unlockHint('stormChaser').length).toBeLessThanOrEqual(24); // fits the mirror's panel
    expect(unlockHint('hailWarden').length).toBeLessThanOrEqual(24);
    expect(unlockHint('rainKnight')).toBe('');
  });

  it('every knight but the first has a rule', () => {
    for (const c of CHARACTERS.slice(1)) expect(unlockHint(c.id), c.id).not.toBe('');
  });

  it('reads a saved list: known knights only, the first always, the one in use too', () => {
    const known = new Set(CHARACTERS.map((c) => c.id));
    expect(sanitizeUnlocked(undefined, known, 'rainKnight')).toEqual(['rainKnight']);
    expect(sanitizeUnlocked(['hailWarden', 'nobody', 7, 'hailWarden'], known, 'rainKnight')).toEqual(['rainKnight', 'hailWarden']);
    expect(sanitizeUnlocked([], known, 'stormChaser')).toEqual(['rainKnight', 'stormChaser']); // a save from before: the knight in use is theirs
  });
});

describe('earned knights in the save', () => {
  it('a new profile has only the Rain Knight, and it round-trips', async () => {
    const { defaultSave, parseStored, serialize } = await import('../src/save/save');
    const save = defaultSave();
    expect(save.town.unlocked).toEqual(['rainKnight']);
    const more = { ...save, town: { ...save.town, unlocked: ['rainKnight', 'hailWarden'] } };
    expect(parseStored(serialize(more), 0).save.town.unlocked).toEqual(['rainKnight', 'hailWarden']);
  });

  it('a save from before knights were earned keeps the knight it was using', async () => {
    const { defaultSave, parseStored, serialize } = await import('../src/save/save');
    const doc = JSON.parse(serialize(defaultSave()));
    delete doc.town.unlocked;
    doc.town.characterId = 'stormChaser';
    expect(parseStored(JSON.stringify(doc), 0).save.town.unlocked).toEqual(['rainKnight', 'stormChaser']);
  });

  it('junk in the list is dropped', async () => {
    const { defaultSave, parseStored, serialize } = await import('../src/save/save');
    const doc = JSON.parse(serialize(defaultSave()));
    doc.town.unlocked = ['hailWarden', 'wizard', 4, null];
    expect(parseStored(JSON.stringify(doc), 0).save.town.unlocked).toEqual(['rainKnight', 'hailWarden']);
  });
});
