/**
 * What gets painted on top of the bare tiles: shorelines, curbs, lane markings,
 * building roofs and wall faces, bridge rails, ice cracks, and the trees, cars,
 * lamps and umbrellas themselves. Plain data + math (no Phaser): the rules turn
 * a tile grid into a list of small coloured rectangles ("ops"), each tagged with
 * a semantic role (`foam`, `wallFace`...) that the renderer maps to a palette.
 * Deterministic for a given grid and seed, so it can be unit-tested.
 */
import { TILE } from '../config/constants';
import { getRegion } from '../config/regions';
import { TileType, type Grid } from './mapGen';

export type Role =
  | 'foam'
  | 'foamSoft'
  | 'deepEdge'
  | 'deckShadow'
  | 'iceEdge'
  | 'iceCrack'
  | 'curb'
  | 'curbShade'
  | 'lane'
  | 'parapetLight'
  | 'parapetDark'
  | 'wallFace'
  | 'wallShade'
  | 'window'
  | 'windowLit'
  | 'vent'
  | 'ventLight'
  | 'railDark'
  | 'railLight'
  | 'shadow'
  | 'leaf'
  | 'leafLight'
  | 'leafDark'
  | 'trunk'
  | 'frond'
  | 'frondLight'
  | 'carBody'
  | 'carBody2'
  | 'carBody3'
  | 'carGlass'
  | 'carTire'
  | 'lampPole'
  | 'lampLight'
  | 'hydrant'
  | 'hydrantCap'
  | 'umbrellaA'
  | 'umbrellaB';

export interface Op {
  x: number;
  y: number;
  w: number;
  h: number;
  role: Role;
  /** Opacity 0..1 (default 1). */
  a?: number;
}

