import Phaser from 'phaser';
import type { WeaponType } from './chibi';
import { BEAM } from '../config/weapons';

/**
 * Tiny procedural weapon sprites (16x16, drawn pointing UP with the grip at
 * bottom-center) so the game can rotate them around the hand and swing them.
 */

const SIZE = 16;
const OUTLINE = 0x202030;

type Grid = (number | null)[][];

function newGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array<number | null>(SIZE).fill(null));
}

function rect(g: Grid, x: number, y: number, w: number, h: number, c: number) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy]) g[yy][xx] = c;
}

function outlined(g: Grid): Grid {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (g[y][x] !== null) continue;
      const near = (dx: number, dy: number) => g[y + dy]?.[x + dx] != null;
      if (near(1, 0) || near(-1, 0) || near(0, 1) || near(0, -1)) out[y][x] = OUTLINE;
    }
  }
  return out;
}

function sword(): Grid {
  const g = newGrid();
  rect(g, 7, 2, 2, 10, 0x7fe0ff); // blade
  rect(g, 7, 2, 1, 10, 0xe8fcff); // highlight edge
  rect(g, 7, 1, 2, 1, 0xffffff); // tip
  rect(g, 5, 12, 6, 1, 0xe8b030); // guard
  rect(g, 7, 13, 2, 2, 0x8a5a2a); // grip
  rect(g, 7, 15, 2, 1, 0xe8b030); // pommel
  return g;
}

function hammer(): Grid {
  const g = newGrid();
  rect(g, 7, 5, 2, 11, 0x8a5a2a); // haft
  rect(g, 3, 0, 10, 6, 0xa8d8f8); // icy head
  rect(g, 3, 0, 10, 1, 0xffffff);
  rect(g, 3, 5, 10, 1, 0x5088c0);
  rect(g, 12, 1, 1, 5, 0x5088c0);
  rect(g, 5, 2, 2, 2, 0xe8f8ff); // crystal glint
  return g;
}

function daggers(): Grid {
  const g = newGrid();
  for (const x of [3, 10]) {
    rect(g, x, 3, 2, 9, 0xfff080); // blade
    rect(g, x, 3, 1, 9, 0xffffff);
    rect(g, x - 1, 12, 4, 1, 0xe8a010); // guard
    rect(g, x, 13, 2, 3, 0x6a4020); // grip
  }
  // a little static spark between the blades
  rect(g, 7, 6, 2, 1, 0x60d0f0);
  rect(g, 6, 8, 1, 1, 0x60d0f0);
  rect(g, 9, 9, 1, 1, 0x60d0f0);
  return g;
}

const BUILDERS: Record<WeaponType, () => Grid> = { sword, hammer, daggers };

export function weaponKey(type: WeaponType): string {
  return `weapon_${type}`;
}

export const SLASH_KEY = 'fx_slash';
export const SPARK_KEY = 'fx_spark';

export function beamKey(type: WeaponType): string {
  return `fx_beam_${type}`;
}

function css(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function paint(scene: Phaser.Scene, key: string, grid: Grid) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, SIZE, SIZE)!;
  const ctx = tex.getContext();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const c = grid[y][x];
      if (c === null) continue;
      ctx.fillStyle = css(c);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
}

/** Crescent slash effect, pointing up from the pivot at bottom-center. */
function slash(): Grid {
  const g = newGrid();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x + 0.5 - 8;
      const dy = SIZE - (y + 0.5);
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dx, dy);
      if (r >= 10 && r <= 14.5 && Math.abs(a) < 0.95) {
        g[y][x] = r >= 11.5 && r <= 13 ? 0xffffff : 0xa0e8ff;
      }
    }
  }
  return g;
}

/**
 * Beam segment texture (2px wide, stretched to beam length in game): banded
 * edge → mid → white core, symmetric around the center row.
 */
function generateBeamTexture(scene: Phaser.Scene, type: WeaponType) {
  const key = beamKey(type);
  if (scene.textures.exists(key)) return;
  const { halfWidth, colors } = BEAM[type];
  const h = halfWidth * 2 + 1;
  const tex = scene.textures.createCanvas(key, 2, h)!;
  const ctx = tex.getContext();
  for (let row = 0; row < h; row++) {
    const d = Math.abs(row - halfWidth) / Math.max(1, halfWidth);
    const color = d <= 0.3 ? colors[2] : d <= 0.7 ? colors[1] : colors[0];
    ctx.fillStyle = css(color);
    ctx.fillRect(0, row, 2, 1);
  }
  tex.refresh();
}

/** 5x5 star burst used for beam muzzle / impact flashes. */
function sparks(): Grid {
  const g = newGrid();
  for (const [x, y] of [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [2, 4], [1, 1], [3, 1], [1, 3], [3, 3]]) {
    g[y][x] = x === 2 && y === 2 ? 0xffffff : 0xfff8c0;
  }
  return g;
}

export function generateWeaponTextures(scene: Phaser.Scene) {
  for (const type of Object.keys(BUILDERS) as WeaponType[]) {
    paint(scene, weaponKey(type), outlined(BUILDERS[type]()));
  }
  paint(scene, SLASH_KEY, slash());
  paint(scene, SPARK_KEY, sparks());
  for (const type of Object.keys(BUILDERS) as WeaponType[]) generateBeamTexture(scene, type);
}
