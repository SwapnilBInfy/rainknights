/**
 * Seeded world generation. Plain data + math (no Phaser) so layouts can be
 * unit-tested: the same seed always makes the same map, every walkable tile
 * can be reached from the spawn, and each city has its own shape.
 *
 * A region's `layout` picks the shape and its `tuning` sets the numbers. A 'city' is a street grid of
 * blocks (buildings, parks, empty lots) with a river crossed by bridges: New York, London (a wide river,
 * lots of parks) and Tokyo (tight blocks, a thin canal). A 'coast' is a beach with an ocean edge, canals
 * crossed by boardwalk bridges, buildings and lagoons: Miami and Mumbai (a crowded seafront).
 */
import { MAP_COLS, MAP_ROWS } from '../config/constants';
import { getRegion, type CityTuning, type CoastTuning } from '../config/regions';

/** Tile ids. The order is the order of the tileset strip (see gfx/tiles.ts). */
export const TileType = {
  GRASS_A: 0,
  GRASS_B: 1,
  PATH: 2,
  /** Deep water: solid. */
  WATER: 3,
  ROCK: 4,
  /** Shallow water: walkable, makes you Wet. */
  SHALLOW: 5,
  /** Frozen water: walkable, slippery. */
  ICE: 6,
  /** A building: solid. */
  BUILDING: 7,
  /** A bridge deck over water: walkable and dry, with the water carrying on underneath. */
  BRIDGE: 8,
  /** A tree (a palm on a beach): solid. The art on top is drawn by the decor layer. */
  TREE: 9,
  /** A parked car on the road's outer lane: solid. */
  CAR: 10,
  /** A street lamp or hydrant (a beach umbrella on a beach): solid. */
  PROP: 11,
  /** Churned-up ground after rain: walkable, slows you. Made by the weather, never by the generator. */
  MUD: 12,
} as const;

export const TILE_TYPE_COUNT = 13;

export type Grid = number[][];

export interface Spawn {
  col: number;
  row: number;
}

export interface GeneratedMap {
  grid: Grid;
  spawn: Spawn;
  seed: number;
  regionId: string;
}

const SOLID = new Set<number>([TileType.WATER, TileType.ROCK, TileType.BUILDING, TileType.TREE, TileType.CAR, TileType.PROP]);
export const isSolid = (t: number): boolean => SOLID.has(t);
export const isWalkable = (t: number): boolean => !SOLID.has(t);
const isGrass = (t: number): boolean => t === TileType.GRASS_A || t === TileType.GRASS_B;

/** Radius (tiles) of the clear plaza the knight starts in. */
export const PLAZA_RADIUS = 7;
const FRAME = 2;

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [lo, hi]. */
const ri = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

function inBounds(grid: Grid, x: number, y: number): boolean {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

function set(grid: Grid, x: number, y: number, t: number) {
  if (inBounds(grid, x, y)) grid[y][x] = t;
}

function fillRect(grid: Grid, x0: number, y0: number, x1: number, y1: number, t: number, onlyIf?: (cur: number) => boolean) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inBounds(grid, x, y)) continue;
      if (!onlyIf || onlyIf(grid[y][x])) grid[y][x] = t;
    }
  }
}

function blob(grid: Grid, cx: number, cy: number, r: number, t: number, rng: Rng, onlyIf?: (cur: number) => boolean) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      const edge = r * r + (rng() - 0.5) * r * 1.2;
      if (d2 <= edge && inBounds(grid, x, y) && (!onlyIf || onlyIf(grid[y][x]))) grid[y][x] = t;
    }
  }
}

/** Lay road: a bridge deck over water, plain road everywhere else. */
function road(grid: Grid, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inBounds(grid, x, y)) continue;
      const cur = grid[y][x];
      grid[y][x] = cur === TileType.WATER || cur === TileType.SHALLOW || cur === TileType.BRIDGE ? TileType.BRIDGE : TileType.PATH;
    }
  }
}

