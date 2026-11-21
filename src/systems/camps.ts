/**
 * Where the enemies live. Plain data and maths (no Phaser): the enemies of a city stand in fixed camps, and where they
 * are is a pure function of the map and its seed, so the same map always has them in the same places, every camp is on
 * open ground the knight can walk to, and it can be tested.
 *
 * Camps get tougher the farther they are from the plaza the knight starts on (three rings), and the boss waits at the
 * far end of the map. A city's signature enemy (the Cab Wraith in New York) joins some camps beyond the first ring.
 */
import { mulberry32, PLAZA_RADIUS, TileType, isSolid, type Grid, type Spawn } from './mapGen';

export interface CampMember {
  type: string;
  /** Where it stands, in px from the camp's centre. */
  dx: number;
  dy: number;
  /** Where in its loop it starts (0 to 2π), so a camp's members do not walk in step. */
  phase: number;
}

export interface Camp {
  id: number;
  col: number;
  row: number;
  /** 0 outskirts, 1 midtown, 2 core: how far out the camp is. */
  tier: 0 | 1 | 2;
  members: CampMember[];
}

export interface CampPlan {
  camps: Camp[];
  /** Where the boss waits: the far end of the map. */
  boss: { col: number; row: number };
}

/** The three rings, as distances from the plaza in tiles. */
export const TIER_EDGES: readonly [number, number] = [30, 52];
export const tierAt = (distTiles: number): 0 | 1 | 2 => (distTiles < TIER_EDGES[0] ? 0 : distTiles < TIER_EDGES[1] ? 1 : 2);

/** Who lives in each ring. */
export const ROSTER: Record<0 | 1 | 2, readonly string[]> = {
  0: ['rainImp', 'rainImp', 'windWraith'],
  1: ['windWraith', 'hailBrute', 'lightningWisp'],
  2: ['hailBrute', 'lightningWisp', 'snowGolem'],
};

export const CAMP_COUNT = 16;
/** Camps are at least this many tiles apart (relaxed if the map is too tight), and this far from the boss. */
const SPACING = 13;
const BOSS_CLEARANCE = 11;
/** Nothing stands closer than this to the plaza: the knight starts in peace. */
export const CAMP_CLEARANCE = PLAZA_RADIUS + 12;

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

function members(rng: () => number, tier: 0 | 1 | 2, signature: string | undefined, onRoad: boolean): CampMember[] {
  const size = tier === 2 ? 3 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2);
  const out: CampMember[] = [];
  const roster = ROSTER[tier];
  // a signature enemy leads some camps beyond the outskirts (a vehicle one needs a road under the camp)
  const lead = signature && tier > 0 && onRoad && rng() < 0.55 ? signature : null;
  for (let i = 0; i < size; i++) {
    const angle = (i / size) * Math.PI * 2 + rng() * 0.6;
    const reach = size === 1 ? 0 : 10 + rng() * 8;
    out.push({
      type: i === 0 && lead ? lead : roster[Math.min(roster.length - 1, Math.floor(rng() * roster.length))],
      dx: Math.round(Math.cos(angle) * reach),
      dy: Math.round(Math.sin(angle) * reach),
      phase: rng() * Math.PI * 2,
    });
  }
  return out;
}

/** Where everything goes on this map. Deterministic for a map and seed. */
export function placeCamps(grid: Grid, spawn: Spawn, seed: number, signature?: string): CampPlan {
  const rows = grid.length;
  const cols = grid[0].length;
  const rng = mulberry32((seed ^ 0x3c6ef372) >>> 0);
  const margin = 6;
  const candidates: { col: number; row: number; d: number }[] = [];
  for (let row = margin; row < rows - margin; row++) {
    for (let col = margin; col < cols - margin; col++) {
      const d = Math.hypot(col - spawn.col, row - spawn.row);
      if (d >= CAMP_CLEARANCE && isOpen(grid, col, row)) candidates.push({ col, row, d });
    }
  }
  // The boss: among the farthest open ground, the one nearest a road if there is one (a bus wants a street).
  const byFar = [...candidates].sort((a, b) => b.d - a.d);
  const farPool = byFar.slice(0, Math.max(1, Math.floor(byFar.length * 0.04)));
  const bossTile = farPool.find((c) => grid[c.row][c.col] === TileType.PATH) ?? farPool[0] ?? { col: spawn.col, row: spawn.row + CAMP_CLEARANCE, d: 0 };
  const boss = { col: bossTile.col, row: bossTile.row };

  // a shuffle, so the same seed always gives the same order and a different seed a different map
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const camps: Camp[] = [];
  let spacing = SPACING;
  for (let pass = 0; pass < 4 && camps.length < CAMP_COUNT; pass++) {
    for (const c of candidates) {
      if (camps.length >= CAMP_COUNT) break;
      if (Math.hypot(c.col - boss.col, c.row - boss.row) < BOSS_CLEARANCE) continue;
      if (!camps.every((k) => Math.hypot(k.col - c.col, k.row - c.row) >= spacing)) continue;
      const tier = tierAt(c.d);
      camps.push({ id: camps.length, col: c.col, row: c.row, tier, members: members(rng, tier, signature, grid[c.row][c.col] === TileType.PATH) });
    }
    spacing *= 0.75;
  }
  return { camps, boss };
}

/** The camps along a tunnel: a few foes spread between the two sets of stairs, away from both ends. */
export function tunnelCamps(grid: Grid, a: { col: number; row: number }, b: { col: number; row: number }, seed: number, count = 6): Camp[] {
  const rng = mulberry32((seed ^ 0x510e527f) >>> 0);
  const open: { col: number; row: number }[] = [];
  for (let row = 2; row < grid.length - 2; row++) {
    for (let col = 2; col < grid[0].length - 2; col++) {
      if (!isOpen(grid, col, row)) continue;
      if (Math.hypot(col - a.col, row - a.row) < 12 || Math.hypot(col - b.col, row - b.row) < 12) continue;
      open.push({ col, row });
    }
  }
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  const camps: Camp[] = [];
  let spacing = 14;
  for (let pass = 0; pass < 4 && camps.length < count; pass++) {
    for (const c of open) {
      if (camps.length >= count) break;
      if (!camps.every((k) => Math.hypot(k.col - c.col, k.row - c.row) >= spacing)) continue;
      camps.push({ id: camps.length, col: c.col, row: c.row, tier: 0, members: members(rng, 0, undefined, false).slice(0, 2) });
    }
    spacing *= 0.7;
  }
  return camps;
}