/** A small deterministic hash of a tile position, for variety that never changes. */
export function tileHash(col: number, row: number, seed: number): number {
  let h = Math.imul(col + 1, 374761393) ^ Math.imul(row + 1, 668265263) ^ Math.imul((seed | 0) + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const LAND = new Set<number>([TileType.GRASS_A, TileType.GRASS_B, TileType.PATH, TileType.BUILDING, TileType.ROCK, TileType.TREE, TileType.CAR, TileType.PROP]);
const KERB_NEIGHBOURS = new Set<number>([TileType.GRASS_A, TileType.GRASS_B, TileType.BUILDING, TileType.ROCK, TileType.TREE, TileType.PROP]);
const isRoad = (t: number) => t === TileType.PATH || t === TileType.BRIDGE;
const isWater = (t: number) => t === TileType.WATER || t === TileType.SHALLOW;

type Side = 'N' | 'S' | 'W' | 'E';
const SIDES: Side[] = ['N', 'S', 'W', 'E'];

/** A strip along one edge of a tile, `thick` px deep. */
function edge(x: number, y: number, side: Side, thick: number, role: Role, a?: number, inset = 0): Op {
  const T = TILE;
  switch (side) {
    case 'N':
      return { x, y: y + inset, w: T, h: thick, role, a };
    case 'S':
      return { x, y: y + T - thick - inset, w: T, h: thick, role, a };
    case 'W':
      return { x: x + inset, y, w: thick, h: T, role, a };
    case 'E':
      return { x: x + T - thick - inset, y, w: thick, h: T, role, a };
  }
}

export interface DecorOptions {
  /** A 'street' region paints lane markings; a 'beach' one has boardwalk planks instead. */
  regionId: string;
  seed: number;
}

export function computeDecor(grid: Grid, opts: DecorOptions): Op[] {
  const rows = grid.length;
  const cols = grid[0].length;
  const ops: Op[] = [];
  const props: { c: number; r: number; t: number }[] = [];
  const beach = getRegion(opts.regionId).dress === 'beach';
  const lanes = !beach;

  /** A neighbour's tile type; off the map counts as the same as the tile itself (no edge at the world's rim). */
  const at = (c: number, r: number, self: number) => grid[r]?.[c] ?? self;
  const nb = (c: number, r: number, self: number): Record<Side, number> => ({
    N: at(c, r - 1, self),
    S: at(c, r + 1, self),
    W: at(c - 1, r, self),
    E: at(c + 1, r, self),
  });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = grid[r][c];
      const x = c * TILE;
      const y = r * TILE;
      const h = tileHash(c, r, opts.seed);
      const n = nb(c, r, t);

      switch (t) {
        case TileType.BUILDING: {
          if (n.N !== TileType.BUILDING) ops.push(edge(x, y, 'N', 1, 'parapetLight'));
          if (n.W !== TileType.BUILDING) ops.push(edge(x, y, 'W', 1, 'parapetLight'));
          if (n.E !== TileType.BUILDING) ops.push(edge(x, y, 'E', 1, 'parapetDark'));
          if (n.S !== TileType.BUILDING) {
            // the front of the building: a wall with windows
            ops.push({ x, y: y + 10, w: TILE, h: 6, role: 'wallFace' });
            ops.push({ x, y: y + 15, w: TILE, h: 1, role: 'wallShade' });
            ops.push({ x: x + 3, y: y + 11, w: 3, h: 3, role: h & 4 ? 'windowLit' : 'window' });
            ops.push({ x: x + 10, y: y + 11, w: 3, h: 3, role: h & 8 ? 'windowLit' : 'window' });
          } else if (h % 100 < 7) {
            // a roof vent here and there
            const vx = x + 3 + (h >>> 8) % 8;
            const vy = y + 2 + (h >>> 12) % 5;
            ops.push({ x: vx, y: vy, w: 3, h: 3, role: 'vent' });
            ops.push({ x: vx, y: vy, w: 3, h: 1, role: 'ventLight' });
          }
          break;
        }

        case TileType.PATH: {
          for (const s of SIDES) {
            if (!KERB_NEIGHBOURS.has(n[s])) continue;
            ops.push(edge(x, y, s, 1, 'curb'));
            ops.push(edge(x, y, s, 1, 'curbShade', 0.4, 1));
          }
          if (lanes) {
            const horizCentre =
              isRoad(n.W) && isRoad(n.E) && isRoad(n.N) && isRoad(n.S) && !isRoad(at(c, r - 2, t)) && !isRoad(at(c, r + 2, t));
            const vertCentre =
              isRoad(n.W) && isRoad(n.E) && isRoad(n.N) && isRoad(n.S) && !isRoad(at(c - 2, r, t)) && !isRoad(at(c + 2, r, t));
            if (horizCentre && !vertCentre) ops.push({ x: x + 1, y: y + 7, w: 7, h: 2, role: 'lane' });
            else if (vertCentre && !horizCentre) ops.push({ x: x + 7, y: y + 1, w: 2, h: 7, role: 'lane' });
          }
          break;
        }

        case TileType.WATER:
        case TileType.SHALLOW: {
          for (const s of SIDES) {
            if (LAND.has(n[s])) {
              ops.push(edge(x, y, s, 1, 'foam'));
              if (t === TileType.SHALLOW) ops.push(edge(x, y, s, 1, 'foamSoft', 0.45, 1));
            } else if (n[s] === TileType.BRIDGE) {
              ops.push(edge(x, y, s, 2, 'deckShadow', 0.35));
            } else if (t === TileType.WATER && n[s] === TileType.SHALLOW) {
              ops.push(edge(x, y, s, 1, 'deepEdge'));
            }
          }
          break;
        }

        case TileType.ICE: {
          for (const s of SIDES) if (n[s] !== TileType.ICE) ops.push(edge(x, y, s, 1, 'iceEdge'));
          if (h % 100 < 22) {
            // a crack, stepping across the tile
            const cx = x + 2 + (h >>> 8) % 6;
            const cy = y + 2 + (h >>> 12) % 6;
            for (let k = 0; k < 5; k++) ops.push({ x: cx + k * 2, y: cy + k + (k % 2), w: 2, h: 1, role: 'iceCrack' });
          }
          break;
        }

        case TileType.BRIDGE: {
          for (const s of SIDES) {
            if (isWater(n[s]) || n[s] === TileType.ICE) {
              ops.push(edge(x, y, s, 2, 'railDark'));
              for (let i = 0; i < TILE; i += 4) {
                ops.push(s === 'N' || s === 'S' ? { x: x + i, y: s === 'N' ? y : y + TILE - 2, w: 1, h: 2, role: 'railLight' } : { x: s === 'W' ? x : x + TILE - 2, y: y + i, w: 2, h: 1, role: 'railLight' });
              }
            }
          }
          break;
        }

        case TileType.TREE:
        case TileType.CAR:
        case TileType.PROP:
          props.push({ c, r, t });
          break;
      }
    }
  }

  // Props go last so a canopy can overhang its neighbours.
  for (const p of props) {
    const x = p.c * TILE;
    const y = p.r * TILE;
    const h = tileHash(p.c, p.r, opts.seed);
    if (p.t === TileType.TREE) beach ? palm(ops, x, y, h) : tree(ops, x, y, h);
    else if (p.t === TileType.CAR) car(ops, x, y, h, isRoad(at(p.c - 1, p.r, p.t)) || isRoad(at(p.c + 1, p.r, p.t)) || at(p.c - 1, p.r, p.t) === TileType.CAR || at(p.c + 1, p.r, p.t) === TileType.CAR);
    else beach ? umbrella(ops, x, y, h) : lamp(ops, x, y, h);
  }
  return ops;
}