function baseGrass(cols: number, rows: number, rng: Rng): Grid {
  const grid: Grid = [];
  for (let y = 0; y < rows; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) row.push(rng() < 0.18 ? TileType.GRASS_B : TileType.GRASS_A);
    grid.push(row);
  }
  return grid;
}

/** A band of water (deep core, shallow banks) that wanders across the map. */
function carveWaterway(
  grid: Grid,
  rng: Rng,
  vertical: boolean,
  centerAt: number,
  halfWidth: number,
  bank: number
): { center: number[]; halfWidth: number[] } {
  const cols = grid[0].length;
  const rows = grid.length;
  const len = vertical ? rows : cols;
  const span = vertical ? cols : rows;
  const center: number[] = [];
  const hws: number[] = [];
  let c = centerAt;
  let hw = halfWidth;
  for (let i = 0; i < len; i++) {
    const r = rng();
    if (r < 0.2) c -= 1;
    else if (r > 0.8) c += 1;
    c = Math.max(FRAME + hw + bank + 2, Math.min(span - FRAME - hw - bank - 3, c));
    if (rng() < 0.08) hw = Math.max(1, Math.min(halfWidth + 1, hw + (rng() < 0.5 ? -1 : 1)));
    center.push(c);
    hws.push(hw);
    for (let d = -(hw + bank); d <= hw + bank; d++) {
      const t = Math.abs(d) <= hw ? TileType.WATER : TileType.SHALLOW;
      if (vertical) set(grid, c + d, i, t);
      else set(grid, i, c + d, t);
    }
  }
  return { center, halfWidth: hws };
}

const CITY_DEFAULTS: CityTuning = { river: [2, 3], built: 0.62, park: 0.18, gapX: [13, 17], gapY: [11, 15] };
const COAST_DEFAULTS: CoastTuning = { canals: [2, 3], buildings: 16 };

