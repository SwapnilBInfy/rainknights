import Phaser from 'phaser';
import { cameraOf, FOCAL, HORIZON, landMask, MAP_H, MAP_W, PX_PER_DEG, VIEW_H, VIEW_W, type FlightState } from '../systems/worldMap';
import { OUTLINE } from './palette';

/** Texture keys for the flight map. */
export const FLIGHT_TEX = { world: 'flight_world', cloud: 'flight_cloud', star: 'flight_star', view: 'flight_view', outline: 'flight_outline' } as const;

const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

const OCEAN = rgb(0x234a86);
const OCEAN_LIGHT = rgb(0x2c5a9a);
const SHELF = rgb(0x3a78b8);
const SHELF_NEAR = rgb(0x58a0d8);
const GRASS_A = rgb(0x58a050);
const GRASS_B = rgb(0x4e9448);
const JUNGLE = rgb(0x2e7a3c);
const DESERT_A = rgb(0xd8b868);
const DESERT_B = rgb(0xc8a858);
const ICE_A = rgb(0xe8f0f8);
const ICE_B = rgb(0xc8d8e8);
const COAST = rgb(0x2e5a34);
const GRID = rgb(0x335a9a);

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/** Which colour a land pixel gets, from where on Earth it is. */
function landColour(lon: number, lat: number, x: number, y: number): [number, number, number] {
  const n = hash(x, y) & 3;
  if (lat > 68 || lat < -62) return n === 0 ? ICE_B : ICE_A;
  const desert =
    (lat > 15 && lat < 30 && lon > -15 && lon < 58) ||
    (lat > 38 && lat < 46 && lon > 90 && lon < 115) ||
    (lat < -20 && lat > -33 && lon > 120 && lon < 142);
  if (desert) return n < 2 ? DESERT_A : DESERT_B;
  if (Math.abs(lat) < 10) return n < 3 ? JUNGLE : GRASS_B;
  return n < 2 ? GRASS_A : GRASS_B;
}

/** The whole world as one texture. Built once (about half a million pixels), then reused. */
export function generateWorldTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(FLIGHT_TEX.world)) return;
  const mask = landMask();
  const canvas = scene.textures.createCanvas(FLIGHT_TEX.world, MAP_W, MAP_H)!;
  const ctx = canvas.getContext();
  const img = ctx.createImageData(MAP_W, MAP_H);

  // How far each water pixel is from land (capped), by growing the land one pixel at a time.
  const dist = new Uint8Array(MAP_W * MAP_H);
  let frontier: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) frontier.push(i);
  const seen = Uint8Array.from(mask);
  for (let d = 1; d <= 8 && frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % MAP_W;
      const y = (i - x) / MAP_W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        const ni = ny * MAP_W + nx;
        if (seen[ni]) continue;
        seen[ni] = 1;
        dist[ni] = d;
        next.push(ni);
      }
    }
    frontier = next;
  }

  const gridEvery = 30 * PX_PER_DEG;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      const lon = x / PX_PER_DEG - 180;
      const lat = 90 - y / PX_PER_DEG;
      let c: [number, number, number];
      if (mask[i]) {
        const edge = mask[i - 1] === 0 || mask[i + 1] === 0 || (y > 0 && mask[i - MAP_W] === 0) || (y < MAP_H - 1 && mask[i + MAP_W] === 0);
        c = edge && x > 0 && x < MAP_W - 1 ? COAST : landColour(lon, lat, x, y);
      } else {
        const d = dist[i];
        if (d > 0 && d <= 2) c = SHELF_NEAR;
        else if (d > 0 && d <= 6) c = SHELF;
        else c = hash(x >> 1, y) % 29 === 0 ? OCEAN_LIGHT : OCEAN;
        if ((x % gridEvery === 0 || y % gridEvery === 0) && d === 0) c = GRID;
      }
      const o = i * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  canvas.refresh();
}

/** A small puffy cloud, white with a soft underside. Drifts over the map, above the knight's shadow. */
export function generateCloudTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(FLIGHT_TEX.cloud)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const puff = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
    g.fillStyle(c, a);
    g.fillRect(x, y, w, h);
  };
  puff(2, 6, 28, 6, 0xc8d4e8); // underside
  puff(4, 3, 24, 6, 0xf4f8ff);
  puff(8, 1, 10, 4, 0xffffff);
  puff(18, 2, 8, 4, 0xffffff);
  puff(0, 7, 4, 3, 0xe4ecf8);
  puff(28, 7, 4, 3, 0xe4ecf8);
  g.generateTexture(FLIGHT_TEX.cloud, 32, 13);
  g.destroy();
}

