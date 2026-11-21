/**
 * Each city is cut into three zones by two rings of rock, and each ring has one gate that only opens for a knight of
 * a certain level: the outskirts (where the knight lands), midtown, and the core (where the boss waits). Plain data
 * and maths (no Phaser): where the rings and gates go is a pure function of the map and its seed, so the same map
 * always has them in the same places, every zone can be reached through its gate, and it can all be tested.
 */
import { mulberry32, TileType, isWalkable, type Grid, type Spawn } from './mapGen';

/** The rings, as distances from the plaza in tiles: the outskirts end at the first, midtown at the second. */
export const ZONE_RADII: readonly [number, number] = [24, 40];

/** Which zone a tile is in: 0 outskirts, 1 midtown, 2 core. */
export function zoneAt(col: number, row: number, spawn: Spawn): 0 | 1 | 2 {
  const d = Math.hypot(col - spawn.col, row - spawn.row);
  return d < ZONE_RADII[0] ? 0 : d < ZONE_RADII[1] ? 1 : 2;
}

/** The levels the two gates open at, city by city; later cities ask more of the knight. */
export const GATE_LEVELS: Record<string, readonly [number, number]> = {
  nyc: [3, 6],
  miami: [4, 8],
  london: [6, 10],
  tokyo: [8, 13],
  mumbai: [10, 16],
};
const DEFAULT_LEVELS: readonly [number, number] = [3, 6];

export const gateLevels = (regionId: string): readonly [number, number] => GATE_LEVELS[regionId] ?? DEFAULT_LEVELS;

/** The level to bring to a city: the one its second gate opens at (the core, and the boss, are beyond it). */
export const suggestedLevel = (regionId: string): number => gateLevels(regionId)[1];

/** The level needed to be in a zone at all. */
export const levelForZone = (regionId: string, zone: 0 | 1 | 2): number => (zone === 0 ? 1 : gateLevels(regionId)[zone - 1]);

export interface Gate {
  /** 1 is between the outskirts and midtown, 2 between midtown and the core. */
  ring: 1 | 2;
  /** The level that opens it. */
  level: number;
  /** The tiles it fills (open ground in the ring, shut until the knight is of the level). */
  tiles: { col: number; row: number }[];
  /** Its middle, in tiles, for a label. */
  col: number;
  row: number;
}

/** How thick a ring is, in tiles. */
const BAND = 2;
/** A gate takes the open ground of the ring within this many tiles of a point on it. */
const GATE_REACH = 2.1;

type Tile = { col: number; row: number };

/** The tiles of the ring: those whose distance from the plaza is within a tile of the radius. */
function bandTiles(grid: Grid, spawn: Spawn, radius: number): Tile[] {
  const out: Tile[] = [];
  const lo = radius - BAND / 2;
  const hi = radius + BAND / 2;
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[0].length; col++) {
      const d = Math.hypot(col - spawn.col, row - spawn.row);
      if (d >= lo && d < hi) out.push({ col, row });
    }
  }
  return out;
}

const key = (t: Tile) => `${t.col},${t.row}`;

/** The open ground of the ring within reach of a point on it: one way through. */
function gateAround(grid: Grid, band: Tile[], at: Tile): Tile[] {
  return band.filter((t) => Math.hypot(t.col - at.col, t.row - at.row) <= GATE_REACH && isWalkable(grid[t.row][t.col]));
}

/** Whether a tile in the gap is on a road: a gate set in a street reads as a gate. */
const onRoad = (grid: Grid, t: Tile) => grid[t.row][t.col] === TileType.PATH;

/**
 * What a ring does to the map, worked out once: the pieces the map falls into with the ring shut, how big each is, and
 * which piece each tile is in. A gate joins the pieces it touches, so how much of the map the knight can still reach
 * through any set of gates is a sum over pieces, not a fresh flood for every candidate.
 */