function cityLayout(grid: Grid, rng: Rng, spawn: Spawn, tuning: Partial<CityTuning> = {}) {
  const cols = grid[0].length;
  const rows = grid.length;
  const t = { ...CITY_DEFAULTS, ...tuning };

  // The river, not through the spawn. (River width [0, 0] means a city with no river.)
  const vertical = rng() < 0.5;
  const span = vertical ? cols : rows;
  const frac = rng() < 0.5 ? 0.17 + rng() * 0.1 : 0.73 + rng() * 0.1;
  const riverWidth = ri(rng, t.river[0], t.river[1]);
  const river = t.river[1] > 0 ? carveWaterway(grid, rng, vertical, Math.round(span * frac), riverWidth, 2) : null;
  const inRiverCorridor = (pos: number) => {
    // pos is a coordinate across the river's width; true if a road at that spot would run alongside the river
    if (!river) return false;
    const c = river.center.reduce((a, b) => a + b, 0) / river.center.length;
    return Math.abs(pos - c) < 9;
  };

  // Street grid.
  const alongVert: number[] = [];
  for (let x = 9 + ri(rng, 0, 3); x < cols - 8; x += ri(rng, t.gapX[0], t.gapX[1])) alongVert.push(x);
  const alongHorz: number[] = [];
  for (let y = 8 + ri(rng, 0, 3); y < rows - 8; y += ri(rng, t.gapY[0], t.gapY[1])) alongHorz.push(y);
  // Roads that run parallel to the river would sit in it; keep only those clear of it.
  const vroads = alongVert.filter((x) => vertical ? !inRiverCorridor(x) : true);
  const hroads = alongHorz.filter((y) => !vertical ? !inRiverCorridor(y) : true);

  const carveRoadV = (x: number) => {
    let y = 0;
    while (y < rows) {
      const seg = ri(rng, 22, 38);
      if (rng() > 0.1) road(grid, x, y, x + 2, Math.min(rows - 1, y + seg));
      y += seg;
    }
  };
  const carveRoadH = (y: number) => {
    let x = 0;
    while (x < cols) {
      const seg = ri(rng, 22, 38);
      if (rng() > 0.1) road(grid, x, y, Math.min(cols - 1, x + seg), y + 2);
      x += seg;
    }
  };
  vroads.forEach(carveRoadV);
  hroads.forEach(carveRoadH);

  // City blocks between the streets.
  const xs = [FRAME + 1, ...vroads.flatMap((x) => [x - 1, x + 3]), cols - FRAME - 2];
  const ys = [FRAME + 1, ...hroads.flatMap((y) => [y - 1, y + 3]), rows - FRAME - 2];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    for (let j = 0; j + 1 < ys.length; j += 2) {
      const bx0 = xs[i];
      const bx1 = xs[i + 1];
      const by0 = ys[j];
      const by1 = ys[j + 1];
      if (bx1 - bx0 < 4 || by1 - by0 < 4) continue;
      const roll = rng();
      const dry = isGrass;
      if (roll < t.built) {
        // buildings with a sidewalk around them
        fillRect(grid, bx0 + 1, by0 + 1, bx1 - 1, by1 - 1, TileType.BUILDING, dry);
        if (bx1 - bx0 >= 9) {
          const ax = ri(rng, bx0 + 3, bx1 - 3);
          fillRect(grid, ax, by0 + 1, ax, by1 - 1, TileType.PATH, (t) => t === TileType.BUILDING);
        }
        if (by1 - by0 >= 9 && rng() < 0.6) {
          const ay = ri(rng, by0 + 3, by1 - 3);
          fillRect(grid, bx0 + 1, ay, bx1 - 1, ay, TileType.PATH, (t) => t === TileType.BUILDING);
        }
      } else if (roll < t.built + t.park) {
        // a park with a pond and a few boulders
        const cx = Math.round((bx0 + bx1) / 2);
        const cy = Math.round((by0 + by1) / 2);
        if (rng() < 0.75) {
          const r = ri(rng, 2, 3);
          blob(grid, cx, cy, r, TileType.SHALLOW, rng, dry);
          if (r >= 3) blob(grid, cx, cy, 1, TileType.WATER, rng, (t) => t === TileType.SHALLOW);
        }
        for (let k = 0; k < ri(rng, 2, 4); k++) set(grid, ri(rng, bx0 + 1, bx1 - 1), ri(rng, by0 + 1, by1 - 1), isGrass(grid[Math.min(rows - 1, by0 + 1)][bx0 + 1]) ? TileType.ROCK : TileType.GRASS_A);
      } else {
        // an empty lot with rubble
        for (let k = 0; k < ri(rng, 1, 3); k++) blob(grid, ri(rng, bx0 + 1, bx1 - 1), ri(rng, by0 + 1, by1 - 1), 1, TileType.ROCK, rng, dry);
      }
    }
  }
  void spawn;
}