const STAR = [
  '....X....',
  '...XXX...',
  '...XXX...',
  'XXXXXXXXX',
  '.XXXXXXX.',
  '..XXXXX..',
  '..XXXXX..',
  '.XXX.XXX.',
  '.XX...XX.',
];

/** A five-point star with a dark outline. White, so it can be tinted to the city's weather. */
export function generateStarTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(FLIGHT_TEX.star)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(OUTLINE, 1);
  STAR.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== 'X') return;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.fillRect(x + 1 + dx, y + 1 + dy, 1, 1);
    })
  );
  g.fillStyle(0xffffff, 1);
  STAR.forEach((row, y) => [...row].forEach((ch, x) => ch === 'X' && g.fillRect(x + 1, y + 1, 1, 1)));
  g.generateTexture(FLIGHT_TEX.star, 11, 11);
  g.destroy();
}

/**
 * The blue flight pad: a glowing plate on the ground with a ring of lights chasing round it.
 * Drawn each frame (it is only ever on screen in Mistford) so it can pulse.
 * (cx, cy) is the centre; `size` is the side in pixels; `charge` 0..1 brightens it when the knight stands on it.
 */
export function drawFlightPad(g: Phaser.GameObjects.Graphics, cx: number, cy: number, size: number, timeMs: number, charge: number) {
  g.clear();
  const half = size / 2;
  const pulse = 0.5 + 0.5 * Math.sin(timeMs / 260);
  g.fillStyle(0x2a6ad8, 0.28 + 0.2 * pulse + 0.25 * charge);
  g.fillRect(cx - half - 3, cy - half - 3, size + 6, size + 6); // glow
  g.fillStyle(OUTLINE, 1);
  g.fillRect(cx - half, cy - half, size, size);
  g.fillStyle(0x1f4fb8, 1);
  g.fillRect(cx - half + 1, cy - half + 1, size - 2, size - 2);
  g.fillStyle(0x3f8cf0, 1);
  g.fillRect(cx - half + 3, cy - half + 3, size - 6, size - 6);
  g.fillStyle(0xbfe0ff, 0.5 + 0.4 * pulse + 0.1 * charge);
  g.fillRect(cx - half + 5, cy - half + 5, size - 10, size - 10);
  // an upward arrow, the way up and out
  g.fillStyle(0xffffff, 1);
  g.fillRect(cx - 1, cy - 5, 2, 9);
  g.fillRect(cx - 3, cy - 3, 6, 1);
  g.fillRect(cx - 2, cy - 4, 4, 1);
  g.fillRect(cx - 4, cy - 2, 8, 1);
  // lights chasing round the rim
  const n = Math.floor(size / 4);
  const lit = Math.floor(timeMs / 120) % n;
  for (let i = 0; i < n; i++) {
    const on = i === lit || i === (lit + 1) % n;
    g.fillStyle(on ? 0xffffff : 0x8cc4ff, on ? 1 : 0.7);
    const t = (i / n) * 4;
    const side = Math.floor(t);
    const f = (t - side) * (size - 4);
    const px = side === 0 ? cx - half + 2 + f : side === 1 ? cx + half - 3 : side === 2 ? cx + half - 3 - f : cx - half + 2;
    const py = side === 0 ? cy - half + 1 : side === 1 ? cy - half + 2 + f : side === 2 ? cy + half - 2 : cy + half - 3 - f;
    g.fillRect(Math.round(px), Math.round(py), 2, 1);
  }
}

/** The whole world drawn small, as a cloud outline for the sky corner: bright coasts, a faint fill. */
export const OUTLINE_CELL = 18;
export const OUTLINE_W = MAP_W / OUTLINE_CELL;
export const OUTLINE_H = MAP_H / OUTLINE_CELL;

export function generateOutlineTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(FLIGHT_TEX.outline)) return;
  const mask = landMask();
  const land: boolean[][] = [];
  for (let cy = 0; cy < OUTLINE_H; cy++) {
    land.push([]);
    for (let cx = 0; cx < OUTLINE_W; cx++) {
      let hits = 0;
      for (const [ox, oy] of [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]]) {
        hits += mask[(cy * OUTLINE_CELL + oy) * MAP_W + cx * OUTLINE_CELL + ox];
      }
      land[cy].push(hits >= 3);
    }
  }
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let cy = 0; cy < OUTLINE_H; cy++) {
    for (let cx = 0; cx < OUTLINE_W; cx++) {
      if (!land[cy][cx]) continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !land[cy + dy]?.[cx + dx]);
      g.fillStyle(0xffffff, edge ? 0.95 : 0.32);
      g.fillRect(cx, cy, 1, 1);
    }
  }
  g.generateTexture(FLIGHT_TEX.outline, OUTLINE_W, OUTLINE_H);
  g.destroy();
}

