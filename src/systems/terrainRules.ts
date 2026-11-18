/**
 * What the weather does to the map, and what each tile does to whoever stands
 * on it. Plain data + math (no Phaser) so the rules can be unit-tested.
 *
 * - Cold fronts freeze every pond and canal into walkable, slippery ice.
 * - Heat dries the shallows.
 * - Rain leaves puddles; hurricanes and downpours flood low ground as the
 *   storm front escalates.
 * - Shallow water makes you Wet and slows you; connected water carries a
 *   lightning strike to everyone standing in it.
 */
import { isSolid, mulberry32, PLAZA_RADIUS, TileType, type Grid } from './mapGen';

export interface TileEffects {
  /** Movement speed multiplier. */
  slow: number;
  /** 1 = full grip; low values make you slide. */
  grip: number;
  /** Standing here soaks you. */
  wet: boolean;
}

export const WADE_SLOW = 0.85;
export const ICE_GRIP = 0.12;
const NORMAL: TileEffects = { slow: 1, grip: 1, wet: false };
const WADING: TileEffects = { slow: WADE_SLOW, grip: 1, wet: true };
const ICY: TileEffects = { slow: 1, grip: ICE_GRIP, wet: false };

export function effectsFor(tile: number): TileEffects {
  if (tile === TileType.SHALLOW) return WADING;
  if (tile === TileType.ICE) return ICY;
  return NORMAL;
}

export const isWetTile = (t: number): boolean => t === TileType.SHALLOW;
export const isWaterTile = (t: number): boolean => t === TileType.SHALLOW || t === TileType.WATER;

export interface WeatherTerrain {
  freeze: boolean;
  dry: boolean;
  /** Puddle blobs per tile (a map has 10,000). */
  puddleDensity: number;
}

const WET_DENSITY: Record<string, number> = { rain: 0.003, thunderstorm: 0.004, tropical_downpour: 0.005, hurricane: 0.004 };

export function weatherTerrain(condition: string): WeatherTerrain {
  return {
    freeze: condition === 'cold_front',
    dry: condition === 'heat',
    puddleDensity: WET_DENSITY[condition] ?? 0,
  };
}

const copy = (grid: Grid): Grid => grid.map((row) => row.slice());
const around = (x: number, y: number): [number, number][] => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];

/** The weather's lasting mark on a freshly generated map (a new grid; the input is untouched). */
export function applyStaticWeather(grid: Grid, condition: string, seed: number): Grid {
  const rule = weatherTerrain(condition);
  const out = copy(grid);
  const rows = out.length;
  const cols = out[0].length;

  if (rule.freeze) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (out[y][x] === TileType.WATER || out[y][x] === TileType.SHALLOW) out[y][x] = TileType.ICE;
      }
    }
    return out;
  }

  if (rule.dry) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] !== TileType.SHALLOW) continue;
        const road = around(x, y).some(([nx, ny]) => grid[ny]?.[nx] === TileType.PATH);
        out[y][x] = road ? TileType.PATH : TileType.GRASS_A;
      }
    }
    return out;
  }

  if (rule.puddleDensity > 0) {
    const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const n = Math.floor(cols * rows * rule.puddleDensity);
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    for (let i = 0; i < n; i++) {
      const px = 3 + Math.floor(rng() * (cols - 6));
      const py = 3 + Math.floor(rng() * (rows - 6));
      if (Math.hypot(px - cx, py - cy) < PLAZA_RADIUS + 2) continue;
      const size = rng() < 0.5 ? 1 : 2;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < (rng() < 0.7 ? size : 1); dx++) {
          const t = out[py + dy]?.[px + dx];
          if (t === TileType.GRASS_A || t === TileType.GRASS_B || t === TileType.PATH) out[py + dy][px + dx] = TileType.SHALLOW;
        }
      }
    }
  }
  return out;
}

/** How many tiles inland the flood has reached, given the weather and the storm front (0..5). */
export function floodRingsFor(condition: string, frontIndex: number): number {
  const f = Math.max(0, Math.floor(frontIndex));
  if (condition === 'hurricane') return Math.min(4, f);
  if (condition === 'tropical_downpour') return Math.min(2, Math.floor(f / 2));
  return 0;
}

/** Spread shallow water `rings` tiles out from existing water over open ground (never into buildings or rock). */
export function applyFlood(base: Grid, rings: number): Grid {
  const out = copy(base);
  if (rings <= 0) return out;
  const rows = out.length;
  const cols = out[0].length;
  let frontier: [number, number][] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (base[y][x] === TileType.SHALLOW || base[y][x] === TileType.WATER) frontier.push([x, y]);
  for (let ring = 0; ring < rings; ring++) {
    const next: [number, number][] = [];
    for (const [x, y] of frontier) {
      for (const [nx, ny] of around(x, y)) {
        const t = out[ny]?.[nx];
        if (t === TileType.GRASS_A || t === TileType.GRASS_B || t === TileType.PATH) {
          out[ny][nx] = TileType.SHALLOW;
          next.push([nx, ny]);
        }
      }
    }
    frontier = next;
  }
  return out;
}

export interface WaterBodies {
  cols: number;
  /** Body id per tile (row-major); 0 = not water. */
  ids: Int32Array;
  count: number;
}

/**
 * Connected bodies of water (deep and shallow together): what a lightning strike runs through.
 * Bridge decks carry the water on underneath, so they link the bodies on either side.
 * (Only WATER and SHALLOW tiles are "in" the water; see `isWaterTile`.)
 */
export function waterBodies(grid: Grid): WaterBodies {
  const rows = grid.length;
  const cols = grid[0].length;
  const ids = new Int32Array(cols * rows);
  let count = 0;
  for (let i = 0; i < cols * rows; i++) {
    const sx = i % cols;
    const sy = (i - sx) / cols;
    if (ids[i] || !isWaterTile(grid[sy][sx])) continue;
    count += 1;
    ids[i] = count;
    const queue = [i];
    for (let q = 0; q < queue.length; q++) {
      const x = queue[q] % cols;
      const y = (queue[q] - x) / cols;
      for (const [nx, ny] of around(x, y)) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (ids[ni] || !(isWaterTile(grid[ny][nx]) || grid[ny][nx] === TileType.BRIDGE)) continue;
        ids[ni] = count;
        queue.push(ni);
      }
    }
  }
  return { cols, ids, count };
}

export { isSolid };
