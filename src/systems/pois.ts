/**
 * Points of interest scattered over a city map: supply crates, weather shrines and the stairs down to the
 * tunnels. Plain data and maths (no Phaser): where they go is a pure function of the map and its seed, so the same
 * map always has them in the same places, every one can be walked to, and they can be tested.
 *
 * - **Entrances** (four, in two linked pairs): subway stairs in the street cities, cave mouths on the coast. Each
 *   pair is joined by one underground tunnel, so going down at one and up at the other is a fast way across the map.
 * - **Shrines** (three): stand still at one and it grants a weather power.
 * - **Crates** (ten): open one for drips, supplies and gems.
 */
import { mulberry32, PLAZA_RADIUS, TileType, isSolid, type Grid, type Spawn } from './mapGen';

export type PoiKind = 'entrance' | 'crate' | 'shrine';

export interface Poi {
  /** Its index in the list: unique for the map, used to remember what has been used. */
  id: number;
  kind: PoiKind;
  col: number;
  row: number;
  /** Entrances only: the id of the entrance at the other end of this one's tunnel, and which tunnel (0 or 1). */
  pair?: number;
  tunnel?: number;
}

export const POI_COUNT: Record<PoiKind, number> = { entrance: 4, shrine: 3, crate: 10 };
/** Minimum distance between things of the same kind, in tiles (relaxed if the map is too tight to fit them all). */
const SPACING: Record<PoiKind, number> = { entrance: 24, shrine: 18, crate: 11 };
/** Nothing is placed closer than this to the plaza the knight starts on (the flight pad is there). */
export const POI_CLEARANCE = PLAZA_RADIUS + 9;
/** Nothing is placed closer than this to anything else. */
const MIN_APART = 7;

const isFloor = (t: number) => t === TileType.GRASS_A || t === TileType.GRASS_B || t === TileType.PATH;
const isWet = (t: number) => t === TileType.WATER || t === TileType.SHALLOW;

/** Open ground all round: a tile and its eight neighbours are floor, with no water or obstacle in the way. */
function isOpen(grid: Grid, col: number, row: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = grid[row + dy]?.[col + dx];
      if (t === undefined || isSolid(t) || isWet(t) || t === TileType.BRIDGE) return false;
    }
  }
  return isFloor(grid[row][col]);
}

/** Whether a tile suits a flavour of entrance: a street entrance is by a road, a coastal one by the water or the rocks. */
function themed(grid: Grid, col: number, row: number, dress: 'street' | 'beach'): boolean {
  const r = dress === 'street' ? 2 : 3;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const t = grid[row + dy]?.[col + dx];
      if (t === undefined) continue;
      if (dress === 'street' ? t === TileType.PATH && (dx !== 0 || dy !== 0) : isWet(t) || t === TileType.ROCK) return true;
    }
  }
  return false;
}

/** Where everything goes on this map. Deterministic for a map and seed. */
export function placePois(grid: Grid, spawn: Spawn, seed: number, dress: 'street' | 'beach'): Poi[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const rng = mulberry32((seed ^ 0x6a09e667) >>> 0);
  const margin = 6;
  const candidates: { col: number; row: number }[] = [];
  for (let row = margin; row < rows - margin; row++) {
    for (let col = margin; col < cols - margin; col++) {
      if (Math.hypot(col - spawn.col, row - spawn.row) < POI_CLEARANCE) continue;
      if (isOpen(grid, col, row)) candidates.push({ col, row });
    }
  }
  // a shuffle, so the same seed always gives the same order and a different seed a different map
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const placed: Poi[] = [];
  const far = (c: { col: number; row: number }, kind: PoiKind, spacing: number) =>
    placed.every((p) => Math.hypot(p.col - c.col, p.row - c.row) >= (p.kind === kind ? spacing : MIN_APART));

  for (const kind of ['entrance', 'shrine', 'crate'] as const) {
    let spacing = SPACING[kind];
    const want = POI_COUNT[kind];
    for (let pass = 0; pass < 4 && placed.filter((p) => p.kind === kind).length < want; pass++) {
      // the first pass wants a fitting setting for an entrance; later passes take anything open
      const wantTheme = kind === 'entrance' && pass === 0;
      // stairs and shrines go on the pavement beside a road or on open ground, not in the middle of the road itself
      const offRoad = kind !== 'crate' && pass < 3;
      for (const c of candidates) {
        if (placed.filter((p) => p.kind === kind).length >= want) break;
        if (offRoad && grid[c.row][c.col] === TileType.PATH) continue;
        if (wantTheme && !themed(grid, c.col, c.row, dress)) continue;
        if (far(c, kind, spacing)) placed.push({ id: placed.length, kind, col: c.col, row: c.row });
      }
      spacing *= 0.7;
    }
  }

  // Entrances come in linked pairs: the first with the one farthest from it, and the other two together.
  const ents = placed.filter((p) => p.kind === 'entrance');
  if (ents.length === POI_COUNT.entrance) {
    const [e0, ...rest] = ents;
    const partner = rest.reduce((best, e) => (Math.hypot(e.col - e0.col, e.row - e0.row) > Math.hypot(best.col - e0.col, best.row - e0.row) ? e : best));
    const others = rest.filter((e) => e !== partner);
    e0.pair = partner.id;
    partner.pair = e0.id;
    others[0].pair = others[1].id;
    others[1].pair = others[0].id;
    e0.tunnel = partner.tunnel = 0;
    others[0].tunnel = others[1].tunnel = 1;
  }
  return placed;
}

/** Which tunnel an entrance leads into, whether it is walked from its far end, and where it comes out. */
export function tunnelFor(pois: readonly Poi[], entranceId: number): { tunnel: number; reversed: boolean; exitId: number } | null {
  const e = pois.find((p) => p.id === entranceId && p.kind === 'entrance');
  if (!e || e.pair === undefined || e.tunnel === undefined) return null;
  return { tunnel: e.tunnel, reversed: e.id > e.pair, exitId: e.pair };
}

/** Everything of a kind. */
export const poisOf = (pois: readonly Poi[], kind: PoiKind): Poi[] => pois.filter((p) => p.kind === kind);

/** Pixel centre of a POI's tile. */
export const poiCenter = (poi: Pick<Poi, 'col' | 'row'>, tile = 16): { x: number; y: number } => ({ x: poi.col * tile + tile / 2, y: poi.row * tile + tile / 2 });

