import { describe, expect, it } from 'vitest';
import { CITIES } from '../src/config/regions';
import { generateMap, isSolid, isWalkable, PLAZA_RADIUS, TileType, unreachableWalkable } from '../src/systems/mapGen';
import { applyStaticWeather } from '../src/systems/terrainRules';
import { placePois, POI_CLEARANCE, POI_COUNT, poiCenter, poisOf, tunnelFor } from '../src/systems/pois';
import { flood, generateUnderground } from '../src/systems/underground';
import { miniPoint, minimapPixels, miniSize, MINI_COLOURS, tileColour } from '../src/systems/minimap';
import { MAP_COLS, MAP_ROWS, TILE } from '../src/config/constants';

const SEEDS = [3, 33, 404, 5150, 90210, 777777];
const dressOf = (id: string) => CITIES.find((c) => c.id === id)!.dress;

describe('points of interest', () => {
  it('puts the same things in the same places for the same map, and others elsewhere for another', () => {
    for (const city of CITIES) {
      const { grid, spawn } = generateMap(city.id, 12);
      const a = placePois(grid, spawn, 12, city.dress);
      expect(placePois(grid, spawn, 12, city.dress)).toEqual(a);
      const other = generateMap(city.id, 13);
      expect(placePois(other.grid, other.spawn, 13, city.dress)).not.toEqual(a);
    }
  });

  it('has four entrances, three shrines and ten crates, on every city and many seeds', () => {
    for (const city of CITIES) {
      for (const seed of SEEDS) {
        const { grid, spawn } = generateMap(city.id, seed);
        const pois = placePois(grid, spawn, seed, city.dress);
        for (const kind of ['entrance', 'shrine', 'crate'] as const) expect(poisOf(pois, kind), `${city.id} ${seed} ${kind}`).toHaveLength(POI_COUNT[kind]);
        expect(pois.map((p) => p.id)).toEqual(pois.map((_, i) => i));
      }
    }
  });

  it('every one is on open ground the knight can walk to, away from the plaza and from each other', () => {
    for (const city of CITIES) {
      for (const seed of SEEDS) {
        const { grid, spawn } = generateMap(city.id, seed);
        expect(unreachableWalkable(grid, spawn)).toBe(0);
        const pois = placePois(grid, spawn, seed, city.dress);
        for (const p of pois) {
          const tag = `${city.id} ${seed} ${p.kind}#${p.id}`;
          // open ground all round: nothing solid or wet beside it, so the knight can reach it from any side
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(isSolid(grid[p.row + dy][p.col + dx]) || [TileType.WATER, TileType.SHALLOW].includes(grid[p.row + dy][p.col + dx]), tag).toBe(false);
          expect(Math.hypot(p.col - spawn.col, p.row - spawn.row), tag).toBeGreaterThanOrEqual(POI_CLEARANCE);
          expect(POI_CLEARANCE).toBeGreaterThan(PLAZA_RADIUS);
        }
        for (let i = 0; i < pois.length; i++) for (let j = i + 1; j < pois.length; j++) expect(Math.hypot(pois[i].col - pois[j].col, pois[i].row - pois[j].row), `${city.id} ${seed} ${i}/${j}`).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('stays on walkable ground when the weather has changed the map (rain makes puddles and mud)', () => {
    for (const city of CITIES) {
      const { grid, spawn } = generateMap(city.id, 88);
      const pois = placePois(grid, spawn, 88, city.dress);
      for (const weather of ['rain', 'tropical_downpour', 'cold_front', 'heat']) {
        const out = applyStaticWeather(grid, weather, 88);
        for (const p of pois) expect(isWalkable(out[p.row][p.col]), `${city.id} ${weather} ${p.kind}`).toBe(true);
      }
    }
  });

  it('links the entrances in two pairs, each pair on one tunnel and far apart', () => {
    for (const city of CITIES) {
      for (const seed of SEEDS) {
        const { grid, spawn } = generateMap(city.id, seed);
        const pois = placePois(grid, spawn, seed, city.dress);
        const ents = poisOf(pois, 'entrance');
        for (const e of ents) {
          const partner = ents.find((x) => x.id === e.pair)!;
          expect(partner, `${city.id} ${seed}`).toBeDefined();
          expect(partner.pair).toBe(e.id);
          expect(partner.tunnel).toBe(e.tunnel);
          expect(partner.id).not.toBe(e.id);
          const t = tunnelFor(pois, e.id)!;
          expect(t.exitId).toBe(partner.id);
          expect(tunnelFor(pois, partner.id)!.reversed).toBe(!t.reversed);
          expect(Math.hypot(e.col - partner.col, e.row - partner.row), 'a tunnel is worth taking').toBeGreaterThan(20);
        }
        expect(new Set(ents.map((e) => e.tunnel))).toEqual(new Set([0, 1]));
      }
    }
    expect(tunnelFor([], 0)).toBeNull();
  });

  it('puts street entrances by a road and coastal ones by water or rock, where it can', () => {
    let themedCount = 0;
    let total = 0;
    for (const city of CITIES) {
      for (const seed of SEEDS) {
        const { grid, spawn } = generateMap(city.id, seed);
        for (const e of poisOf(placePois(grid, spawn, seed, city.dress), 'entrance')) {
          total++;
          const r = city.dress === 'street' ? 2 : 3;
          let ok = false;
          for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) {
            const t = grid[e.row + dy]?.[e.col + dx];
            ok = city.dress === 'street' ? t === TileType.PATH : [TileType.WATER, TileType.SHALLOW, TileType.ROCK].includes(t);
          }
          if (ok) themedCount++;
        }
      }
    }
    expect(themedCount / total).toBeGreaterThan(0.6);
  });

  it('keeps stairs and shrines off the road itself, wherever it can', () => {
    let onRoad = 0;
    let total = 0;
    for (const city of CITIES) {
      for (const seed of SEEDS) {
        const { grid, spawn } = generateMap(city.id, seed);
        for (const p of placePois(grid, spawn, seed, city.dress)) {
          if (p.kind === 'crate') continue;
          total++;
          if (grid[p.row][p.col] === TileType.PATH) onRoad++;
        }
      }
    }
    expect(onRoad / total).toBeLessThan(0.05);
  });

  it('gives a pixel centre for a tile', () => {
    expect(poiCenter({ col: 3, row: 4 })).toEqual({ x: 3 * TILE + 8, y: 4 * TILE + 8 });
  });
});

describe('the tunnels', () => {
  const tunnels = () => CITIES.flatMap((c) => SEEDS.flatMap((seed) => [0, 1].map((t) => ({ city: c, seed, t, tun: generateUnderground(c.id, seed, t, c.dress) }))));

  it('is the same tunnel every time, and differs by seed, tunnel number and city', () => {
    const a = generateUnderground('nyc', 5, 0, 'street');
    expect(generateUnderground('nyc', 5, 0, 'street')).toEqual(a);
    expect(generateUnderground('nyc', 6, 0, 'street').grid).not.toEqual(a.grid);
    expect(generateUnderground('nyc', 5, 1, 'street').grid).not.toEqual(a.grid);
    expect(generateUnderground('tokyo', 5, 0, 'street').grid).not.toEqual(a.grid);
  });

  it('is the size of the world, and solid rock round the edge', () => {
    const { grid } = generateUnderground('london', 9, 0, 'street');
    expect(grid).toHaveLength(MAP_ROWS);
    expect(grid[0]).toHaveLength(MAP_COLS);
    for (let i = 0; i < MAP_COLS; i++) {
      expect(isSolid(grid[0][i])).toBe(true);
      expect(isSolid(grid[MAP_ROWS - 1][i])).toBe(true);
    }
    for (let i = 0; i < MAP_ROWS; i++) {
      expect(isSolid(grid[i][0])).toBe(true);
      expect(isSolid(grid[i][MAP_COLS - 1])).toBe(true);
    }
  });

  it('can be walked from the way in to the way out, to every chest and to every open tile', () => {
    for (const { city, seed, t, tun } of tunnels()) {
      const tag = `${city.id} ${seed} #${t}`;
      const reached = flood(tun.grid, tun.a);
      expect(reached[tun.b.row * MAP_COLS + tun.b.col], `${tag}: A to B`).toBe(1);
      for (const c of tun.chests) expect(reached[c.row * MAP_COLS + c.col], `${tag}: chest ${c.col},${c.row}`).toBe(1);
      for (let y = 0; y < MAP_ROWS; y++) for (let x = 0; x < MAP_COLS; x++) if (isWalkable(tun.grid[y][x])) expect(reached[y * MAP_COLS + x], `${tag}: ${x},${y}`).toBe(1);
    }
  });

  it('has the stairs at opposite ends with landings, and plenty to explore', () => {
    for (const { city, seed, t, tun } of tunnels()) {
      const tag = `${city.id} ${seed} #${t}`;
      expect(tun.b.col - tun.a.col, tag).toBeGreaterThan(70);
      for (const stairs of [tun.a, tun.b]) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expect(isWalkable(tun.grid[stairs.row + dy][stairs.col + dx]), `${tag} landing`).toBe(true);
      const walk = tun.grid.flat().filter(isWalkable).length / (MAP_COLS * MAP_ROWS);
      expect(walk, tag).toBeGreaterThan(0.06);
      expect(walk, tag).toBeLessThan(0.45);
      expect(tun.chests.length, `${tag} chests`).toBeGreaterThanOrEqual(4);
    }
  });

  it('is a subway under the street cities (pavement, pillars) and a cave under the coast (sand, pools)', () => {
    const count = (grid: number[][], tile: number) => grid.flat().filter((v) => v === tile).length;
    for (const seed of SEEDS) {
      const subway = generateUnderground('nyc', seed, 0, dressOf('nyc'));
      expect(count(subway.grid, TileType.PATH), `subway ${seed}`).toBeGreaterThan(300);
      expect(count(subway.grid, TileType.PROP), `pillars ${seed}`).toBeGreaterThan(5);
      expect(count(subway.grid, TileType.WATER)).toBe(0);
      const cave = generateUnderground('miami', seed, 0, dressOf('miami'));
      expect(count(cave.grid, TileType.GRASS_A), `cave ${seed}`).toBeGreaterThan(300);
      expect(count(cave.grid, TileType.WATER), `pools ${seed}`).toBeGreaterThan(0);
      expect(count(cave.grid, TileType.PROP)).toBe(0);
    }
  });
});

describe('the minimap', () => {
  it('is a quarter the size of the map, one pixel for each 2x2 of tiles', () => {
    const { grid } = generateMap('nyc', 4);
    expect(miniSize(grid)).toEqual({ w: MAP_COLS / 2, h: MAP_ROWS / 2 });
    expect(minimapPixels(grid)).toHaveLength((MAP_COLS / 2) * (MAP_ROWS / 2));
  });

  it('shows water, roads, buildings and land in different colours, and the majority wins', () => {
    expect(new Set([tileColour(TileType.WATER), tileColour(TileType.PATH), tileColour(TileType.BUILDING), tileColour(TileType.GRASS_A), tileColour(TileType.ROCK), tileColour(TileType.ICE), tileColour(TileType.MUD)]).size).toBe(7);
    expect(tileColour(TileType.SHALLOW)).toBe(tileColour(TileType.WATER));
    expect(tileColour(TileType.BRIDGE)).toBe(tileColour(TileType.PATH));
    const grid = [[TileType.WATER, TileType.WATER], [TileType.WATER, TileType.GRASS_A]];
    expect(minimapPixels(grid)).toEqual([MINI_COLOURS.water]);
    expect(minimapPixels([[TileType.PATH, TileType.PATH], [TileType.GRASS_A, TileType.BUILDING]])).toEqual([MINI_COLOURS.road]);
  });

  it('a river shows on the minimap, and every colour it uses is a known one', () => {
    const { grid } = generateMap('nyc', 33);
    const px = minimapPixels(grid);
    const colours = new Set(px);
    for (const c of colours) expect(Object.values(MINI_COLOURS)).toContain(c);
    expect(px.filter((c) => c === MINI_COLOURS.water).length).toBeGreaterThan(100);
    expect(px.filter((c) => c === MINI_COLOURS.building).length).toBeGreaterThan(400);
  });

  it('puts a world position on the right minimap pixel', () => {
    expect(miniPoint(0, 0)).toEqual({ x: 0, y: 0 });
    expect(miniPoint(100 * TILE, 100 * TILE)).toEqual({ x: 50, y: 50 });
    expect(miniPoint(8 * TILE, 4 * TILE)).toEqual({ x: 4, y: 2 });
  });
});