const SKY_TOP = rgb(0x2f7fe0);
const SKY_LOW = rgb(0xa8d4f6);
const HAZE = rgb(0xd4e8f8);
const POLE = rgb(0xe8f0f8);

/**
 * Draws the sky and the ground, one frame at a time, into a 240x160 canvas. The ground is the world texture
 * seen in perspective: each screen row looks at one distance away, so a row is a straight line across the map.
 * The farther the row, the more it is washed out toward the haze colour, like the horizon in the old
 * pseudo-3D flying games.
 */
export class GroundRenderer {
  private readonly src: Uint32Array;
  private readonly canvas: Phaser.Textures.CanvasTexture;
  private readonly image: ImageData;
  private readonly dst: Uint32Array;

  constructor(scene: Phaser.Scene) {
    generateWorldTexture(scene);
    const world = scene.textures.get(FLIGHT_TEX.world) as Phaser.Textures.CanvasTexture;
    this.src = new Uint32Array(world.getContext().getImageData(0, 0, MAP_W, MAP_H).data.buffer);
    if (scene.textures.exists(FLIGHT_TEX.view)) scene.textures.remove(FLIGHT_TEX.view);
    this.canvas = scene.textures.createCanvas(FLIGHT_TEX.view, VIEW_W, VIEW_H)!;
    this.image = this.canvas.getContext().createImageData(VIEW_W, VIEW_H);
    this.dst = new Uint32Array(this.image.data.buffer);
  }

  private static pack(c: readonly [number, number, number]): number {
    return (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
  }

  render(f: FlightState): void {
    const dst = this.dst;
    // sky: deep blue overhead to pale near the horizon
    for (let y = 0; y < HORIZON; y++) {
      const t = Math.pow(y / HORIZON, 1.6);
      const c: [number, number, number] = [
        SKY_TOP[0] + (SKY_LOW[0] - SKY_TOP[0]) * t,
        SKY_TOP[1] + (SKY_LOW[1] - SKY_TOP[1]) * t,
        SKY_TOP[2] + (SKY_LOW[2] - SKY_TOP[2]) * t,
      ];
      dst.fill(GroundRenderer.pack(c.map(Math.round) as [number, number, number]), y * VIEW_W, (y + 1) * VIEW_W);
    }
    // the ground, row by row
    const cam = cameraOf(f);
    const sin = Math.sin(f.heading);
    const cos = Math.cos(f.heading);
    const src = this.src;
    const hazeInt = GroundRenderer.pack(HAZE);
    const poleInt = GroundRenderer.pack(POLE);
    for (let y = HORIZON; y < VIEW_H; y++) {
      const row = y * VIEW_W;
      const k = y - HORIZON;
      if (k === 0) {
        dst.fill(hazeInt, row, row + VIEW_W);
        continue;
      }
      const dist = (cam.height * FOCAL) / k;
      const stepX = (cos * dist) / FOCAL;
      const stepY = (sin * dist) / FOCAL;
      let u = cam.x + sin * dist - stepX * (VIEW_W / 2);
      let v = cam.y - cos * dist - stepY * (VIEW_W / 2);
      const haze = Math.min(1, Math.max(0, (dist - 230) / 760));
      const hz = Math.round(haze * 256);
      for (let x = 0; x < VIEW_W; x++, u += stepX, v += stepY) {
        const iy = Math.floor(v);
        let c: number;
        if (iy < 0 || iy >= MAP_H) c = poleInt;
        else {
          const ix = ((Math.floor(u) % MAP_W) + MAP_W) % MAP_W;
          c = src[iy * MAP_W + ix];
        }
        if (hz > 0) {
          const r = c & 255;
          const g = (c >> 8) & 255;
          const b = (c >> 16) & 255;
          c = (0xff000000 | ((b + (((HAZE[2] - b) * hz) >> 8)) << 16) | ((g + (((HAZE[1] - g) * hz) >> 8)) << 8) | (r + (((HAZE[0] - r) * hz) >> 8))) >>> 0;
        }
        dst[row + x] = c;
      }
    }
    // a soft white band where the sky meets the ground
    for (let y = HORIZON - 7; y < HORIZON; y++) {
      const a = ((y - (HORIZON - 7)) / 7) * 0.8;
      for (let x = 0; x < VIEW_W; x++) {
        const c = dst[y * VIEW_W + x];
        const r = c & 255;
        const g = (c >> 8) & 255;
        const b = (c >> 16) & 255;
        dst[y * VIEW_W + x] =
          (0xff000000 | (Math.round(b + (HAZE[2] - b) * a) << 16) | (Math.round(g + (HAZE[1] - g) * a) << 8) | Math.round(r + (HAZE[0] - r) * a)) >>> 0;
      }
    }
    this.canvas.getContext().putImageData(this.image, 0, 0);
    this.canvas.refresh();
  }
}
