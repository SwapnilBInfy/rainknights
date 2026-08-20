import Phaser from 'phaser';
import { TILE, MAP_COLS, MAP_ROWS } from '../config/constants';
import type { RegionDef } from '../config/regions';

interface DensityProfile {
  waterBlobs: number;
  rockBlobs: number;
  pathBlobs: number;
}

const DENSITY_BY_REGION: Record<string, DensityProfile> = {
  nyc: { waterBlobs: 3, rockBlobs: 18, pathBlobs: 8 },
  miami: { waterBlobs: 10, rockBlobs: 6, pathBlobs: 4 },
};
const DEFAULT_DENSITY: DensityProfile = { waterBlobs: 5, rockBlobs: 12, pathBlobs: 6 };

export const TileType = {
  GRASS_A: 0,
  GRASS_B: 1,
  PATH: 2,
  WATER: 3,
  ROCK: 4,
} as const;

export interface TerrainResult {
  tilemap: Phaser.Tilemaps.Tilemap;
  layer: Phaser.Tilemaps.TilemapLayer;
}

function carveBlob(grid: number[][], cx: number, cy: number, radius: number, tileType: number) {
  const rows = grid.length;
  const cols = grid[0].length;
  for (let y = Math.max(0, cy - radius); y <= Math.min(rows - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(cols - 1, cx + radius); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const jitter = (Math.random() - 0.5) * radius * 0.6;
      if (dx * dx + dy * dy <= radius * radius + jitter * radius) {
        grid[y][x] = tileType;
      }
    }
  }
}

function generateTerrainData(density: DensityProfile): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < MAP_ROWS; y++) {
    const row: number[] = [];
    for (let x = 0; x < MAP_COLS; x++) {
      row.push(Math.random() < 0.18 ? TileType.GRASS_B : TileType.GRASS_A);
    }
    grid.push(row);
  }

  for (let i = 0; i < density.pathBlobs; i++) {
    const cx = Phaser.Math.Between(5, MAP_COLS - 5);
    const cy = Phaser.Math.Between(5, MAP_ROWS - 5);
    carveBlob(grid, cx, cy, Phaser.Math.Between(3, 6), TileType.PATH);
  }

  for (let i = 0; i < density.waterBlobs; i++) {
    const cx = Phaser.Math.Between(6, MAP_COLS - 6);
    const cy = Phaser.Math.Between(6, MAP_ROWS - 6);
    carveBlob(grid, cx, cy, Phaser.Math.Between(4, 7), TileType.WATER);
  }

  for (let i = 0; i < density.rockBlobs; i++) {
    const cx = Phaser.Math.Between(3, MAP_COLS - 3);
    const cy = Phaser.Math.Between(3, MAP_ROWS - 3);
    carveBlob(grid, cx, cy, Phaser.Math.Between(2, 4), TileType.ROCK);
  }

  // Force-clear a safe zone around the spawn point (world center) to grass.
  const centerX = Math.floor(MAP_COLS / 2);
  const centerY = Math.floor(MAP_ROWS / 2);
  const safeRadius = 7;
  for (let y = centerY - safeRadius; y <= centerY + safeRadius; y++) {
    for (let x = centerX - safeRadius; x <= centerX + safeRadius; x++) {
      if (y >= 0 && y < MAP_ROWS && x >= 0 && x < MAP_COLS) {
        grid[y][x] = TileType.GRASS_A;
      }
    }
  }

  return grid;
}

export function buildTerrain(scene: Phaser.Scene, region: RegionDef): TerrainResult {
  const density = DENSITY_BY_REGION[region.id] ?? DEFAULT_DENSITY;
  const data = generateTerrainData(density);
  const tilemap = scene.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
  const key = region.terrainTilesKey;
  const tileset = tilemap.addTilesetImage(key, key, TILE, TILE)!;
  const layer = tilemap.createLayer(0, tileset, 0, 0)!;
  layer.setCollision([TileType.WATER, TileType.ROCK]);
  layer.setDepth(0);
  return { tilemap, layer };
}