function disc(ops: Op[], cx: number, cy: number, radius: number, role: Role, a?: number) {
  for (let yy = -radius; yy <= radius; yy++) {
    const half = Math.round(Math.sqrt(radius * radius + 0.5 - yy * yy));
    ops.push({ x: cx - half, y: cy + yy, w: half * 2, h: 1, role, a });
  }
}

function tree(ops: Op[], x: number, y: number, h: number) {
  ops.push({ x: x + 3, y: y + 11, w: 10, h: 3, role: 'shadow', a: 0.35 });
  ops.push({ x: x + 7, y: y + 8, w: 2, h: 6, role: 'trunk' });
  const cx = x + 8;
  const cy = y + 5 + (h % 2);
  disc(ops, cx, cy, 7, 'leafDark');
  disc(ops, cx - 1, cy - 1, 6, 'leaf');
  disc(ops, cx - 3, cy - 3, 3, 'leafLight');
  if (h & 4) ops.push({ x: cx + 2, y: cy + 1, w: 2, h: 2, role: 'leafDark' });
}

function palm(ops: Op[], x: number, y: number, h: number) {
  ops.push({ x: x + 4, y: y + 12, w: 9, h: 2, role: 'shadow', a: 0.3 });
  const lean = (h % 3) - 1; // -1, 0 or 1
  for (let k = 0; k < 8; k++) ops.push({ x: x + 7 + Math.round((lean * k) / 4), y: y + 13 - k, w: 2, h: 1, role: 'trunk' });
  const cx = x + 8 + lean * 2;
  const cy = y + 5;
  // six fronds fanning out
  const dirs: [number, number][] = [[-1, 0], [1, 0], [-1, -1], [1, -1], [0, -1], [0, 1]];
  for (const [dx, dy] of dirs) {
    for (let k = 1; k <= 6; k++) ops.push({ x: cx + dx * k - 1, y: cy + dy * k * (dy === 0 ? 0 : 1) + (dx !== 0 && dy === 0 ? Math.floor(k / 3) : 0), w: 2, h: 2, role: k >= 5 ? 'frondLight' : 'frond' });
  }
  ops.push({ x: cx - 1, y: cy - 1, w: 3, h: 3, role: 'trunk' });
}