function coastLayout(grid: Grid, rng: Rng, spawn: Spawn, tuning: Partial<CoastTuning> = {}) {
  const cols = grid[0].length;
  const rows = grid.length;
  const t = { ...COAST_DEFAULTS, ...tuning };

  // Ocean along one edge: deep water with a shallow surf line.
  const side = ri(rng, 0, 3); // 0 top, 1 bottom, 2 left, 3 right
  let depth = ri(rng, 8, 11);
  const along = side < 2 ? cols : rows;
  for (let i = 0; i < along; i++) {
    if (rng() < 0.25) depth = Math.max(7, Math.min(12, depth + (rng() < 0.5 ? -1 : 1)));
    for (let d = 0; d < depth; d++) {
      const t = d >= depth - 2 ? TileType.SHALLOW : TileType.WATER;
      if (side === 0) set(grid, i, d, t);
      else if (side === 1) set(grid, i, rows - 1 - d, t);
      else if (side === 2) set(grid, d, i, t);
      else set(grid, cols - 1 - d, i, t);
    }
  }

  // Canals, avoiding the spawn.
  const canalCount = ri(rng, t.canals[0], t.canals[1]);
  const oceanVertical = side >= 2;
  for (let n = 0; n < canalCount; n++) {
    const vertical = rng() < 0.5 ? oceanVertical : !oceanVertical;
    const span = vertical ? cols : rows;
    const mid = vertical ? spawn.col : spawn.row;
    let at = Math.round(span * (0.2 + (n + rng() * 0.5) * (0.6 / canalCount)));
    if (Math.abs(at - mid) < 11) at += at < mid ? -12 : 12;
    const canal = carveWaterway(grid, rng, vertical, at, 1, 1);
    // Boardwalk bridges every so often.
    const len = vertical ? rows : cols;
    for (let p = ri(rng, 8, 16); p < len - 4; p += ri(rng, 16, 24)) {
      const c = canal.center[p];
      const reach = 4;
      if (vertical) road(grid, c - reach, p, c + reach, p + 2);
      else road(grid, p, c - reach, p + 2, c + reach);
    }
  }

  // Boardwalk avenues.
  for (const f of [0.3 + rng() * 0.08, 0.64 + rng() * 0.08]) {
    const x = Math.round(cols * f);
    const y = Math.round(rows * f);
    if (Math.abs(x - spawn.col) > 3) road(grid, x, 0, x + 2, rows - 1);
    if (Math.abs(y - spawn.row) > 3) road(grid, 0, y, cols - 1, y + 2);
  }

  // Resort buildings on dry sand, away from the plaza and the boardwalks.
  let placed = 0;
  for (let attempt = 0; attempt < 120 * Math.ceil(t.buildings / 16) && placed < t.buildings; attempt++) {
    const w = ri(rng, 4, 7);
    const h = ri(rng, 3, 5);
    const x = ri(rng, FRAME + 2, cols - w - FRAME - 3);
    const y = ri(rng, FRAME + 2, rows - h - FRAME - 3);
    if (Math.hypot(x + w / 2 - spawn.col, y + h / 2 - spawn.row) < PLAZA_RADIUS + 6) continue;
    let clear = true;
    for (let yy = y - 1; yy <= y + h && clear; yy++) for (let xx = x - 1; xx <= x + w && clear; xx++) if (!inBounds(grid, xx, yy) || !isGrass(grid[yy][xx])) clear = false;
    if (!clear) continue;
    fillRect(grid, x, y, x + w - 1, y + h - 1, TileType.BUILDING);
    placed++;
  }

  // Lagoons and a few coral outcrops.
  for (let n = 0; n < ri(rng, 3, 4); n++) {
    const cx = ri(rng, 12, cols - 13);
    const cy = ri(rng, 12, rows - 13);
    if (Math.hypot(cx - spawn.col, cy - spawn.row) < PLAZA_RADIUS + 8) continue;
    blob(grid, cx, cy, ri(rng, 3, 4), TileType.SHALLOW, rng, isGrass);
    blob(grid, cx, cy, ri(rng, 1, 2), TileType.WATER, rng, (t) => t === TileType.SHALLOW);
  }
  for (let n = 0; n < 6; n++) blob(grid, ri(rng, 8, cols - 9), ri(rng, 8, rows - 9), 1, TileType.ROCK, rng, isGrass);
}

function clearPlaza(grid: Grid, spawn: Spawn) {
  for (let y = spawn.row - PLAZA_RADIUS; y <= spawn.row + PLAZA_RADIUS; y++) {
    for (let x = spawn.col - PLAZA_RADIUS; x <= spawn.col + PLAZA_RADIUS; x++) {
      if ((x - spawn.col) ** 2 + (y - spawn.row) ** 2 <= PLAZA_RADIUS * PLAZA_RADIUS) set(grid, x, y, TileType.GRASS_A);
    }
  }
}

function frame(grid: Grid, regionId: string) {
  const beach = getRegion(regionId).dress === 'beach';
  const rows = grid.length;
  const cols = grid[0].length;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const depth = Math.min(x, y, cols - 1 - x, rows - 1 - y);
      if (depth >= FRAME || grid[y][x] === TileType.WATER) continue;
      if (beach) {
        // a sea wall (outermost) with a row of palms inside it
        grid[y][x] = depth === 0 ? TileType.ROCK : (x + y) % 2 === 0 ? TileType.TREE : TileType.ROCK;
      } else {
        grid[y][x] = TileType.BUILDING; // the skyline
      }
    }
  }
}

