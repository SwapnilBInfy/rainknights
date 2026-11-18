import { describe, expect, it } from 'vitest';
import { ensureConnected, generateMap, isSolid, PLAZA_RADIUS, TileType, TILE_TYPE_COUNT, unreachableWalkable, type Grid } from '../src/systems/mapGen';
import { MAP_COLS, MAP_ROWS } from '../src/config/constants';

const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919);
const REGIONS = ['nyc', 'miami'];

const count = (grid: Grid, t: number) => grid.flat().filter((v) => v === t).length;
const fraction = (grid: Grid, pred: (t: number) => boolean) => grid.flat().filter(pred).length / (grid.length * grid[0].length);

describe('generateMap', () => {
  it('is deterministic: the same seed makes the same map, a different seed a different one', () => {
    for (const region of REGIONS) {
      const a = generateMap(region, 4242);
      const b = generateMap(region, 4242);
      const c = generateMap(region, 4243);
      expect(a.grid).toEqual(b.grid);
      expect(a.grid).not.toEqual(c.grid);
    }
  });

  it('fills the whole world with valid tile ids', () => {
    for (const region of REGIONS) {
      const { grid } = generateMap(region, 7);
      expect(grid).toHaveLength(MAP_ROWS);
      for (const row of grid) {
        expect(row).toHaveLength(MAP_COLS);
        for (const t of row) expect(t >= 0 && t < TILE_TYPE_COUNT).toBe(true);
      }
    }
  });

  it('always leaves a clear, walkable plaza at the spawn', () => {
    for (const region of REGIONS) {
      for (const seed of SEEDS) {
        const { grid, spawn } = generateMap(region, seed);
        for (let dy = -PLAZA_RADIUS + 1; dy <= PLAZA_RADIUS - 1; dy++) {
          for (let dx = -PLAZA_RADIUS + 1; dx <= PLAZA_RADIUS - 1; dx++) {
            if (dx * dx + dy * dy > (PLAZA_RADIUS - 1) ** 2) continue;
            expect(isSolid(grid[spawn.row + dy][spawn.col + dx]), `${region} ${seed}`).toBe(false);
          }
        }
      }
    }
  });

  it('every walkable tile can be reached from the spawn, for many seeds', () => {
    for (const region of REGIONS) {
      for (const seed of SEEDS) {
        const { grid, spawn } = generateMap(region, seed);
        expect(unreachableWalkable(grid, spawn), `${region} seed ${seed}`).toBe(0);
      }
    }
  });

  it('is open enough to play but built up enough to matter', () => {
    for (const region of REGIONS) {
      for (const seed of SEEDS.slice(0, 20)) {
        const { grid } = generateMap(region, seed);
        const solid = fraction(grid, isSolid);
        expect(solid, `${region} ${seed} solid=${solid.toFixed(2)}`).toBeGreaterThan(0.12);
        expect(solid, `${region} ${seed} solid=${solid.toFixed(2)}`).toBeLessThan(0.55);
      }
    }
  });

  it('New York is a street grid with buildings, a river, bridges and shallow ponds', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { grid } = generateMap('nyc', seed);
      expect(count(grid, TileType.BUILDING), `buildings ${seed}`).toBeGreaterThan(900);
      expect(count(grid, TileType.PATH), `roads ${seed}`).toBeGreaterThan(900);
      expect(count(grid, TileType.WATER), `deep water ${seed}`).toBeGreaterThan(150);
      expect(count(grid, TileType.SHALLOW), `shallows ${seed}`).toBeGreaterThan(150);
    }
  });

  it('Miami has an ocean, canals, shallows and fewer buildings than New York', () => {
    let nyc = 0;
    let miami = 0;
    for (const seed of SEEDS.slice(0, 10)) {
      const m = generateMap('miami', seed).grid;
      expect(count(m, TileType.WATER), `deep water ${seed}`).toBeGreaterThan(500);
      expect(count(m, TileType.SHALLOW), `shallows ${seed}`).toBeGreaterThan(200);
      expect(count(m, TileType.PATH), `boardwalks ${seed}`).toBeGreaterThan(300);
      miami += count(m, TileType.BUILDING);
      nyc += count(generateMap('nyc', seed).grid, TileType.BUILDING);
    }
    expect(miami).toBeLessThan(nyc / 2);
  });

  it('roads carry across water on bridge decks', () => {
    for (const region of REGIONS) {
      for (const seed of SEEDS.slice(0, 10)) {
        const { grid } = generateMap(region, seed);
        expect(count(grid, TileType.BRIDGE), `${region} bridges ${seed}`).toBeGreaterThan(8);
        // a deck is never an isolated tile: it spans water, so it touches water or more deck
        const wet = (t: number) => t === TileType.WATER || t === TileType.SHALLOW || t === TileType.BRIDGE;
        for (let y = 1; y < MAP_ROWS - 1; y++) {
          for (let x = 1; x < MAP_COLS - 1; x++) {
            if (grid[y][x] !== TileType.BRIDGE) continue;
            const touches = [grid[y][x - 1], grid[y][x + 1], grid[y - 1][x], grid[y + 1][x]].filter(wet).length;
            expect(touches, `${region} ${seed} deck at ${x},${y}`).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  it('streets have trees, parked cars and lamps or hydrants; Miami has palms and umbrellas but no cars', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const nyc = generateMap('nyc', seed).grid;
      expect(count(nyc, TileType.CAR), `cars ${seed}`).toBeGreaterThan(12);
      expect(count(nyc, TileType.TREE), `trees ${seed}`).toBeGreaterThan(20);
      expect(count(nyc, TileType.PROP), `props ${seed}`).toBeGreaterThan(6);
      const miami = generateMap('miami', seed).grid;
      expect(count(miami, TileType.CAR), `miami cars ${seed}`).toBe(0);
      expect(count(miami, TileType.TREE), `palms ${seed}`).toBeGreaterThan(220);
      expect(count(miami, TileType.PROP), `umbrellas ${seed}`).toBeGreaterThan(8);
    }
  });

  it('props are solid, and a parked car always sits on the road with open road beside it', () => {
    for (const t of [TileType.TREE, TileType.CAR, TileType.PROP]) expect(isSolid(t)).toBe(true);
    for (const seed of SEEDS.slice(0, 10)) {
      const { grid } = generateMap('nyc', seed);
      for (let y = 1; y < MAP_ROWS - 1; y++) {
        for (let x = 1; x < MAP_COLS - 1; x++) {
          if (grid[y][x] !== TileType.CAR) continue;
          const road = [grid[y - 1][x], grid[y + 1][x], grid[y][x - 1], grid[y][x + 1]].filter((t) => t === TileType.PATH).length;
          expect(road, `car at ${x},${y} seed ${seed}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('keeps the spawn plaza free of props', () => {
    for (const region of REGIONS) {
      for (const seed of SEEDS.slice(0, 10)) {
        const { grid, spawn } = generateMap(region, seed);
        for (let dy = -PLAZA_RADIUS + 1; dy < PLAZA_RADIUS; dy++) {
          for (let dx = -PLAZA_RADIUS + 1; dx < PLAZA_RADIUS; dx++) {
            if (dx * dx + dy * dy > (PLAZA_RADIUS - 1) ** 2) continue;
            const t = grid[spawn.row + dy][spawn.col + dx];
            expect([TileType.TREE, TileType.CAR, TileType.PROP], `${region} ${seed}`).not.toContain(t);
          }
        }
      }
    }
  });

  it('the world edge is a skyline in New York and a palm-lined sea wall in Miami', () => {
    const nyc = generateMap('nyc', 5).grid;
    // (the river runs off the map edge, so the skyline has a gap where it leaves)
    expect(nyc[0].filter((t) => t === TileType.BUILDING).length).toBeGreaterThan(MAP_COLS * 0.85);
    expect(nyc.map((row) => row[0]).filter((t) => t === TileType.BUILDING).length).toBeGreaterThan(MAP_ROWS * 0.85);
    const miami = generateMap('miami', 5).grid;
    let palms = 0;
    for (let y = 2; y < MAP_ROWS - 2; y++) {
      for (const x of [1, MAP_COLS - 2]) if (miami[y][x] === TileType.TREE) palms++;
    }
    expect(palms).toBeGreaterThan(20);
  });

  it('bridges are walkable', () => {
    expect(isSolid(TileType.BRIDGE)).toBe(false);
  });
});

describe('ensureConnected', () => {
  const open = (cols: number, rows: number): Grid => Array.from({ length: rows }, () => Array<number>(cols).fill(TileType.GRASS_A));

  it('fills a tiny walled-off pocket with rock instead of leaving it unreachable', () => {
    const g = open(40, 40);
    for (let i = 28; i < 33; i++) for (const [x, y] of [[i, 28], [i, 32], [28, i], [32, i]]) g[y][x] = TileType.ROCK;
    const spawn = { col: 5, row: 5 };
    expect(unreachableWalkable(g, spawn)).toBeGreaterThan(0);
    ensureConnected(g, spawn);
    expect(unreachableWalkable(g, spawn)).toBe(0);
  });

  it('carves a road to a large walled-off area', () => {
    const g = open(60, 60);
    // a deep-water moat around a big island
    for (let y = 15; y < 50; y++) for (let x = 15; x < 50; x++) if (x < 18 || x > 46 || y < 18 || y > 46) g[y][x] = TileType.WATER;
    const spawn = { col: 3, row: 3 };
    expect(unreachableWalkable(g, spawn)).toBeGreaterThan(500);
    ensureConnected(g, spawn);
    expect(unreachableWalkable(g, spawn)).toBe(0);
    // the moat is water, so the carved crossing is a bridge deck
    expect(g.flat().filter((t) => t === TileType.PATH || t === TileType.BRIDGE).length).toBeGreaterThan(0);
  });

  it('leaves an already connected map alone', () => {
    const g = open(30, 30);
    g[10][10] = TileType.ROCK;
    const before = g.map((r) => r.slice());
    ensureConnected(g, { col: 2, row: 2 });
    expect(g).toEqual(before);
  });
});
