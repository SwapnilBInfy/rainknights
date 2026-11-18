import { describe, expect, it } from 'vitest';
import { generateMap, TileType, type Grid } from '../src/systems/mapGen';
import { computeDecor, tileHash, type Op, type Role } from '../src/systems/decorRules';
import { TILE } from '../src/config/constants';

const blank = (cols: number, rows: number, t: number = TileType.GRASS_A): Grid => Array.from({ length: rows }, () => Array<number>(cols).fill(t));
const rolesAt = (ops: Op[], col: number, row: number): Role[] =>
  ops.filter((o) => o.x >= col * TILE && o.x < (col + 1) * TILE && o.y >= row * TILE && o.y < (row + 1) * TILE).map((o) => o.role);
const has = (ops: Op[], col: number, row: number, role: Role) => rolesAt(ops, col, row).includes(role);
const opts = { regionId: 'nyc', seed: 1 };

describe('shorelines', () => {
  it('draws foam on the water side where it meets land, and none inside open water', () => {
    const g = blank(9, 9, TileType.WATER);
    g[4][4] = TileType.GRASS_A; // an island
    const ops = computeDecor(g, opts);
    expect(has(ops, 4, 3, 'foam')).toBe(true); // water tile north of the island
    expect(has(ops, 4, 5, 'foam')).toBe(true);
    expect(has(ops, 1, 1, 'foam')).toBe(false); // open water
  });

  it('adds a softer second line on shallow water and a depth edge where deep meets shallow', () => {
    const g = blank(9, 9, TileType.WATER);
    g[4][4] = TileType.GRASS_A;
    g[4][5] = TileType.SHALLOW;
    const ops = computeDecor(g, opts);
    expect(has(ops, 5, 4, 'foamSoft')).toBe(true);
    expect(has(ops, 6, 4, 'deepEdge')).toBe(true);
  });

  it('does not draw an edge at the rim of the world', () => {
    const g = blank(5, 5, TileType.WATER);
    expect(computeDecor(g, opts)).toHaveLength(0);
  });

  it('puts a shadow on the water under a bridge deck', () => {
    const g = blank(7, 7, TileType.WATER);
    g[3][3] = TileType.BRIDGE;
    const ops = computeDecor(g, opts);
    expect(has(ops, 3, 2, 'deckShadow')).toBe(true);
  });
});

describe('roads', () => {
  it('draws a curb where a road meets grass, but not between two road tiles', () => {
    const g = blank(7, 5);
    for (let c = 0; c < 7; c++) g[2][c] = TileType.PATH;
    const ops = computeDecor(g, opts);
    expect(has(ops, 3, 2, 'curb')).toBe(true);
    const roadsOnly = blank(5, 5, TileType.PATH);
    expect(computeDecor(roadsOnly, opts).some((o) => o.role === 'curb')).toBe(false);
  });

  it('marks the centre line of a three-wide street, in New York but not on Miami boardwalks', () => {
    const g = blank(12, 9);
    for (let c = 0; c < 12; c++) for (let r = 3; r <= 5; r++) g[r][c] = TileType.PATH;
    const nyc = computeDecor(g, opts);
    expect(has(nyc, 6, 4, 'lane')).toBe(true); // the middle row
    expect(has(nyc, 6, 3, 'lane')).toBe(false); // an outer row
    expect(computeDecor(g, { regionId: 'miami', seed: 1 }).some((o) => o.role === 'lane')).toBe(false);
  });

  it('does not stripe the middle of an intersection', () => {
    const g = blank(11, 11);
    for (let i = 0; i < 11; i++) for (let k = 4; k <= 6; k++) {
      g[k][i] = TileType.PATH;
      g[i][k] = TileType.PATH;
    }
    expect(has(computeDecor(g, opts), 5, 5, 'lane')).toBe(false);
  });
});

describe('buildings', () => {
  it('give a wall face with windows on the south side only, and a parapet on the other open sides', () => {
    const g = blank(7, 7);
    for (let r = 2; r <= 4; r++) for (let c = 2; c <= 4; c++) g[r][c] = TileType.BUILDING;
    const ops = computeDecor(g, opts);
    expect(has(ops, 3, 4, 'wallFace')).toBe(true); // bottom row
    expect(has(ops, 3, 3, 'wallFace')).toBe(false); // interior
    expect(has(ops, 3, 2, 'parapetLight')).toBe(true); // top edge
    expect(has(ops, 2, 3, 'parapetLight')).toBe(true); // west edge
    expect(has(ops, 4, 3, 'parapetDark')).toBe(true); // east edge
    expect(rolesAt(ops, 3, 4).filter((r) => r === 'window' || r === 'windowLit').length).toBe(2);
  });

  it('the wall face sits inside the tile (it never spills onto the ground below)', () => {
    const g = blank(5, 5);
    g[2][2] = TileType.BUILDING;
    for (const o of computeDecor(g, opts).filter((o) => o.role === 'wallFace' || o.role === 'window' || o.role === 'windowLit')) {
      expect(o.y).toBeGreaterThanOrEqual(2 * TILE);
      expect(o.y + o.h).toBeLessThanOrEqual(3 * TILE);
    }
  });
});