class RingPieces {
  private readonly label: Int32Array;
  private readonly size: number[] = [];
  private readonly cols: number;
  private readonly rows: number;
  /** Walkable tiles outside the ring, in all the pieces. */
  readonly total: number;

  constructor(grid: Grid, private readonly spawn: Spawn, band: Tile[]) {
    this.cols = grid[0].length;
    this.rows = grid.length;
    const shut = new Uint8Array(this.cols * this.rows);
    for (const t of band) shut[t.row * this.cols + t.col] = 1;
    this.label = new Int32Array(this.cols * this.rows).fill(-1);
    const queue = new Int32Array(this.cols * this.rows);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols + x;
        if (!isWalkable(grid[y][x])) continue;
        if (shut[i] || this.label[i] >= 0) continue;
        const id = this.size.length;
        let head = 0;
        let tail = 0;
        this.label[i] = id;
        queue[tail++] = i;
        while (head < tail) {
          const cur = queue[head++];
          const cx = cur % this.cols;
          const cy = (cur - cx) / this.cols;
          for (let k = 0; k < 4; k++) {
            const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
            const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
            if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
            const ni = ny * this.cols + nx;
            if (this.label[ni] >= 0 || shut[ni] || !isWalkable(grid[ny][nx])) continue;
            this.label[ni] = id;
            queue[tail++] = ni;
          }
        }
        this.size.push(tail);
      }
    }
    this.total = this.size.reduce((n, v) => n + v, 0);
  }

  /** The pieces a gate touches: those of the open ground beside its tiles. */
  touches(gate: Tile[]): number[] {
    const out = new Set<number>();
    for (const t of gate) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = t.col + dx;
        const y = t.row + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        const l = this.label[y * this.cols + x];
        if (l >= 0) out.add(l);
      }
    }
    return [...out];
  }

  /** How many walkable tiles the knight could not reach if these were the ring's only gates. */
  lost(gates: Tile[][]): number {
    const home = this.label[this.spawn.row * this.cols + this.spawn.col];
    const reached = new Set<number>([home]);
    const touched = gates.map((g) => this.touches(g));
    // a gate opens a way between the pieces it touches: spread from the knight's piece through whichever gates reach it
    for (let again = true; again; ) {
      again = false;
      touched.forEach((pieces) => {
        if (!pieces.some((p) => reached.has(p))) return;
        for (const p of pieces) {
          if (!reached.has(p)) {
            reached.add(p);
            again = true;
          }
        }
      });
    }
    let got = 0;
    for (const p of reached) got += this.size[p] ?? 0;
    return this.total - got;
  }
}

/** Tiles beyond which another gate is not worth it: a few stray pockets are fine, half a coast is not. */
const LOST_OK = 150;

/** The angle of a tile round the plaza, in radians. */
const angleOf = (t: Tile, spawn: Spawn) => Math.atan2(t.row - spawn.row, t.col - spawn.col);

/**
 * Where a ring's gates go: places where the ring has open ground to go through (a street, if there is one), chosen so
 * the ring costs the knight as little of the map as it can. One gate usually does; a coast cut into pieces by its
 * canals gets a second or third so that no stretch of it is shut away. `away` is the angle of the previous ring's gate:
 * the way on is better across the zone than straight on.
 */
