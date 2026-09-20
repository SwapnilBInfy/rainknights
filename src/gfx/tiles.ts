import Phaser from 'phaser';
import { TILE } from '../config/constants';

/**
 * GBA-style 16x16 terrain tiles, painted pixel by pixel from a per-region
 * theme. One strip texture: groundA, groundB, path, water, rock (the order
 * Terrain.ts relies on).
 */
export interface TerrainTheme {
  style: 'pavement' | 'sand';
  groundA: number;
  groundB: number;
  pathA: number;
  pathB: number;
  water: number;
  waterLight: number;
  waterDark: number;
  rock: number;
  rockLight: number;
  rockDark: number;
}

function css(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** Mixes a color toward black (amount < 0) or white (amount > 0). */
function shade(c: number, amount: number): number {
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const mix = (v: number) => Math.round(v + (target - v) * t);
  return (mix((c >> 16) & 255) << 16) | (mix((c >> 8) & 255) << 8) | mix(c & 255);
}

/** Small deterministic PRNG so tiles look the same every run. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTerrainTileset(scene: Phaser.Scene, key: string, theme: TerrainTheme) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, TILE * 5, TILE)!;
  const ctx = tex.getContext();

  const put = (tile: number, x: number, y: number, c: number) => {
    ctx.fillStyle = css(c);
    ctx.fillRect(tile * TILE + x, y, 1, 1);
  };
  const fill = (tile: number, c: number) => {
    ctx.fillStyle = css(c);
    ctx.fillRect(tile * TILE, 0, TILE, TILE);
  };

  const ground = (tile: number, base: number, variant: boolean, seed: number) => {
    fill(tile, base);
    const rand = rng(seed);
    if (theme.style === 'pavement') {
      for (let i = 0; i < TILE; i++) {
        put(tile, i, 0, shade(base, -0.1));
        put(tile, 0, i, shade(base, -0.1));
        put(tile, i, 8, shade(base, -0.07));
        put(tile, 8, i, shade(base, -0.07));
      }
      if (variant) {
        for (const [x, y] of [[3, 2], [4, 3], [5, 3], [5, 4], [6, 5], [7, 6], [11, 11], [12, 12], [12, 13]]) {
          put(tile, x, y, shade(base, -0.22));
        }
      } else {
        for (let i = 0; i < 4; i++) put(tile, 1 + Math.floor(rand() * 14), 1 + Math.floor(rand() * 14), shade(base, 0.08));
      }
    } else {
      for (let i = 0; i < 9; i++) put(tile, Math.floor(rand() * TILE), Math.floor(rand() * TILE), shade(base, -0.1));
      for (let i = 0; i < 5; i++) put(tile, Math.floor(rand() * TILE), Math.floor(rand() * TILE), shade(base, 0.1));
      if (variant) {
        for (const x of [3, 4, 5, 6]) put(tile, x, 5, shade(base, -0.14));
        for (const x of [9, 10, 11, 12]) put(tile, x, 11, shade(base, -0.14));
      }
    }
  };

  const path = (tile: number) => {
    fill(tile, theme.pathA);
    if (theme.style === 'pavement') {
      // asphalt with a dashed lane marking
      for (const x of [1, 2, 3, 4, 5, 9, 10, 11, 12, 13]) {
        put(tile, x, 7, theme.pathB);
        put(tile, x, 8, theme.pathB);
      }
    } else {
      // boardwalk planks
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          if (y % 4 === 3) put(tile, x, y, theme.pathB);
          else if (x === (Math.floor(y / 4) % 2 ? 4 : 12)) put(tile, x, y, theme.pathB);
        }
      }
    }
  };

  const water = (tile: number) => {
    fill(tile, theme.water);
    [[3, 0], [8, 6], [13, 2]].forEach(([y, off]) => {
      for (let i = 0; i < 4; i++) put(tile, (off + i) % TILE, y, theme.waterLight);
      for (let i = 1; i < 3; i++) put(tile, (off + i) % TILE, y + 1, theme.waterDark);
    });
  };

  const rock = (tile: number) => {
    fill(tile, theme.rock);
    for (let i = 0; i < TILE; i++) {
      put(tile, i, 0, theme.rockDark);
      put(tile, i, TILE - 1, theme.rockDark);
      put(tile, 0, i, theme.rockDark);
      put(tile, TILE - 1, i, theme.rockDark);
    }
    for (let i = 1; i < TILE - 2; i++) {
      put(tile, i, 1, theme.rockLight);
      put(tile, 1, i, theme.rockLight);
      put(tile, i + 1, TILE - 2, shade(theme.rock, -0.2));
      put(tile, TILE - 2, i + 1, shade(theme.rock, -0.2));
    }
    for (const [x, y] of [[5, 5], [6, 5], [10, 9], [9, 10], [4, 11]]) put(tile, x, y, theme.rockLight);
    for (const [x, y] of [[8, 4], [11, 6], [6, 9]]) put(tile, x, y, shade(theme.rock, -0.25));
  };

  ground(0, theme.groundA, false, 11);
  ground(1, theme.groundB, true, 23);
  path(2);
  water(3);
  rock(4);
  tex.refresh();
}

/** 2x4 diagonal rain streak (white; tinted per weather by the scene). */
export function generateRainTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, 3, 5)!;
  const ctx = tex.getContext();
  ctx.fillStyle = '#ffffff';
  for (const [x, y] of [[2, 0], [2, 1], [1, 2], [1, 3], [0, 4]]) ctx.fillRect(x, y, 1, 1);
  tex.refresh();
}