/** True if any tile within `r` (a square) satisfies `pred`. */
function near(grid: Grid, x: number, y: number, r: number, pred: (t: number) => boolean): boolean {
  for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (inBounds(grid, xx, yy) && pred(grid[yy][xx])) return true;
  return false;
}

const isRoad = (t: number) => t === TileType.PATH || t === TileType.BRIDGE;
const isWaterish = (t: number) => t === TileType.WATER || t === TileType.SHALLOW;

/**
 * Street furniture and greenery: parked cars on the outer lane of straight roads, trees on sidewalks and in
 * open ground, lamps and hydrants. (Miami: palms along the boardwalks and beaches, umbrellas by the water.)
 * All of it is solid, so it is placed before connectivity is checked.
 */
function placeProps(grid: Grid, rng: Rng, regionId: string) {
  const rows = grid.length;
  const cols = grid[0].length;
  const beach = getRegion(regionId).dress === 'beach'; // palms, umbrellas and boardwalks instead of cars and lamps
  const edgeOk = (x: number, y: number) => x > FRAME + 1 && y > FRAME + 1 && x < cols - FRAME - 2 && y < rows - FRAME - 2;

  // parked cars (New York)
  if (!beach) {
    for (let y = FRAME + 2; y < rows - FRAME - 2; y++) {
      for (let x = FRAME + 3; x < cols - FRAME - 3; x++) {
        if (grid[y][x] !== TileType.PATH || rng() > 0.05) continue;
        const horiz = grid[y][x - 1] === TileType.PATH && grid[y][x + 1] === TileType.PATH;
        const vert = grid[y - 1][x] === TileType.PATH && grid[y + 1][x] === TileType.PATH;
        if (horiz === vert) continue;
        // outer lane of a straight stretch: the tile beyond is not road along the whole run of five
        let out = 0;
        for (const s of [-1, 1]) {
          let ok = true;
          for (let k = -2; k <= 2 && ok; k++) {
            const rx = horiz ? x + k : x + s;
            const ry = horiz ? y + s : y + k;
            const px = horiz ? x + k : x;
            const py = horiz ? y : y + k;
            if (grid[py]?.[px] !== TileType.PATH || isRoad(grid[ry]?.[rx] ?? TileType.BUILDING)) ok = false;
          }
          if (ok) out = s;
        }
        if (!out || near(grid, x, y, 5, (t) => t === TileType.CAR)) continue;
        // keep the other two lanes clear
        grid[y][x] = TileType.CAR;
      }
    }
  }

  // trees and lamps/hydrants/umbrellas
  for (let y = FRAME + 2; y < rows - FRAME - 2; y++) {
    for (let x = FRAME + 2; x < cols - FRAME - 2; x++) {
      if (!isGrass(grid[y][x]) || !edgeOk(x, y)) continue;
      const byRoad = near(grid, x, y, 1, isRoad) && [grid[y - 1][x], grid[y + 1][x], grid[y][x - 1], grid[y][x + 1]].some(isRoad);
      const byWater = near(grid, x, y, 2, isWaterish);
      const open = !near(grid, x, y, 1, (t) => isSolid(t) || isWaterish(t) || isRoad(t));
      if (beach) {
        if (byWater && !near(grid, x, y, 3, (t) => t === TileType.PROP) && rng() < 0.05) grid[y][x] = TileType.PROP; // umbrella
        else if ((byRoad ? rng() < 0.12 : byWater ? rng() < 0.08 : open && rng() < 0.008) && !near(grid, x, y, 2, (t) => t === TileType.TREE)) grid[y][x] = TileType.TREE; // palm
      } else if (byRoad) {
        if (rng() < 0.04 && !near(grid, x, y, 3, (t) => t === TileType.TREE)) grid[y][x] = TileType.TREE;
        else if (rng() < 0.025 && !near(grid, x, y, 5, (t) => t === TileType.PROP)) grid[y][x] = TileType.PROP;
      } else if (open && rng() < 0.012 && !near(grid, x, y, 2, (t) => t === TileType.TREE)) {
        grid[y][x] = TileType.TREE;
      }
    }
  }
}

