/**
 * The minimap's picture of the world. Plain data (no Phaser): each pixel stands for a square of tiles and takes the
 * colour of whatever most of them are, so a river, a street grid and the rocks all read at a glance.
 */
import { TileType, type Grid } from './mapGen';

export const MINI_CELL = 2;

export const MINI_COLOURS = {
  land: 0x5f8f50,
  road: 0xa0a0ae,
  water: 0x3f6fc0,
  building: 0x7a5a5a,
  rock: 0x4a4a5a,
  ice: 0xcfeaf8,
  mud: 0x6e4e2e,
} as const;

/** The colour class a tile counts as. */
export function tileColour(t: number): number {
  switch (t) {
    case TileType.WATER:
    case TileType.SHALLOW:
      return MINI_COLOURS.water;
    case TileType.PATH:
    case TileType.BRIDGE:
    case TileType.CAR:
      return MINI_COLOURS.road;
    case TileType.BUILDING:
      return MINI_COLOURS.building;
    case TileType.ROCK:
      return MINI_COLOURS.rock;
    case TileType.ICE:
      return MINI_COLOURS.ice;
    case TileType.MUD:
      return MINI_COLOURS.mud;
    default:
      return MINI_COLOURS.land;
  }
}

/** The size, in minimap pixels, of a map. */
export const miniSize = (grid: Grid, cell = MINI_CELL): { w: number; h: number } => ({ w: Math.floor(grid[0].length / cell), h: Math.floor(grid.length / cell) });

/** One colour per minimap pixel, row by row: each is the most common colour among its tiles. */
export function minimapPixels(grid: Grid, cell = MINI_CELL): number[] {
  const { w, h } = miniSize(grid, cell);
  const out: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const votes = new Map<number, number>();
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          const c = tileColour(grid[y * cell + dy][x * cell + dx]);
          votes.set(c, (votes.get(c) ?? 0) + 1);
        }
      }
      let best = MINI_COLOURS.land as number;
      let bestN = -1;
      for (const [c, n] of votes) if (n > bestN) [best, bestN] = [c, n];
      out.push(best);
    }
  }
  return out;
}

/** Where a world position (px) lands on the minimap, in minimap pixels. */
export const miniPoint = (x: number, y: number, tile = 16, cell = MINI_CELL): { x: number; y: number } => ({ x: x / tile / cell, y: y / tile / cell });