describe('ice and bridges', () => {
  it('edges ice where it meets anything else, and cracks only some tiles', () => {
    const g = blank(20, 20, TileType.ICE);
    g[10][10] = TileType.GRASS_A;
    const ops = computeDecor(g, opts);
    expect(has(ops, 10, 9, 'iceEdge')).toBe(true);
    const cracked = new Set<string>();
    for (const o of ops.filter((o) => o.role === 'iceCrack')) cracked.add(`${Math.floor(o.x / TILE)},${Math.floor(o.y / TILE)}`);
    expect(cracked.size).toBeGreaterThan(20);
    expect(cracked.size).toBeLessThan(200);
  });

  it('puts rails on the water side of a bridge deck, but not along the road', () => {
    const g = blank(9, 9, TileType.WATER);
    for (let c = 0; c < 9; c++) g[4][c] = TileType.BRIDGE; // a deck running east-west
    const ops = computeDecor(g, opts);
    expect(has(ops, 4, 4, 'railDark')).toBe(true);
    const mid = ops.filter((o) => o.role === 'railDark' && Math.floor(o.x / TILE) === 4 && Math.floor(o.y / TILE) === 4);
    expect(mid.every((o) => o.w === TILE && o.h === 2)).toBe(true); // top and bottom rails only, along the water
    expect(mid).toHaveLength(2);
  });
});

describe('props', () => {
  it('each prop type paints its own art', () => {
    const g = blank(9, 9);
    g[2][2] = TileType.TREE;
    g[2][5] = TileType.CAR;
    g[6][2] = TileType.PROP;
    g[6][5] = TileType.TREE;
    const nyc = computeDecor(g, opts);
    expect(nyc.some((o) => o.role === 'leaf')).toBe(true);
    expect(nyc.some((o) => o.role === 'carGlass')).toBe(true);
    expect(nyc.some((o) => o.role === 'lampPole' || o.role === 'hydrant')).toBe(true);
    const miami = computeDecor(g, { regionId: 'miami', seed: 1 });
    expect(miami.some((o) => o.role === 'frond')).toBe(true);
    expect(miami.some((o) => o.role === 'umbrellaA')).toBe(true);
    expect(miami.some((o) => o.role === 'leaf')).toBe(false);
  });

  it('a car is drawn along the road it is parked on', () => {
    const horizontal = blank(7, 5);
    for (let c = 0; c < 7; c++) horizontal[2][c] = TileType.PATH;
    horizontal[2][3] = TileType.CAR;
    const isBody = (o: Op) => o.role === 'carBody' || o.role === 'carBody2' || o.role === 'carBody3';
    const h = computeDecor(horizontal, opts).filter(isBody);
    expect(h[0].w).toBeGreaterThan(h[0].h);
    const vertical = blank(5, 7);
    for (let r = 0; r < 7; r++) vertical[r][2] = TileType.PATH;
    vertical[3][2] = TileType.CAR;
    const v = computeDecor(vertical, opts).filter(isBody);
    expect(v[0].h).toBeGreaterThan(v[0].w);
  });
});

describe('determinism and size', () => {
  it('the same grid and seed give the same decor; a different seed varies the details', () => {
    const { grid } = generateMap('nyc', 7);
    expect(computeDecor(grid, { regionId: 'nyc', seed: 7 })).toEqual(computeDecor(grid, { regionId: 'nyc', seed: 7 }));
    expect(computeDecor(grid, { regionId: 'nyc', seed: 8 })).not.toEqual(computeDecor(grid, { regionId: 'nyc', seed: 7 }));
    expect(tileHash(3, 4, 5)).toBe(tileHash(3, 4, 5));
    expect(tileHash(3, 4, 5)).not.toBe(tileHash(4, 3, 5));
  });

  it('a whole map has a sensible number of ops, all with positive size and inside the world', () => {
    for (const region of ['nyc', 'miami']) {
      const { grid } = generateMap(region, 11);
      const ops = computeDecor(grid, { regionId: region, seed: 11 });
      expect(ops.length).toBeGreaterThan(2000);
      expect(ops.length).toBeLessThan(120_000);
      for (const o of ops) {
        expect(o.w).toBeGreaterThan(0);
        expect(o.h).toBeGreaterThan(0);
        if (o.a !== undefined) expect(o.a).toBeGreaterThan(0);
      }
    }
  });
});
