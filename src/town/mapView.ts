import Phaser from 'phaser';
import { TILE } from '../config/constants';
import { TEX } from '../gfx/spriteDefs';
import { DecorLayer } from '../gfx/decor';
import { isSolid, TILE_TYPE_COUNT, type Grid } from '../systems/mapGen';

/** Paint a hand-authored grid with the city tiles and the same decor pass the streets use. */
export function mountMap(scene: Phaser.Scene, grid: Grid, seed: number): { layer: Phaser.Tilemaps.TilemapLayer; width: number; height: number } {
  const tilemap = scene.make.tilemap({ data: grid, tileWidth: TILE, tileHeight: TILE });
  const tileset = tilemap.addTilesetImage(TEX.terrainTilesNyc, TEX.terrainTilesNyc, TILE, TILE)!;
  const layer = tilemap.createLayer(0, tileset, 0, 0)!;
  const solid: number[] = [];
  for (let t = 0; t < TILE_TYPE_COUNT; t++) if (isSolid(t)) solid.push(t);
  layer.setCollision(solid);
  layer.setDepth(0);

  const decor = new DecorLayer(scene, 'nyc', seed, grid[0].length, grid.length);
  decor.draw(grid);
  scene.events.once('shutdown', () => decor.destroy());

  return { layer, width: grid[0].length * TILE, height: grid.length * TILE };
}
