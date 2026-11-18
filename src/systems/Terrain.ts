import Phaser from 'phaser';
import { TILE } from '../config/constants';
import type { RegionDef } from '../config/regions';
import { generateMap, isSolid, TileType, TILE_TYPE_COUNT, type Grid } from './mapGen';
import { applyFlood, applyStaticWeather, effectsFor, floodRingsFor, isWaterTile, waterBodies, type TileEffects, type WaterBodies } from './terrainRules';

export { TileType };

/** The map the player plays on, as the game sees it: tiles, what each does, and how the weather changes them. */
export class TerrainField {
  private grid: Grid;
  private bodies: WaterBodies;
  floodRings = 0;

  constructor(
    readonly layer: Phaser.Tilemaps.TilemapLayer,
    private readonly baseGrid: Grid,
    initialGrid: Grid,
    floodRings: number
  ) {
    this.grid = initialGrid;
    this.floodRings = floodRings;
    this.bodies = waterBodies(this.grid);
  }

  get cols(): number {
    return this.grid[0].length;
  }

  get rows(): number {
    return this.grid.length;
  }

  /** Tile type at a world position (anything off the map counts as a building). */
  tileAt(wx: number, wy: number): number {
    const col = Math.floor(wx / TILE);
    const row = Math.floor(wy / TILE);
    return this.grid[row]?.[col] ?? TileType.BUILDING;
  }

  effectsAt(wx: number, wy: number): TileEffects {
    return effectsFor(this.tileAt(wx, wy));
  }

  isSolidAt(wx: number, wy: number): boolean {
    return isSolid(this.tileAt(wx, wy));
  }

  /** Id of the water body here (0 when this is not water; standing on a bridge deck is dry). */
  waterBodyAt(wx: number, wy: number): number {
    const col = Math.floor(wx / TILE);
    const row = Math.floor(wy / TILE);
    if (!isWaterTile(this.grid[row]?.[col] ?? TileType.BUILDING)) return 0;
    return this.bodies.ids[row * this.bodies.cols + col];
  }

  /** Centres of the tiles of `bodyId` within `radius` px of a point (what a strike flashes through). */
  waterTilesNear(wx: number, wy: number, radius: number, bodyId: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    const c0 = Math.floor((wx - radius) / TILE);
    const c1 = Math.floor((wx + radius) / TILE);
    const r0 = Math.floor((wy - radius) / TILE);
    const r1 = Math.floor((wy + radius) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!isWaterTile(this.grid[r]?.[c] ?? TileType.BUILDING)) continue;
        if (this.bodies.ids[r * this.bodies.cols + c] !== bodyId) continue;
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        if (Math.hypot(x - wx, y - wy) <= radius) out.push({ x, y });
      }
    }
    return out;
  }

  /** A shallow-water tile within `radius` px of a point, chosen at random, or null. */
  wetSpotNear(wx: number, wy: number, radius: number, rand: () => number = Math.random): { x: number; y: number } | null {
    const found: { x: number; y: number }[] = [];
    const c0 = Math.floor((wx - radius) / TILE);
    const c1 = Math.floor((wx + radius) / TILE);
    const r0 = Math.floor((wy - radius) / TILE);
    const r1 = Math.floor((wy + radius) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.grid[r]?.[c] !== TileType.SHALLOW) continue;
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        if (Math.hypot(x - wx, y - wy) <= radius) found.push({ x, y });
      }
    }
    return found.length ? found[Math.floor(rand() * found.length)] : null;
  }

  /** Raise the flood to `rings` tiles inland (it only ever rises). Returns how many tiles changed. */
  setFloodRings(rings: number): number {
    if (rings <= this.floodRings) return 0;
    const next = applyFlood(this.baseGrid, rings);
    let changed = 0;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (next[y][x] === this.grid[y][x]) continue;
        this.layer.putTileAt(next[y][x], x, y); // only walkable ground becomes shallow, so collision is unchanged
        changed++;
      }
    }
    this.grid = next;
    this.floodRings = rings;
    this.bodies = waterBodies(this.grid);
    return changed;
  }

  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    const names = Object.keys(TileType) as (keyof typeof TileType)[];
    for (const row of this.grid) for (const t of row) out[names[t] ?? String(t)] = (out[names[t] ?? String(t)] ?? 0) + 1;
    for (const n of names) out[n] ??= 0;
    return out;
  }

  /** The centre of a tile of this type with `run` more of the same type in a row to its right (debug / tests). */
  findTile(type: number, run = 0): { x: number; y: number } | null {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols - run; x++) {
        let ok = true;
        for (let k = 0; k <= run && ok; k++) if (this.grid[y][x + k] !== type) ok = false;
        if (ok) return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
      }
    }
    return null;
  }
}

export interface TerrainResult {
  tilemap: Phaser.Tilemaps.Tilemap;
  layer: Phaser.Tilemaps.TilemapLayer;
  field: TerrainField;
  /** World position of the spawn plaza's centre. */
  spawn: { x: number; y: number };
  seed: number;
}

export interface TerrainOptions {
  seed: number;
  /** The live weather condition (cold_front, heat, rain, ...). */
  condition: string;
  /** The storm front the run is on, which decides how far a hurricane has flooded. */
  frontIndex: number;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

/** `?seed=123` in the URL pins the map (for demos, screenshots and tests). */
export function seedFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= 0x7fffffff ? n : null;
}

export function buildTerrain(scene: Phaser.Scene, region: RegionDef, opts: TerrainOptions): TerrainResult {
  const generated = generateMap(region.id, opts.seed);
  const baseGrid = applyStaticWeather(generated.grid, opts.condition, opts.seed);
  const rings = floodRingsFor(opts.condition, opts.frontIndex);
  const grid = applyFlood(baseGrid, rings);

  const tilemap = scene.make.tilemap({ data: grid, tileWidth: TILE, tileHeight: TILE });
  const key = region.terrainTilesKey;
  const tileset = tilemap.addTilesetImage(key, key, TILE, TILE)!;
  const layer = tilemap.createLayer(0, tileset, 0, 0)!;
  const solid: number[] = [];
  for (let t = 0; t < TILE_TYPE_COUNT; t++) if (isSolid(t)) solid.push(t);
  layer.setCollision(solid);
  layer.setDepth(0);

  const field = new TerrainField(layer, baseGrid, grid, rings);
  const spawn = { x: generated.spawn.col * TILE + TILE / 2, y: generated.spawn.row * TILE + TILE / 2 };
  return { tilemap, layer, field, spawn, seed: opts.seed };
}