/** How many walkable tiles cannot be reached from the spawn on foot. */
export function unreachableWalkable(grid: Grid, spawn: Spawn): number {
  const { reached } = floodFromSpawn(grid, spawn);
  let n = 0;
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[0].length; x++) if (isWalkable(grid[y][x]) && !reached[y * grid[0].length + x]) n++;
  return n;
}

function floodFromSpawn(grid: Grid, spawn: Spawn) {
  const cols = grid[0].length;
  const rows = grid.length;
  const reached = new Uint8Array(cols * rows);
  const queue: number[] = [];
  const start = spawn.row * cols + spawn.col;
  if (isWalkable(grid[spawn.row][spawn.col])) {
    reached[start] = 1;
    queue.push(start);
  }
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q];
    const x = cur % cols;
    const y = (cur - x) / cols;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (reached[ni] || !isWalkable(grid[ny][nx])) continue;
      reached[ni] = 1;
      queue.push(ni);
    }
  }
  return { reached };
}

/**
 * Make every walkable tile reachable from the spawn: small walled-off pockets
 * are filled in with rock, larger ones get a road carved to the rest.
 */
export function ensureConnected(grid: Grid, spawn: Spawn) {
  const cols = grid[0].length;
  const rows = grid.length;
  for (let pass = 0; pass < 20; pass++) {
    const { reached } = floodFromSpawn(grid, spawn);
    const seen = new Uint8Array(cols * rows);
    const comps: number[][] = [];
    for (let i = 0; i < cols * rows; i++) {
      const x = i % cols;
      const y = (i - x) / cols;
      if (seen[i] || reached[i] || !isWalkable(grid[y][x])) continue;
      const comp: number[] = [i];
      seen[i] = 1;
      for (let q = 0; q < comp.length; q++) {
        const cx = comp[q] % cols;
        const cy = (comp[q] - cx) / cols;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const ni = ny * cols + nx;
          if (seen[ni] || reached[ni] || !isWalkable(grid[ny][nx])) continue;
          seen[ni] = 1;
          comp.push(ni);
        }
      }
      comps.push(comp);
    }
    if (comps.length === 0) return;

    for (const comp of comps) {
      if (comp.length < 60) {
        for (const i of comp) grid[Math.floor(i / cols)][i % cols] = TileType.ROCK;
        continue;
      }
      // Breadth-first from the pocket through anything, to the nearest reachable tile.
      const parent = new Int32Array(cols * rows).fill(-2);
      const queue: number[] = [];
      for (const i of comp) {
        parent[i] = -1;
        queue.push(i);
      }
      let hit = -1;
      for (let q = 0; q < queue.length && hit < 0; q++) {
        const cur = queue[q];
        const x = cur % cols;
        const y = (cur - x) / cols;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const ni = ny * cols + nx;
          if (parent[ni] !== -2) continue;
          parent[ni] = cur;
          if (reached[ni]) {
            hit = ni;
            break;
          }
          queue.push(ni);
        }
      }
      for (let at = hit; at >= 0 && parent[at] !== -1; at = parent[at]) {
        const x = at % cols;
        const y = (at - x) / cols;
        if (isSolid(grid[y][x])) grid[y][x] = grid[y][x] === TileType.WATER ? TileType.BRIDGE : TileType.PATH;
      }
    }
  }
}

export function generateMap(regionId: string, seed: number, cols = MAP_COLS, rows = MAP_ROWS): GeneratedMap {
  const rng = mulberry32(seed);
  const grid = baseGrass(cols, rows, rng);
  const spawn: Spawn = { col: Math.floor(cols / 2), row: Math.floor(rows / 2) };
  const region = getRegion(regionId);
  if (region.layout === 'coast') coastLayout(grid, rng, spawn, region.tuning);
  else cityLayout(grid, rng, spawn, region.tuning);
  placeProps(grid, rng, regionId);
  clearPlaza(grid, spawn);
  frame(grid, regionId);
  ensureConnected(grid, spawn);
  return { grid, spawn, seed, regionId };
}
