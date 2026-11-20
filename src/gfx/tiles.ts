import Phaser from 'phaser';
import { TILE } from '../config/constants';

/**
 * GBA-style 16x16 terrain tiles, painted pixel by pixel from a per-region
 * theme. One strip texture, in the order of `TileType` (systems/mapGen.ts):
 * groundA, groundB, path, water, rock, shallow, ice, building, bridge, tree, car, prop.
 * Edges, curbs, lane markings, rails, roofs' parapets and wall faces, and the props themselves are painted on
 * top by the decor layer (gfx/decor.ts), so these tiles stay plain and seamless.
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
  /** Rooftops. */
  roof: number;
  roofLight: number;
  roofDark: number;
  roofVent: number;
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
  const tex = scene.textures.createCanvas(key, TILE * 13, TILE)!;
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
      // asphalt: plain, with a little grit (the lane markings are painted by the decor layer)
      const rand = rng(61);
      for (let i = 0; i < 10; i++) put(tile, Math.floor(rand() * TILE), Math.floor(rand() * TILE), shade(theme.pathA, i % 2 ? 0.08 : -0.1));
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

  // Shallow water: the sea-floor shows through, ripples on top.
  const shallow = (tile: number) => {
    const rand = rng(41);
    fill(tile, shade(theme.water, 0.28));
    for (let i = 0; i < 14; i++) put(tile, Math.floor(rand() * TILE), Math.floor(rand() * TILE), shade(theme.groundA, -0.05));
    [[2, 1], [9, 7], [4, 12]].forEach(([y, off]) => {
      for (let i = 0; i < 4; i++) put(tile, (off + i) % TILE, y, theme.waterLight);
    });
    for (const [x, y] of [[12, 4], [3, 9], [10, 13]]) put(tile, x, y, shade(theme.water, -0.15));
  };

  // Ice: pale and glossy (the edges and cracks are painted by the decor layer).
  const ice = (tile: number) => {
    const rand = rng(71);
    fill(tile, 0xcdeaf7);
    for (let i = 0; i < 12; i++) put(tile, Math.floor(rand() * TILE), Math.floor(rand() * TILE), i % 3 ? 0xdff3fc : 0xb4dcee);
    for (const [x, y] of [[3, 1], [4, 1], [9, 6], [10, 6], [6, 12], [7, 12]]) put(tile, x, y, 0xffffff);
  };

  // A rooftop: seamless tar and gravel (parapets, vents and the wall face are painted by the decor layer).
  const building = (tile: number) => {
    const rand = rng(83);
    fill(tile, theme.roof);
    for (let i = 0; i < 16; i++) put(tile, Math.floor(rand() * TILE), Math.floor(rand() * TILE), shade(theme.roof, i % 2 ? 0.1 : -0.12));
  };

  // A bridge deck: smooth boards with a faint seam (the rails are painted by the decor layer).
  const bridge = (tile: number) => {
    const deck = theme.style === 'pavement' ? shade(theme.pathA, 0.1) : theme.pathA;
    const rand = rng(97);
    fill(tile, deck);
    for (let i = 0; i < 12; i++) put(tile, Math.floor(rand() * TILE), Math.floor(rand() * TILE), shade(deck, i % 2 ? 0.07 : -0.09));
    for (let k = 0; k < TILE; k++) {
      put(tile, 7, k, shade(deck, -0.07));
      put(tile, k, 7, shade(deck, -0.07));
    }
  };

  // Mud: dark, wet earth, churned, with a few glints where the puddles are.
  const mud = (tile: number) => {
    const rand = rng(53);
    // brown whatever the city's ground, with a little of the ground showing through
    const mix = (a: number, b: number, t: number) => {
      const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
      return (ch(16) << 16) | (ch(8) << 8) | ch(0);
    };
    const base = mix(theme.groundA, 0x5a3e24, 0.78);
    fill(tile, base);
    for (let i = 0; i < 22; i++) put(tile, Math.floor(rand() * TILE), Math.floor(rand() * TILE), shade(base, i % 2 ? 0.14 : -0.16));
    for (const [x, y] of [[3, 3], [4, 3], [10, 9], [11, 9], [11, 10], [5, 12]]) put(tile, x, y, shade(theme.water, -0.1));
    for (const [x, y] of [[4, 3], [10, 9]]) put(tile, x, y, shade(theme.waterLight, -0.1));
  };

  ground(0, theme.groundA, false, 11);
  ground(1, theme.groundB, true, 23);
  path(2);
  water(3);
  rock(4);
  shallow(5);
  ice(6);
  building(7);
  bridge(8);
  ground(9, theme.groundA, false, 11); // tree
  path(10); // car (on the road)
  ground(11, theme.groundA, false, 11); // lamp, hydrant or umbrella
  mud(12);
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