function pickGates(grid: Grid, spawn: Spawn, band: Tile[], rng: () => number, away: number | null): { tiles: Tile[]; angle: number }[] {
  const pieces = new RingPieces(grid, spawn, band);
  const candidates: { tiles: Tile[]; angle: number; score: number }[] = [];
  const seen = new Set<string>();
  band.forEach((at, i) => {
    if (i % 2 === 1 || !isWalkable(grid[at.row][at.col])) return; // (every other tile: a gate is wider than that)
    const tiles = gateAround(grid, band, at);
    const id = tiles.map(key).sort().join('|');
    if (tiles.length < 2 || seen.has(id)) return;
    seen.add(id);
    const angle = angleOf(at, spawn);
    let score = tiles.length + tiles.filter((t) => onRoad(grid, t)).length * 3 + rng() * 2;
    if (away !== null) {
      const diff = Math.abs(Math.atan2(Math.sin(angle - away), Math.cos(angle - away)));
      score -= (1 - diff / Math.PI) * 25; // a gate right beside the last one's side is worth less
    }
    candidates.push({ tiles, angle, score });
  });
  const chosen: { tiles: Tile[]; angle: number; score: number }[] = [];
  let before = Infinity;
  for (let n = 0; n < 4; n++) {
    let best: (typeof candidates)[number] | null = null;
    let bestCost = Infinity;
    let bestLost = Infinity;
    for (const c of candidates) {
      if (chosen.includes(c) || chosen.some((o) => Math.hypot(o.tiles[0].col - c.tiles[0].col, o.tiles[0].row - c.tiles[0].row) < 8)) continue;
      const lost = pieces.lost([...chosen.map((o) => o.tiles), c.tiles]);
      const cost = lost - (n === 0 ? c.score : 0);
      if (cost < bestCost) {
        bestCost = cost;
        bestLost = lost;
        best = c;
      }
    }
    if (!best) break;
    if (chosen.length > 0 && (before <= LOST_OK || before - bestLost < 60)) break; // good enough, or no help
    chosen.push(best);
    before = bestLost;
  }
  return chosen;
}

/**
 * Close the two rings of rock round the plaza, leaving a gate (or, on a map cut up by water, a few) in each, and seal
 * off anything the rings cut off from the knight (a pocket the gates do not lead to becomes rock). Changes `grid`.
 */
export function applyZones(grid: Grid, spawn: Spawn, seed: number, regionId: string): Gate[] {
  const rng = mulberry32((seed ^ 0x1f83d9ab) >>> 0);
  const levels = gateLevels(regionId);
  const gates: Gate[] = [];
  let away: number | null = null;
  ZONE_RADII.forEach((radius, i) => {
    const band = bandTiles(grid, spawn, radius);
    const picks = pickGates(grid, spawn, band, rng, away);
    const open = new Set(picks.flatMap((p) => p.tiles.map(key)));
    for (const t of band) if (!open.has(key(t))) grid[t.row][t.col] = TileType.ROCK;
    for (const p of picks) {
      const col = Math.round(p.tiles.reduce((n, t) => n + t.col, 0) / p.tiles.length);
      const row = Math.round(p.tiles.reduce((n, t) => n + t.row, 0) / p.tiles.length);
      gates.push({ ring: (i + 1) as 1 | 2, level: levels[i], tiles: p.tiles, col, row });
    }
    if (picks[0]) away = picks[0].angle;
  });
  sealUnreachable(grid, spawn);
  return gates;
}

/** The walkable tiles the knight cannot reach on foot from the plaza (as a flag per tile, and how many). */
function reach(grid: Grid, spawn: Spawn): { seen: Uint8Array; lost: number } {
  const cols = grid[0].length;
  const rows = grid.length;
  const seen = new Uint8Array(cols * rows);
  const queue: number[] = [spawn.row * cols + spawn.col];
  seen[queue[0]] = 1;
  for (let q = 0; q < queue.length; q++) {
    const x = queue[q] % cols;
    const y = (queue[q] - x) / cols;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[ny * cols + nx] || !isWalkable(grid[ny][nx])) continue;
      seen[ny * cols + nx] = 1;
      queue.push(ny * cols + nx);
    }
  }
  let lost = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!seen[y * cols + x] && isWalkable(grid[y][x])) lost++;
  return { seen, lost };
}

/** Fill any walkable tile the knight cannot reach on foot from the plaza with rock. */
function sealUnreachable(grid: Grid, spawn: Spawn) {
  const cols = grid[0].length;
  const { seen } = reach(grid, spawn);
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < cols; x++) if (!seen[y * cols + x] && isWalkable(grid[y][x])) grid[y][x] = TileType.ROCK;
}
