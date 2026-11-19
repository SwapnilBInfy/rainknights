import { TILE } from '../config/constants';
import { TileType, isSolid, type Grid } from '../systems/mapGen';

/**
 * Mistford, a one-screen-and-a-bit village. Hand authored (the cities stay seeded).
 * The south edge is the road out; the house and the market open off the main street.
 */

export interface Cell {
  col: number;
  row: number;
}

const TOWN_FLOOR = TileType.GRASS_A;
const ROOM_FLOOR = TileType.PATH;

const TOWN_ART = [
  '##################',
  '#tt............tt#',
  '#.HHHHH....SSSSS.#',
  '#.HHHHH....SSSSS.#',
  '#.HHHHH....SSSSS.#',
  '#.HHHHH....SSSSS.#',
  '#....d........d..#',
  '#================#',
  '#.......==.......#',
  '#.......==..~~...#',
  '#.......==..~~...#',
  '#.......==.......#',
  '#....********....#',
  '##################',
];

const HOUSE_ART = [
  '###############',
  '#.............#',
  '#..b.....c....#',
  '#.............#',
  '#..m.....a....#',
  '#.............#',
  '#.............#',
  '#.............#',
  '#......d......#',
  '###############',
];

const MARKET_ART = [
  '###############',
  '#.............#',
  '#.............#',
  '#KKKKKKKKKKKKK#',
  '#.............#',
  '#.............#',
  '#.............#',
  '#.............#',
  '#......d......#',
  '###############',
];

function parse(rows: string[], floor: number): Grid {
  return rows.map((row) =>
    [...row].map((ch) => {
      if (ch === '#' || ch === 'H' || ch === 'S' || ch === 'K') return TileType.BUILDING;
      if (ch === 't') return TileType.TREE;
      if (ch === 'r') return TileType.ROCK;
      if (ch === '~') return TileType.SHALLOW;
      if (ch === 'w') return TileType.WATER;
      if (ch === '=' || ch === '*' || ch === 'd') return TileType.PATH;
      if (ch === '.') return floor;
      return floor;
    })
  );
}

export function cells(rows: readonly string[], ch: string): Cell[] {
  const out: Cell[] = [];
  rows.forEach((row, r) => {
    [...row].forEach((c, col) => {
      if (c === ch) out.push({ col, row: r });
    });
  });
  return out;
}

export function cellCenter(cell: Cell): { x: number; y: number } {
  return { x: cell.col * TILE + TILE / 2, y: cell.row * TILE + TILE / 2 };
}

export const TOWN_ROWS = TOWN_ART;
export const townGrid: Grid = parse(TOWN_ART, TOWN_FLOOR);
export const houseGrid: Grid = parse(HOUSE_ART, ROOM_FLOOR);
export const marketGrid: Grid = parse(MARKET_ART, ROOM_FLOOR);

const doorMats = cells(TOWN_ART, 'd').sort((a, b) => a.col - b.col);

export const TOWN = {
  spawn: { col: 8, row: 7 } as Cell,
  houseMat: doorMats[0],
  shopMat: doorMats[1],
  gates: cells(TOWN_ART, '*'),
  /** Where you land outside a door, on the street, so the mat does not immediately pull you back in. */
  houseExit: { col: doorMats[0].col, row: doorMats[0].row + 1 } as Cell,
  shopExit: { col: doorMats[1].col, row: doorMats[1].row + 1 } as Cell,
};

export const HOUSE = {
  spawn: { col: 7, row: 6 } as Cell,
  door: cells(HOUSE_ART, 'd')[0],
  bed: { col: 11, row: 6 } as Cell,
  chest: { col: 9, row: 2 } as Cell,
  mirror: { col: 3, row: 4 } as Cell,
  rack: { col: 9, row: 4 } as Cell,
};

export const MARKET = {
  spawn: { col: 7, row: 6 } as Cell,
  door: cells(MARKET_ART, 'd')[0],
  /** Floor in front of the counter. */
  counterRow: 4,
  keeper: { col: 4, row: 2 } as Cell,
};

export interface TownNpc {
  id: string;
  name: string;
  at: Cell;
  shirt: 'blue' | 'green';
  lines: [string, string];
}

export const TOWN_NPCS: TownNpc[] = [
  {
    id: 'pia',
    name: 'Pia',
    at: { col: 5, row: 9 },
    shirt: 'blue',
    lines: ['Welcome to Mistford.', 'The rain never quite stops.'],
  },
  {
    id: 'brent',
    name: 'Brent',
    at: { col: 12, row: 9 },
    shirt: 'green',
    lines: ['Drips buy food and armor.', 'The market is to the east.'],
  },
];

export const TOWN_SIGN: { at: Cell; lines: [string, string] } = {
  at: { col: 6, row: 10 },
  lines: ['South road: the cities.', 'Come home between runs.'],
};

export function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

export function cellOf(x: number, y: number): Cell {
  return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
}

/** Every walkable tile in Mistford can be reached from the spawn, doors included. */
export function reachableFrom(grid: Grid, start: Cell): Set<string> {
  const key = (c: Cell) => `${c.col},${c.row}`;
  const seen = new Set<string>();
  const queue: Cell[] = [start];
  seen.add(key(start));
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of dirs) {
      const next = { col: cur.col + dx, row: cur.row + dy };
      const id = key(next);
      if (seen.has(id)) continue;
      const tile = grid[next.row]?.[next.col];
      if (tile === undefined || isSolid(tile)) continue;
      seen.add(id);
      queue.push(next);
    }
  }
  return seen;
}