function car(ops: Op[], x: number, y: number, h: number, horizontal: boolean) {
  const body: Role = (['carBody', 'carBody2', 'carBody3'] as const)[h % 3];
  if (horizontal) {
    ops.push({ x: x + 1, y: y + 4, w: 14, h: 9, role: 'shadow', a: 0.3 });
    ops.push({ x: x + 1, y: y + 3, w: 14, h: 8, role: body });
    ops.push({ x: x + 3, y: y + 4, w: 3, h: 6, role: 'carGlass' });
    ops.push({ x: x + 10, y: y + 4, w: 2, h: 6, role: 'carGlass' });
    ops.push({ x: x + 3, y: y + 2, w: 3, h: 1, role: 'carTire' });
    ops.push({ x: x + 10, y: y + 2, w: 3, h: 1, role: 'carTire' });
    ops.push({ x: x + 3, y: y + 11, w: 3, h: 1, role: 'carTire' });
    ops.push({ x: x + 10, y: y + 11, w: 3, h: 1, role: 'carTire' });
  } else {
    ops.push({ x: x + 4, y: y + 1, w: 9, h: 14, role: 'shadow', a: 0.3 });
    ops.push({ x: x + 3, y: y + 1, w: 8, h: 14, role: body });
    ops.push({ x: x + 4, y: y + 3, w: 6, h: 3, role: 'carGlass' });
    ops.push({ x: x + 4, y: y + 10, w: 6, h: 2, role: 'carGlass' });
    ops.push({ x: x + 2, y: y + 3, w: 1, h: 3, role: 'carTire' });
    ops.push({ x: x + 2, y: y + 10, w: 1, h: 3, role: 'carTire' });
    ops.push({ x: x + 11, y: y + 3, w: 1, h: 3, role: 'carTire' });
    ops.push({ x: x + 11, y: y + 10, w: 1, h: 3, role: 'carTire' });
  }
}

function lamp(ops: Op[], x: number, y: number, h: number) {
  if (h % 2 === 0) {
    // a street lamp: pole and a glowing head
    ops.push({ x: x + 6, y: y + 11, w: 4, h: 2, role: 'shadow', a: 0.35 });
    ops.push({ x: x + 7, y: y + 4, w: 2, h: 8, role: 'lampPole' });
    ops.push({ x: x + 5, y: y + 2, w: 6, h: 3, role: 'lampPole' });
    ops.push({ x: x + 6, y: y + 3, w: 4, h: 1, role: 'lampLight' });
  } else {
    // a fire hydrant
    ops.push({ x: x + 5, y: y + 11, w: 6, h: 2, role: 'shadow', a: 0.35 });
    ops.push({ x: x + 6, y: y + 6, w: 4, h: 6, role: 'hydrant' });
    ops.push({ x: x + 4, y: y + 8, w: 8, h: 2, role: 'hydrant' });
    ops.push({ x: x + 6, y: y + 4, w: 4, h: 2, role: 'hydrantCap' });
  }
}

function umbrella(ops: Op[], x: number, y: number, h: number) {
  ops.push({ x: x + 4, y: y + 11, w: 10, h: 3, role: 'shadow', a: 0.3 });
  ops.push({ x: x + 8, y: y + 8, w: 1, h: 6, role: 'trunk' });
  const cx = x + 8;
  const cy = y + 6;
  const flip = h & 1;
  for (let yy = -5; yy <= 5; yy++) {
    const half = Math.round(Math.sqrt(30 - yy * yy));
    for (let xx = -half; xx < half; xx++) ops.push({ x: cx + xx, y: cy + yy, w: 1, h: 1, role: (Math.floor((xx + 8) / 3) + flip) % 2 === 0 ? 'umbrellaA' : 'umbrellaB' });
  }
}
