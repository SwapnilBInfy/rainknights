/**
 * The tunnels under a city. Plain data and maths (no Phaser): a map is carved out of solid rock from a seed, so the
 * same tunnel is always the same, every part of it can be reached from the stairs, and it can be tested.
 *
 * A tunnel joins two entrances on the surface. The street cities have **subway** tunnels (straight corridors and
 * pillared stations, asphalt underfoot); the coastal cities have **caves** (winding passages and pools). Each has
 * dead-end rooms with chests. The way in (A) is at one end and the way out (B) at the other.
 */
import { MAP_COLS, MAP_ROWS } from '../config/constants';
import { mulberry32, TileType, isWalkable, type Grid } from './mapGen';

export interface Cell {
  col: number;
  row: number;
}

export interface Tunnel {
  grid: Grid;
  /** The stairs up at the west end, and at the east end. */
  a: Cell;
  b: Cell;
  /** Where the chests are (the dead ends and the stations). */
  chests: Cell[];
}

type Rng = () => number;
const ri = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
const FRAME = 3;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Generate tunnel `tunnel` (0 or 1) under a city's map. `dress` picks subway or cave. */
export function generateUnderground(regionId: string, seed: number, tunnel: number, dress: 'street' | 'beach', cols = MAP_COLS, rows = MAP_ROWS): Tunnel {
  const rng = mulberry32((Math.imul(seed >>> 0, 2654435761) ^ Math.imul(tunnel + 1, 40503) ^ hashString(regionId)) >>> 0);
  const subway = dress === 'street';
  const floor: number = subway ? TileType.PATH : TileType.GRASS_A;
  const grid: Grid = Array.from({ length: rows }, () => new Array<number>(cols).fill(TileType.ROCK));
  const inside = (x: number, y: number) => x >= FRAME && y >= FRAME && x < cols - FRAME && y < rows - FRAME;
  const carve = (x: number, y: number, t: number = floor) => {
    if (inside(x, y)) grid[y][x] = t;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, t: number = floor) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) carve(x, y, t);
  };
  const disc = (cx: number, cy: number, r: number, t: number = floor) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1) carve(x, y, t);
  };

  const a: Cell = { col: 9, row: ri(rng, 26, rows - 27) };
  const b: Cell = { col: cols - 10, row: ri(rng, 26, rows - 27) };
  // the route: a string of stops from the west end to the east end
  const stops: Cell[] = [a];
  const legs = 4;
  for (let i = 1; i <= legs; i++) {
    const col = Math.round(a.col + ((b.col - a.col) * i) / (legs + 1)) + ri(rng, -4, 4);
    stops.push({ col, row: ri(rng, 16, rows - 17) });
  }
  stops.push(b);

  // a corridor between two stops
  const link = (p: Cell, q: Cell) => {
    if (subway) {
      // straight runs with a turn, three wide
      const midCol = p.col + Math.round((q.col - p.col) / 2);
      rect(Math.min(p.col, midCol), p.row - 1, Math.max(p.col, midCol), p.row + 1);
      rect(midCol - 1, Math.min(p.row, q.row), midCol + 1, Math.max(p.row, q.row));
      rect(Math.min(midCol, q.col), q.row - 1, Math.max(midCol, q.col), q.row + 1);
    } else {
      // a winding passage that leans toward its goal
      let x = p.col;
      let y = p.row;
      for (let guard = 0; guard < 900 && (Math.abs(x - q.col) > 1 || Math.abs(y - q.row) > 1); guard++) {
        disc(x, y, 2 + (rng() < 0.2 ? 1 : 0));
        if (rng() < 0.55) x += Math.sign(q.col - x);
        else y += rng() < 0.65 ? Math.sign(q.row - y) : ri(rng, -1, 1);
        x = Math.max(FRAME + 3, Math.min(cols - FRAME - 4, x));
        y = Math.max(FRAME + 3, Math.min(rows - FRAME - 4, y));
      }
      disc(q.col, q.row, 2);
    }
  };
  for (let i = 0; i + 1 < stops.length; i++) link(stops[i], stops[i + 1]);

  const chests: Cell[] = [];
  const room = (c: Cell, w: number, h: number) => {
    if (subway) rect(c.col - Math.floor(w / 2), c.row - Math.floor(h / 2), c.col + Math.floor(w / 2), c.row + Math.floor(h / 2));
    else disc(c.col, c.row, Math.floor(Math.max(w, h) / 2));
  };

  // stations or caverns at the stops in between
  for (const s of stops.slice(1, -1)) {
    room(s, 13, 7);
    if (subway) {
      // pillars along the long edges of the station, leaving the middle clear
      for (let dx = -4; dx <= 4; dx += 4) {
        carve(s.col + dx, s.row - 2, TileType.PROP);
        carve(s.col + dx, s.row + 2, TileType.PROP);
      }
    } else {
      // a pool off to one side
      const side = rng() < 0.5 ? -1 : 1;
      disc(s.col + side * 3, s.row + side * 2, 1, TileType.WATER);
      disc(s.col + side * 3, s.row + side * 2, 2, TileType.SHALLOW);
      disc(s.col + side * 3, s.row + side * 2, 1, TileType.WATER);
    }
    chests.push({ col: s.col + (rng() < 0.5 ? -4 : 4), row: s.row });
  }

  // dead-end branches, each ending in a small chamber with a chest
  const branches = 4;
  for (let i = 0; i < branches; i++) {
    const from = stops[ri(rng, 1, stops.length - 2)];
    const dir = rng() < 0.5 ? -1 : 1;
    const len = ri(rng, 12, 20);
    const bend = ri(rng, -6, 6);
    const end: Cell = { col: from.col + bend, row: Math.max(FRAME + 5, Math.min(rows - FRAME - 6, from.row + dir * len)) };
    if (Math.abs(end.row - from.row) < 6) continue;
    link({ col: from.col, row: from.row }, end);
    room(end, 7, 5);
    chests.push({ ...end });
  }

  // the stairs, with a landing in front of each
  rect(a.col - 2, a.row - 2, a.col + 2, a.row + 2);
  rect(b.col - 2, b.row - 2, b.col + 2, b.row + 2);
  // puddles on the floor of the corridors
  for (let i = 0; i < 9; i++) {
    const x = ri(rng, FRAME + 4, cols - FRAME - 5);
    const y = ri(rng, FRAME + 4, rows - FRAME - 5);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) if (grid[y + dy]?.[x + dx] === floor && Math.hypot(x - a.col, y - a.row) > 6 && Math.hypot(x - b.col, y - b.row) > 6) grid[y + dy][x + dx] = TileType.SHALLOW;
  }

  // seal off anything the carving left cut off from the stairs
  const reached = flood(grid, a);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (isWalkable(grid[y][x]) && !reached[y * cols + x]) grid[y][x] = TileType.ROCK;
  const open = chests.filter((c) => isWalkable(grid[c.row][c.col]) && reached[c.row * cols + c.col]);
  return { grid, a, b, chests: open };
}

/** Which tiles can be walked to from `from`. */
export function flood(grid: Grid, from: Cell): Uint8Array {
  const rows = grid.length;
  const cols = grid[0].length;
  const seen = new Uint8Array(rows * cols);
  const queue: number[] = [];
  if (isWalkable(grid[from.row][from.col])) {
    seen[from.row * cols + from.col] = 1;
    queue.push(from.row * cols + from.col);
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
      if (seen[ni] || !isWalkable(grid[ny][nx])) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}
