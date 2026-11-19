import Phaser from 'phaser';
import { ALT_MAX, ALT_MIN, cameraOf, FOCAL, HORIZON, landMask, MAP_H, MAP_W, PX_PER_DEG, VIEW_H, VIEW_W, type FlightState } from '../systems/worldMap';
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

const SKY_LOW = rgb(0x2f7fe0);
const SPACE = rgb(0x0a1640);
const HAZE = rgb(0xd4e8f8);

/**
 * Draws the planet, one frame at a time, into a 240x160 canvas. Every pixel is a ray from the camera: if it hits
 * the sphere, the hit point's longitude and latitude pick a pixel of the world texture; if it misses, it is sky,
 * pale where it grazes the atmosphere and deepening toward space (and the higher you fly, the darker the sky).
 * That is what makes the horizon curve, and curve more the higher the camera goes. Distant ground is washed out
 * toward the haze colour, like the horizon in the old pseudo-3D flying games.
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

  render(state: FlightState): void {
    const dst = this.dst;
    const src = this.src;
    const { c, fc, r, up } = cameraOf(state);
    const cc = c.x * c.x + c.y * c.y + c.z * c.z - 1; // > 0: the camera is outside the planet
    const camR2 = cc + 1;
    // the haze is measured against how far the horizon is, so it washes out the far half of the view at any height
    const horizon = Math.sqrt(cc);
    const hazeFrom = 0.3 * horizon;
    const hazeSpan = 0.7 * horizon;
    const climb = Math.min(1, Math.max(0, (state.alt - ALT_MIN) / (ALT_MAX - ALT_MIN)));
    // the sky darkens toward space as you climb
    const deep: [number, number, number] = [
      SKY_LOW[0] + (SPACE[0] - SKY_LOW[0]) * climb * 0.75,
      SKY_LOW[1] + (SPACE[1] - SKY_LOW[1]) * climb * 0.75,
      SKY_LOW[2] + (SPACE[2] - SKY_LOW[2]) * climb * 0.75,
    ];
    const halfW = VIEW_W / 2;
    for (let y = 0; y < VIEW_H; y++) {
      const up_k = HORIZON - y;
      const bx = fc.x * FOCAL + up.x * up_k - r.x * halfW;
      const by = fc.y * FOCAL + up.y * up_k - r.y * halfW;
      const bz = fc.z * FOCAL + up.z * up_k - r.z * halfW;
      const row = y * VIEW_W;
      for (let x = 0; x < VIEW_W; x++) {
        const dx = bx + r.x * x;
        const dy = by + r.y * x;
        const dz = bz + r.z * x;
        const a = dx * dx + dy * dy + dz * dz;
        const b = c.x * dx + c.y * dy + c.z * dz;
        const disc = b * b - a * cc;
        let R: number;
        let G: number;
        let B: number;
        if (disc < 0 || b >= 0) {
          // sky: pale where the ray grazes the atmosphere, deep where it does not
          const closest2 = b < 0 ? camR2 - (b * b) / a : camR2;
          const glow = Math.min(1, Math.max(0, (Math.sqrt(closest2) - 1) / 0.1));
          const g = Math.pow(glow, 0.7);
          R = HAZE[0] + (deep[0] - HAZE[0]) * g;
          G = HAZE[1] + (deep[1] - HAZE[1]) * g;
          B = HAZE[2] + (deep[2] - HAZE[2]) * g;
        } else {
          const t = (-b - Math.sqrt(disc)) / a;
          const hx = c.x + t * dx;
          const hy = c.y + t * dy;
          const hz = c.z + t * dz;
          const lat = Math.asin(hy > 1 ? 1 : hy < -1 ? -1 : hy);
          const lon = Math.atan2(hx, hz);
          const ix = Math.min(MAP_W - 1, Math.floor((lon / (2 * Math.PI) + 0.5) * MAP_W));
          const iy = Math.min(MAP_H - 1, Math.floor((0.5 - lat / Math.PI) * MAP_H));
          const px = src[iy * MAP_W + ix];
          R = px & 255;
          G = (px >> 8) & 255;
          B = (px >> 16) & 255;
          // wash distant ground out toward the haze
          const haze = Math.min(1, Math.max(0, (t * FOCAL - hazeFrom) / hazeSpan));
          if (haze > 0) {
            R += (HAZE[0] - R) * haze;
            G += (HAZE[1] - G) * haze;
            B += (HAZE[2] - B) * haze;
          }
        }
        dst[row + x] = 0xff000000 | (Math.round(B) << 16) | (Math.round(G) << 8) | Math.round(R);
      }
    }
    this.canvas.getContext().putImageData(this.image, 0, 0);
    this.canvas.refresh();
  }
}
